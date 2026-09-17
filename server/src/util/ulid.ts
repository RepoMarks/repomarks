import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RAND_LEN = 16;

let lastTime = 0;
let lastRandom = new Uint8Array(RAND_LEN);

function encodeTime(time: number): string {
  let out = '';
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRandom(): string {
  let out = '';
  for (let i = 0; i < RAND_LEN; i++) out += ENCODING[lastRandom[i] % 32];
  return out;
}

/** 单调递增的 ULID，字典序即时间序（适合 JSONL 追加） */
export function ulid(): string {
  const now = Date.now();
  if (now === lastTime) {
    for (let i = RAND_LEN - 1; i >= 0; i--) {
      if (lastRandom[i] < 255) {
        lastRandom[i]++;
        break;
      }
      lastRandom[i] = 0;
    }
  } else {
    lastTime = now;
    lastRandom = randomBytes(RAND_LEN);
  }
  return encodeTime(lastTime) + encodeRandom();
}

export function isUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
