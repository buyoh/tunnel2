import { encodeMessage, MessageType } from './protocol-message.mjs';
import { encodeSignaling } from './signaling-data.mjs';
import { TunnelApp } from './tunnel-app.mjs';
import { MockTransport } from './transport/mock-transport.mjs';

describe('TunnelApp', () => {
  it('connectOffer で offer-ready を発火し waiting-answer へ遷移する', async () => {
    const transport = new MockTransport();
    const app = new TunnelApp(transport);
    const offers: string[] = [];

    app.on('offer-ready', (encoded: string) => {
      offers.push(encoded);
    });

    await app.connectOffer();

    expect(app.getState()).toBe('waiting-answer');
    expect(offers.length).toBe(1);
  });

  it('connectAccept で waiting-offer へ遷移する', async () => {
    const transport = new MockTransport();
    const app = new TunnelApp(transport);

    await app.connectAccept();

    expect(app.getState()).toBe('waiting-offer');
  });

  it('connected 状態で ping を送信できる', async () => {
    const transport = new MockTransport();
    const app = new TunnelApp(transport);

    await app.connectOffer();
    await app.setRemoteAnswer(
      encodeSignaling({
        sdp: 'mock-answer',
        type: 'answer',
        candidates: [{ candidate: 'mock-candidate', mid: '0' }],
      }),
    );
    transport.simulateOpen();

    app.ping('hello');

    const messages = transport.getSentMessages();
    const last = messages[messages.length - 1];
    const decoded = encodeMessage({ connId: 0, type: MessageType.PING, payload: Buffer.from('hello', 'utf-8') });
    expect(last.equals(decoded)).toBe(true);
  });

  it('PING 受信時に PONG を自動返信する', async () => {
    const [a, b] = MockTransport.createPair();
    const alice = new TunnelApp(a);
    const bob = new TunnelApp(b);

    await alice.connectOffer();
    await bob.connectAccept();
    await bob.setRemoteOffer(
      encodeSignaling({
        sdp: 'mock-offer',
        type: 'offer',
        candidates: [{ candidate: 'mock-candidate', mid: '0' }],
      }),
    );
    await alice.setRemoteAnswer(
      encodeSignaling({
        sdp: 'mock-answer',
        type: 'answer',
        candidates: [{ candidate: 'mock-candidate', mid: '0' }],
      }),
    );
    a.simulateOpen();
    b.simulateOpen();

    a.clearSentMessages();
    b.clearSentMessages();
    alice.ping('hello');

    const bobSent = b.getSentMessages();
    expect(bobSent.length).toBeGreaterThan(0);
    const decoded = bobSent[bobSent.length - 1];
    const msgType = decoded.readUInt8(4);
    expect(msgType).toBe(MessageType.PONG);
    expect(decoded.subarray(5).toString('utf-8')).toBe('hello');
  });

  it('PONG 受信時に pong-received を発火する', async () => {
    const [a, b] = MockTransport.createPair();
    const alice = new TunnelApp(a);
    const bob = new TunnelApp(b);
    const received: string[] = [];

    alice.on('pong-received', (message: string) => {
      received.push(message);
    });

    await alice.connectOffer();
    await bob.connectAccept();
    await bob.setRemoteOffer(
      encodeSignaling({
        sdp: 'mock-offer',
        type: 'offer',
        candidates: [{ candidate: 'mock-candidate', mid: '0' }],
      }),
    );
    await alice.setRemoteAnswer(
      encodeSignaling({
        sdp: 'mock-answer',
        type: 'answer',
        candidates: [{ candidate: 'mock-candidate', mid: '0' }],
      }),
    );
    a.simulateOpen();
    b.simulateOpen();

    alice.ping('echo');

    expect(received).toContain('echo');
  });
});
