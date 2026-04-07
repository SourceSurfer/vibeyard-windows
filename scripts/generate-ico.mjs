/**
 * Generates build/icon.ico from build/icon.png.
 * Uses only Node.js built-ins — no extra npm packages.
 * ICO format: ICONDIR (6 bytes) + ICONDIRENTRY per image (16 bytes) + PNG data.
 * Windows supports PNG-embedded ICO since Vista; 256x256 PNG is the canonical single-image ICO.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '..', 'build');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error(`ERROR: ${pngPath} not found`);
  process.exit(1);
}

const pngData = fs.readFileSync(pngPath);
console.log(`Read ${pngPath} (${pngData.length} bytes)`);

const imageCount = 1;
const imageOffset = 6 + 16 * imageCount;

// ICONDIR header (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved, must be 0
header.writeUInt16LE(1, 2);          // type: 1 = ICO
header.writeUInt16LE(imageCount, 4); // number of images

// ICONDIRENTRY (16 bytes per image)
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);              // width: 0 means 256px
entry.writeUInt8(0, 1);              // height: 0 means 256px
entry.writeUInt8(0, 2);              // color count (0 = no palette)
entry.writeUInt8(0, 3);              // reserved
entry.writeUInt16LE(1, 4);           // color planes
entry.writeUInt16LE(32, 6);          // bits per pixel
entry.writeUInt32LE(pngData.length, 8);   // size of image data
entry.writeUInt32LE(imageOffset, 12);     // offset to image data

const icoData = Buffer.concat([header, entry, pngData]);
fs.writeFileSync(icoPath, icoData);
console.log(`Written ${icoPath} (${icoData.length} bytes)`);
