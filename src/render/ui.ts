import {
  BET_STEPS, BOMBS, BOMB_ORDER, BUY_FEATURE, CHAIN_LADDER, CRATES_FOR_MINEFIELD,
  FREE_SPINS_BASE, JACKPOTS, JACKPOT_ORDER, MINEFIELD_RESPINS, SCATTERS_FOR_FREE,
  SYMBOLS, SYMBOL_ORDER, WIN_TIERS,
} from '../game/config';
import type { JackpotId } from '../game/types';
import { countUp, wait } from '../util/anim';
import { sound } from './sound';

export const money = (v: number): string =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const icon = (id: string, size = 40, cls = ''): string =>
  `<svg viewBox="0 0 100 100" width="${size}" height="${size}"${cls ? ` class="${cls}"` : ''}><use href="#sym-${id}"/></svg>`;

export interface UiHandlers {
  onSpin: () => void;
  onBetChange: (delta: number) => void;
  onToggleTurbo: () => void;
  onAutoplay: (count: number) => void;
  onStopAuto: () => void;
  onBuy: (which: 'free' | 'minefield') => void;
}

/** Everything outside the board: control bar, meters, modals, banners. */
export class Ui {
  readonly balanceEl = el('val-balance');
  readonly betEl = el('val-bet');
  readonly winEl = el('val-win');
  readonly winBox = document.querySelector<HTMLElement>('.cb-win')!;
  readonly spinBtn = el<HTMLButtonElement>('btn-spin');
  readonly turboBtn = el<HTMLButtonElement>('btn-turbo');
  readonly autoBtn = el<HTMLButtonElement>('btn-auto');
  readonly autoBadge = el('auto-badge');
  readonly buyBtn = el<HTMLButtonElement>('btn-buy');
  readonly betUp = el<HTMLButtonElement>('bet-up');
  readonly betDown = el<HTMLButtonElement>('bet-down');
  readonly chainMeter = el('meter-chain');
  readonly chainValue = el('chain-value');
  readonly modeMeter = el('meter-mode');
  readonly modeValue = el('mode-value');
  readonly spinsMeter = el('meter-spins');
  readonly spinsValue = el('spins-value');
  readonly modalRoot = el('modal-root');
  readonly bannerRoot = el('banner-root');

  private displayedWin = 0;

  constructor(private handlers: UiHandlers) {
    this.buildJackpots();
    this.wire();
  }

  private buildJackpots(): void {
    const host = el('jackpots');
    host.replaceChildren();
    for (const id of [...JACKPOT_ORDER].reverse()) {
      const jp = JACKPOTS[id];
      const node = document.createElement('div');
      node.className = 'jp';
      node.dataset.id = id;
      node.innerHTML =
        `<span class="jp-name">${jp.label}</span>` +
        `<span class="jp-value" data-jp="${id}">${jp.mult}×</span>` +
        `<span class="jp-cells">${jp.cells} cells</span>`;
      host.append(node);
    }
  }

