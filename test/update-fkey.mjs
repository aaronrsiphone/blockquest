// Test the Update button UI and the F jump key.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:8044/');
await page.waitForTimeout(800);

// Update button visible and works (repo is at latest commit -> "Already up to date")
const updateVisible = await page.isVisible('#update-btn');
await page.click('#update-btn');
await page.waitForSelector('#update-msg:not(:empty)', { timeout: 15000 });
const updateMsg = await page.textContent('#update-msg');
console.log('update button visible:', updateVisible);
console.log('update result:', JSON.stringify(updateMsg?.trim()));

// the update success path auto-reloads the page — wait for it, then re-navigate
await page.waitForTimeout(2000);
await page.goto('http://localhost:8044/');
await page.waitForTimeout(800);

// F key jumps: enter game, press F, check height gain
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(1500);

const fJump = await page.evaluate(async () => {
  const g = window.game;
  await new Promise((r) => setTimeout(r, 800)); // settle on ground
  const y1 = g.player.pos.y;
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
  await new Promise((r) => setTimeout(r, 350));
  const yUp = g.player.pos.y;
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
  await new Promise((r) => setTimeout(r, 1200)); // land
  return { gain: +(yUp - y1).toFixed(2), landed: +g.player.pos.y.toFixed(2) === +y1.toFixed(2) };
});
console.log(`F key jump: gained ${fJump.gain} blocks, landed back: ${fJump.landed}`);

// double-tap F toggles flight
const fFly = await page.evaluate(() => {
  const g = window.game;
  const was = g.player.flying;
  g.player.tryToggleFly(g.clock.elapsedTime + 1);
  g.player.tryToggleFly(g.clock.elapsedTime + 1.05);
  return g.player.flying !== was;
});
console.log('double-tap F toggles flight:', fFly);

console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'No console errors.');
await browser.close();
