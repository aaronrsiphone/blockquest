// Verify PLC mouse-look code path with realistic locked-pointer events
// (MouseEvent with movementX/movementY, as a real browser delivers when locked),
// while simultaneously holding a walk key.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/');
await page.click('#play-btn');
await page.waitForSelector('#pause-screen:not(.hidden)', { timeout: 20000 });
await page.click('#resume-btn');
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
  const g = window.game;
  const startPos = g.player.pos.clone();
  const startDir = new THREE.Vector3();
  g.camera.getWorldDirection(startDir);

  // hold forward key (same as real keydown handler)
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

  // simulate mouse-look: browser sends mousemove w/ movementX while locked.
  // Burst dispatched synchronously (headless timers are heavily throttled).
  const t0 = performance.now();
  let lookEvents = 0;
  for (let i = 0; i < 40; i++) {
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 14, movementY: -2 })
    );
    lookEvents++;
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 50));
  }
  const lookMs = performance.now() - t0;
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

  const endDir = new THREE.Vector3();
  g.camera.getWorldDirection(endDir);
  const angle = startDir.angleTo(endDir);
  const dist = Math.hypot(g.player.pos.x - startPos.x, g.player.pos.z - startPos.z);
  return { lookEvents, lookMs, angleDeg: (angle * 180) / Math.PI, walked: dist };
});

console.log(`look events delivered: ${result.lookEvents} in ${result.lookMs.toFixed(0)}ms`);
console.log(`camera rotated:        ${result.angleDeg.toFixed(1)}° while walking`);
console.log(`player walked:         ${result.walked.toFixed(2)} blocks while turning`);
console.log(
  'SIMULTANEOUS LOOK+WALK:',
  result.angleDeg > 30 && result.walked > 0.5 ? 'WORKS ✓' : 'BROKEN ✗'
);
await browser.close();
