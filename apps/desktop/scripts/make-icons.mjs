// Rasterize the Podium mark into the app/window icons (public/icon.png, icon-256.png, icon.svg).
// Reads the same polygons the in-app <LogoMark /> uses, so the two never drift. No dependencies.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(app, "src/ui/logo.tsx"), "utf8");
const poly = (name) => src.match(new RegExp(`${name} = "([^"]+)"`))[1].split(" ").map((p) => p.split(",").map(Number));
const OUTER = poly("OUTER"), COUNTER = poly("COUNTER");
// icon plate: a traditional rounded square (charcoal) with the 64-unit mark centred inside
const P0 = -14, P1 = 78, PR = 21; // plate spans -14..78 design units, corner radius 21
const inPlate = (u, v) => {
  const cx = Math.min(Math.max(u, P0 + PR), P1 - PR), cy = Math.min(Math.max(v, P0 + PR), P1 - PR);
  return u >= P0 && u <= P1 && v >= P0 && v <= P1 && (u - cx) ** 2 + (v - cy) ** 2 <= PR * PR;
};

function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const CHARCOAL = [0x27, 0x27, 0x27], SIGNAL = [0xe8, 0x55, 0x3e];

function render(size) {
  const ss = 4, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let plate = 0, mark = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // map pixel to design units (the plate spans P0..P1)
          const u = ((x + (sx + 0.5) / ss) / size) * (P1 - P0) + P0, v = ((y + (sy + 0.5) / ss) / size) * (P1 - P0) + P0;
          if (inPlate(u, v)) plate++;
          if (inside(OUTER, u, v) && !inside(COUNTER, u, v)) mark++;
        }
      }
      const n = ss * ss, a = plate / n, m = mark / n;
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(CHARCOAL[k] * (1 - m) + SIGNAL[k] * m);
      px[i + 3] = Math.round(255 * Math.max(a, m));
    }
  }
  return png(size, px);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${P0} ${P0} ${P1 - P0} ${P1 - P0}" width="512" height="512">
  <rect x="${P0}" y="${P0}" width="${P1 - P0}" height="${P1 - P0}" rx="${PR}" fill="#272727"/>
  <path d="M${pts(OUTER).replace(/ /g, "L")}ZM${pts(COUNTER).replace(/ /g, "L")}Z" fill="#E8553E" fill-rule="evenodd"/>
</svg>
`;

// self-check: the counter must be a hole inside the mark, and the icon centre must be plate
console.assert(inside(OUTER, 35, 16) && inside(COUNTER, 35, 16), "lectern top sits in the bowl");
console.assert(!inside(COUNTER, 50, 20), "bowl wall stays solid");
console.assert(inPlate(32, 32) && !inPlate(P0 + 1, P0 + 1), "plate corners are rounded");

writeFileSync(join(app, "public/icon.png"), render(512));
writeFileSync(join(app, "public/icon-256.png"), render(256));
writeFileSync(join(app, "public/icon.svg"), svg);
console.log("icons: public/icon.png, icon-256.png, icon.svg");
