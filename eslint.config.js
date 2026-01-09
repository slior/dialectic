const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = tseslint.config(
  // Base TypeScript config
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: [
          './tsconfig.base.json',
          './packages/*/tsconfig.json',
        ],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      import: importPlugin,
      sonarjs: sonarjs,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      
      // Code quality rules (complexity is built into ESLint, no plugin needed)
      'complexity': ['error', { max: 10 }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-magic-numbers': ['error', {
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        detectObjects: false,
      }],
      'max-lines-per-function': ['error', { max: 100 }],
      'max-depth': ['error', { max: 4 }],
      'max-params': ['error', { max: 5 }],
      
      // Import ordering
      'import/order': ['error', {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      }],
    },
  },
  // Test file overrides
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-magic-numbers': 'off',
      'complexity': 'warn',
      'sonarjs/cognitive-complexity': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Disable max-lines-per-function for tests: it's standard to have all tests in a single describe block
      'max-lines-per-function': 'off',
    },
  },
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      '**/dist/**',
      '**/coverage/**',
    ],
  },
);
