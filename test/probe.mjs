// Probe: measure real FPS + game behavior on a given URL.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8044/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const lines = [];
page.on('console', (m) => lines.push(m.text()));

await page.goto(url);
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(500);

// walk for 2s and measure
const r = await page.evaluate(async () => {
  const g = window.game;
  const start = g.player.pos.clone();
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  let frames = 0;
  const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  await new Promise((res) => setTimeout(res, 2000));
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  const dist = Math.hypot(g.player.pos.x - start.x, g.player.pos.z - start.z);
  return { dist2s: +dist.toFixed(2), fps: frames / 2, simTime: +g.clock.elapsedTime.toFixed(1) };
});
console.log(`\n=== ${url} ===`);
console.log(JSON.stringify(r));
console.log('--- [BQ] state lines ---');
lines.filter((l) => l.includes('state')).slice(-5).forEach((l) => console.log(l));
await browser.close();
