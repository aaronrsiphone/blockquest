// Debug: do locked-pointer mousemove events carry movementX in headless?
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/');
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(800);

const events = await page.evaluate(() => {
  const seen = [];
  document.addEventListener('mousemove', (e) => {
    seen.push({ mx: e.movementX, my: e.movementY, cx: e.clientX, cy: e.clientY });
  });
  return seen;
});

await page.mouse.move(640, 400);
for (let i = 1; i <= 5; i++) {
  await page.mouse.move(640 + i * 40, 400 + i * 10);
  await page.waitForTimeout(60);
}
console.log('mousemove events seen:', JSON.stringify(events, null, 1));
const totalMx = events.reduce((s, e) => s + e.mx, 0);
console.log('total movementX:', totalMx);

const cam = await page.evaluate(() => {
  const g = window.game;
  const d = new THREE.Vector3();
  g.camera.getWorldDirection(d);
  return { dir: [d.x, d.y, d.z], locked: document.pointerLockElement !== null };
});
console.log('camera dir after moves:', JSON.stringify(cam));
await browser.close();
