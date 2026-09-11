import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import vuePlugin from 'eslint-plugin-vue';
import globals from 'globals';
import vueParser from 'vue-eslint-parser';

// Airbnb's config predates flat config and no longer targets current ESLint,
// so the rules below are hand-picked from it rather than pulled in wholesale.
const airbnbStyleRules = {
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-arrow-callback': 'error',
  'prefer-template': 'error',
  'object-shorthand': 'error',
  eqeqeq: ['error', 'always'],
  'no-shadow': 'error',
  'no-param-reassign': 'error',
  'no-underscore-dangle': 'off',
  'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
  'no-console': 'warn',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'consistent-return': 'error',
  'default-case': 'error',
  'no-else-return': 'error',
  'arrow-body-style': ['error', 'as-needed'],
  'import-x/order': [
    'error',
    { alphabetize: { order: 'asc' }, 'newlines-between': 'always' },
  ],
  'import-x/no-extraneous-dependencies': [
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
  'import-x/prefer-default-export': 'off',
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    plugins: { 'import-x': importPlugin },
    rules: airbnbStyleRules,
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
