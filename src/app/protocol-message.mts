/** 多重化プロトコルのメッセージ種別。 */
export enum MessageType {
  CONNECT = 0x01,
  CONNECT_ACK = 0x02,
  CONNECT_ERR = 0x03,
  DATA = 0x10,
  CLOSE = 0x20,
  PING = 0x30,
  PONG = 0x31,
}

/** connId・種別・ペイロードからなるプロトコルメッセージ。 */
export interface ProtocolMessage {
  connId: number;
  type: MessageType;
  payload: Buffer;
}

export function encodeMessage(msg: ProtocolMessage): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(msg.connId, 0);
  header.writeUInt8(msg.type, 4);
  return Buffer.concat([header, msg.payload]);
}

export function decodeMessage(data: Buffer): ProtocolMessage {
  if (data.length < 5) {
    throw new Error('Protocol message must be at least 5 bytes');
  }

  const connId = data.readUInt32BE(0);
  const type = data.readUInt8(4) as MessageType;
  const payload = data.subarray(5);

  return { connId, type, payload };
}