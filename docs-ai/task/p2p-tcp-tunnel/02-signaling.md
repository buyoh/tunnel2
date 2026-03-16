# 02. シグナリング設計

## 概要

P2P の接続確立にはシグナリング (SDP Offer/Answer, ICE Candidate の交換) が必要。
本アプリケーションでは、シグナリングサーバーを使わず、ユーザーが情報をコピー&ペーストする方式を採用する。

シグナリングデータの構造は P2P トランスポート層が生成・消費するが、エンコード・デコード・バリデーションはトランスポート非依存のユーティリティとして提供する。

## 設計方針

- SDP と ICE Candidate をまとめて1つの JSON にシリアライズ
- base64 エンコードして1行のテキストとしてコピペ可能にする
- ICE Candidate 収集が完了してから表示することで、1回のコピペで済むようにする

## シグナリングデータ構造

```typescript
interface SignalingData {
  sdp: string;           // SDP 文字列
  type: 'offer' | 'answer';
  candidates: Array<{
    candidate: string;   // ICE Candidate 文字列
    mid: string;         // Media ID
  }>;
}
```

### エンコード・デコード

```typescript
// エンコード: SignalingData → base64 文字列
function encodeSignaling(data: SignalingData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

// デコード: base64 文字列 → SignalingData
function decodeSignaling(encoded: string): SignalingData {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}
```

## ファイル: `src/signaling.mts`

### 公開インターフェース

```typescript
// シグナリング情報の型
export interface SignalingData {
  sdp: string;
  type: 'offer' | 'answer';
  candidates: Array<{ candidate: string; mid: string }>;
}

// シグナリング情報をエンコード
export function encodeSignaling(data: SignalingData): string;

// シグナリング情報をデコード (入力バリデーション付き)
export function decodeSignaling(encoded: string): SignalingData;
```

### バリデーション

`decodeSignaling` では以下を検証する:

1. base64 デコード可能であること
2. JSON パース可能であること
3. 必須フィールド (`sdp`, `type`, `candidates`) が存在すること
4. `type` が `'offer'` または `'answer'` であること
5. `candidates` が配列であること

不正な入力にはわかりやすいエラーメッセージを返す。

## コピペ方式のユーザーフロー

### Offer 側

```
$ tunnel listen 2222
P2P 接続を開始します...

以下のオファー情報を相手に送ってください:
─────────────────────────────────────
eyJ0eXBlIjoib2ZmZXIiLCJzZHAiOiJ2PTAu...
─────────────────────────────────────

相手のアンサー情報を貼り付けてください:
> eyJ0eXBlIjoiYW5zd2VyIiwic2RwIjoidi...

接続確立中...
接続しました! localhost:2222 で待ち受けています
```

### Answer 側

```
$ tunnel forward localhost:22
相手のオファー情報を貼り付けてください:
> eyJ0eXBlIjoib2ZmZXIiLCJzZHAiOiJ2PTAu...

以下のアンサー情報を相手に送ってください:
─────────────────────────────────────
eyJ0eXBlIjoiYW5zd2VyIiwic2RwIjoidi...
─────────────────────────────────────

接続確立中...
接続しました! 受信した接続を localhost:22 に転送します
```
