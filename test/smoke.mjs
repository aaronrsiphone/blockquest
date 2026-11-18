// Automated smoke test for BLOCKQUEST using Playwright.
import { chromium } from 'playwright';

const results = [];
const errors = [];
function check(name, cond) {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) process.exitCode = 1;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/start-screen.png' });
check('start screen visible', await page.isVisible('#start-screen'));

// start game
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.waitForTimeout(500);
check('world generated, pause shown', await page.isVisible('#pause-screen'));
check('hotbar visible', await page.isVisible('#hotbar'));
const slotCount = await page.locator('#hotbar .slot').count();
check('9 hotbar slots', slotCount === 9);

// enter world (pointer lock)
await page.click('#resume-btn');
await page.waitForTimeout(1500);
const locked = await page.evaluate(() => document.pointerLockElement !== null);
check('pointer lock engaged', locked);
await page.screenshot({ path: 'shots/game.png' });

// movement test: walk forward 1.2s
const posBefore = await page.evaluate(() => {
  const g = window.game;
  return [g.player.pos.x, g.player.pos.y, g.player.pos.z];
});
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
const posAfter = await page.evaluate(() => {
  const g = window.game;
  return [g.player.pos.x, g.player.pos.y, g.player.pos.z];
});
const dist = Math.hypot(posAfter[0] - posBefore[0], posAfter[2] - posBefore[2]);
check(`walking moves player (dist=${dist.toFixed(2)})`, dist > 2);

// gravity / standing test: respawn (drops from ~2 blocks up), wait for landing,
// then y must be stable (not sinking)
await page.evaluate(() => window.game.player.respawn());
await page.waitForTimeout(1500);
const y1 = await page.evaluate(() => window.game.player.pos.y);
await page.waitForTimeout(1500);
const y2 = await page.evaluate(() => window.game.player.pos.y);
check(`no floor sinking (dy=${(y2 - y1).toFixed(4)})`, Math.abs(y2 - y1) < 0.05);

// jump test
const jy1 = await page.evaluate(() => window.game.player.pos.y);
await page.keyboard.down('Space');
await page.waitForTimeout(400);
await page.keyboard.up('Space');
const jy2 = await page.evaluate(() => window.game.player.pos.y);
check(`jump gains height (dy=${(jy2 - jy1).toFixed(2)})`, jy2 - jy1 > 0.4);

// aim down and test block break/place
await page.evaluate(() => {
  const g = window.game;
  const p = g.player.pos.clone();
  g.camera.lookAt(p.x, p.y - 2, p.z);
});
await page.waitForTimeout(100);
const broke = await page.evaluate(() => {
  const g = window.game;
  const hit = g.world.raycast(g.camera.position, g.camera.getWorldDirection(new THREE.Vector3()), 6);
  if (!hit) return { ok: false, why: 'no target under crosshair' };
  const before = g.world.getBlock(hit.x, hit.y, hit.z);
  g.breakBlock();
  const after = g.world.getBlock(hit.x, hit.y, hit.z);
  return { ok: before !== 0 && after === 0, before, after };
});
check(`break block (${JSON.stringify(broke)})`, broke.ok);

const placed = await page.evaluate(() => {
  const g = window.game;
  const hit = g.world.raycast(g.camera.position, g.camera.getWorldDirection(new THREE.Vector3()), 6);
  if (!hit) return { ok: false };
  const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
  g.placeBlock();
  return { ok: g.world.getBlock(tx, ty, tz) !== 0, block: g.world.getBlock(tx, ty, tz) };
});
check(`place block (${JSON.stringify(placed)})`, placed.ok);

// hotbar selection via keys
await page.keyboard.press('Digit5');
const sel = await page.evaluate(() => window.game.ui.selected);
check('hotbar key 5 selects slot 4', sel === 4);

// TNT: place below and ignite
const tnt = await page.evaluate(async () => {
  const g = window.game;
  const p = g.player.pos;
  const x = Math.floor(p.x), z = Math.floor(p.z);
  // find ground below
  let y = Math.floor(p.y);
  while (y > 0 && g.world.getBlock(x, y - 1, z) === 0) y--;
  g.world.setBlock(x, y, z, 12); // TNT
  g.igniteTnt(x, y, z);
  await new Promise((r) => setTimeout(r, 4000));
  const remaining = g.world.getBlock(x, y, z);
  return { placed: true, remaining, tntsLeft: g.tnts.length };
});
check(`TNT explodes (remaining=${tnt.remaining}, fuses=${tnt.tntsLeft})`, tnt.remaining === 0 && tnt.tntsLeft === 0);

// flight toggle (respawn first — the TNT crater may have moved the player)
await page.evaluate(() => window.game.player.respawn());
await page.waitForTimeout(500);
const fly = await page.evaluate(() => {
  const g = window.game;
  const was = g.player.flying;
  g.player.tryToggleFly(g.clock.elapsedTime + 1);
  g.player.tryToggleFly(g.clock.elapsedTime + 1.05);
  return g.player.flying !== was;
});
check('double-tap space toggles flight', fly);

// flight actually lifts
await page.keyboard.down('Space');
await page.waitForTimeout(700);
await page.keyboard.up('Space');
const flyY = await page.evaluate(() => window.game.player.pos.y);
check(`flight ascends (y=${flyY.toFixed(1)})`, flyY > y2 + 1);

// save + reset buttons exist
check('save button works', await page.evaluate(() => { document.getElementById('save-btn').click(); return localStorage.getItem('blockquest_save_v1') !== null; }));

await page.screenshot({ path: 'shots/final.png' });

console.log(results.join('\n'));
if (errors.length) {
  console.log('\nERRORS:');
  errors.forEach((e) => console.log('  ' + e));
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
await browser.close();
