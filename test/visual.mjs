// Visual + performance verification via canvas pixel sampling.
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
await page.waitForTimeout(2000);

// aim at horizon-ish for a scenic frame
await page.evaluate(() => {
  const g = window.game;
  g.camera.lookAt(g.player.pos.x + 5, g.player.pos.y + 0.6, g.player.pos.z - 8);
});
await page.waitForTimeout(300);

const stats = await page.evaluate(() => {
  const g = window.game;
  const c = g.renderer.domElement;
  const g2 = document.createElement('canvas');
  g2.width = c.width; g2.height = c.height;
  const ctx = g2.getContext('2d');
  ctx.drawImage(c, 0, 0);
  const sample = (x, y) => {
    const d = ctx.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  // count visible chunk meshes / triangles
  let tris = 0, meshes = 0;
  g.world.group.traverse((o) => {
    if (o.isMesh && o.visible) {
      meshes++;
      const idx = o.geometry.getIndex();
      tris += idx ? idx.count / 3 : 0;
    }
  });
  // FPS measure
  return {
    topPixel: sample(0.5, 0.08),
    midPixel: sample(0.5, 0.5),
    bottomPixel: sample(0.5, 0.85),
    cornerPixel: sample(0.08, 0.5),
    tris, meshes,
    waterTiles: g.world.materials.water.map.offset.x,
    playerY: g.player.pos.y,
    seed: g.world.seed,
  };
});

// FPS: count frames over 2 seconds
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < 2000) requestAnimationFrame(tick);
    else resolve(frames / 2);
  };
  requestAnimationFrame(tick);
}));

// day/night: fast-forward time and check sky color changes
const skyChange = await page.evaluate(async () => {
  const g = window.game;
  const before = g.scene.background.clone();
  g.dayTime = 0.75; // midnight
  await new Promise((r) => setTimeout(r, 300));
  const after = g.scene.background.clone();
  return {
    changed: !before.equals(after),
    nightLuminance: (after.r + after.g + after.b) / 3,
    starsOpacity: g.stars.material.opacity,
  };
});

console.log(JSON.stringify({ stats, fps, skyChange, errors }, null, 2));

// pixel sanity checks
const [tr, tg, tb] = stats.topPixel; // sky should be blue-dominant
const skyBlue = tb > tr && tb > 100;
console.log(`\nsky is blueish: ${skyBlue} (rgb ${stats.topPixel})`);
console.log(`world triangles: ${stats.tris} across ${stats.meshes} meshes`);
console.log(`fps: ${fps.toFixed(0)}`);
await page.screenshot({ path: 'shots/scenic.png' });
await browser.close();
