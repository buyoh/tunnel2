# 概要

node-datachannel, socat を使った p2p の TCP トンネル。

## 技術スタック

- **バックエンド**: Node.js

ファイル削除を行うときは、`rm` `rmdir` コマンドではなく、`.trash/` ディレクトリに移動。
`/tmp` は使わず、`./.trash/tmp` ディレクトリを使用すること。

## ドキュメント

AI 向けのドキュメントは `docs-ai/` ディレクトリに配置される。

## テストについて

- テストは「Unitテスト」「largeテスト」の2種類
- 動作確認等のため一時ディレクトリ・ファイルが必要なときは、`./.trash/tmp` ディレクトリを使う。

## Git について

同時に別の Agent が修正を行っているかもしれないため、修正するファイルだけをコミットしてね

## SKILL について

以下に関連するタスクの場合、該当のドキュメントを参照するべし

`.github/skills/add-test-spec/SKILL.md` : `/resources/tests/` 以下にテストケースを追加するときに使う
`.github/skills/design-architecture/SKILL.md` : 仕様を基にソフトウェアの設計・コード変更方法を検討するときに使う
`.github/skills/update-code/SKILL.md` : アプリケーションに使用されるコードを更新する際に使う
