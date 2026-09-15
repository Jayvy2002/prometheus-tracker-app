import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'supabase/functions/**', '**/*.test.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ignores: ['src/shared/api/supabase/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features', '@/features/*', '**/features/**'],
            message: 'ARCH05 : shared ↛ features.',
          },
          {
            group: ['**/stores/**', 'zustand', 'zustand/*'],
            message: 'ARCH05 : shared sans Zustand (sauf api/supabase).',
          },
        ],
      }],
    },
  },
  {
    files: ['src/shared/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features', '@/features/*', '**/features/**'],
            message: 'ARCH05 : shared/ui ↛ features.',
          },
          {
            group: ['**/stores/**', 'zustand', 'zustand/*'],
            message: 'ARCH05 : shared/ui sans Zustand.',
          },
          {
            group: ['@supabase/supabase-js', '**/lib/supabase', '**/shared/api/supabase'],
            message: 'ARCH05 : shared/ui sans Supabase.',
          },
        ],
      }],
    },
  },
  ...['account', 'coaching', 'marketplace', 'workout', 'nutrition', 'programs'].map((domain) => {
    const others = ['account', 'coaching', 'marketplace', 'workout', 'nutrition', 'programs']
      .filter((name) => name !== domain);
    return {
      files: [`src/features/${domain}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: others.flatMap((other) => ([
            {
              group: [`@/features/${other}`, `@/features/${other}/*`],
              message: `ARCH05 : pas de deep-import inter-features (${domain} ↛ ${other}).`,
            },
            {
              group: [`**/features/${other}/**`],
              message: `ARCH05 : pas de deep-import inter-features (${domain} ↛ ${other}).`,
            },
          ])),
        }],
      },
    };
  }),
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
  },
);
