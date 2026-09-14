import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, rgb = [37, 99, 235]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const cx = x - width / 2;
      const cy = y - height / 2;
      const r = Math.sqrt(cx * cx + cy * cy);
      const inMark = r < width * 0.28;
      raw[i] = inMark ? 255 : rgb[0];
      raw[i + 1] = inMark ? 255 : rgb[1];
      raw[i + 2] = inMark ? 255 : rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192, 192));
writeFileSync('public/icon-512.png', png(512, 512));
writeFileSync('public/icon-maskable-512.png', png(512, 512, [15, 23, 42]));
writeFileSync('public/apple-touch-icon.png', png(180, 180));
writeFileSync('public/screenshot-narrow.png', png(390, 844, [10, 10, 10]));
writeFileSync('public/screenshot-wide.png', png(1280, 720, [10, 10, 10]));
console.log('wrote PWA icons');
