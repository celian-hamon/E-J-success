// Renders the PNG app icons from public/icons/icon.svg. Run: node scripts/make-icons.mjs
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile("public/icons/icon.svg");
const out = "public/icons";

for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
}
await sharp(svg).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);

// Maskable: full-bleed background with the logo inside the 80% safe zone.
const logo = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#070b1f" } })
  .composite([{ input: logo, gravity: "centre" }])
  .png()
  .toFile(`${out}/maskable-512.png`);

console.log("Icons written to", out);
