/**
 * Chunked HTTPS downloader with Range request support.
 * Used to download large binaries through networks that reset TLS after ~3-5MB.
 * Usage: node scripts/download-chunked.mjs <url> <output-path> [chunk-size-mb]
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const [,, url, outputPath, chunkSizeMB = '3'] = process.argv;

if (!url || !outputPath) {
  console.error('Usage: node download-chunked.mjs <url> <output-path> [chunk-size-mb]');
  process.exit(1);
}

const CHUNK_SIZE = parseInt(chunkSizeMB, 10) * 1024 * 1024;

function getContentLength(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getContentLength(res.headers.location).then(resolve).catch(reject);
      }
      const len = parseInt(res.headers['content-length'] || '0', 10);
      resolve({ length: len, acceptsRanges: res.headers['accept-ranges'] === 'bytes', finalUrl: url });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadChunk(url, start, end, attempt = 1) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'Range': `bytes=${start}-${end}` }
    };
    const req = https.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadChunk(res.headers.location, start, end, attempt).then(resolve).catch(reject);
      }
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        reject(new Error(`Unexpected status ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', e => {
      if (attempt <= 5) {
        console.log(`[download-chunked] chunk ${start}-${end} attempt ${attempt} failed: ${e.message}, retrying...`);
        setTimeout(() => downloadChunk(url, start, end, attempt + 1).then(resolve).catch(reject), 2000 * attempt);
      } else {
        reject(e);
      }
    });
  });
}

async function main() {
  console.log(`[download-chunked] resolving ${url}`);
  const { length, acceptsRanges, finalUrl } = await getContentLength(url);
  console.log(`[download-chunked] size: ${(length / 1024 / 1024).toFixed(1)}MB, range: ${acceptsRanges}`);

  const outDir = path.dirname(path.resolve(outputPath));
  fs.mkdirSync(outDir, { recursive: true });

  if (!acceptsRanges || length === 0) {
    console.log('[download-chunked] no range support, trying single download...');
    // fallback: write stream
    await new Promise((resolve, reject) => {
      https.get(finalUrl, res => {
        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        res.on('error', reject);
      }).on('error', reject);
    });
    console.log(`[download-chunked] done: ${outputPath}`);
    return;
  }

  // Chunked download
  const fd = fs.openSync(outputPath, 'w');
  // Pre-allocate
  try { fs.ftruncateSync(fd, length); } catch {}

  let downloaded = 0;
  for (let start = 0; start < length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, length - 1);
    process.stdout.write(`\r[download-chunked] ${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(length / 1024 / 1024).toFixed(1)}MB`);
    const chunk = await downloadChunk(finalUrl, start, end);
    fs.writeSync(fd, chunk, 0, chunk.length, start);
    downloaded += chunk.length;
  }
  fs.closeSync(fd);
  console.log(`\n[download-chunked] done: ${outputPath} (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
}

main().catch(e => {
  console.error('[download-chunked] fatal:', e.message);
  process.exit(1);
});
