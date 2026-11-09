const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '../public/assets/orchard');
let originalBytes = 0;
let optimizedBytes = 0;
let count = 0;

for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(root, directory.name))) {
    if (!file.endsWith('.png')) continue;
    const source = path.join(root, directory.name, file);
    const output = source.replace(/\.png$/, '.webp');
    const png = fs.readFileSync(source);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const scale = Math.min(1, 768 / Math.max(width, height));
    const result = spawnSync('cwebp', [
      '-quiet', '-q', '90', '-alpha_q', '100', '-m', '6', '-sharp_yuv',
      '-resize', String(Math.max(1, Math.round(width * scale))),
      String(Math.max(1, Math.round(height * scale))), source, '-o', output,
    ], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `Unable to optimize ${source}`);
    originalBytes += png.length;
    optimizedBytes += fs.statSync(output).size;
    count++;
  }
}
console.log(JSON.stringify({ count, originalBytes, optimizedBytes, reductionPct: Math.round((1 - optimizedBytes / originalBytes) * 100) }));
