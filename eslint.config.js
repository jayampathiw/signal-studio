import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Pre-CI code: console usage, `any` types, unused vars, etc. aren't cleaned
// up yet. Burn-down tracked in docs/PROJECT-STATUS.md as a count of warnings
// here — shrink this list as files are touched and cleaned up; never add new
// entries for new code, and never widen the rule set below for it either.
const LEGACY_ALLOWED_PATHS = [
  'apps/**',
  'packages/**',
  'evals/**',
  'scripts/**',
  'supabase/functions/**',
  '.claude/**',
];

// Scripts whose entire job is printing progress for a human running them at
// a terminal (not "production paths" in the CLAUDE.md sense) — console.log
// is the correct tool here, not a lint violation to grandfather in.
const CLI_SCRIPT_PATHS = ['projects/assemblex-factory/pilot/scripts/**'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.angular/**',
      '**/.remotion/**',
      '**/out/**',
      '**/output/**',
      'apps/dashboard/**',
      'content/**',
      'projects/assemblex-factory/content/**',
      'projects/assemblex-factory/pilot/public/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    plugins: { 'import-x': importPlugin },
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: LEGACY_ALLOWED_PATHS,
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: CLI_SCRIPT_PATHS,
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  prettierConfig,
);
