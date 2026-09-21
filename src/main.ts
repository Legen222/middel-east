import './styles/index.css';

import { mountSprite } from './art/symbols';
import {
  BET_STEPS, BUY_FEATURE, COLS, CRATES_FOR_MINEFIELD, DEFAULT_BALANCE,
  JACKPOTS, MINEFIELD_RESPINS, ROWS, SCATTERS_FOR_FREE,
} from './game/config';
import { cloneGrid, playFreeSpins, spin } from './game/engine';
import { Rng } from './game/rng';
import type { Cell, Grid, MinefieldResult, SpinResult } from './game/types';
import { Board } from './render/board';
import { FxLayer } from './render/fx';
import { sound } from './render/sound';
import { Ui } from './render/ui';
import { money } from './render/ui';
import { setSpeed, wait } from './util/anim';

const SAVE_KEY = 'sandstorm-siege/v1';

interface Persisted {
  balance: number;
  betIndex: number;
  turbo: boolean;
  muted: boolean;
}

function load(): Persisted {
  const fallback: Persisted = { balance: DEFAULT_BALANCE, betIndex: 4, turbo: false, muted: false };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      balance: Number.isFinite(parsed.balance) ? Math.max(0, parsed.balance as number) : fallback.balance,
      betIndex: typeof parsed.betIndex === 'number' && BET_STEPS[parsed.betIndex] !== undefined
        ? parsed.betIndex : fallback.betIndex,
      turbo: Boolean(parsed.turbo),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return fallback;
  }
}

/** `?seed=123` makes a session reproducible, which keeps demos and bug
 *  reports repeatable. */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : undefined;
}

class Game {
  private rng: Rng;
  private board: Board;
  private ui: Ui;
  private state = load();
  private busy = false;
  private autoRemaining = 0;
  private stopRequested = false;

  constructor() {
    const seed = seedFromUrl();
    this.rng = seed === undefined ? new Rng() : new Rng(seed);
    mountSprite();
    const fx = new FxLayer(document.getElementById('fx') as HTMLCanvasElement);
    this.board = new Board(document.getElementById('board') as HTMLDivElement, fx);
    this.ui = new Ui({
      onSpin: () => void this.onSpinPressed(),
      onBetChange: (delta) => this.changeBet(delta),
      onToggleTurbo: () => this.toggleTurbo(),
      onAutoplay: (count) => void this.startAutoplay(count),
      onStopAuto: () => this.stopAutoplay(),
      onBuy: (which) => void this.buyFeature(which),
    });

    sound.setEnabled(!this.state.muted);
    document.getElementById('btn-sound')?.classList.toggle('muted', this.state.muted);
    setSpeed(this.state.turbo ? 2.1 : 1);

    this.ui.setBalance(this.state.balance);
    this.ui.setBet(this.bet);
    this.ui.setWinInstant(0);
    this.ui.setChain(1);
    this.ui.setMode('Base Game', false);
    this.ui.setFreeSpins(null);
    this.ui.setTurbo(this.state.turbo);
    this.ui.setAutoplay(0);

    this.board.render(this.idleGrid());
  }

  private get bet(): number { return BET_STEPS[this.state.betIndex]; }

  private save(): void {
    this.state.muted = sound.muted;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch { /* private mode */ }
  }

  /** A quiet, bomb-free board to look at before the first spin. */
  private idleGrid(): Grid {
    const rng = new Rng(20260921);
    let grid = spin(rng, { kind: 'base', persistentMultiplier: 1 }).initialGrid;
    for (let attempt = 0; attempt < 40; attempt++) {
      const hasBomb = grid.flat().some((cell) => cell.kind === 'bomb');
      if (!hasBomb) break;
      grid = spin(rng, { kind: 'base', persistentMultiplier: 1 }).initialGrid;
    }
    return cloneGrid(grid);
  }

  // ---------- controls ----------

  private changeBet(delta: number): void {
    if (this.busy) return;
    const next = this.state.betIndex + delta;
    if (next < 0 || next >= BET_STEPS.length) return;
    this.state.betIndex = next;
    this.ui.setBet(this.bet);
    this.save();
  }

  private toggleTurbo(): void {
    this.state.turbo = !this.state.turbo;
    setSpeed(this.state.turbo ? 2.1 : 1);
    this.ui.setTurbo(this.state.turbo);
    this.save();
  }

  private async startAutoplay(count: number): Promise<void> {
    this.autoRemaining = count;
    this.stopRequested = false;
    this.ui.setAutoplay(count);
    if (!this.busy) await this.runAutoplay();
  }

  private stopAutoplay(): void {
    this.stopRequested = true;
    this.autoRemaining = 0;
    this.ui.setAutoplay(0);
  }

