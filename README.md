# tunnel2

node-datachannel を使った P2P の TCP トンネル。

## How to use

2 台のマシン（以下 Alice / Bob）間で TCP トンネルを張る手順を示す。
Alice 側でローカルポートを listen し、Bob 側が転送先に forward する。

### CLI モード

対話的に操作する場合は `npm run start` を使う。

#### Alice（listen 側）

```bash
npm run start -- listen 8080
```

- listen するとオファー情報（Base64 文字列）がコンソールに表示される
- このオファー情報を Bob に渡す

Bob からアンサー情報を受け取ったら、プロンプトに貼り付けて Enter を押す。

#### Bob（forward 側）

```bash
npm run start -- forward localhost:3000
```

- Alice からオファー情報を受け取ったら、プロンプトに貼り付けて Enter を押す
- アンサー情報がコンソールに表示されるので、Alice に渡す

#### 全体の流れ

1. **Alice**: `npm run start -- listen <port>` を実行
2. **Alice**: 表示されたオファー情報を Bob に送る
3. **Bob**: `npm run start -- forward <host:port>` を実行
4. **Bob**: Alice のオファー情報をプロンプトに貼り付ける
5. **Bob**: 表示されたアンサー情報を Alice に送る
6. **Alice**: Bob のアンサー情報をプロンプトに貼り付ける
7. P2P 接続が確立し、Alice の `<port>` への接続が Bob の `<host:port>` に転送される

### Daemon モード

バックグラウンドで動かす場合はシェルスクリプトを使う。
すべてのスクリプトは `--id <id>` オプションで daemon を識別する（省略時は `default`）。
異なる ID を指定すれば、同一環境で複数の daemon を同時に起動できる。

#### Daemon の起動・停止

```bash
# 起動
scripts/daemon-start.sh
scripts/daemon-start.sh --id alice

# ステータス確認
scripts/daemon-status.sh
scripts/daemon-status.sh --id alice

# 停止
scripts/daemon-stop.sh
scripts/daemon-stop.sh --id alice
```

#### コマンド送信

```bash
scripts/daemon-post.sh [--id <id>] <action> [key=value ...]
```

#### Daemon モードでの接続手順

```bash
# 1. Alice: listen を開始
scripts/daemon-post.sh --id alice listen port=8080

# 2. Alice: ステータスからオファー情報を取得し、Bob に送る
scripts/daemon-status.sh --id alice

# 3. Bob: forward を開始
scripts/daemon-post.sh --id bob forward host=localhost port=3000

# 4. Bob: Alice のオファー情報をセット
scripts/daemon-post.sh --id bob set-remote-offer encoded="<Alice のオファー情報>"

# 5. Bob: ステータスからアンサー情報を取得し、Alice に送る
scripts/daemon-status.sh --id bob

# 6. Alice: Bob のアンサー情報をセット
scripts/daemon-post.sh --id alice set-remote-answer encoded="<Bob のアンサー情報>"

# 7. 接続完了 — close で切断
scripts/daemon-post.sh --id alice close
```
