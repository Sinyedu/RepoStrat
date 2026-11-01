import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'drizzle/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/*.cjs'],
    languageOptions: { globals: { require: 'readonly', process: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
