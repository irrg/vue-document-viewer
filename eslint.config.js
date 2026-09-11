import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import vuePlugin from 'eslint-plugin-vue';
import globals from 'globals';
import vueParser from 'vue-eslint-parser';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...compat.extends('airbnb-base'),
  {
    rules: {
      // oxfmt owns import ordering (see .oxfmtrc.jsonc); one tool, one policy.
      'import/order': 'off',
      // Airbnb's default assumes CJS/bundler resolution, where a relative
      // import never carries an extension. This package is native ESM
      // (Node >=24, Vite), where Node/browser resolution requires one.
      'import/extensions': ['error', 'ignorePackages'],
      // This package's public API is entirely named exports (see index.js);
      // forcing single-export modules to use `export default` would fight
      // that convention for no benefit.
      'import/prefer-default-export': 'off',
      // Config and test files legitimately import devDependencies.
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.js',
            '**/*.config.js',
            '**/*.config.mjs',
            'scripts/**',
          ],
        },
      ],
      // Airbnb's for-of ban exists for pre-regenerator-runtime transpilation
      // targets. This package requires Node >=24 and evergreen browsers, so
      // that concern doesn't apply — keep the other GOTO-shaped restrictions.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message:
            'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
        },
        {
          selector: 'LabeledStatement',
          message:
            'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message:
            '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
      ],
    },
  },
  ...vuePlugin.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.config.js', '**/*.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.test.js', 'src/testing/**'],
    languageOptions: { globals: globals.vitest },
  },
  prettierConfig,
];
