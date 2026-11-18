// Simultaneous mouse-look + keyboard-walk test.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/');
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(1000);

// Baseline: walk forward with NO mouse movement for 800ms
const base1 = await page.evaluate(() => {
  const g = window.game;
  return { pos: g.player.pos.clone(), yaw: g.camera.rotation.y };
});
await page.keyboard.down('KeyW');
await page.waitForTimeout(800);
const walkOnly = await page.evaluate(() => ({
  pos: window.game.player.pos.clone(),
  yaw: window.game.camera.rotation.y,
}));
await page.keyboard.up('KeyW');

// Reset player to same spot for a fair comparison
await page.evaluate((b) => {
  window.game.player.pos.copy(b.pos);
  window.game.player.vel.set(0, 0, 0);
}, base1);

// Now: walk forward WHILE sweeping the mouse for 800ms
await page.keyboard.down('KeyW');
const cx = 640, cy = 400;
await page.mouse.move(cx, cy);
for (let i = 1; i <= 16; i++) {
  await page.mouse.move(cx + i * 15, cy + Math.sin(i) * 40);
  await page.waitForTimeout(50);
}
const walkAndLook = await page.evaluate(() => ({
  pos: window.game.player.pos.clone(),
  yaw: window.game.camera.rotation.y,
  locked: document.pointerLockElement !== null,
}));
await page.keyboard.up('KeyW');

const distOnly = Math.hypot(walkOnly.pos.x - base1.pos.x, walkOnly.pos.z - base1.pos.z);
const distBoth = Math.hypot(walkAndLook.pos.x - base1.pos.x, walkAndLook.pos.z - base1.pos.z);
const yawDelta = Math.abs(walkAndLook.yaw - base1.yaw);

console.log('walk only:      moved', distOnly.toFixed(2), 'blocks');
console.log('walk + mouse:   moved', distBoth.toFixed(2), 'blocks, yaw changed by', yawDelta.toFixed(3), 'rad');
console.log('pointer still locked:', walkAndLook.locked);
console.log('LOOK works while walking:', yawDelta > 0.2);
console.log('WALK works while looking:', distBoth > 1.0);
console.log('walking speed unaffected:', distBoth > distOnly * 0.6);
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'No console errors.');
await browser.close();
