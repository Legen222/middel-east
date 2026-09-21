import { BOMBS, COLS, ROWS, SYMBOLS } from '../game/config';
import type { BlastWave, Cell, Coord, Grid } from '../game/types';
import { nextFrame, prefersReducedMotion, wait } from '../util/anim';
import type { FxLayer } from './fx';
import { sound } from './sound';

const artOf = (cell: Cell): string => (cell.kind === 'bomb' ? cell.id : cell.kind === 'symbol' ? cell.id : '');

const fmtValue = (v: number): string => (Number.isInteger(v) ? `${v}×` : `${v.toFixed(2).replace(/0$/, '')}×`);

/**
 * Owns the DOM for the 5x5 board and every tile animation. The engine hands
 * it finished spin data; this class is purely presentation.
 */
export class Board {
  private cells: HTMLDivElement[] = [];
  /** uid -> live tile element, so gravity can move the same node. */
  private tiles = new Map<number, HTMLDivElement>();

  constructor(
    private root: HTMLDivElement,
    private fx: FxLayer,
  ) {
    this.buildCells();
  }

  private buildCells(): void {
    this.root.replaceChildren();
    this.cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.setAttribute('role', 'gridcell');
        this.root.append(cell);
        this.cells.push(cell);
      }
    }
  }

  private cellAt(at: Coord): HTMLDivElement {
    return this.cells[at.r * COLS + at.c];
  }

  private makeTile(cell: Cell): HTMLDivElement | null {
    if (cell.kind === 'empty') return null;
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.uid = String(cell.uid);

    const art = artOf(cell);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'tile-art');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#sym-${art}`);
    svg.append(use);
    el.append(svg);

    if (cell.kind === 'bomb') {
      const def = BOMBS[cell.id];
      el.classList.add('is-bomb');
      el.style.setProperty('--tile-a', shade(def.accent, 0.32));
      el.style.setProperty('--tile-b', shade(def.accent2, 0.6));
      el.setAttribute('aria-label', `${def.name}, ${def.shape}, worth ${fmtValue(cell.value)}`);
      const fuse = document.createElement('span');
      fuse.className = 'fuse';
      el.append(fuse);
    } else {
      const def = SYMBOLS[cell.id];
      if (cell.id === 'scatter') el.classList.add('is-scatter');
      else if (cell.id === 'crate') el.classList.add('is-crate');
      else if (cell.value > 0) el.classList.add('is-loot');
      el.setAttribute('aria-label', cell.value > 0 ? `${def.name}, ${fmtValue(cell.value)}` : def.name);
    }

    if (cell.value > 0) {
      const badge = document.createElement('span');
      badge.className = 'tile-value';
      badge.textContent = fmtValue(cell.value);
      el.append(badge);
    }

    this.tiles.set(cell.uid, el);
    return el;
  }

  /** Wipe every tile without animating. */
  clear(): void {
    for (const cell of this.cells) cell.replaceChildren();
    this.tiles.clear();
    this.fx.clear();
  }

  /** Render a grid instantly, no motion. */
  render(grid: Grid): void {
    this.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.makeTile(grid[r][c]);
        if (tile) this.cellAt({ r, c }).append(tile);
      }
    }
  }

  /** Drop the whole board in, column by column. */
  async dropIn(grid: Grid): Promise<void> {
    this.clear();
    const perColumn = 52;
    const perRow = 26;

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = this.makeTile(grid[r][c]);
        if (!tile) continue;
        tile.style.setProperty('--from-y', `${-(r + 2) * 130}%`);
        tile.style.animationDelay = `calc(${c * perColumn + r * perRow}ms / var(--speed))`;
        tile.classList.add('dropping');
        this.cellAt({ r, c }).append(tile);
      }
    }

    sound.play('drop');
    await wait(perColumn * COLS + perRow * ROWS + 220);
    for (const tile of this.tiles.values()) {
      tile.classList.remove('dropping');
      tile.style.removeProperty('animation-delay');
    }
    sound.play('land');
  }

  /** Light the fuses on every bomb and tint the cells they are about to clear. */
  async armBombs(wave: BlastWave, grid: Grid): Promise<void> {
    const marked = new Set<string>();
    for (const bomb of wave.bombs) {
      const el = this.tileAt(grid, bomb.at);
      el?.classList.add('arming');
      for (const target of BOMBS[bomb.id].footprint(bomb.at)) {
        if (target.r < 0 || target.r >= ROWS || target.c < 0 || target.c >= COLS) continue;
        marked.add(`${target.r}:${target.c}`);
      }
    }
    for (const key of marked) {
      const [r, c] = key.split(':').map(Number);
      const el = this.tileAt(grid, { r, c });
      if (el && !el.classList.contains('arming')) el.classList.add('marked');
    }
    sound.play('arm');
    await wait(prefersReducedMotion() ? 120 : 620);
  }

  private tileAt(grid: Grid, at: Coord): HTMLDivElement | undefined {
    const cell = grid[at.r]?.[at.c];
    if (!cell || cell.kind === 'empty') return undefined;
    return this.tiles.get(cell.uid);
  }

  /**
   * Detonate a wave: bombs pop, everything in the footprint is thrown outward
   * and its coin value flies off to the win counter.
   */
  async detonate(wave: BlastWave, grid: Grid, coinTarget: HTMLElement | null): Promise<void> {
    const bombKeys = new Set(wave.bombs.map((b) => `${b.at.r}:${b.at.c}`));
    let power = 0;

    for (const bomb of wave.bombs) {
      const def = BOMBS[bomb.id];
      power = Math.max(power, def.shake);
      const el = this.tileAt(grid, bomb.at);
      el?.classList.remove('arming');
      el?.classList.add('detonating');
      this.shockwave(bomb.at, def.accent);
      this.fx.explode((bomb.at.c + 0.5) / COLS, (bomb.at.r + 0.5) / ROWS, def.shake, def.accent);
    }

    this.flash(wave.bombs[0]?.at ?? { r: 2, c: 2 });
    this.shake(power);
    sound.play(power > 0.5 ? 'blast-big' : 'blast-small', 0.7 + power);

    // Throw the cleared tiles away from the nearest bomb.
    for (const hit of wave.cleared) {
      const key = `${hit.at.r}:${hit.at.c}`;
      if (bombKeys.has(key)) continue;
      const el = this.tileAt(grid, hit.at);
      if (!el) continue;
      el.classList.remove('marked');
      const origin = nearest(wave.bombs.map((b) => b.at), hit.at);
      const dx = hit.at.c - origin.c;
      const dy = hit.at.r - origin.r;
      const len = Math.hypot(dx, dy) || 1;
      el.style.setProperty('--fly-x', `${(dx / len) * 150 + (Math.random() - 0.5) * 40}%`);
      el.style.setProperty('--fly-y', `${(dy / len) * 150 - 60 + (Math.random() - 0.5) * 40}%`);
      el.style.setProperty('--spin-a', `${(Math.random() - 0.5) * 18}deg`);
      el.style.setProperty('--spin-b', `${(Math.random() - 0.5) * 220}deg`);
      el.classList.add('blasting');
    }

    await wait(200);

    // Coin values arc toward the win readout.
    const scoring = wave.cleared.filter((hit) => hit.value > 0);
    if (scoring.length > 0 && coinTarget) {
      const boardRect = this.root.getBoundingClientRect();
      const targetRect = coinTarget.getBoundingClientRect();
      scoring.forEach((hit, i) => {
        setTimeout(() => {
          this.flyCoin(hit.at, hit.value, boardRect, targetRect);
          sound.play('coin');
        }, i * 42);
      });
    }

    await wait(260);
    for (const hit of wave.cleared) {
      const el = this.tileAt(grid, hit.at);
      el?.remove();
    }
    if (scoring.length > 0) await wait(Math.min(420, scoring.length * 42));
  }

  private flyCoin(at: Coord, value: number, boardRect: DOMRect, targetRect: DOMRect): void {
    const cellRect = this.cellAt(at).getBoundingClientRect();
    const coin = document.createElement('span');
    coin.className = 'coin-fly';
    coin.textContent = fmtValue(value);
    coin.style.left = `${cellRect.left - boardRect.left + cellRect.width / 2}px`;
    coin.style.top = `${cellRect.top - boardRect.top + cellRect.height / 2}px`;
    coin.style.setProperty('--to-x', `${targetRect.left + targetRect.width / 2 - cellRect.left - cellRect.width / 2}px`);
    coin.style.setProperty('--to-y', `${targetRect.top + targetRect.height / 2 - cellRect.top - cellRect.height / 2}px`);
    this.root.append(coin);
    setTimeout(() => coin.remove(), 1200);
  }

  /** Slide survivors into the crater and drop fresh tiles from above. */
  async collapse(wave: BlastWave): Promise<void> {
    for (const drop of wave.drops) {
      const el = this.tiles.get(drop.uid);
      if (!el) continue;
      const rows = drop.to.r - drop.from.r;
      el.style.setProperty('--from-y', `${-rows * 100 - rows * 4.5}%`);
      el.classList.remove('falling');
      this.cellAt(drop.to).append(el);
    }

    const spawned: HTMLDivElement[] = [];
    for (const at of wave.spawns) {
      const tile = this.makeTile(wave.gridAfterRefill[at.r][at.c]);
      if (!tile) continue;
      tile.style.setProperty('--from-y', `${-(at.r + 2) * 130}%`);
      tile.classList.add('dropping');
      this.cellAt(at).append(tile);
      spawned.push(tile);
    }

    await nextFrame();
    for (const drop of wave.drops) {
      this.tiles.get(drop.uid)?.classList.add('falling');
    }

    sound.play('drop');
    await wait(400);

    for (const drop of wave.drops) {
      const el = this.tiles.get(drop.uid);
      el?.classList.remove('falling');
      el?.style.removeProperty('--from-y');
      if (drop.to.r === ROWS - 1) this.fx.dust((drop.to.c + 0.5) / COLS, 0.97);
    }
    for (const tile of spawned) tile.classList.remove('dropping');
    sound.play('land');
  }

  /** Big multiplier stamp in the middle of the board. */
  async stampMultiplier(multiplier: number): Promise<void> {
    const stamp = document.createElement('div');
    stamp.className = 'chain-stamp';
    stamp.textContent = `×${multiplier}`;
    stamp.style.left = '50%';
    stamp.style.top = '42%';
    this.root.append(stamp);
    sound.play('chain', Math.log2(multiplier) + 1);
    await wait(560);
    setTimeout(() => stamp.remove(), 600);
  }

  private shockwave(at: Coord, color: string): void {
    const ring = document.createElement('div');
    ring.className = 'shock';
    const rect = this.cellAt(at).getBoundingClientRect();
    const boardRect = this.root.getBoundingClientRect();
    const size = Math.max(boardRect.width, boardRect.height) * 0.9;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.left = `${rect.left - boardRect.left + rect.width / 2}px`;
    ring.style.top = `${rect.top - boardRect.top + rect.height / 2}px`;
    ring.style.borderColor = color;
    this.root.append(ring);
    setTimeout(() => ring.remove(), 900);
  }

  private flash(at: Coord): void {
    this.root.style.setProperty('--fx', `${((at.c + 0.5) / COLS) * 100}%`);
    this.root.style.setProperty('--fy', `${((at.r + 0.5) / ROWS) * 100}%`);
    this.root.classList.remove('flash');
    void this.root.offsetWidth;
    this.root.classList.add('flash');
    setTimeout(() => this.root.classList.remove('flash'), 500);
  }

  private shake(power: number): void {
    if (prefersReducedMotion()) return;
    this.root.style.setProperty('--shake', String(Math.max(0.3, power)));
    this.root.classList.remove('shaking');
    void this.root.offsetWidth;
    this.root.classList.add('shaking');
    setTimeout(() => this.root.classList.remove('shaking'), 700);
  }

  /** Mark a tile as held during the Minefield feature. */
  lock(at: Coord, grid: Grid): void {
    const el = this.tileAt(grid, at);
    el?.classList.add('locked');
  }

  /** Highlight the surviving scatters / crates that triggered a feature. */
  async celebrateFeature(coords: Coord[], grid: Grid, cue: 'scatter' | 'crate'): Promise<void> {
    for (const at of coords) {
      const el = this.tileAt(grid, at);
      if (!el) continue;
      el.classList.add('locked');
      this.fx.explode((at.c + 0.5) / COLS, (at.r + 0.5) / ROWS, 0.3, cue === 'scatter' ? '#f0c14b' : '#c2a35e');
      sound.play(cue);
      await wait(180);
    }
    await wait(260);
  }

  /** Show a short message centred on the board. */
  async notice(text: string, ms = 1100): Promise<void> {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const node = document.createElement('div');
    node.className = 'notice';
    node.textContent = text;
    overlay.append(node);
    await wait(ms);
    node.remove();
  }
}

function nearest(origins: Coord[], at: Coord): Coord {
  let best = origins[0] ?? at;
  let bestDist = Infinity;
  for (const origin of origins) {
    const d = (origin.r - at.r) ** 2 + (origin.c - at.c) ** 2;
    if (d < bestDist) { bestDist = d; best = origin; }
  }
  return best;
}

/** Darken a hex colour toward black by `amount` (0..1). */
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const to = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    return Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  };
  return `#${to(0)}${to(2)}${to(4)}`;
}
