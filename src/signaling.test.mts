import { decodeSignaling, encodeSignaling, SignalingData } from './signaling.mjs';

describe('signaling', () => {
  it('encodes and decodes signaling data', () => {
    const input: SignalingData = {
      sdp: 'v=0',
      type: 'offer',
      candidates: [{ candidate: 'a', mid: '0' }],
    };

    const encoded = encodeSignaling(input);
    const decoded = decodeSignaling(encoded);

    expect(decoded).toEqual(input);
  });

  it('throws on invalid type', () => {
    const encoded = Buffer.from(
      JSON.stringify({ sdp: 'x', type: 'nope', candidates: [] }),
      'utf-8',
    ).toString('base64');

    expect(() => decodeSignaling(encoded)).toThrow('offer or answer');
  });
});