  private async runAutoplay(): Promise<void> {
    while (this.autoRemaining > 0 && !this.stopRequested) {
      if (this.state.balance < this.bet) break;
      this.autoRemaining--;
      this.ui.setAutoplay(this.autoRemaining);
      const result = await this.playSpin();
      if (result.stoppedByFeature) break;
      await wait(220);
    }
    this.autoRemaining = 0;
    this.ui.setAutoplay(0);
  }

  private async onSpinPressed(): Promise<void> {
    if (this.autoRemaining > 0) { this.stopAutoplay(); return; }
    if (this.busy) return;
    await this.playSpin();
  }

  private async buyFeature(which: 'free' | 'minefield'): Promise<void> {
    if (this.busy) return;
    const cost = (which === 'free' ? BUY_FEATURE.free : BUY_FEATURE.minefield) * this.bet;
    if (this.state.balance < cost) {
      await this.ui.showBanner({
        title: 'Not enough balance',
        note: `That feature costs ${money(cost)}.`,
        hold: 1700,
      });
      return;
    }
    await this.playSpin({ cost, buy: which });
  }

  // ---------- the spin ----------

  private async playSpin(opts: { cost?: number; buy?: 'free' | 'minefield' } = {}): Promise<{ stoppedByFeature: boolean }> {
    const cost = opts.cost ?? this.bet;
    if (this.busy) return { stoppedByFeature: false };
    if (this.state.balance < cost) {
      await this.ui.showBanner({ title: 'Out of balance', note: 'Lower your bet to keep playing.', hold: 1700 });
      this.stopAutoplay();
      return { stoppedByFeature: true };
    }

    this.busy = true;
    this.ui.setBusy(true, this.autoRemaining > 0);
    this.state.balance -= cost;
    this.ui.setBalance(this.state.balance);
    this.ui.setWinInstant(0);
    this.ui.setChain(1);
    this.save();

    const result = spin(this.rng, { kind: 'base', persistentMultiplier: 1 }, {
      forceScatters: opts.buy === 'free' ? SCATTERS_FOR_FREE : undefined,
      forceMinefield: opts.buy === 'minefield' || undefined,
    });

    let total = 0;
    await this.board.dropIn(result.initialGrid);

    if (result.minefield) {
      await this.board.celebrateFeature(result.crates, result.initialGrid, 'crate');
      total += await this.runMinefield(result.initialGrid, result.minefield);
    } else {
      total += await this.playChain(result, 1);
    }

    let stoppedByFeature = false;
    if (result.triggeredFreeSpins > 0) {
      stoppedByFeature = true;
      await this.board.celebrateFeature(result.scatters, result.initialGrid, 'scatter');
      total += await this.runFreeSpins(result.triggeredFreeSpins, total);
    } else if (result.minefield) {
      stoppedByFeature = true;
    }

    await this.settle(total, cost);
    this.busy = false;
    this.ui.setBusy(false, this.autoRemaining > 0);

    if (this.autoRemaining > 0 && !stoppedByFeature && !this.stopRequested) {
      void this.runAutoplay();
    } else if (stoppedByFeature) {
      this.stopAutoplay();
    }

    return { stoppedByFeature };
  }

  /** Walk the detonation waves of one spin. Returns the cash won. */
  private async playChain(result: SpinResult, persistent: number): Promise<number> {
    let running = 0;
    let grid = result.initialGrid;

    for (const wave of result.waves) {
      await this.board.armBombs(wave, grid);
      await this.board.detonate(wave, grid, this.ui.winEl);

      running += wave.win * this.bet;
      this.ui.setChain(wave.multiplier);
      await this.ui.countWin(running, 420);

      if (wave.multiplier > 1) await this.board.stampMultiplier(wave.multiplier);

      grid = wave.gridAfterRefill;
      await this.board.collapse(wave);
    }

    if (result.waves.length === 0 && persistent > 1) this.ui.setChain(persistent);
    return running;
  }

  private async runFreeSpins(count: number, carried: number): Promise<number> {
    const session = playFreeSpins(this.rng, count);

    await this.ui.showBanner({
      kicker: `${SCATTERS_FOR_FREE}+ Sandstorms`,
      title: 'FREE SPINS',
      arabic: 'لفات مجانية',
      amount: `${count} spins`,
      note: 'The chain multiplier never resets. Every detonation pushes it higher for the rest of the round.',
      hold: 3200,
      dismissible: true,
    });

    this.ui.setMode('Free Spins', true);
    let won = 0;
    let index = 0;

    for (const round of session.rounds) {
      index++;
      this.ui.setFreeSpins(session.rounds.length - index + 1);
      this.ui.setChain(round.multiplierBefore);
      this.ui.setWinInstant(carried + won);

      await this.board.dropIn(round.result.initialGrid);
      const gained = await this.playFreeRound(round.result, carried + won, round.multiplierBefore);
      won += gained;

      if (round.extraSpins > 0) {
        sound.play('scatter');
        await this.board.notice(`+${round.extraSpins} FREE SPINS`, 1200);
      }
      await wait(260);
    }

    this.ui.setFreeSpins(null);
    this.ui.setMode('Base Game', false);

    await this.ui.showBanner({
      kicker: 'Feature complete',
      title: 'TOTAL FEATURE WIN',
      amount: money(won),
      note: `${session.spinsPlayed} free spins played · final chain ×${session.finalMultiplier}`,
      hold: 3400,
      dismissible: true,
    });

    return won;
  }

