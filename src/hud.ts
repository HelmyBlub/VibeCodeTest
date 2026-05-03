import { PLAYER_MAX_HP, PLAYER_MAX_MANA } from './constants';

export class HUD {
    private readonly hpFill:     HTMLElement;
    private readonly hpText:     HTMLElement;
    private readonly manaFill:   HTMLElement;
    private readonly manaText:   HTMLElement;
    private readonly gameOverEl: HTMLElement;
    private readonly hitFlashEl: HTMLElement;
    private hitFlashTimer = 0;
    private readonly audioCtx: AudioContext | null;

    constructor() {
        this.hpFill   = document.getElementById('hp-fill')!;
        this.hpText   = document.getElementById('hp-text')!;
        this.manaFill = document.getElementById('mana-fill')!;
        this.manaText = document.getElementById('mana-text')!;
        this.gameOverEl = document.getElementById('game-over')!;

        this.hitFlashEl = document.createElement('div');
        Object.assign(this.hitFlashEl.style, {
            position:      'fixed',
            inset:         '0',
            background:    'rgba(220, 30, 30, 0)',
            pointerEvents: 'none',
            zIndex:        '100',
            transition:    'background 0.25s ease-out',
        });
        document.body.appendChild(this.hitFlashEl);

        try {
            this.audioCtx = new AudioContext();
        } catch {
            this.audioCtx = null;
        }
    }

    updateHP(hp: number): void {
        this.hpFill.style.width = `${(hp / PLAYER_MAX_HP) * 100}%`;
        this.hpText.textContent = String(hp);
    }

    updateMana(mana: number): void {
        this.manaFill.style.width = `${(mana / PLAYER_MAX_MANA) * 100}%`;
        this.manaText.textContent = String(Math.floor(mana));
    }

    showGameOver(): void {
        this.gameOverEl.style.display = 'flex';
    }

    showHitFlash(): void {
        this.hitFlashEl.style.transition = 'none';
        this.hitFlashEl.style.background = 'rgba(220, 30, 30, 0.45)';
        clearTimeout(this.hitFlashTimer);
        // Force reflow so the transition fires properly
        void this.hitFlashEl.offsetWidth;
        this.hitFlashEl.style.transition = 'background 0.28s ease-out';
        this.hitFlashTimer = window.setTimeout(() => {
            this.hitFlashEl.style.background = 'rgba(220, 30, 30, 0)';
        }, 60);
        this.playHitSound();
    }

    private playHitSound(): void {
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const ctx = this.audioCtx;
            const duration = 0.12;
            const buf  = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8) * 0.9;
            }
            const src    = ctx.createBufferSource();
            src.buffer   = buf;
            const filter = ctx.createBiquadFilter();
            filter.type           = 'lowpass';
            filter.frequency.value = 550;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.45, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            src.start();
            src.stop(ctx.currentTime + duration);
        } catch { /* audio errors are non-fatal */ }
    }
}
