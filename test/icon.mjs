// Generate the BLOCKQUEST desktop icon from the game's own hotbar block art.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 4 });
await page.goto('http://localhost:8044/');
await page.waitForTimeout(1500);

// Upscale the grass-block hotbar icon (pixelated) and export as PNG
const dataUrl = await page.evaluate(() => {
  const canvas = document.querySelector('#hotbar .slot canvas');
  const big = document.createElement('canvas');
  big.width = 256;
  big.height = 256;
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 32, 32, 192, 192);
  return big.toDataURL('image/png');
});

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync(
  'icons/blockquest-icon.png',
  Buffer.from(dataUrl.split(',')[1], 'base64')
);
console.log('icon written: icons/blockquest-icon.png');

// sanity check with the pixel analyzer
await browser.close();