  private async playFreeRound(result: SpinResult, base: number, persistent: number): Promise<number> {
    let running = 0;
    let grid = result.initialGrid;

    if (result.minefield) {
      await this.board.celebrateFeature(result.crates, grid, 'crate');
      return this.runMinefield(grid, result.minefield, base);
    }

    for (const wave of result.waves) {
      await this.board.armBombs(wave, grid);
      await this.board.detonate(wave, grid, this.ui.winEl);

      running += wave.win * this.bet;
      this.ui.setChain(wave.multiplier);
      await this.ui.countWin(base + running, 420);
      if (wave.multiplier > 1) await this.board.stampMultiplier(wave.multiplier);

      grid = wave.gridAfterRefill;
      await this.board.collapse(wave);
    }

    if (result.waves.length === 0) this.ui.setChain(persistent);
    return running;
  }

  private async runMinefield(landing: Grid, data: MinefieldResult, base = 0): Promise<number> {
    await this.ui.showBanner({
      kicker: `${CRATES_FOR_MINEFIELD}+ Ammo Crates`,
      title: 'MINEFIELD',
      arabic: 'حقل الألغام',
      amount: `${MINEFIELD_RESPINS} respins`,
      note: 'Every bomb that lands locks in place and resets the respins. Fill all 25 cells for the Grand.',
      hold: 3000,
      dismissible: true,
    });

    this.ui.setMode('Minefield', true);

    // The board freezes down to the seed bombs (the crates and any bombs that
    // were already on the landing grid). The engine has already decided every
    // locked bomb, so the rest is replayed one respin at a time.
    const revealed: Grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < COLS; c++) {
        const landed = landing[r][c];
        const isSeed = landed.kind === 'bomb' || (landed.kind === 'symbol' && landed.id === 'crate');
        const final = data.finalGrid[r][c];
        row.push(isSeed && final.kind === 'bomb' ? { ...final } : { kind: 'empty', uid: -(r * COLS + c + 1) });
      }
      revealed.push(row);
    }

    this.board.render(revealed);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (revealed[r][c].kind === 'bomb') this.board.lock({ r, c }, revealed);
      }
    }
    sound.play('lock');
    await wait(520);

    let respins = MINEFIELD_RESPINS;
    for (const step of data.steps) {
      await this.board.notice(`${respins} RESPIN${respins === 1 ? '' : 'S'} LEFT`, 760);

      for (const lock of step.locked) {
        revealed[lock.at.r][lock.at.c] = { ...data.finalGrid[lock.at.r][lock.at.c] };
      }
      this.board.render(revealed);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (revealed[r][c].kind === 'bomb') this.board.lock({ r, c }, revealed);
        }
      }
      if (step.locked.length > 0) { sound.play('lock'); }
      respins = step.respinsLeft;
      await wait(560);
    }

    // Blow everything and pay out.
    const collected = data.collected * this.bet;
    await this.board.notice('DETONATE', 800);
    sound.play('blast-big', 1.2);
    this.board.render(revealed);
    await this.ui.countWin(base + collected, 1100);

    let total = collected;
    if (data.jackpot) {
      const jp = JACKPOTS[data.jackpot];
      this.ui.flashJackpot(data.jackpot, true);
      sound.play('jackpot');
      await this.ui.showBanner({
        kicker: 'Jackpot',
        title: `${jp.label.toUpperCase()} JACKPOT`,
        arabic: jp.arabic,
        amount: money(jp.mult * this.bet),
        hold: 3400,
        dismissible: true,
      });
      total += jp.mult * this.bet;
      await this.ui.countWin(base + total, 900);
    }

    this.ui.setMode('Base Game', false);
    return total;
  }

  private async settle(total: number, cost: number): Promise<void> {
    await this.ui.countWin(total, 520);
    if (total > 0) {
      this.state.balance += total;
      this.ui.setBalance(this.state.balance);
      this.save();
      await this.ui.showWinBanner(total, cost);
      if (total / cost < 8) sound.play('win');
    } else {
      sound.play('lose');
    }
  }
}

new Game();
