/**
 * Provably-fair float stream.
 *
 *   bytes_r = HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${r}`)   r = 0, 1, 2, …
 *   float   = b0/256 + b1/256² + b2/256³ + b3/256⁴                               4 bytes per float
 *
 * One HMAC yields 8 floats; when they run out the round counter r increments.
 * Every float lies in [0, 1) with 2⁻³² resolution. Games only ever consume
 * floats through the FloatSource interface, so the Monte-Carlo harness can
 * feed the same game code from a fast PRNG with identical resolution.
 */

import { hmacHex } from './sha256';

export type HmacFn = (key: string, msg: string) => Uint8Array;

export interface FloatSource {
  next(): number;
}

export class FairStream implements FloatSource {
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 32;
  private round = 0;

  constructor(
    readonly serverSeed: string,
    readonly clientSeed: string,
    readonly nonce: number,
    private readonly hmac: HmacFn = hmacHex,
  ) {}

  next(): number {
    if (this.pos >= 32) {
      this.buf = this.hmac(this.serverSeed, `${this.clientSeed}:${this.nonce}:${this.round++}`);
      this.pos = 0;
    }
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return b[p] / 256 + b[p + 1] / 65536 + b[p + 2] / 16777216 + b[p + 3] / 4294967296;
  }
}
