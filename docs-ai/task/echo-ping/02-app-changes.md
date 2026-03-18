# 02 — TunnelApp / DaemonController の変更

## protocol-message.mts

MessageType enum に追加:

```typescript
export enum MessageType {
  CONNECT = 0x01,
  CONNECT_ACK = 0x02,
  CONNECT_ERR = 0x03,
  DATA = 0x10,
  CLOSE = 0x20,
  PING = 0x30,   // 追加
  PONG = 0x31,   // 追加
}
```

## tunnel-app.mts

### 新メソッド

#### `connectOffer(): Promise<void>`

TCP トンネルなしで P2P offer を生成する。

```typescript
async connectOffer(): Promise<void> {
  this.ensureState('idle', 'connectOffer() can only be called in idle state');
  // TunnelListener を作らない
  this.setState('offering');
  const offer = await this.transport.createOffer();
  this.emit('offer-ready', encodeSignaling(offer));
  this.setState('waiting-answer');
}
```

#### `connectAccept(): Promise<void>`

TCP トンネルなしで offer 受信待ちに遷移する。

```typescript
async connectAccept(): Promise<void> {
  this.ensureState('idle', 'connectAccept() can only be called in idle state');
  // TunnelForwarder を作らない
  this.setState('waiting-offer');
}
```

#### `ping(message: string): void`

PING メッセージを送信する。

```typescript
ping(message: string): void {
  if (this.state !== 'connected') {
    throw new Error('ping() can only be called in connected state');
  }
  const payload = Buffer.from(message, 'utf-8');
  this.transport.sendMessage(encodeMessage({
    connId: 0,
    type: MessageType.PING,
    payload,
  }));
}
```

### onMessage ハンドラ変更

`onMessage` コールバック内で PING/PONG を先に処理し、それ以外を tunnel に委譲する。

```typescript
onMessage: (data: Buffer) => {
  try {
    const msg = decodeMessage(data);

    // PING → 自動 PONG 返信
    if (msg.type === MessageType.PING) {
      this.transport.sendMessage(encodeMessage({
        connId: 0,
        type: MessageType.PONG,
        payload: msg.payload,
      }));
      return;
    }

    // PONG → イベント発火
    if (msg.type === MessageType.PONG) {
      this.emit('pong-received', msg.payload.toString('utf-8'));
      return;
    }

    // その他 → tunnel に委譲
    if (this.tunnel) {
      this.tunnel.handleMessage(msg);
    }
  } catch (error) {
    this.emit('error', error as Error);
  }
},
```

### onOpen ハンドラ変更

tunnel がない場合 (connectOffer/connectAccept) でも connected に遷移できるようにする。

```typescript
onOpen: () => {
  if (this.state !== 'connecting') {
    return;
  }
  if (this.tunnel instanceof TunnelListener) {
    this.tunnel.start();
  }
  this.setState('connected');
  this.emit('connected');
},
```

既存コードは変更不要。tunnel が null でも connected に遷移する。

## daemon-controller.mts

### executeCommand に追加するアクション

```typescript
case 'connect-offer':
  await this.app.connectOffer();
  break;
case 'connect-accept':
  await this.app.connectAccept();
  break;
case 'ping':
  this.app.ping(this.getMessageArg(normalizedArgs.value.message, 'ping.message'));
  break;
```

### setupEventListeners に追加

```typescript
this.app.on('pong-received', (message: string) => push('pong-received', message));
```

### 新バリデーションメソッド

```typescript
private getMessageArg(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}
```

既存の `getEncodedArg` と同じシグネチャだが、意味的に別メソッドとして定義する。
ただし `getEncodedArg` を流用しても差し支えない。
