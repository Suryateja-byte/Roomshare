import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outputDir = join(process.cwd(), 'public/icons');

mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background - dark zinc color (#18181b)
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, size, size);
  
  // Rounded corners effect (simplified as we just fill)
  
  // "R" letter - white
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', size / 2, size / 2 + size * 0.05);
  
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(join(outputDir, `icon-${size}.png`), buffer);
  console.log(`Generated icon-${size}.png`);
}
