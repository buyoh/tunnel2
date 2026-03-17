# ESLint 設定・package.json の修正

## 問題 1: ESLint が `.mts` ファイルを対象にしていない

### 現状

`eslint.config.mjs` の `files` パターンが `**/*.{ts,tsx}` であり、プロジェクトで使用している `.mts` 拡張子に一致しない。
テスト用パターン `**/*.spec.{ts,tsx}` も同様に `.spec.mts` に一致しない。

### 修正方針

- `**/*.{ts,tsx}` → `**/*.{ts,tsx,mts}` に変更
- `**/*.spec.{ts,tsx}` → `**/*.spec.{ts,tsx,mts}` に同様変更

## 問題 2: 不要な React / ブラウザ設定

### 現状

本プロジェクトは Node.js バックエンドであり、React は使用していない。
`eslint.config.mjs` に以下の不要な設定が含まれている:

- `eslint-plugin-react` のインポートと設定
- `globals.browser` の追加
- `ecmaFeatures: { jsx: true }`
- `react/jsx-uses-vars`, `react/react-in-jsx-scope` ルール
- `react: { version: 'detect' }` 設定

### 修正方針

React 関連の設定をすべて削除する。

## 問題 3: 未使用の依存関係

### 現状

以下の依存関係がソースコードで使用されていない:

| パッケージ | 種別 | 理由 |
|-----------|------|------|
| `dotenv` | dependencies | `import`/`require` が存在しない |
| `@testing-library/jest-dom` | devDependencies | テストで使用していない |
| `jest-environment-jsdom` | devDependencies | Jest 設定で `testEnvironment: 'node'` を使用 |
| `eslint-plugin-react` | eslint.config.mjs で参照 | package.json に未記載かつ React 不使用 |

### 修正方針

- `dotenv` を `dependencies` から削除
- `@testing-library/jest-dom`, `jest-environment-jsdom` を `devDependencies` から削除
- `eslint-plugin-react` のインポートと設定を削除

## 問題 4: `@typescript-eslint/no-explicit-any: 'off'`

### 現状

`any` の使用を許容する設定になっている。型安全性を低下させる。

### 修正方針

`'off'` → `'warn'` に変更し、段階的に `any` を排除する（既存コードへの影響を考慮）。

## ステータス

- [ ] ESLint ファイルパターン修正
- [ ] React 設定削除
- [ ] 未使用依存関係の削除
- [ ] `no-explicit-any` ルール変更
