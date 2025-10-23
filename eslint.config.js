import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.vitest.json'],
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        NodeJS: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'prettier': prettierPlugin,
      'unused-imports': unusedImports,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      
      // Prettier integration
      'prettier/prettier': 'error',
      
      // TypeScript specific enterprise rules
      '@typescript-eslint/no-unused-vars': 'off', // handled by unused-imports
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      
      // Import/Export rules
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      
      // Performance and best practices
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      
      // Code quality
      'eqeqeq': ['error', 'always'],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-throw-literal': 'error',
      
      // Complexity
      'complexity': ['error', { max: 15 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': ['error', { max: 100 }],
      'max-params': ['error', { max: 5 }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // Relax some rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
      'no-console': 'off',
    },
  },
  prettier,
];