const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outputDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background with rounded corners
  const radius = size * 0.15;
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();
  
  // "R" letter in white
  ctx.fillStyle = '#ffffff';
  const fontSize = Math.floor(size * 0.55);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', size / 2, size / 2 + size * 0.03);
  
  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${filePath}`);
});

console.log('All icons generated!');
