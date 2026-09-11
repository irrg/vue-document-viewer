/**
 * Renders a cell's raw value as the display string its Excel number format
 * would produce. Scope is deliberately bounded (per spec): percentages,
 * thousands separators, fixed decimal places, currency prefixes, and common
 * date/time patterns. A format outside that range — conditional sections,
 * fractions, scientific notation, elapsed-time brackets like `[h]:mm:ss`,
 * locale calendar switches — falls back to the raw value as a string.
 * Never throws, never renders `[object Object]`.
 */

// Format codes can carry up to 4 ';'-separated sections (positive; negative;
// zero; text). Multi-section formatting (e.g. parenthesized negatives) is
// out of scope — always use the first section, split only on a top-level
// ';' (not one sitting inside a "literal" or a [bracket]).
const firstSection = (code) => {
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];

    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === '[') depth += 1;
    else if (!inQuotes && char === ']') depth = Math.max(0, depth - 1);
    else if (!inQuotes && depth === 0 && char === ';') return code.slice(0, i);
  }

  return code;
};

// Strips quoted literals and [bracketed] tokens (locale/color/currency
// escapes) so token-detection regexes below don't match letters that are
// just literal text, e.g. the 'd' in "USD" or a [$-409] locale tag.
const stripLiteralsAndBrackets = (code) =>
  code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');

const CURRENCY_BRACKET = /\[\$([^-\]]*)/;

const detectCurrencySymbol = (code) => {
  const bracketed = code.match(CURRENCY_BRACKET);
  if (bracketed) return bracketed[1] || '$';

  return code.includes('$') ? '$' : null;
};

const countDecimalPlaces = (numericPart) => {
  const match = numericPart.match(/\.([0#]+)/);
  return match ? match[1].length : 0;
};

const formatNumeric = (value, code) => {
  const numericPart = stripLiteralsAndBrackets(code);
  const isPercent = numericPart.includes('%');
  const currencySymbol = detectCurrencySymbol(code);
  const hasGrouping = /#,#|0,0/.test(numericPart);
  const decimals = countDecimalPlaces(numericPart);

  const scaled = isPercent ? value * 100 : value;
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: hasGrouping,
  }).format(scaled);

  const withCurrency = currencySymbol
    ? `${currencySymbol}${formatted}`
    : formatted;

  return isPercent ? `${withCurrency}%` : withCurrency;
};

// An 'm'/'mm' run is ambiguous between "month" and "minute" — Excel decides
// by proximity: closest to an 'h'/'s' token means minutes, closest to a
// 'd'/'y' token (or no neighbor at all) means month.
const classifyMonthOrMinute = (tokens, index) => {
  for (let offset = 1; offset < tokens.length; offset += 1) {
    const before = tokens[index - offset];
    const after = tokens[index + offset];

    if (before && /^[hs]/i.test(before)) return 'minute';
    if (before && /^[dy]/i.test(before)) return 'month';
    if (after && /^[hs]/i.test(after)) return 'minute';
    if (after && /^[dy]/i.test(after)) return 'month';
  }

  return 'month';
};

const buildDateTimeOptions = (code) => {
  const cleaned = stripLiteralsAndBrackets(code);
  const tokens = cleaned.match(/[ymdhs]+|[^ymdhs]+/gi) ?? [];
  const options = {};
  let hasDatePart = false;
  let hasTimePart = false;

  tokens.forEach((token, index) => {
    const letter = token[0].toLowerCase();
    const { length } = token;

    if (letter === 'y') {
      options.year = length >= 4 ? 'numeric' : '2-digit';
      hasDatePart = true;
    } else if (letter === 'd') {
      options.day = length >= 2 ? '2-digit' : 'numeric';
      hasDatePart = true;
    } else if (letter === 'h') {
      options.hour = length >= 2 ? '2-digit' : 'numeric';
      hasTimePart = true;
    } else if (letter === 's') {
      options.second = length >= 2 ? '2-digit' : 'numeric';
      hasTimePart = true;
    } else if (letter === 'm') {
      if (classifyMonthOrMinute(tokens, index) === 'minute') {
        options.minute = length >= 2 ? '2-digit' : 'numeric';
        hasTimePart = true;
      } else {
        options.month =
          // eslint-disable-next-line no-nested-ternary
          length >= 4 ? 'long' : length === 3 ? 'short' : '2-digit';
        hasDatePart = true;
      }
    }
  });

  if (/am\/pm|a\/p/i.test(cleaned)) options.hour12 = true;
  if (!hasDatePart && !hasTimePart) {
    options.year = 'numeric';
    options.month = '2-digit';
    options.day = '2-digit';
  }

  return options;
};

const formatDate = (value, code) => {
  const options = buildDateTimeOptions(code);

  // exceljs (correctly) treats Excel serials as timezone-naive, but encodes
  // the resulting Date at UTC midnight. Formatting in the viewer's local
  // timezone would re-interpret that instant and can roll the displayed day
  // backward for anyone west of UTC. Reading it back out via the UTC
  // timezone is what makes the round trip a no-op instead of a shift.
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: 'UTC',
  }).format(value);
};

/**
 * @param {*} value - A cell's raw value (exceljs's `cell.value`).
 * @param {string|undefined|null} formatCode - The cell's Excel number
 * format code, e.g. '0.00%', '#,##0.00', 'mm/dd/yyyy', 'General'.
 * @returns {string}
 */
export const formatCellValue = (value, formatCode) => {
  if (value === null || value === undefined) return '';

  try {
    if (value instanceof Date)
      return formatDate(value, formatCode || 'yyyy-mm-dd');

    if (typeof value === 'number') {
      if (!formatCode || formatCode === 'General') return String(value);
      if (formatCode === '@') return String(value);

      return formatNumeric(value, firstSection(formatCode));
    }

    // A realistic exceljs cell value is never a plain object by this point
    // (dates, numbers, and strings are handled above; rich text/hyperlink/
    // error shapes are the adapter's job to unwrap before we ever see them)
    // — but guard it anyway so a stray object renders as its JSON rather
    // than the useless, spec-forbidden "[object Object]".
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value) ?? '';
      } catch {
        return '';
      }
    }

    return String(value);
  } catch {
    return typeof value === 'object' ? '' : String(value);
  }
};