  private wire(): void {
    this.spinBtn.addEventListener('click', () => { sound.unlock(); this.handlers.onSpin(); });
    this.betUp.addEventListener('click', () => { sound.play('click'); this.handlers.onBetChange(1); });
    this.betDown.addEventListener('click', () => { sound.play('click'); this.handlers.onBetChange(-1); });
    this.turboBtn.addEventListener('click', () => { sound.play('click'); this.handlers.onToggleTurbo(); });

    this.autoBtn.addEventListener('click', () => {
      sound.play('click');
      if (this.autoBtn.classList.contains('active')) this.handlers.onStopAuto();
      else this.openAutoplay();
    });

    this.buyBtn.addEventListener('click', () => { sound.play('click'); this.openBuy(); });

    el('btn-menu').addEventListener('click', () => { sound.play('click'); this.openPaytable(); });

    const soundBtn = el('btn-sound');
    soundBtn.addEventListener('click', () => {
      sound.unlock();
      const next = sound.muted;
      sound.setEnabled(next);
      soundBtn.classList.toggle('muted', !next);
      if (next) sound.play('click');
    });

    el('btn-fullscreen').addEventListener('click', () => {
      sound.play('click');
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement) return;
        event.preventDefault();
        sound.unlock();
        this.handlers.onSpin();
      }
      if (event.code === 'Escape') this.closeModal();
    });
  }

  // ---------- readouts ----------

  setBalance(value: number): void { this.balanceEl.textContent = money(value); }

  setBet(value: number): void {
    this.betEl.textContent = money(value);
    this.betDown.disabled = value <= BET_STEPS[0];
    this.betUp.disabled = value >= BET_STEPS[BET_STEPS.length - 1];
    el('buy-sub').textContent = `from ${money(BUY_FEATURE.free * value)}`;
  }

  setWinInstant(value: number): void {
    this.displayedWin = value;
    this.winEl.textContent = money(value);
    this.winBox.classList.toggle('counting', value > 0);
  }

  async countWin(to: number, duration = 700): Promise<void> {
    this.winBox.classList.toggle('counting', to > 0);
    await countUp(this.displayedWin, to, duration, (v) => {
      this.winEl.textContent = money(v);
    });
    this.displayedWin = to;
  }

  setChain(multiplier: number): void {
    this.chainValue.textContent = `×${multiplier}`;
    this.chainMeter.classList.toggle('hot', multiplier > 1);
  }

  setMode(label: string, free: boolean): void {
    this.modeValue.textContent = label;
    this.modeMeter.classList.toggle('free', free);
  }

  setFreeSpins(remaining: number | null): void {
    this.spinsMeter.hidden = remaining === null;
    if (remaining !== null) this.spinsValue.textContent = String(remaining);
  }

  setBusy(busy: boolean, autoplaying = false): void {
    this.spinBtn.disabled = busy && !autoplaying;
    this.betUp.disabled = busy;
    this.betDown.disabled = busy;
    this.buyBtn.disabled = busy;
    this.spinBtn.classList.toggle('stop', autoplaying);
    const text = this.spinBtn.querySelector('.spin-text');
    if (text) text.textContent = autoplaying ? 'STOP' : 'SPIN';
  }

  setAutoplay(remaining: number): void {
    const on = remaining > 0;
    this.autoBtn.classList.toggle('active', on);
    this.autoBadge.hidden = !on;
    this.autoBadge.textContent = remaining === Infinity ? '∞' : String(remaining);
  }

  setTurbo(on: boolean): void {
    this.turboBtn.setAttribute('aria-pressed', String(on));
  }

  flashJackpot(id: JackpotId, won = false): void {
    const node = this.modalRoot.ownerDocument.querySelector<HTMLElement>(`.jp[data-id="${id}"]`);
    if (!node) return;
    node.classList.remove('lit', 'won');
    void node.offsetWidth;
    node.classList.add(won ? 'won' : 'lit');
    if (won) setTimeout(() => node.classList.remove('won'), 3200);
  }

  // ---------- banners ----------

  /** Tier for a win, or null if it is below the first threshold. */
  static tierFor(multiple: number): (typeof WIN_TIERS)[number] | null {
    let found: (typeof WIN_TIERS)[number] | null = null;
    for (const tier of WIN_TIERS) if (multiple >= tier.at) found = tier;
    return found;
  }

  async showBanner(opts: {
    kicker?: string;
    title: string;
    arabic?: string;
    amount?: string;
    note?: string;
    hold?: number;
    dismissible?: boolean;
    /** Renders a button and resolves only once it is pressed. */
    action?: string;
  }): Promise<void> {
    const node = document.createElement('div');
    node.className = 'banner';
    node.innerHTML = [
      opts.kicker ? `<span class="banner-kicker">${opts.kicker}</span>` : '',
      `<h2 class="banner-title">${opts.title}</h2>`,
      opts.arabic ? `<span class="banner-arabic" lang="ar" dir="rtl">${opts.arabic}</span>` : '',
      opts.amount ? `<span class="banner-amount">${opts.amount}</span>` : '',
      opts.note ? `<p class="banner-note">${opts.note}</p>` : '',
      opts.action ? `<button class="banner-action" type="button">${opts.action}</button>` : '',
      opts.dismissible && !opts.action ? '<span class="banner-hint">Tap to continue</span>' : '',
    ].join('');
    this.bannerRoot.append(node);

    if (opts.action) {
      this.bannerRoot.style.pointerEvents = 'auto';
      await new Promise<void>((resolve) => {
        node.querySelector('.banner-action')!.addEventListener('click', () => resolve(), { once: true });
      });
      this.bannerRoot.style.pointerEvents = 'none';
      node.classList.add('out');
      await wait(360);
      node.remove();
      return;
    }

    if (opts.dismissible) {
      this.bannerRoot.style.pointerEvents = 'auto';
      await Promise.race([
        wait(opts.hold ?? 4200),
        new Promise<void>((resolve) => {
          const onTap = () => { window.removeEventListener('pointerdown', onTap); resolve(); };
          setTimeout(() => window.addEventListener('pointerdown', onTap, { once: true }), 400);
        }),
      ]);
      this.bannerRoot.style.pointerEvents = 'none';
    } else {
      await wait(opts.hold ?? 1800);
    }

    node.classList.add('out');
    await wait(360);
    node.remove();
  }

  /** Count a big win up on screen, tier by tier. */
  async showWinBanner(amount: number, bet: number): Promise<void> {
    const multiple = amount / bet;
    const tier = Ui.tierFor(multiple);
    if (!tier) return;

    sound.play('bigwin');
    const node = document.createElement('div');
    node.className = 'banner';
    node.innerHTML =
      `<span class="banner-kicker">${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}× your stake</span>` +
      `<h2 class="banner-title">${tier.label}</h2>` +
      `<span class="banner-arabic" lang="ar" dir="rtl">${tier.arabic}</span>` +
      '<span class="banner-amount" data-amount>0.00</span>';
    this.bannerRoot.append(node);

    const amountEl = node.querySelector<HTMLElement>('[data-amount]')!;
    await countUp(0, amount, 1500 + Math.min(2200, multiple * 9), (v) => {
      amountEl.textContent = money(v);
    });
    await wait(900);
    node.classList.add('out');
    await wait(360);
    node.remove();
  }

  // ---------- modals ----------

  closeModal(): void {
    this.modalRoot.hidden = true;
    this.modalRoot.replaceChildren();
  }

  private openModal(html: string): HTMLDivElement {
    this.modalRoot.hidden = false;
    this.modalRoot.replaceChildren();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<button class="modal-close" type="button" aria-label="Close">✕</button>${html}`;
    modal.querySelector('.modal-close')!.addEventListener('click', () => {
      sound.play('click');
      this.closeModal();
    });
    this.modalRoot.append(modal);
    this.modalRoot.addEventListener('click', (event) => {
      if (event.target === this.modalRoot) this.closeModal();
    }, { once: true });
    return modal;
  }

  private openAutoplay(): void {
    const modal = this.openModal(
      '<h2>Autoplay</h2><p>Spins stop early on any feature trigger, or when you press STOP.</p>' +
      `<div class="auto-options">${[10, 25, 50, 100, 250].map((n) => `<button class="auto-chip" type="button" data-n="${n}">${n}</button>`).join('')}</div>`,
    );
    modal.querySelectorAll<HTMLButtonElement>('.auto-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        sound.play('click');
        this.closeModal();
        this.handlers.onAutoplay(Number(chip.dataset.n));
      });
    });
  }

  private openBuy(): void {
    const bet = Number(this.betEl.textContent?.replace(/,/g, '') ?? 1);
    const modal = this.openModal(
      '<h2>Buy Feature</h2><p>Jump straight into a feature at the current stake.</p>' +
      '<div class="buy-options">' +
      `<button class="buy-option" type="button" data-which="free">${icon('scatter', 44)}` +
      '<span class="bo-body"><span class="bo-title">Sandstorm Free Spins</span>' +
      `<span class="bo-desc">${FREE_SPINS_BASE} free spins. The chain multiplier never resets — every detonation pushes it higher for the rest of the round.</span></span>` +
      `<span class="bo-cost">${money(BUY_FEATURE.free * bet)}</span></button>` +
      `<button class="buy-option" type="button" data-which="minefield">${icon('crate', 44)}` +
      '<span class="bo-body"><span class="bo-title">Minefield Hold &amp; Win</span>' +
      `<span class="bo-desc">The board freezes and ${MINEFIELD_RESPINS} respins try to fill it with bombs. Every new bomb resets the respins; a full board pays the Grand.</span></span>` +
      `<span class="bo-cost">${money(BUY_FEATURE.minefield * bet)}</span></button>` +
      '</div>',
    );
    modal.querySelectorAll<HTMLButtonElement>('.buy-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.play('click');
        this.closeModal();
        this.handlers.onBuy(btn.dataset.which as 'free' | 'minefield');
      });
    });
  }

  private openPaytable(): void {
    const symbolCards = SYMBOL_ORDER.map((id) => {
      const def = SYMBOLS[id];
      const values = def.values.map(([v]) => `${v}×`).join(' · ');
      return `<div class="pay-item">${icon(id, 42)}<span class="pay-name">${def.name}</span>` +
        `<span class="pay-vals">${values}</span></div>`;
    }).join('');

    const bombCards = BOMB_ORDER.map((id) => {
      const def = BOMBS[id];
      const values = def.values.map(([v]) => `${v}×`).join(' · ');
      return `<div class="pay-item">${icon(id, 42)}<span class="pay-name">${def.name}</span>` +
        `<span class="pay-shape">${def.shape}</span><span class="pay-vals">${values}</span></div>`;
    }).join('');

    const jackpotRows = JACKPOT_ORDER.map((id) => {
      const jp = JACKPOTS[id];
      return `<li><strong>${jp.label} — ${jp.mult}× bet</strong> at ${jp.cells} filled cells</li>`;
    }).join('');

    this.openModal(
      '<h2>How Sandstorm Siege pays</h2>' +
      '<p lang="ar" dir="rtl" style="font-family:var(--font-arabic);color:var(--sand-3)">حصار العاصفة</p>' +
      '<p>There are <strong>no paylines and no matching clusters</strong>. Tiles land face up, and some of them carry a printed coin value. ' +
      'That value is paid only when a <strong>bomb blows the tile up</strong>.</p>' +

      '<h3>1 · Bombs are the payout engine</h3>' +
      '<p>Every bomb on the board goes off at the same time and banks the coin value of everything inside its blast shape.</p>' +
      `<div class="pay-grid">${bombCards}</div>` +

      '<h3>2 · Chains raise the multiplier</h3>' +
      '<p>Survivors fall into the crater and fresh tiles drop in. If that refill lands another bomb, the chain continues one rung higher:</p>' +
      `<p><strong>${CHAIN_LADDER.map((m) => `×${m}`).join(' → ')}</strong></p>` +

      '<h3>3 · Loot tiles</h3>' +
      '<p>Higher-tier tiles carry fatter coin values when they land as loot.</p>' +
      `<div class="pay-grid">${symbolCards}</div>` +

      '<h3>4 · Sandstorm free spins</h3>' +
      `<p>${icon('scatter', 24, 'pay-inline')} Land <strong>${SCATTERS_FOR_FREE}+ Sandstorms</strong> for <strong>${FREE_SPINS_BASE} free spins</strong>. ` +
      'Sandstorms are blast-proof. During the feature the chain multiplier <strong>never resets</strong> — every detonation raises it for the rest of the round.</p>' +

      '<h3>5 · Minefield hold &amp; win</h3>' +
      `<p>${icon('crate', 24, 'pay-inline')} Land <strong>${CRATES_FOR_MINEFIELD}+ Ammo Crates</strong> and the board freezes. ` +
      `You get <strong>${MINEFIELD_RESPINS} respins</strong>; every new bomb locks in place and resets the respins. All locked values are paid at the end.</p>` +
      `<ul>${jackpotRows}</ul>` +

      '<h3>Return to player</h3>' +
      '<p>Theoretical RTP <strong>96.8%</strong>, high volatility, hit rate <strong>30.3%</strong>, maximum win over <strong>2,000×</strong> the stake. ' +
      'This is a demo built for play money only.</p>',
    );
  }
}
