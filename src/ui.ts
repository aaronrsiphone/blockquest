// HTML UI management: screens, hotbar, HUD.
import { HOTBAR, BLOCKS } from './blocks';
import { drawBlockIcon } from './textures';

export class UI {
  startScreen: HTMLElement;
  pauseScreen: HTMLElement;
  loadingScreen: HTMLElement;
  crosshair: HTMLElement;
  hotbarEl: HTMLElement;
  hudHint: HTMLElement;
  hudTime: HTMLElement;
  selected = 0;
  private slots: HTMLElement[] = [];
  private onSlotChange?: (i: number) => void;

  atlasCanvas: HTMLCanvasElement;

  constructor(atlasCanvas: HTMLCanvasElement) {
    this.atlasCanvas = atlasCanvas;
    this.startScreen = document.getElementById('start-screen')!;
    this.pauseScreen = document.getElementById('pause-screen')!;
    this.loadingScreen = document.getElementById('loading-screen')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.hotbarEl = document.getElementById('hotbar')!;
    this.hudHint = document.getElementById('hud-hint')!;
    this.hudTime = document.getElementById('hud-time')!;
    this.buildHotbar();
  }

  private buildHotbar() {
    HOTBAR.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const icon = document.createElement('canvas');
      icon.width = 48;
      icon.height = 48;
      drawBlockIcon(icon, BLOCKS[id].tiles, this.atlasCanvas);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = BLOCKS[id].name;
      slot.append(num, icon, name);
      slot.addEventListener('click', () => this.selectSlot(i));
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    });
    this.selectSlot(0);
  }

  selectSlot(i: number) {
    this.selected = ((i % 9) + 9) % 9;
    this.slots.forEach((s, j) => s.classList.toggle('selected', j === this.selected));
    this.onSlotChange?.(this.selected);
  }

  setSlotChangeListener(fn: (i: number) => void) {
    this.onSlotChange = fn;
  }

  selectedBlock(): number {
    return HOTBAR[this.selected];
  }

  showGameHud(show: boolean) {
    this.crosshair.classList.toggle('hidden', !show);
    this.hotbarEl.classList.toggle('hidden', !show);
    this.hudHint.classList.toggle('hidden', !show);
    this.hudTime.classList.toggle('hidden', !show);
  }

  setTimeText(t: string) {
    this.hudTime.textContent = t;
  }
}
