import type { ProjectileConfig, Spell, SpellElement } from './types';

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

const ELEMENT_EMOJI: Record<SpellElement, string> = {
    fire:      '🔥',
    ice:       '❄',
    lightning: '⚡',
};

const ELEMENT_DESC: Record<SpellElement, string> = {
    fire:      'burns over time',
    ice:       'slows movement',
    lightning: 'arcs to nearby target',
};

function fmt1(n: number): string {
    return (Math.round(n * 10) / 10).toFixed(1);
}

// Internal creator state per projectile (damage/burnDamage baked in makeSpell)
interface ProjState {
    right:   number;
    up:      number;
    forward: number;
    pitch:   number;
    yaw:     number;
    element: SpellElement;
    power:   number;
}

function defaultProjState(): ProjState {
    return { right: 0, up: 0, forward: 0, pitch: 0, yaw: 0, element: 'fire', power: 50 };
}

function spellLabel(s: Spell): string {
    const ct = s.castTime === 0 ? 'Instant' : `${fmt1(s.castTime / 1000)}s cast`;
    const cd = s.cooldown === 0 ? 'No CD'   : `${fmt1(s.cooldown / 1000)}s CD`;
    if (s.projectiles.length === 1) {
        const p  = s.projectiles[0];
        const el = p.element[0].toUpperCase() + p.element.slice(1);
        return `${el} · Pwr ${p.power} · ${ct} · ${cd} · ${p.damage} dmg · ${s.manaCost} mp`;
    }
    const elements = [...new Set(s.projectiles.map(p => p.element))];
    const elLabel  = elements.length === 1
        ? elements[0][0].toUpperCase() + elements[0].slice(1)
        : 'Mixed';
    return `${elLabel} · ×${s.projectiles.length} proj · ${ct} · ${cd} · ${s.manaCost} mp`;
}

const MAX_PROJECTILES = 6;

// ── SpellCreator ─────────────────────────────────────────────────────────────

export class SpellCreator {
    private castTime = 0;     // ms, 0–3000
    private cooldown = 2000;  // ms, 0–10000

    private projStates: ProjState[] = [defaultProjState()];
    private selectedProjIdx = 0;

    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;

    // DOM refs
    private previewEl!:        HTMLElement;
    private slotListEl!:       HTMLElement;
    private projTabsEl!:       HTMLElement;
    private projElementBtns!:  HTMLElement[];

