import { getSpeed, prefersReducedMotion } from '../util/anim';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  hue: number;
  kind: 'spark' | 'smoke' | 'shard' | 'sand';
  rot: number;
  spin: number;
}

/**
 * Canvas particle layer sitting over the board: explosion sparks, smoke,
 * flying shards and drifting sand. One rAF loop that idles when empty.
 */
export class FxLayer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private running = false;
  private last = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private get w(): number { return this.canvas.width / this.dpr; }
  private get h(): number { return this.canvas.height / this.dpr; }

  /** Blast at board-relative coordinates (0..1). */
  explode(nx: number, ny: number, power: number, tint: string): void {
    if (prefersReducedMotion()) return;
    const x = nx * this.w;
    const y = ny * this.h;
    const hue = hueOf(tint);
    const sparks = Math.round(26 + 34 * power);
    for (let i = 0; i < sparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 300) * (0.6 + power);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.5,
        size: 1.4 + Math.random() * 3.2,
        hue,
        kind: Math.random() < 0.22 ? 'shard' : 'spark',
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      });
    }
    const puffs = Math.round(8 + 12 * power);
    for (let i = 0; i < puffs; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 70;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.7,
        size: 10 + Math.random() * 26 * (0.5 + power),
        hue: 32,
        kind: 'smoke',
        rot: 0,
        spin: 0,
      });
    }
    this.start();
  }

  /** A puff of sand kicked up where a tile lands. */
  dust(nx: number, ny: number): void {
    if (prefersReducedMotion()) return;
    const x = nx * this.w;
    const y = ny * this.h;
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: -20 - Math.random() * 40,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.25,
        size: 2 + Math.random() * 4,
        hue: 42,
        kind: 'sand',
        rot: 0,
        spin: 0,
      });
    }
    this.start();
  }

  /** Celebratory shower from the top of the board. */
  confetti(count = 70): void {
    if (prefersReducedMotion()) return;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: -10 - Math.random() * this.h * 0.4,
        vx: (Math.random() - 0.5) * 70,
        vy: 90 + Math.random() * 190,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.2,
        size: 3 + Math.random() * 5,
        hue: [42, 48, 168, 340][Math.floor(Math.random() * 4)],
        kind: 'shard',
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 12,
      });
    }
    this.start();
  }

  clear(): void {
    this.particles.length = 0;
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000) * getSpeed();
    this.last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.particles.splice(i, 1); continue; }

      const t = p.life / p.maxLife;
      const drag = p.kind === 'smoke' ? 0.9 : 0.975;
      p.vx *= drag;
      p.vy = p.vy * drag + (p.kind === 'smoke' ? -70 : 620) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      const alpha = 1 - t;
      switch (p.kind) {
        case 'smoke': {
          ctx.globalCompositeOperation = 'source-over';
          const r = p.size * (1 + t * 1.8);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, `hsla(${p.hue}, 40%, 42%, ${alpha * 0.32})`);
          grad.addColorStop(1, `hsla(${p.hue}, 40%, 24%, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          break;
        }
        case 'shard': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `hsla(${p.hue}, 90%, ${62 - t * 22}%, ${alpha})`;
          ctx.fillRect(-p.size, -p.size * 0.42, p.size * 2, p.size * 0.84);
          ctx.restore();
          break;
        }
        case 'sand': {
          ctx.fillStyle = `hsla(${p.hue}, 55%, ${58 - t * 18}%, ${alpha * 0.7})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          const r = p.size * (1 - t * 0.55);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
          grad.addColorStop(0, `hsla(${p.hue}, 100%, 88%, ${alpha})`);
          grad.addColorStop(0.35, `hsla(${p.hue}, 100%, 62%, ${alpha * 0.8})`);
          grad.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    if (this.particles.length > 0) {
      requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      ctx.clearRect(0, 0, this.w, this.h);
    }
  };
}

/** Rough hex/name -> hue so bombs throw sparks in their own colour. */
function hueOf(color: string): number {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 34;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 34;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
