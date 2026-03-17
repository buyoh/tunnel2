import { decodeMessage, encodeMessage, MessageType } from './protocol-message.mjs';

describe('protocol', () => {
  it('round-trips DATA messages', () => {
    const encoded = encodeMessage({
      connId: 42,
      type: MessageType.DATA,
      payload: Buffer.from('hello', 'utf-8'),
    });

    const decoded = decodeMessage(encoded);
    expect(decoded.connId).toBe(42);
    expect(decoded.type).toBe(MessageType.DATA);
    expect(decoded.payload.toString('utf-8')).toBe('hello');
  });

  it('supports uint32 max connId', () => {
    const encoded = encodeMessage({
      connId: 0xffffffff,
      type: MessageType.CLOSE,
      payload: Buffer.alloc(0),
    });
    const decoded = decodeMessage(encoded);
    expect(decoded.connId).toBe(0xffffffff);
  });

  it('throws on too short message', () => {
    expect(() => decodeMessage(Buffer.from([1, 2, 3]))).toThrow('at least 5 bytes');
  });
});