# ESLint が完全に動作不能

## 重要度

high

## 問題点

`eslint.config.mjs` が `eslint-plugin-react` をインポートしているが、このパッケージは `package.json` の `devDependencies` に含まれておらず、`node_modules` にも存在しない。
結果として ESLint 実行時に `ERR_MODULE_NOT_FOUND` で即座にクラッシュし、**全てのリントチェックが機能していない**。

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'eslint-plugin-react'
imported from /home/mai/repo/tunnel2/eslint.config.mjs
```

`npm run lint` の `eslint` 部分が常に失敗するため、CI でも手動実行でもコード品質チェックが一切行われない状態にある。

## 違反しているルール

- **プロジェクト品質管理**: リンターが機能しないことで、コーディング規約違反やバグの早期検出が不可能
- **設定の整合性**: 使わないプラグインの参照が残っている

## 備考

既存タスク `code-review-fixes/` の README で「ESLint が `.mts` を対象にしていない・不要な React/ブラウザ設定」として言及されているが、詳細ドキュメント（`02-config-cleanup.md`）が未作成であり、修正も適用されていない。本件は ESLint が完全に動作不能であるという深刻度から、改めて high として記録する。

## 解決策

### A. eslint.config.mjs から React 関連を除去（推奨）

本プロジェクトは Node.js バックエンドであり React を使用していないため、以下を削除する:

1. `import reactPlugin from 'eslint-plugin-react'` の削除
2. `plugins: { react: reactPlugin }` の削除
3. `globals.browser` の削除
4. `react/jsx-uses-vars`, `react/react-in-jsx-scope` ルールの削除
5. `ecmaFeatures: { jsx: true }` の削除
6. `settings: { react: { version: 'detect' } }` の削除
7. ファイルパターン `**/*.{ts,tsx}` → `**/*.mts` に変更

**影響範囲**: `eslint.config.mjs` のみ。lint の動作が回復し、既存コードに対してチェックが有効になる。

### B. eslint-plugin-react をインストールする（非推奨）

React を使わないプロジェクトに React プラグインを追加しても意味がないため、推奨しない。
