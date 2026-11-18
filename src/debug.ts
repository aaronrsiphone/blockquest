// Debug instrumentation: console logging + on-screen HUD chip.
// Logs lock state, key events, mousemove delivery (movementX/Y), yaw changes.

import * as THREE from 'three';

export interface DebugTarget {
  camera: THREE.PerspectiveCamera;
  controls: { isLocked: boolean };
  input: { forward: boolean; back: boolean; left: boolean; right: boolean };
  player: { pos: THREE.Vector3 };
}

export class DebugMonitor {
  private chip: HTMLDivElement;
  private mouseEvents = 0;
  private sumAbsMX = 0;
  private zeroMX = 0; // events with movementX === 0
  private patched = 0; // events where we injected a clientX-based fallback
  private yawDeltaAccum = 0;
  private lastYaw = 0;
  private lastReport = performance.now();
  private lastChip = 0;
  private fps = 60;
  private detailedLogged = 0;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;
  private t0 = performance.now();
  private game: DebugTarget;

  constructor(game: DebugTarget) {
    this.game = game;
    this.chip = document.createElement('div');
    this.chip.style.cssText = `position:fixed;bottom:2px;left:4px;z-index:999;font:11px monospace;
      color:#fff;text-shadow:1px 1px 0 #000;background:rgba(0,0,0,.45);padding:3px 6px;border-radius:4px;
      pointer-events:none;white-space:pre;`;
    document.body.appendChild(this.chip);

    const log = (...a: unknown[]) => console.log('[BQ]', ...a);

    log('boot', {
      ua: navigator.userAgent,
      three: THREE.REVISION,
      platform: navigator.platform,
      time: new Date().toISOString(),
    });

    document.addEventListener('pointerlockchange', () => {
      const el = document.pointerLockElement;
      log(`pointerlockchange: element=${el ? (el as HTMLElement).tagName : 'null'} PLC.isLocked=${game.controls.isLocked}`);
    });
    document.addEventListener('pointerlockerror', () => {
      log('POINTERLOCK ERROR — browser refused pointer lock');
    });

    document.addEventListener('keydown', (e) => {
      if (!e.repeat) log(`key down  ${e.code}`);
    });
    document.addEventListener('keyup', (e) => {
      log(`key up    ${e.code}`);
    });

    // Patch window capture-phase: fallback for setups where movementX is
    // always 0 while locked (some Linux display servers). Runs BEFORE
    // PointerLockControls' document-level bubble listener.
    window.addEventListener(
      'mousemove',
      (e) => {
        if (document.pointerLockElement) {
          const locked = game.controls.isLocked;
          this.mouseEvents++;
          const mx = e.movementX, my = e.movementY;
          this.sumAbsMX += Math.abs(mx);
          if (mx === 0 && my === 0) this.zeroMX++;

          // Detailed dump of the first events — reveals zero/missing movementX
          if (this.detailedLogged < 12) {
            this.detailedLogged++;
            log(
              `mouse #${this.detailedLogged}: movementX=${mx} movementY=${my} clientX=${e.clientX} clientY=${e.clientY} locked=${locked}`
            );
          }

          // Fallback: inject clientX-delta as movement when the browser
          // reports none but the pointer position is actually changing.
          if (mx === 0 && my === 0 && this.lastClientX !== null && this.lastClientY !== null) {
            const dx = e.clientX - this.lastClientX;
            const dy = e.clientY - this.lastClientY;
            if (dx !== 0 || dy !== 0) {
              try {
                Object.defineProperty(e, 'movementX', { value: dx });
                Object.defineProperty(e, 'movementY', { value: dy });
                this.patched++;
                if (this.patched <= 3) console.log('[BQ]', `movementX fallback patched: dx=${dx} dy=${dy}`);
              } catch {
                /* read-only event — nothing we can do */
              }
            }
          }
        }
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      },
      true // capture phase — before PLC's listener
    );
  }

  update(dt: number) {
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    const yaw = this.game.camera.rotation.y;
    this.yawDeltaAccum += yaw - this.lastYaw;
    this.lastYaw = yaw;

    const now = performance.now();

    // console report ~1/s while locked
    if (now - this.lastReport > 1000 && document.pointerLockElement) {
      this.lastReport = now;
      const keys = [
        this.game.input.forward && 'W',
        this.game.input.back && 'S',
        this.game.input.left && 'A',
        this.game.input.right && 'D',
      ].filter(Boolean).join('');
      const secs = (now - this.t0) / 1000;
      console.log(
        `[BQ] state t=${secs.toFixed(0)}s lock=${this.game.controls.isLocked} keys=[${keys || '-'}] ` +
          `mouse=${this.mouseEvents}ev/s Σ|mx|=${this.sumAbsMX} zeroMX=${this.zeroMX} patched=${this.patched} ` +
          `Δyaw=${((this.yawDeltaAccum * 180) / Math.PI).toFixed(1)}°/s fps=${this.fps.toFixed(0)} ` +
          `pos=(${this.game.player.pos.x.toFixed(1)},${this.game.player.pos.y.toFixed(1)},${this.game.player.pos.z.toFixed(1)})`
      );
      this.mouseEvents = 0;
      this.sumAbsMX = 0;
      this.zeroMX = 0;
      this.patched = 0;
      this.yawDeltaAccum = 0;
    }

    // chip ~7/s
    if (now - this.lastChip > 150) {
      this.lastChip = now;
      const keys = [
        this.game.input.forward && 'W',
        this.game.input.back && 'S',
        this.game.input.left && 'A',
        this.game.input.right && 'D',
      ].filter(Boolean).join('');
      const locked = document.pointerLockElement ? '✓' : '✗';
      this.chip.textContent =
        `🔒${locked} mv:${String(this.mouseEvents).padStart(3)}ev Σmx:${String(this.sumAbsMX).padStart(4)} ` +
        `Δyaw:${((this.yawDeltaAccum * 180) / Math.PI).toFixed(1).padStart(6)}° keys:${keys || '-'} ` +
        `fps:${this.fps.toFixed(0)} y:${this.game.player.pos.y.toFixed(1)}`;
    }
  }
}
