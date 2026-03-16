# 03. P2P 接続管理

## 概要

`node-datachannel` の `PeerConnection` と `DataChannel` を管理するモジュール。
シグナリングデータの生成・適用と、DataChannel のライフサイクル管理を行う。

## ファイル: `src/connection.mts`

### 設計方針

- PeerConnection の作成・設定をラップ
- ICE Candidate 収集完了を Promise で待てるようにする
- DataChannel の open/close イベントを適切にハンドリング
- 接続エラー時のクリーンアップを確実に行う

### 公開インターフェース

```typescript
import { SignalingData } from './signaling.mjs';

export interface ConnectionEvents {
  onDataChannelOpen: (dc: DataChannel) => void;
  onDataChannelMessage: (msg: Buffer) => void;
  onDataChannelClosed: () => void;
  onConnectionStateChange: (state: string) => void;
}

// Offer 側: PeerConnection を作成し、DataChannel を作成して Offer を生成
export async function createOffer(events: ConnectionEvents): Promise<{
  signalingData: SignalingData;
  peer: PeerConnection;
  dc: DataChannel;
}>;

// Answer 側: Offer を受け取り、PeerConnection を作成して Answer を生成
export async function createAnswer(
  offerData: SignalingData,
  events: ConnectionEvents,
): Promise<{
  signalingData: SignalingData;
  peer: PeerConnection;
}>;

// Offer 側: Answer を適用して接続を確立
export function applyAnswer(
  peer: PeerConnection,
  answerData: SignalingData,
): void;
```

### ICE 設定

```typescript
const DEFAULT_RTC_CONFIG = {
  iceServers: ['stun:stun.l.google.com:19302'],
};
```

STUN サーバーとして Google の公開サーバーを使用。
将来的に TURN サーバーの設定も追加可能にする。

### ICE Candidate 収集の完了待ち

ICE Candidate は非同期的に生成される。全候補の収集完了を待ってからシグナリングデータを返す。

```typescript
async function gatherCandidates(peer: PeerConnection): Promise<Array<{ candidate: string; mid: string }>> {
  return new Promise((resolve) => {
    const candidates: Array<{ candidate: string; mid: string }> = [];

    peer.onLocalCandidate((candidate, mid) => {
      candidates.push({ candidate, mid });
    });

    peer.onGatheringStateChange((state) => {
      if (state === 'complete') {
        resolve(candidates);
      }
    });
  });
}
```

### 接続確立シーケンス (Offer 側)

1. `PeerConnection` を作成
2. `onLocalDescription` コールバックを設定 → SDP を保存
3. `onLocalCandidate` コールバックを設定 → ICE Candidate を収集
4. `DataChannel` を作成 (ラベル: `"tunnel"`)
5. ICE 収集完了を待つ
6. `SignalingData` (SDP + ICE Candidates) を返す

### 接続確立シーケンス (Answer 側)

1. `PeerConnection` を作成
2. `onLocalDescription` / `onLocalCandidate` コールバックを設定
3. `onDataChannel` コールバックを設定 → DataChannel を受信
4. `setRemoteDescription(offer.sdp, offer.type)` を呼ぶ
5. Offer の ICE Candidate を全て `addRemoteCandidate()` で追加
6. ICE 収集完了を待つ
7. `SignalingData` (Answer SDP + ICE Candidates) を返す

### エラーハンドリング

- `onStateChange` で `failed` / `disconnected` を検知 → エラー通知
- PeerConnection 作成失敗 → 例外をそのまま上位に伝播
- タイムアウト: ICE 収集が一定時間 (30秒) 以内に完了しない場合はエラー

### リソースクリーンアップ

```typescript
export function closeConnection(peer: PeerConnection, dc?: DataChannel): void {
  dc?.close();
  peer.close();
}
```

プロセス終了時にも確実にクリーンアップするため、`process.on('exit')` と `process.on('SIGINT')` でクリーンアップを登録する。
