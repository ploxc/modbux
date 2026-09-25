module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ],
  plugins: ['react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // An async function that awaits nothing hides a synchronous one behind a
    // promise. Test stubs are left out: they stand in for an async signature.
    'require-await': 'error',
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto'
      }
    ]
  },
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'e2e/**'],
      rules: { 'require-await': 'off' }
    }
  ]
}
