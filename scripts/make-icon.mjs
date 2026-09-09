/**
 * Draws the Marketplace icon: an LC monogram on a rounded square.
 *
 * The gallery wants a 128x128 PNG, and generating it here rather than checking
 * in a binary somebody exported once means the icon can be changed by editing
 * numbers. Node's zlib is the only thing needed to write a PNG, so this adds no
 * dependency for something that runs at most once a release.
 *
 * Usage: node scripts/make-icon.mjs [resources/icon.png]
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 128;
/** Samples per axis. Edges are curved, so they need more than one. */
const SUPERSAMPLE = 4;

const BACKGROUND = [24, 24, 27]; // near black, so it reads on light and dark
const FOREGROUND = [250, 250, 250];
const CORNER_RADIUS = 26;

/** Inside the rounded square that forms the badge. */
function insideBadge(x, y) {
  const r = CORNER_RADIUS;
  const nearestX = Math.min(Math.max(x, r), SIZE - r);
  const nearestY = Math.min(Math.max(y, r), SIZE - r);
  const withinBox = x >= 0 && y >= 0 && x <= SIZE && y <= SIZE;
  if (!withinBox) {
    return false;
  }
  // Only the corners are curved; everywhere else the box answer stands.
  const corner = (x < r || x > SIZE - r) && (y < r || y > SIZE - r);
  if (!corner) {
    return true;
  }
  return Math.hypot(x - nearestX, y - nearestY) <= r;
}

const STROKE = 11;

/** The L: one upright, one foot. */
function insideL(x, y) {
  const left = 30;
  const top = 38;
  const bottom = 90;
  const footRight = 56;

  const upright = x >= left && x <= left + STROKE && y >= top && y <= bottom;
  const foot = y >= bottom - STROKE && y <= bottom && x >= left && x <= footRight;
  return upright || foot;
}

/** The C: a ring with its right side left open. */
function insideC(x, y) {
  const centreX = 88;
  const centreY = 64;
  const radius = 22;

  const distance = Math.hypot(x - centreX, y - centreY);
  const onRing = distance >= radius - STROKE / 2 && distance <= radius + STROKE / 2;
  if (!onRing) {
    return false;
  }
  // Leave a gap on the right, between roughly -50 and 50 degrees.
  const angle = Math.atan2(y - centreY, x - centreX);
  return Math.abs(angle) > (50 * Math.PI) / 180;
}

/** Colour of one pixel, averaged over its samples so the curves are smooth. */
function pixel(px, py) {
  let inside = 0;
  let ink = 0;

  for (let sy = 0; sy < SUPERSAMPLE; sy++) {
    for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      const x = px + (sx + 0.5) / SUPERSAMPLE;
      const y = py + (sy + 0.5) / SUPERSAMPLE;
      if (insideBadge(x, y)) {
        inside++;
        if (insideL(x, y) || insideC(x, y)) {
          ink++;
        }
      }
    }
  }

  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const alpha = Math.round((inside / samples) * 255);
  const inkShare = inside === 0 ? 0 : ink / inside;

  const channel = (index) =>
    Math.round(BACKGROUND[index] * (1 - inkShare) + FOREGROUND[index] * inkShare);

  return [channel(0), channel(1), channel(2), alpha];
}

/** PNG chunk: length, type, payload, CRC. */
function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xff_ff_ff_ff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xff_ff_ff_ff;
}

// Each row is prefixed with a filter byte; 0 means the bytes stand as they are.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let offset = 0;
for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0;
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y);
    raw[offset++] = r;
    raw[offset++] = g;
    raw[offset++] = b;
    raw[offset++] = a;
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bits per channel
header[9] = 6; // truecolour with alpha
// bytes 10-12 stay zero: deflate, no filtering beyond per-row, no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = process.argv[2] ?? 'resources/icon.png';
writeFileSync(target, png);
console.log(`Wrote ${target}: ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB`);
