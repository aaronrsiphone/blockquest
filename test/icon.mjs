// Generate the BLOCKQUEST desktop icon from the game's own hotbar block art.
// Renders a large 512x512 icon with the block filling the frame.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://localhost:8044/');
await page.waitForTimeout(1500);

// Upscale the grass-block hotbar icon (pixelated) to fill a 512px canvas
const dataUrl = await page.evaluate(() => {
  const canvas = document.querySelector('#hotbar .slot canvas');
  const big = document.createElement('canvas');
  big.width = 512;
  big.height = 512;
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // source block art nearly fills its 48px canvas; scale to ~96% of the icon
  ctx.drawImage(canvas, 10, 10, 492, 492);
  return big.toDataURL('image/png');
});

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync(
  'icons/blockquest-icon.png',
  Buffer.from(dataUrl.split(',')[1], 'base64')
);
console.log('icon written: icons/blockquest-icon.png (512x512, block fills frame)');
await browser.close();
