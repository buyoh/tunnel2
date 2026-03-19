import * as crypto from 'node:crypto';
import { KeyStore, generateChallenge, verifySignature } from './key-store.mjs';

function createKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('KeyStore', () => {
  it('登録済み公開鍵からグループ名を返す', () => {
    const { publicKeyPem } = createKeyPair();
    const store = new KeyStore([{ group_name: 'team-alpha', keys: [publicKeyPem] }]);

    expect(store.findGroup(publicKeyPem)).toBe('team-alpha');
    expect(store.findGroup('missing')).toBeNull();
  });

  it('重複する公開鍵を拒否する', () => {
    const { publicKeyPem } = createKeyPair();

    expect(
      () =>
        new KeyStore([
          { group_name: 'team-alpha', keys: [publicKeyPem] },
          { group_name: 'team-beta', keys: [publicKeyPem] },
        ]),
    ).toThrow('duplicate public key');
  });

  it('challenge を生成して署名検証できる', () => {
    const { privateKeyPem, publicKeyPem } = createKeyPair();
    const nonce = generateChallenge();
    const signature = crypto.sign(null, Buffer.from(nonce, 'hex'), privateKeyPem).toString('hex');

    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(publicKeyPem, nonce, signature)).toBe(true);
    expect(verifySignature(publicKeyPem, nonce, '00')).toBe(false);
  });
});