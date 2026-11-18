// Pause menu, seed, and reset flow test.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/');

// custom seed
await page.fill('#seed-input', 'hello');
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(800);
const seed1 = await page.evaluate(() => window.game.world.seed);
console.log(`seed 'hello' -> ${seed1} (expect 1335831723)`);

// Simulate Escape via exitPointerLock (headless Chrome doesn't forward Escape to
// pointer lock; in real browsers Escape fires the same 'unlock' event).
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(300);
const pausedVisible = await page.isVisible('#pause-screen:not(.hidden)');
console.log(`Escape shows pause menu: ${pausedVisible}`);
const unlocked = await page.evaluate(() => document.pointerLockElement === null);
console.log(`pointer released: ${unlocked}`);

// resume again
await page.click('#resume-btn');
await page.waitForTimeout(500);
const relocked = await page.evaluate(() => document.pointerLockElement !== null);
console.log(`resume re-locks pointer: ${relocked}`);

// reset world
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(200);
await page.click('#reset-btn');
await page.waitForTimeout(300);
const startVisible = await page.isVisible('#start-screen:not(.hidden)');
console.log(`reset returns to start screen: ${startVisible}`);

// start fresh random world
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(600);
const state = await page.evaluate(() => ({
  seed: window.game.world.seed,
  running: window.game.running,
  chunks: window.game.world.chunkMeshes.length,
}));
console.log(`fresh world: seed=${state.seed} running=${state.running} chunks=${state.chunks}`);
console.log(`seed changed from previous: ${state.seed !== seed1}`);

console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'No console errors.');
await browser.close();
