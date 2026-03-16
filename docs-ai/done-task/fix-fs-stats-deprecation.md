# fix: fs.Stats deprecation warning (DEP0180) の解消

## 発生日

2026-03-16

## 問題

Node.js v24 で daemon 起動時に以下の警告が出る:

```
(node:57446) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
```

## 原因

`ts-node` の ESM resolver (`node-internal-modules-esm-resolve.js`) 内部で
`new fs.Stats()` を使用しており、Node.js v24 で非推奨になった。
`ts-node` はメンテナンスが事実上停滞しており、修正の見込みがない。

## 修正内容

- `ts-node` を `tsx` に置き換え
- `register.mjs`: `register('ts-node/esm', ...)` → `import 'tsx'`
- `package.json`: devDependencies から `ts-node` を削除、`tsx` を追加
- `ts-jest` はそのまま利用（ts-node に依存しない）

## 確認

- daemon 起動: deprecation warning なし
- テスト: 5 suites, 24 tests, 全パス
