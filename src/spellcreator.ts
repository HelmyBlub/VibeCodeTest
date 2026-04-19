import type { Spell, SpellElement } from './types';

// ── Continuous formulas ──────────────────────────────────────────────────────

function cdMult(cooldown: number): number {
    return 0.7 + (cooldown / 10000) * 0.8; // 0.70 → 1.50
}

export function calcManaCost(power: number, castTime: number): number {
    const pf = 0.3 + (power / 100) * 1.2;       // 0.30 → 1.50
    const cf = 1.5 - (castTime / 3000);           // 1.50 → 0.50
    return Math.max(1, Math.round(20 * pf * cf));
}

export function calcDamage(power: number, cooldown: number): number {
    return Math.max(1, Math.round((10 + power * 0.3) * cdMult(cooldown)));
}

export function calcBurnDamage(power: number, cooldown: number): number {
    return Math.max(1, Math.round((3 + power * 0.05) * cdMult(cooldown)));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ELEMENT_DESC: Record<SpellElement, string> = {
    fire:      'Burns enemies over time',
    ice:       'Slows enemy movement',
    lightning: 'Arcs to a nearby secondary target',
};

function fmt1(n: number): string {
    return (Math.round(n * 10) / 10).toFixed(1);
}

function spellLabel(s: Spell): string {
    const el = s.element[0].toUpperCase() + s.element.slice(1);
    const ct = s.castTime === 0 ? 'Instant' : `${fmt1(s.castTime / 1000)}s cast`;
    const cd = s.cooldown === 0 ? 'No CD'   : `${fmt1(s.cooldown / 1000)}s CD`;
    return `${el} · Pwr ${s.power} · ${ct} · ${cd} · ${s.damage} dmg · ${s.manaCost} mp`;
}

// ── SpellCreator ─────────────────────────────────────────────────────────────

export class SpellCreator {
    private element:  SpellElement = 'fire';
    private power    = 50;    // 1–100
    private castTime = 0;     // ms, 0–3000
    private cooldown = 2000;  // ms, 0–10000

    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;

    // DOM refs
    private previewEl!:   HTMLElement;
    private slotListEl!:  HTMLElement;
    private elementBtns!: HTMLElement[];

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        this.slots[0] = this.makeSpell();
        this.buildHTML();
        this.bindEvents();
    }

    private makeSpell(): Spell {
        return {
            element:    this.element,
            power:      this.power,
            castTime:   this.castTime,
            cooldown:   this.cooldown,
            manaCost:   calcManaCost(this.power, this.castTime),
            damage:     calcDamage(this.power, this.cooldown),
            burnDamage: calcBurnDamage(this.power, this.cooldown),
        };
    }

    private buildHTML(): void {
        this.overlay.innerHTML = `<div class="sc-panel">
  <h2 class="sc-title">SPELL CREATOR</h2>

  <div class="sc-section">
    <div class="sc-label">ELEMENT</div>
    <div class="sc-row" id="sc-element-btns">
      <button class="sc-btn${this.element === 'fire'      ? ' active' : ''}" data-element="fire">🔥 Fire</button>
      <button class="sc-btn${this.element === 'ice'       ? ' active' : ''}" data-element="ice">❄ Ice</button>
      <button class="sc-btn${this.element === 'lightning' ? ' active' : ''}" data-element="lightning">⚡ Lightning</button>
    </div>
  </div>

  <div class="sc-section">
    <div class="sc-label">POWER <span class="sc-range-hint">1 – 100</span></div>
    <div class="sc-slider-row">
      <input type="range"  class="sc-slider" id="sc-power-slider" min="1"    max="100"   step="1"   value="${this.power}">
      <input type="number" class="sc-number" id="sc-power-input"  min="1"    max="100"   step="any" value="${this.power}">
    </div>
  </div>

  <div class="sc-section">
    <div class="sc-label">CAST TIME <span class="sc-range-hint">0 – 3 s</span></div>
    <div class="sc-slider-row">
      <input type="range"  class="sc-slider" id="sc-cast-slider" min="0" max="3000"  step="50"  value="${this.castTime}">
      <input type="number" class="sc-number" id="sc-cast-input"  min="0" max="3"     step="any" value="${fmt1(this.castTime / 1000)}">
    </div>
  </div>

  <div class="sc-section">
    <div class="sc-label">COOLDOWN <span class="sc-range-hint">0 – 10 s</span></div>
    <div class="sc-slider-row">
      <input type="range"  class="sc-slider" id="sc-cd-slider" min="0" max="10000" step="100" value="${this.cooldown}">
      <input type="number" class="sc-number" id="sc-cd-input"  min="0" max="10"    step="any" value="${fmt1(this.cooldown / 1000)}">
    </div>
  </div>

  <div class="sc-preview" id="sc-preview"></div>

  <div class="sc-section">
    <div class="sc-label">SAVE TO SLOT</div>
    <div class="sc-row">
      <button class="sc-btn sc-slot-save" data-slot="0">1</button>
      <button class="sc-btn sc-slot-save" data-slot="1">2</button>
      <button class="sc-btn sc-slot-save" data-slot="2">3</button>
      <button class="sc-btn sc-slot-save" data-slot="3">4</button>
    </div>
  </div>

  <div id="sc-slot-list" class="sc-slots"></div>

  <div class="sc-footer">Tab — close &nbsp;·&nbsp; 1–4 — cast in combat</div>
</div>`;

        this.previewEl   = this.overlay.querySelector<HTMLElement>('#sc-preview')!;
        this.slotListEl  = this.overlay.querySelector<HTMLElement>('#sc-slot-list')!;
        this.elementBtns = [...this.overlay.querySelectorAll<HTMLElement>('[data-element]')];

        this.updatePreview();
        this.updateSlotList();
    }

    private bindEvents(): void {
        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;

        const powerSlider = get('sc-power-slider');
        const powerInput  = get('sc-power-input');
        const castSlider  = get('sc-cast-slider');
        const castInput   = get('sc-cast-input');
        const cdSlider    = get('sc-cd-slider');
        const cdInput     = get('sc-cd-input');

        // Element buttons + slot saves
        this.overlay.addEventListener('click', e => {
            const t = e.target as HTMLElement;
            const el = t.dataset['element'] as SpellElement | undefined;
            if (el) {
                this.element = el;
                this.elementBtns.forEach(b => b.classList.toggle('active', b.dataset['element'] === el));
                this.updatePreview();
                return;
            }
            if (t.classList.contains('sc-slot-save') && t.dataset['slot'] !== undefined) {
                this.slots[Number(t.dataset['slot'])] = this.makeSpell();
                this.updateSlotList();
            }
        });

        // Power (integer)
        powerSlider.addEventListener('input', () => {
            this.power = Math.round(Number(powerSlider.value));
            powerInput.value = String(this.power);
            this.updatePreview();
        });
        powerInput.addEventListener('input', () => {
            this.power = Math.min(100, Math.max(1, Math.round(Number(powerInput.value) || 1)));
            powerSlider.value = String(this.power);
            this.updatePreview();
        });
        powerInput.addEventListener('blur', () => { powerInput.value = String(this.power); });

        // Cast time (slider = ms, input = seconds, 1 decimal)
        castSlider.addEventListener('input', () => {
            this.castTime = Number(castSlider.value);
            castInput.value = fmt1(this.castTime / 1000);
            this.updatePreview();
        });
        castInput.addEventListener('input', () => {
            const secs = Math.min(3, Math.max(0, Number(castInput.value) || 0));
            this.castTime = Math.round(secs * 1000);
            castSlider.value = String(this.castTime);
            this.updatePreview();
        });
        castInput.addEventListener('blur', () => { castInput.value = fmt1(this.castTime / 1000); });

        // Cooldown (slider = ms, input = seconds, 1 decimal)
        cdSlider.addEventListener('input', () => {
            this.cooldown = Number(cdSlider.value);
            cdInput.value = fmt1(this.cooldown / 1000);
            this.updatePreview();
        });
        cdInput.addEventListener('input', () => {
            const secs = Math.min(10, Math.max(0, Number(cdInput.value) || 0));
            this.cooldown = Math.round(secs * 1000);
            cdSlider.value = String(this.cooldown);
            this.updatePreview();
        });
        cdInput.addEventListener('blur', () => { cdInput.value = fmt1(this.cooldown / 1000); });
    }

    private updatePreview(): void {
        const cost    = calcManaCost(this.power, this.castTime);
        const dmg     = calcDamage(this.power, this.cooldown);
        const burn    = calcBurnDamage(this.power, this.cooldown);
        const ctLabel = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime / 1000)} s channel`;
        const cdLabel = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown / 1000)} s cooldown`;
        const dmgLine = this.element === 'fire' ? `${dmg} hit &nbsp;+&nbsp; ${burn}/tick DoT` : `${dmg}`;

        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${cost}</strong> &nbsp;·&nbsp; Damage: <strong>${dmgLine}</strong></div>
<div class="sc-desc">${ctLabel} · ${cdLabel} · ${ELEMENT_DESC[this.element]}</div>`;
    }

    private updateSlotList(): void {
        this.slotListEl.innerHTML =
            '<div class="sc-label">YOUR SPELLS</div>' +
            this.slots.map((s, i) =>
                `<div class="sc-slot-row"><span class="sc-slot-num">${i + 1}</span>${s ? spellLabel(s) : '<em>Empty</em>'}</div>`
            ).join('');
    }

    open():   void { this.isOpen = true;  this.overlay.style.display = 'flex'; }
    close():  void { this.isOpen = false; this.overlay.style.display = 'none'; }
    toggle(): void { this.isOpen ? this.close() : this.open(); }
    get visible(): boolean { return this.isOpen; }
    getSlot(i: number): Spell | null { return this.slots[i] ?? null; }
}
