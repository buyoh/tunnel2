import * as crypto from 'node:crypto';
import fs from 'node:fs';

/** keys.json の 1 グループ分の定義。 */
export interface KeyGroupRecord {
  group_name: string;
  keys: string[];
}

/** 認証に使う公開鍵ストア。 */
export class KeyStore {
  private readonly groupByPublicKey = new Map<string, string>();

  constructor(source: string | KeyGroupRecord[]) {
    const records = typeof source === 'string' ? this.loadRecords(source) : source;

    for (const record of records) {
      for (const key of record.keys) {
        if (this.groupByPublicKey.has(key)) {
          throw new Error('duplicate public key is not allowed');
        }
        this.groupByPublicKey.set(key, record.group_name);
      }
    }
  }

  findGroup(publicKey: string): string | null {
    return this.groupByPublicKey.get(publicKey) ?? null;
  }

  private loadRecords(filePath: string): KeyGroupRecord[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error('keys.json must contain an array');
    }

    return parsed.map((record) => {
      if (!record || typeof record !== 'object') {
        throw new Error('key group record must be an object');
      }
      const keyGroup = record as Partial<KeyGroupRecord>;
      if (typeof keyGroup.group_name !== 'string' || !Array.isArray(keyGroup.keys)) {
        throw new Error('invalid key group record');
      }
      return {
        group_name: keyGroup.group_name,
        keys: keyGroup.keys.map((key) => String(key)),
      };
    });
  }
}

/** 接続ごとの認証チャレンジを生成する。 */
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Ed25519 署名を検証する。 */
export function verifySignature(publicKeyPem: string, nonce: string, signatureHex: string): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(nonce, 'hex'),
      publicKeyPem,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}