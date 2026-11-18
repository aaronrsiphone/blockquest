// Is the -0.35 dy real floor sinking or water? Test stationary on solid ground.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/');
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(1000);

const out = await page.evaluate(async () => {
  const g = window.game;
  const p = g.player;
  const samples = [];
  // stand perfectly still for 3 seconds
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    samples.push({
      t: i * 0.5,
      y: +p.pos.y.toFixed(4),
      onGround: p.onGround,
      feetBlock: g.world.getBlock(bx, Math.floor(p.pos.y - 0.1), bz),
      belowBlock: g.world.getBlock(bx, Math.floor(p.pos.y) - 1, bz),
      velY: +p.vel.y.toFixed(3),
    });
  }
  return samples;
});
console.table ? console.table(out) : console.log(out);
for (const s of out) console.log(JSON.stringify(s));
await browser.close();
