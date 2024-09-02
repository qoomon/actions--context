import eslint from '@eslint/js';
import {FlatCompat} from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strict, // includes tseslint.configs.recommended
    ...tseslint.configs.stylistic,
    ...compat.extends('plugin:require-extensions/recommended'),
    ...compat.extends('plugin:eslint-plugin-jest/recommended'),
    {
      rules: {
        'max-len': ['error', {'code': 120, 'ignoreComments': true}],
        'no-trailing-spaces': ['error', {'skipBlankLines': true}],
      },
    },
    {
      ignores: [
        '**/dist/**',
      ],
    },
);
