# daemon-server.mts / daemon-server.spec.mts のレビューと改善計画

## 対象ファイル

- `src/app/daemon-server.mts` — `DaemonServer` クラス
- `src/app/daemon-server.spec.mts` — 上記のテスト

## 現状の問題点

### 問題1: テストで実ファイル・ソケットを使用（要件1 違反）

`daemon-server.spec.mts` では以下の実I/Oが行われている:

- `fs.mkdirSync(TMP_DIR, { recursive: true })` でディレクトリを作成
- Unix domain socket ファイルを生成して実HTTPサーバーを起動
- `http.request` で実HTTPリクエストを送信
- `afterEach` で `fs.unlinkSync` でソケットファイルを削除

### 問題2: HTTPサーバー層のDI欠如（要件2 違反）

`DaemonServer` は内部で `express()` と `http.createServer()` を直接呼び出しており、テスト時にHTTPサーバーなしでビジネスロジックをテストする手段がない。

**該当箇所:**
- `daemon-server.mts` コンストラクタ内 `express()`, `http.createServer()`

### 問題3: 単一責任原則の不足（要件3 違反）

`DaemonServer` は以下の複数の責務を一つのクラスに持つ:

1. **HTTP サーバー管理** — Express セットアップ、listen/close
2. **イベント履歴の記録** — `events[]` の蓄積、`MAX_EVENTS` 制限
3. **コマンドディスパッチ** — `handleCommand` の switch 文で `TunnelApp` メソッド呼び出し
4. **最終コマンドの追跡** — `lastCommand` の更新

## 改善方針

### 方針A: 責務の分離

ビジネスロジック（イベント管理・コマンドディスパッチ）をHTTPサーバーから分離する。

```
DaemonServer (HTTPサーバー管理のみ)
  └─ DaemonController (コマンドディスパッチ + イベント履歴 + lastCommand管理)
       └─ TunnelApp (既存のアプリケーションコア)
```

#### DaemonController（新規クラス）

```typescript
class DaemonController {
  private events: DaemonEvent[] = [];
  private lastCommand: LastCommand | undefined;

  constructor(private readonly app: TunnelApp) {
    this.setupEventListeners();
  }

  getStatus(): StatusResponse { ... }
  executeCommand(action: string, args: Record<string, unknown>): Promise<CommandResult> { ... }
}
```

- `TunnelApp` のイベント購読・履歴管理
- コマンドのバリデーション・ディスパッチ
- 状態レスポンスの構築

HTTPに一切依存しないため、テスト時は `DaemonController` を直接テストできる。

#### DaemonServer（薄いHTTPラッパー）

```typescript
class DaemonServer {
  constructor(
    private readonly controller: DaemonController,
    private readonly socketPath: string,
  ) { ... }
}
```

- Express ルートは `controller.getStatus()` / `controller.executeCommand()` を呼ぶだけ

### 方針B: テストの改善

`DaemonController` を導入することで:

- コントローラーのテストはHTTPサーバー・ソケットファイル不要
- `DaemonController` に `MockTransport` を持つ `TunnelApp` を注入するだけでテスト可能
- 実ファイル作成・実HTTPリクエストを完全に排除

### 変更の影響範囲

- `src/app/daemon-server.mts` — `DaemonController` を抽出、`DaemonServer` を薄くする
- `src/app/daemon-server.spec.mts` — `DaemonController` を直接テストするように書き直し
- `src/daemon.mts` — `DaemonController` の生成を追加（軽微）

## 実施結果 (2026-03-16)

- [x] `src/app/daemon-server.mts` に `DaemonController` を追加し、イベント履歴・最終コマンド管理・コマンドディスパッチを分離
- [x] `DaemonServer` を HTTP ルーティング専用の薄いラッパーに変更
- [x] `executeCommand()` に引数バリデーション（`port`, `host`, `encoded`, `args` 型）を追加
- [x] `src/app/daemon-server.spec.mts` を実ファイル/実ソケット不要の `DaemonController` テストへ置換
- [x] `src/daemon.mts` で `DaemonController` を組み立てるよう更新
