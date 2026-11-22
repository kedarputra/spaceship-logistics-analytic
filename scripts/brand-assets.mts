/**
 * node scripts/brand-assets.mts: makes the product mark's two working files from the logo,
 * assets/wms-logo.png (1536 × 1024, transparent ground). Run it again after the logo changes, and
 * commit what it writes:
 *
 * - assets/wms-mark.png: the mark trimmed to a square, 192 px. The rail and the sign-in card show it
 *   at 34 px (it is imported, so the build serves it from /_next/static), and the report PDF draws it
 *   at 40 pt, read from this path at run time.
 * - src/app/favicon.ico: the browser tab's icon at 16, 32 and 48 px, PNGs inside one ICO file.
 *   /favicon.ico is public (src/auth/public-paths.ts), so the sign-in page has it too.
 *
 * It uses sharp, which Next installs for its image optimizer, so it needs no install of its own.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const LOGO = "assets/wms-logo.png";
const MARK = "assets/wms-mark.png";
const FAVICON = "src/app/favicon.ico";
/** Only the shapes count: the logo's glow is drawn with an alpha of 0. */
const SOLID = 128;

/** The smallest box around the logo's solid pixels. */
async function solidBox(): Promise<{ left: number; top: number; width: number; height: number }> {
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((data[(y * info.width + x) * info.channels + 3] ?? 0) < SOLID) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error(`${LOGO} has no solid pixels`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** The mark centred on a transparent square, `margin` of its side left free around it, `size` px. */
async function square(size: number, margin: number): Promise<Buffer> {
  const box = await solidBox();
  const side = Math.ceil(Math.max(box.width, box.height) / (1 - 2 * margin));
  const trimmed = await sharp(LOGO).extract(box).toBuffer();
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, left: Math.floor((side - box.width) / 2), top: Math.floor((side - box.height) / 2) }])
    .png()
    .toBuffer()
    .then((full) => sharp(full).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer());
}

/** An ICO holding one PNG per size (the PNG-in-ICO form every current browser reads). */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

const mark = await square(192, 0.02);
writeFileSync(MARK, mark);
const icons = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await square(size, 0) })));
writeFileSync(FAVICON, ico(icons));
console.log(`${MARK}: ${mark.length} bytes; ${FAVICON}: ${icons.map(({ size }) => size).join(", ")} px`);
