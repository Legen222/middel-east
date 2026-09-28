/** Browser stand-in for the parts of node:crypto the server uses (randomBytes, createHash('sha256')). */
import { sha256, toHex } from '../../../engine/src/pf/sha256';

class Bytes extends Uint8Array {
  override toString(encoding?: string): string {
    return encoding === 'hex' ? toHex(this) : super.toString();
  }
}

export function randomBytes(n: number): Bytes {
  const b = new Bytes(n);
  crypto.getRandomValues(b);
  return b;
}

export function createHash(algo: string) {
  if (algo !== 'sha256') throw new Error(`demo shim supports sha256 only, got ${algo}`);
  let data = '';
  return {
    update(s: string) { data += s; return this; },
    digest(enc: string) {
      if (enc !== 'hex') throw new Error('demo shim digests to hex only');
      return toHex(sha256(new TextEncoder().encode(data)));
    },
  };
}