    // Per-proj editor sliders
    private projPowerSlider!: HTMLInputElement;
    private projPowerInput!:  HTMLInputElement;
    private rightSlider!:     HTMLInputElement;
    private rightInput!:      HTMLInputElement;
    private upSlider!:        HTMLInputElement;
    private upInput!:         HTMLInputElement;
    private fwdSlider!:       HTMLInputElement;
    private fwdInput!:        HTMLInputElement;
    private yawSlider!:       HTMLInputElement;
    private yawInput!:        HTMLInputElement;
    private pitchSlider!:     HTMLInputElement;
    private pitchInput!:      HTMLInputElement;

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        this.slots[0] = this.makeSpell();
        this.buildHTML();
        this.bindEvents();
    }

    private makeSpell(): Spell {
        const projectiles: ProjectileConfig[] = this.projStates.map(p => ({
            ...p,
            damage:     calcDamage(p.power, this.cooldown),
            burnDamage: calcBurnDamage(p.power, this.cooldown),
        }));
        return {
            castTime:    this.castTime,
            cooldown:    this.cooldown,
            manaCost:    this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0),
            projectiles,
        };
    }

    private projTabsHTML(): string {
        const tabs = this.projStates.map((p, i) =>
            `<button class="sc-btn sc-proj-tab${i === this.selectedProjIdx ? ' active' : ''}" data-proj="${i}">${ELEMENT_EMOJI[p.element]} #${i + 1}</button>`
        ).join('');
        const addBtn = this.projStates.length < MAX_PROJECTILES
            ? `<button class="sc-btn sc-proj-add">+ Add</button>` : '';
        const removeBtn = this.projStates.length > 1
            ? `<button class="sc-btn sc-proj-remove">× Remove</button>` : '';
        return tabs + addBtn + removeBtn;
    }

    private buildHTML(): void {
        const p0 = this.projStates[0];
        this.overlay.innerHTML = `<div class="sc-panel">
  <h2 class="sc-title">SPELL CREATOR</h2>

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

  <div class="sc-section">
    <div class="sc-label">PROJECTILES <span class="sc-range-hint">max ${MAX_PROJECTILES}</span></div>
    <div class="sc-row sc-proj-tabs" id="sc-proj-tabs">${this.projTabsHTML()}</div>

    <div class="sc-proj-editor">
      <div class="sc-label sc-sub-label">ELEMENT</div>
      <div class="sc-row" id="sc-proj-element-btns">
        <button class="sc-btn sc-proj-elem${p0.element === 'fire'      ? ' active' : ''}" data-proj-element="fire">🔥 Fire</button>
        <button class="sc-btn sc-proj-elem${p0.element === 'ice'       ? ' active' : ''}" data-proj-element="ice">❄ Ice</button>
        <button class="sc-btn sc-proj-elem${p0.element === 'lightning' ? ' active' : ''}" data-proj-element="lightning">⚡ Lightning</button>
      </div>

      <div class="sc-label sc-sub-label" style="margin-top:10px">POWER <span class="sc-range-hint">1 – 100</span></div>
      <div class="sc-slider-row">
        <input type="range"  class="sc-slider" id="sc-proj-power-slider" min="1" max="100" step="1" value="${p0.power}">
        <input type="number" class="sc-number sc-num-narrow" id="sc-proj-power-input" min="1" max="100" step="any" value="${p0.power}">
      </div>

      <div class="sc-label sc-sub-label" style="margin-top:12px">SPAWN OFFSET <span class="sc-range-hint">units from player  R=right  U=up  F=forward</span></div>
      <div class="sc-slider-row">
        <span class="sc-axis">R</span>
        <input type="range"  class="sc-slider" id="sc-right-slider" min="-3" max="3" step="0.1" value="0">
        <input type="number" class="sc-number sc-num-narrow" id="sc-right-input" min="-3" max="3" step="any" value="0.0">
      </div>
      <div class="sc-slider-row">
        <span class="sc-axis">U</span>
        <input type="range"  class="sc-slider" id="sc-up-slider" min="-1" max="4" step="0.1" value="0">
        <input type="number" class="sc-number sc-num-narrow" id="sc-up-input" min="-1" max="4" step="any" value="0.0">
      </div>
      <div class="sc-slider-row">
        <span class="sc-axis">F</span>
        <input type="range"  class="sc-slider" id="sc-fwd-slider" min="-3" max="3" step="0.1" value="0">
        <input type="number" class="sc-number sc-num-narrow" id="sc-fwd-input" min="-3" max="3" step="any" value="0.0">
      </div>

      <div class="sc-label sc-sub-label" style="margin-top:12px">FLY DIRECTION <span class="sc-range-hint">yaw: left/right from forward · pitch: up/down</span></div>
      <div class="sc-slider-row">
        <span class="sc-axis">Yaw</span>
        <input type="range"  class="sc-slider" id="sc-yaw-slider" min="-180" max="180" step="1" value="0">
        <input type="number" class="sc-number sc-num-narrow" id="sc-yaw-input" min="-180" max="180" step="any" value="0">
        <span class="sc-unit">°</span>
      </div>
      <div class="sc-slider-row">
        <span class="sc-axis">Pitch</span>
        <input type="range"  class="sc-slider" id="sc-pitch-slider" min="-90" max="90" step="1" value="0">
        <input type="number" class="sc-number sc-num-narrow" id="sc-pitch-input" min="-90" max="90" step="any" value="0">
        <span class="sc-unit">°</span>
      </div>
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

        this.previewEl       = this.overlay.querySelector<HTMLElement>('#sc-preview')!;
        this.slotListEl      = this.overlay.querySelector<HTMLElement>('#sc-slot-list')!;
        this.projTabsEl      = this.overlay.querySelector<HTMLElement>('#sc-proj-tabs')!;
        this.projElementBtns = [...this.overlay.querySelectorAll<HTMLElement>('[data-proj-element]')];

        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;
        this.projPowerSlider = get('sc-proj-power-slider');
        this.projPowerInput  = get('sc-proj-power-input');
        this.rightSlider     = get('sc-right-slider');
        this.rightInput      = get('sc-right-input');
        this.upSlider        = get('sc-up-slider');
        this.upInput         = get('sc-up-input');
        this.fwdSlider       = get('sc-fwd-slider');
        this.fwdInput        = get('sc-fwd-input');
        this.yawSlider       = get('sc-yaw-slider');
        this.yawInput        = get('sc-yaw-input');
        this.pitchSlider     = get('sc-pitch-slider');
        this.pitchInput      = get('sc-pitch-input');

        this.updatePreview();
        this.updateSlotList();
    }

    private loadProjToEditor(): void {
        const p = this.projStates[this.selectedProjIdx];
        this.projElementBtns.forEach(b =>
            b.classList.toggle('active', b.dataset['projElement'] === p.element)
        );
        this.projPowerSlider.value = String(p.power);
        this.projPowerInput.value  = String(p.power);
        this.rightSlider.value     = String(p.right);
        this.rightInput.value      = p.right.toFixed(1);
        this.upSlider.value        = String(p.up);
        this.upInput.value         = p.up.toFixed(1);
        this.fwdSlider.value       = String(p.forward);
        this.fwdInput.value        = p.forward.toFixed(1);
        this.yawSlider.value       = String(p.yaw);
        this.yawInput.value        = String(p.yaw);
        this.pitchSlider.value     = String(p.pitch);
        this.pitchInput.value      = String(p.pitch);
    }

    private renderProjTabs(): void {
        this.projTabsEl.innerHTML = this.projTabsHTML();
    }

    private bindEvents(): void {
        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;
        const castSlider = get('sc-cast-slider');
        const castInput  = get('sc-cast-input');
        const cdSlider   = get('sc-cd-slider');
        const cdInput    = get('sc-cd-input');

        // Delegated clicks: slot saves, proj tabs, add/remove, element buttons
        this.overlay.addEventListener('click', e => {
            const t = e.target as HTMLElement;

            if (t.classList.contains('sc-slot-save') && t.dataset['slot'] !== undefined) {
                this.slots[Number(t.dataset['slot'])] = this.makeSpell();
                this.updateSlotList();
                return;
            }

            if (t.classList.contains('sc-proj-tab')) {
                this.selectedProjIdx = Number(t.dataset['proj']);
                this.renderProjTabs();
                this.loadProjToEditor();
                return;
            }

            if (t.classList.contains('sc-proj-add')) {
                if (this.projStates.length >= MAX_PROJECTILES) return;
                this.projStates.push(defaultProjState());
                this.selectedProjIdx = this.projStates.length - 1;
                this.renderProjTabs();
                this.loadProjToEditor();
                this.updatePreview();
                return;
            }

            if (t.classList.contains('sc-proj-remove')) {
                if (this.projStates.length <= 1) return;
                this.projStates.splice(this.selectedProjIdx, 1);
                this.selectedProjIdx = Math.min(this.selectedProjIdx, this.projStates.length - 1);
                this.renderProjTabs();
                this.loadProjToEditor();
                this.updatePreview();
                return;
            }

            const projEl = t.dataset['projElement'] as SpellElement | undefined;
            if (projEl) {
                this.projStates[this.selectedProjIdx].element = projEl;
                this.projElementBtns.forEach(b => b.classList.toggle('active', b.dataset['projElement'] === projEl));
                this.renderProjTabs(); // update emoji in tab
                this.updatePreview();
                return;
            }
        });

        // Cast time
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

        // Cooldown
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

        // Per-projectile power
        this.projPowerSlider.addEventListener('input', () => {
            const v = Math.round(Number(this.projPowerSlider.value));
            this.projStates[this.selectedProjIdx].power = v;
            this.projPowerInput.value = String(v);
            this.updatePreview();
        });
        this.projPowerInput.addEventListener('input', () => {
            const v = Math.min(100, Math.max(1, Math.round(Number(this.projPowerInput.value) || 1)));
            this.projStates[this.selectedProjIdx].power = v;
            this.projPowerSlider.value = String(v);
            this.updatePreview();
        });
        this.projPowerInput.addEventListener('blur', () => {
            this.projPowerInput.value = String(this.projStates[this.selectedProjIdx].power);
        });

        // Per-proj offset and direction sliders
        const bindProj = (
            slider: HTMLInputElement,
            input: HTMLInputElement,
            min: number, max: number, decimals: number,
            prop: keyof ProjState,
        ) => {
            const curr = () => this.projStates[this.selectedProjIdx];
            slider.addEventListener('input', () => {
                const v = parseFloat(parseFloat(slider.value).toFixed(decimals));
                (curr() as Record<string, number>)[prop as string] = v;
                input.value = v.toFixed(decimals);
            });
            input.addEventListener('input', () => {
                const v = parseFloat(Math.min(max, Math.max(min, parseFloat(input.value) || 0)).toFixed(decimals));
                (curr() as Record<string, number>)[prop as string] = v;
                slider.value = String(v);
            });
            input.addEventListener('blur', () => {
                input.value = ((curr() as Record<string, number>)[prop as string]).toFixed(decimals);
            });
        };

        bindProj(this.rightSlider,  this.rightInput,  -3,   3, 1, 'right');
        bindProj(this.upSlider,     this.upInput,     -1,   4, 1, 'up');
        bindProj(this.fwdSlider,    this.fwdInput,    -3,   3, 1, 'forward');
        bindProj(this.yawSlider,    this.yawInput,  -180, 180, 0, 'yaw');
        bindProj(this.pitchSlider,  this.pitchInput,  -90,  90, 0, 'pitch');
    }

    private updatePreview(): void {
        const ctLabel = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime / 1000)} s channel`;
        const cdLabel = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown / 1000)} s cooldown`;
        const totalMana = this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0);

        const projLines = this.projStates.map((p, i) => {
            const dmg  = calcDamage(p.power, this.cooldown);
            const burn = calcBurnDamage(p.power, this.cooldown);
            const dmgStr = p.element === 'fire' ? `${dmg}+${burn}/tick` : `${dmg}`;
            return `<span class="sc-proj-preview-item">${ELEMENT_EMOJI[p.element]} #${i + 1} Pwr ${p.power} · ${dmgStr} · ${ELEMENT_DESC[p.element]}</span>`;
        }).join('');

        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${totalMana}</strong>${this.projStates.length > 1 ? ` &nbsp;·&nbsp; ${this.projStates.length} projectiles` : ''}</div>
<div class="sc-proj-preview-list">${projLines}</div>
<div class="sc-desc">${ctLabel} · ${cdLabel}</div>`;
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
