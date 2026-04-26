import type { ProjectileConfig, Spell, SpellElement, SpellStage, StageElement, StageTrigger } from './types';
import { SpellVisualization, type EditMode } from './spellviz';
import { MANA_COST_FACTOR } from './constants';

// ── Continuous formulas ──────────────────────────────────────────────────────

function cdMult(cooldown: number): number {
    return 0.7 + (cooldown / 10000) * 0.8; // 0.70 → 1.50
}

export function calcManaCost(power: number, castTime: number): number {
    const pf = 0.3 + (power / 100) * 1.2;
    const cf = 1.5 - (castTime / 3000);
    return Math.max(1, Math.round(20 * pf * cf * MANA_COST_FACTOR));
}

export function calcDamage(power: number, cooldown: number): number {
    return Math.max(1, Math.round((10 + power * 0.3) * cdMult(cooldown)));
}

export function calcBurnDamage(power: number, cooldown: number): number {
    return Math.max(1, Math.round((3 + power * 0.05) * cdMult(cooldown)));
}

// ── Types & helpers ───────────────────────────────────────────────────────────

type SpellMode = 'simple' | 'chain';

// Stage draft omits computed fields
type StageDraft = Omit<SpellStage, 'damage' | 'burnDamage'>;

const ELEMENT_EMOJI: Record<SpellElement, string> = {
    fire:      '🔥',
    ice:       '❄',
    lightning: '⚡',
};

const STAGE_ELEM_ICON: Record<StageElement, string> = {
    fire: '🔥', ice: '❄', lightning: '⚡', none: '○',
};

const ELEMENT_DESC: Record<SpellElement, string> = {
    fire:      'burns over time',
    ice:       'slows movement',
    lightning: 'arcs to nearby target',
};

function fmt1(n: number): string {
    return (Math.round(n * 10) / 10).toFixed(1);
}

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
    return { right: 0, up: 0, forward: 0.5, pitch: 0, yaw: 0, element: 'fire', power: 50 };
}

function defaultStageDraft(): StageDraft {
    return {
        element: 'none', power: 50, pitch: 45, yaw: 0,
        count: 1, spread: 0, yawSpread: 0,
        stationary: false,
        trigger: 'delay', triggerMs: 1500, duration: 3000,
    };
}

function defaultStageChain(): StageDraft[] {
    return [
        { element: 'none',  power: 50, pitch: 75,  yaw: 0, count: 1, spread: 0, yawSpread: 0,  stationary: false, trigger: 'delay',    triggerMs: 2000, duration: 3000 },
        { element: 'none',  power: 50, pitch: 0,   yaw: 0, count: 1, spread: 0, yawSpread: 0,  stationary: true,  trigger: 'interval', triggerMs: 500,  duration: 4000 },
        { element: 'ice',   power: 60, pitch: -80, yaw: 0, count: 3, spread: 3, yawSpread: 30, stationary: false, trigger: 'impact',   triggerMs: 0,    duration: 2000 },
    ];
}

function slotIcons(s: Spell): string {
    if (s.stages?.length) return '⛓';
    const projs = s.projectiles;
    const first = projs[0].element;
    if (projs.every(p => p.element === first)) return ELEMENT_EMOJI[first];
    return projs.map(p => ELEMENT_EMOJI[p.element]).join('');
}

function spellLabel(s: Spell, active: boolean): string {
    const ct   = s.castTime === 0 ? 'Instant' : `${fmt1(s.castTime / 1000)}s cast`;
    const cd   = s.cooldown === 0 ? 'No CD'   : `${fmt1(s.cooldown / 1000)}s CD`;
    const tag  = active ? ' <em class="sc-editing-tag">editing</em>' : '';
    if (s.stages?.length) {
        return `⛓ Chain · ${s.stages.length} stages · ${ct} · ${cd} · ${s.manaCost} mp${tag}`;
    }
    const icons = slotIcons(s);
    if (s.projectiles.length === 1) {
        const p  = s.projectiles[0];
        const el = p.element[0].toUpperCase() + p.element.slice(1);
        return `${icons} ${el} · Pwr ${p.power} · ${ct} · ${cd} · ${p.damage} dmg · ${s.manaCost} mp${tag}`;
    }
    const elements = [...new Set(s.projectiles.map(p => p.element))];
    const elLabel  = elements.length === 1
        ? elements[0][0].toUpperCase() + elements[0].slice(1)
        : 'Mixed';
    return `${icons} ${elLabel} · ×${s.projectiles.length} proj · ${ct} · ${cd} · ${s.manaCost} mp${tag}`;
}

const MAX_PROJECTILES = 6;
const VIZ_W = 400;
const VIZ_H = 460;

// ── SpellCreator ─────────────────────────────────────────────────────────────

export class SpellCreator {
    private castTime = 0;
    private cooldown = 2000;
    private spellMode: SpellMode = 'simple';

    private projStates: ProjState[] = [defaultProjState()];
    private selectedProjIdx = 0;
    private activeSlot = 0;
    private stageChain: StageDraft[] = defaultStageChain();

    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;
    private viz!: SpellVisualization;

    // DOM refs
    private previewEl!:        HTMLElement;
    private vizHintEl!:        HTMLElement;
    private slotListEl!:       HTMLElement;
    private slotTabsEl!:       HTMLElement;
    private copyRowEl!:        HTMLElement;
    private projTabsEl!:       HTMLElement;
    private projElementBtns!:  HTMLElement[];
    private projPowerSlider!:  HTMLInputElement;
    private projPowerInput!:   HTMLInputElement;
    private castSlider!:       HTMLInputElement;
    private castInput!:        HTMLInputElement;
    private cdSlider!:         HTMLInputElement;
    private cdInput!:          HTMLInputElement;
    private rightSlider!:      HTMLInputElement;
    private rightInput!:       HTMLInputElement;
    private upSlider!:         HTMLInputElement;
    private upInput!:          HTMLInputElement;
    private fwdSlider!:        HTMLInputElement;
    private fwdInput!:         HTMLInputElement;
    private yawSlider!:        HTMLInputElement;
    private yawInput!:         HTMLInputElement;
    private pitchSlider!:      HTMLInputElement;
    private pitchInput!:       HTMLInputElement;
    private simpleSectionEl!:  HTMLElement;
    private chainSectionEl!:   HTMLElement;
    private stageChainEl!:     HTMLElement;
    private modeBtns!:         HTMLElement[];

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        this.buildHTML();
        this.bindEvents();
        this.commitToActiveSlot();
    }

    // ── Spell building ────────────────────────────────────────────────────────

    private makeSpell(): Spell {
        const projectiles: ProjectileConfig[] = this.projStates.map(p => ({
            ...p,
            damage:     calcDamage(p.power, this.cooldown),
            burnDamage: calcBurnDamage(p.power, this.cooldown),
        }));
        return {
            castTime:  this.castTime,
            cooldown:  this.cooldown,
            manaCost:  this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0),
            projectiles,
        };
    }

    private makeChainSpell(): Spell {
        const stages: SpellStage[] = this.stageChain.map(s => ({
            ...s,
            damage:     s.element !== 'none' ? calcDamage(s.power, this.cooldown) : 0,
            burnDamage: s.element === 'fire'  ? calcBurnDamage(s.power, this.cooldown) : 0,
        }));
        const manaCost = Math.max(1, stages.reduce((sum, s) =>
            sum + (s.element !== 'none' ? calcManaCost(s.power, this.castTime) : 5), 0));
        return { castTime: this.castTime, cooldown: this.cooldown, manaCost, projectiles: [], stages };
    }

    private commitToActiveSlot(): void {
        this.slots[this.activeSlot] = this.spellMode === 'chain'
            ? this.makeChainSpell()
            : this.makeSpell();
        if (this.slotTabsEl) this.renderSlotTabs();
    }

    // ── Slot management ───────────────────────────────────────────────────────

    private selectSlot(i: number): void {
        this.activeSlot = i;
        const spell = this.slots[i];
        if (spell?.stages?.length) {
            this.castTime  = spell.castTime;
            this.cooldown  = spell.cooldown;
            this.stageChain = spell.stages.map(s => ({
                element: s.element, power: s.power,
                pitch: s.pitch, yaw: s.yaw,
                count: s.count, spread: s.spread, yawSpread: s.yawSpread,
                stationary: s.stationary,
                trigger: s.trigger, triggerMs: s.triggerMs, duration: s.duration,
            }));
            this.setMode('chain');
        } else if (spell) {
            this.castTime   = spell.castTime;
            this.cooldown   = spell.cooldown;
            this.projStates = spell.projectiles.map(p => ({
                right: p.right, up: p.up, forward: p.forward,
                pitch: p.pitch, yaw: p.yaw, element: p.element, power: p.power,
            }));
            this.setMode('simple');
        } else {
            this.castTime = 0;
            this.cooldown = 2000;
            this.projStates = [defaultProjState()];
            this.stageChain = defaultStageChain();
            // keep current mode
        }
        this.selectedProjIdx = 0;
        this.renderSlotTabs();
        this.renderCopyRow();
        this.loadEditorUI();
        this.updatePreview();
    }

    private copyToSlot(i: number): void {
        this.slots[i] = this.spellMode === 'chain' ? this.makeChainSpell() : this.makeSpell();
        this.renderSlotTabs();
        this.updateSlotList();
    }

    private renderSlotTabs(): void {
        this.slotTabsEl.innerHTML = [0, 1, 2, 3].map(i => {
            const s    = this.slots[i];
            const icon = s ? slotIcons(s) + ' ' : '';
            const cls  = i === this.activeSlot ? ' active' : '';
            return `<button class="sc-btn sc-slot-tab${cls}" data-slot-tab="${i}">${icon}Slot ${i + 1}</button>`;
        }).join('');
    }

    private renderCopyRow(): void {
        const btns = [0, 1, 2, 3]
            .filter(i => i !== this.activeSlot)
            .map(i => `<button class="sc-btn sc-slot-copy" data-slot-copy="${i}">→ Slot ${i + 1}</button>`)
            .join('');
        this.copyRowEl.innerHTML = `<span class="sc-copy-label">Copy to:</span>${btns}`;
    }

    // ── Mode toggle ───────────────────────────────────────────────────────────

    private setMode(mode: SpellMode): void {
        this.spellMode = mode;
        this.simpleSectionEl.style.display = mode === 'simple' ? '' : 'none';
        this.chainSectionEl.style.display  = mode === 'chain'  ? '' : 'none';
        this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset['mode'] === mode));
        if (mode === 'chain') {
            this.renderStageChain();
        } else {
            this.loadEditorUI();
        }
        this.updatePreview();
    }

    // ── Simple mode editor ────────────────────────────────────────────────────

    private loadEditorUI(): void {
        this.castSlider.value = String(this.castTime);
        this.castInput.value  = fmt1(this.castTime / 1000);
        this.cdSlider.value   = String(this.cooldown);
        this.cdInput.value    = fmt1(this.cooldown / 1000);
        this.renderProjTabs();
        this.loadProjToEditor();
    }

    private projTabsHTML(): string {
        const tabs = this.projStates.map((p, i) =>
            `<button class="sc-btn sc-proj-tab${i === this.selectedProjIdx ? ' active' : ''}" data-proj="${i}">${ELEMENT_EMOJI[p.element]} #${i + 1}</button>`
        ).join('');
        const addBtn    = this.projStates.length < MAX_PROJECTILES
            ? `<button class="sc-btn sc-proj-add">+ Add</button>` : '';
        const copyBtn   = this.projStates.length < MAX_PROJECTILES
            ? `<button class="sc-btn sc-proj-copy">⊕ Copy</button>` : '';
        const removeBtn = this.projStates.length > 1
            ? `<button class="sc-btn sc-proj-remove">× Remove</button>` : '';
        return tabs + addBtn + copyBtn + removeBtn;
    }

    private renderProjTabs(): void {
        this.projTabsEl.innerHTML = this.projTabsHTML();
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

    // ── Chain mode editor ─────────────────────────────────────────────────────

    private renderStageChain(): void {
        const cards = this.stageChain.map((s, i) => {
            const isLast  = i === this.stageChain.length - 1;
            const canDel  = this.stageChain.length > 1;
            const icon    = STAGE_ELEM_ICON[s.element];

            const elemBtns = (['none', 'fire', 'ice', 'lightning'] as StageElement[]).map(el =>
                `<button class="sc-btn sc-stage-elem-btn${s.element === el ? ' active' : ''}" data-si="${i}" data-stage-field="element" data-val="${el}">${STAGE_ELEM_ICON[el]} ${el === 'none' ? 'None' : el[0].toUpperCase() + el.slice(1)}</button>`
            ).join('');

            const powerRow = s.element !== 'none' ? `
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Power</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="power" min="1" max="100" step="1" value="${s.power}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="powerN" min="1" max="100" value="${s.power}">
  </div>` : '';

            const dirRows = !s.stationary ? `
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Pitch</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="pitch" min="-90" max="90" step="1" value="${s.pitch}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="pitchN" min="-90" max="90" value="${s.pitch}">
    <span class="sc-unit">°</span>
  </div>
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Yaw</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="yaw" min="-180" max="180" step="1" value="${s.yaw}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="yawN" min="-180" max="180" value="${s.yaw}">
    <span class="sc-unit">°</span>
  </div>` : '';

            const triggerMs = s.trigger !== 'impact' ? `
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="triggerMs" min="100" max="10000" value="${s.triggerMs}">
    <span class="sc-unit">ms</span>` : '';

            const connector = !isLast ? `
  <div class="sc-stage-connector">
    <span class="sc-conn-arrow">▼ then</span>
    <select class="sc-stage-trigger" data-si="${i}" data-stage-field="trigger">
      <option value="delay"${s.trigger === 'delay' ? ' selected' : ''}>Delay</option>
      <option value="impact"${s.trigger === 'impact' ? ' selected' : ''}>Impact</option>
      <option value="interval"${s.trigger === 'interval' ? ' selected' : ''}>Interval</option>
    </select>${triggerMs}
  </div>` : '';

            return `
<div class="sc-stage-card">
  <div class="sc-stage-header">
    <span>Stage ${i + 1} <em class="sc-stage-icon">${icon}</em></span>
    ${canDel ? `<button class="sc-btn sc-stage-del" data-si="${i}">× Del</button>` : ''}
  </div>
  <div class="sc-stage-inline sc-stage-elems">
    ${elemBtns}
  </div>
  ${powerRow}
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Count</span>
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="count" min="1" max="6" value="${s.count}">
    <label class="sc-stage-check-lbl"><input type="checkbox" data-si="${i}" data-stage-field="stationary" ${s.stationary ? 'checked' : ''}> Stationary</label>
  </div>
  ${dirRows}
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Spread</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="spread" min="0" max="5" step="0.1" value="${s.spread}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="spreadN" min="0" max="5" step="0.1" value="${s.spread.toFixed(1)}">
  </div>
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Yaw fan</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="yawSpread" min="0" max="180" step="1" value="${s.yawSpread}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="yawSpreadN" min="0" max="180" value="${s.yawSpread}">
    <span class="sc-unit">°</span>
  </div>
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Lifetime</span>
    <input type="range" class="sc-slider" data-si="${i}" data-stage-field="duration" min="500" max="10000" step="100" value="${s.duration}">
    <input type="number" class="sc-number sc-num-narrow" data-si="${i}" data-stage-field="durationN" min="0.5" max="10" step="0.1" value="${(s.duration / 1000).toFixed(1)}">
    <span class="sc-unit">s</span>
  </div>
  ${connector}
</div>`;
        }).join('');

        this.stageChainEl.innerHTML = cards +
            `<button class="sc-btn sc-stage-add" style="margin-top:8px">+ Add Stage</button>`;
    }

    private handleStageField(si: number, field: string, value: string): void {
        const s = this.stageChain[si];

        const num = (lo: number, hi: number, round = true) => {
            const v = round ? Math.round(Number(value)) : parseFloat(Number(value).toFixed(1));
            return Math.max(lo, Math.min(hi, v));
        };
        const sync = (a: string, b: string, val: string) => {
            const ea = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="${a}"]`);
            const eb = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="${b}"]`);
            if (ea) ea.value = val;
            if (eb) eb.value = val;
        };

        switch (field) {
            case 'power':    case 'powerN':     s.power     = num(1, 100);     sync('power', 'powerN', String(s.power));     break;
            case 'pitch':    case 'pitchN':     s.pitch     = num(-90, 90);    sync('pitch', 'pitchN', String(s.pitch));     break;
            case 'yaw':      case 'yawN':       s.yaw       = num(-180, 180);  sync('yaw', 'yawN', String(s.yaw));           break;
            case 'yawSpread': case 'yawSpreadN': s.yawSpread = num(0, 180);    sync('yawSpread', 'yawSpreadN', String(s.yawSpread)); break;
            case 'spread':   case 'spreadN':    s.spread    = num(0, 5, false); sync('spread', 'spreadN', s.spread.toFixed(1)); break;
            case 'count':    s.count = num(1, 6); break;
            case 'triggerMs': s.triggerMs = num(100, 10000); break;
            case 'duration': {
                s.duration = num(500, 10000);
                const ea = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="duration"]`);
                const eb = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="durationN"]`);
                if (ea) ea.value = String(s.duration);
                if (eb) eb.value = (s.duration / 1000).toFixed(1);
                this.chainUpdatePreview();
                return;
            }
            case 'durationN': {
                s.duration = Math.max(500, Math.min(10000, Math.round(Number(value) * 1000)));
                const ea = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="duration"]`);
                const eb = this.stageChainEl.querySelector<HTMLInputElement>(`[data-si="${si}"][data-stage-field="durationN"]`);
                if (ea) ea.value = String(s.duration);
                if (eb) eb.value = (s.duration / 1000).toFixed(1);
                this.chainUpdatePreview();
                return;
            }
            case 'trigger': {
                s.trigger = value as StageTrigger;
                this.renderStageChain();  // re-render to show/hide triggerMs input
                this.chainUpdatePreview();
                return;
            }
        }
        this.chainUpdatePreview();
    }

    private chainUpdatePreview(): void {
        const ctLabel   = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime / 1000)} s channel`;
        const cdLabel   = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown / 1000)} s cooldown`;
        const stageLines = this.stageChain.map((s, i) => {
            const icon    = STAGE_ELEM_ICON[s.element];
            const dmgPart = s.element !== 'none' ? ` · ${calcDamage(s.power, this.cooldown)} dmg` : '';
            const trigPart = i < this.stageChain.length - 1
                ? ` → ${s.trigger}${s.trigger !== 'impact' ? ' ' + s.triggerMs + 'ms' : ''}`
                : '';
            return `<span class="sc-proj-preview-item">${icon} Stage ${i + 1}${dmgPart}${trigPart}</span>`;
        }).join('');
        const totalMana = Math.max(1, this.stageChain.reduce((sum, s) =>
            sum + (s.element !== 'none' ? calcManaCost(s.power, this.castTime) : 5), 0));

        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${totalMana}</strong> &nbsp;·&nbsp; ${this.stageChain.length} stages</div>
<div class="sc-proj-preview-list">${stageLines}</div>
<div class="sc-desc">${ctLabel} · ${cdLabel}</div>`;

        this.commitToActiveSlot();
        this.updateSlotList();
    }

    // ── HTML skeleton ─────────────────────────────────────────────────────────

    private buildHTML(): void {
        const p0 = this.projStates[0];
        this.overlay.innerHTML = `
<div class="sc-layout">
  <div class="sc-panel">
    <h2 class="sc-title">SPELL CREATOR</h2>

    <div class="sc-section">
      <div class="sc-label">EDITING SLOT</div>
      <div class="sc-row" id="sc-slot-tabs">
        ${[0, 1, 2, 3].map(i =>
            `<button class="sc-btn sc-slot-tab${i === this.activeSlot ? ' active' : ''}" data-slot-tab="${i}">Slot ${i + 1}</button>`
        ).join('')}
      </div>
      <div class="sc-copy-row" id="sc-copy-row">
        <span class="sc-copy-label">Copy to:</span>
        ${[0, 1, 2, 3].filter(i => i !== this.activeSlot).map(i =>
            `<button class="sc-btn sc-slot-copy" data-slot-copy="${i}">→ Slot ${i + 1}</button>`
        ).join('')}
      </div>
    </div>

    <div class="sc-section">
      <div class="sc-label">SPELL MODE</div>
      <div class="sc-row">
        <button class="sc-btn sc-mode-btn${this.spellMode === 'simple' ? ' active' : ''}" data-mode="simple">⚡ Salvo</button>
        <button class="sc-btn sc-mode-btn${this.spellMode === 'chain'  ? ' active' : ''}" data-mode="chain">⛓ Chain</button>
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

    <div id="sc-simple-section">
      <div class="sc-section">
        <div class="sc-label">PROJECTILES <span class="sc-range-hint">max ${MAX_PROJECTILES} · click in view to select</span></div>
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

          <div class="sc-label sc-sub-label" style="margin-top:12px">SPAWN OFFSET <span class="sc-range-hint">R=right  U=up  F=forward</span></div>
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

          <div class="sc-label sc-sub-label" style="margin-top:12px">FLY DIRECTION <span class="sc-range-hint">yaw: left/right · pitch: up/down</span></div>
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
    </div>

    <div id="sc-chain-section" style="display:none">
      <div class="sc-section">
        <div id="sc-stage-chain"></div>
      </div>
    </div>

    <div class="sc-preview" id="sc-preview"></div>
    <div id="sc-slot-list" class="sc-slots"></div>
    <div class="sc-footer">Tab — close &nbsp;·&nbsp; 1–4 — cast in combat</div>
  </div>

  <div class="sc-viz-side">
    <canvas id="sc-viz-canvas" class="sc-viz-canvas" width="${VIZ_W}" height="${VIZ_H}"></canvas>
    <div class="sc-viz-hint">Drag to orbit · Click to select · Hold G: move · Hold R: rotate direction</div>
  </div>
</div>`;

        this.previewEl        = this.overlay.querySelector<HTMLElement>('#sc-preview')!;
        this.slotListEl       = this.overlay.querySelector<HTMLElement>('#sc-slot-list')!;
        this.slotTabsEl       = this.overlay.querySelector<HTMLElement>('#sc-slot-tabs')!;
        this.copyRowEl        = this.overlay.querySelector<HTMLElement>('#sc-copy-row')!;
        this.projTabsEl       = this.overlay.querySelector<HTMLElement>('#sc-proj-tabs')!;
        this.projElementBtns  = [...this.overlay.querySelectorAll<HTMLElement>('[data-proj-element]')];
        this.simpleSectionEl  = this.overlay.querySelector<HTMLElement>('#sc-simple-section')!;
        this.chainSectionEl   = this.overlay.querySelector<HTMLElement>('#sc-chain-section')!;
        this.stageChainEl     = this.overlay.querySelector<HTMLElement>('#sc-stage-chain')!;
        this.modeBtns         = [...this.overlay.querySelectorAll<HTMLElement>('[data-mode]')];

        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;
        this.castSlider      = get('sc-cast-slider');
        this.castInput       = get('sc-cast-input');
        this.cdSlider        = get('sc-cd-slider');
        this.cdInput         = get('sc-cd-input');
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
        this.vizHintEl       = this.overlay.querySelector<HTMLElement>('.sc-viz-hint')!;

        const vizCanvas = this.overlay.querySelector<HTMLCanvasElement>('#sc-viz-canvas')!;
        this.viz = new SpellVisualization(vizCanvas);

        this.viz.onProjectileSelected = (idx) => {
            this.selectedProjIdx = idx;
            this.renderProjTabs();
            this.loadProjToEditor();
            this.syncViz();
        };

        this.viz.onProjectileEdited = (edits) => {
            const p = this.projStates[this.selectedProjIdx];
            if (edits.right   !== undefined) p.right   = Math.min(3,   Math.max(-3,   p.right   + edits.right));
            if (edits.up      !== undefined) p.up      = Math.min(4,   Math.max(-1,   p.up      + edits.up));
            if (edits.forward !== undefined) p.forward = Math.min(3,   Math.max(-3,   p.forward + edits.forward));
            if (edits.yaw     !== undefined) p.yaw     = Math.min(180, Math.max(-180, p.yaw     + edits.yaw));
            if (edits.pitch   !== undefined) p.pitch   = Math.min(90,  Math.max(-90,  p.pitch   + edits.pitch));
            this.loadProjToEditor();
            this.syncViz();
        };

        this.viz.onEditModeChanged = (mode: EditMode) => {
            if (mode === 'none') {
                this.vizHintEl.textContent = 'Drag to orbit · Click to select · Hold G: move · Hold R: rotate direction';
            } else if (mode === 'move') {
                this.vizHintEl.textContent = '⬢ MOVE — left/right: R offset · up/down: F offset · Shift: U offset';
            } else {
                this.vizHintEl.textContent = '↻ ROTATE — left/right: yaw  ·  up/down: pitch';
            }
        };

        this.renderStageChain();
        this.updatePreview();
        this.updateSlotList();
    }

    // ── Viz sync ──────────────────────────────────────────────────────────────

    private syncViz(): void {
        if (this.spellMode === 'chain') {
            this.viz.update([], -1);
        } else {
            this.viz.update(this.projStates, this.selectedProjIdx);
        }
    }

    // ── Preview & slot list ───────────────────────────────────────────────────

    private updatePreview(): void {
        if (this.spellMode === 'chain') {
            this.chainUpdatePreview();
            return;
        }

        const ctLabel   = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime / 1000)} s channel`;
        const cdLabel   = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown / 1000)} s cooldown`;
        const totalMana = this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0);

        const projLines = this.projStates.map((p, i) => {
            const dmg    = calcDamage(p.power, this.cooldown);
            const burn   = calcBurnDamage(p.power, this.cooldown);
            const dmgStr = p.element === 'fire' ? `${dmg}+${burn}/tick` : `${dmg}`;
            return `<span class="sc-proj-preview-item">${ELEMENT_EMOJI[p.element]} #${i + 1} Pwr ${p.power} · ${dmgStr} · ${ELEMENT_DESC[p.element]}</span>`;
        }).join('');

        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${totalMana}</strong>${this.projStates.length > 1 ? ` &nbsp;·&nbsp; ${this.projStates.length} projectiles` : ''}</div>
<div class="sc-proj-preview-list">${projLines}</div>
<div class="sc-desc">${ctLabel} · ${cdLabel}</div>`;

        this.commitToActiveSlot();
        this.updateSlotList();
        this.syncViz();
    }

    private updateSlotList(): void {
        this.slotListEl.innerHTML =
            '<div class="sc-label">YOUR SPELLS</div>' +
            this.slots.map((s, i) =>
                `<div class="sc-slot-row"><span class="sc-slot-num">${i + 1}</span>${s ? spellLabel(s, i === this.activeSlot) : '<em>Empty</em>'}</div>`
            ).join('');
    }

    // ── Event binding ─────────────────────────────────────────────────────────

    private bindEvents(): void {
        // ── Click delegation ─────────────────────────────────────────────────
        this.overlay.addEventListener('click', e => {
            const t = e.target as HTMLElement;

            const slotTab = t.dataset['slotTab'];
            if (slotTab !== undefined) { this.selectSlot(Number(slotTab)); return; }

            const slotCopy = t.dataset['slotCopy'];
            if (slotCopy !== undefined) { this.copyToSlot(Number(slotCopy)); return; }

            const mode = t.dataset['mode'];
            if (mode) { this.setMode(mode as SpellMode); return; }

            if (t.classList.contains('sc-proj-tab')) {
                this.selectedProjIdx = Number(t.dataset['proj']);
                this.renderProjTabs(); this.loadProjToEditor(); this.syncViz(); return;
            }
            if (t.classList.contains('sc-proj-add')) {
                if (this.projStates.length >= MAX_PROJECTILES) return;
                this.projStates.push(defaultProjState());
                this.selectedProjIdx = this.projStates.length - 1;
                this.renderProjTabs(); this.loadProjToEditor(); this.updatePreview(); return;
            }
            if (t.classList.contains('sc-proj-copy')) {
                if (this.projStates.length >= MAX_PROJECTILES) return;
                this.projStates.push({ ...this.projStates[this.selectedProjIdx] });
                this.selectedProjIdx = this.projStates.length - 1;
                this.renderProjTabs(); this.loadProjToEditor(); this.updatePreview(); return;
            }
            if (t.classList.contains('sc-proj-remove')) {
                if (this.projStates.length <= 1) return;
                this.projStates.splice(this.selectedProjIdx, 1);
                this.selectedProjIdx = Math.min(this.selectedProjIdx, this.projStates.length - 1);
                this.renderProjTabs(); this.loadProjToEditor(); this.updatePreview(); return;
            }

            const projEl = t.dataset['projElement'] as SpellElement | undefined;
            if (projEl) {
                this.projStates[this.selectedProjIdx].element = projEl;
                this.projElementBtns.forEach(b => b.classList.toggle('active', b.dataset['projElement'] === projEl));
                this.renderProjTabs(); this.updatePreview(); return;
            }

            // Stage chain buttons
            if (t.classList.contains('sc-stage-del')) {
                const si = Number(t.dataset['si']);
                if (this.stageChain.length <= 1) return;
                this.stageChain.splice(si, 1);
                this.renderStageChain(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-add')) {
                this.stageChain.push(defaultStageDraft());
                this.renderStageChain(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-elem-btn')) {
                const si  = Number(t.dataset['si']);
                this.stageChain[si].element = t.dataset['val'] as StageElement;
                this.renderStageChain(); this.chainUpdatePreview(); return;
            }
        });

        // ── Cast time ─────────────────────────────────────────────────────────
        this.castSlider.addEventListener('input', () => {
            this.castTime = Number(this.castSlider.value);
            this.castInput.value = fmt1(this.castTime / 1000);
            this.updatePreview();
        });
        this.castInput.addEventListener('input', () => {
            const secs = Math.min(3, Math.max(0, Number(this.castInput.value) || 0));
            this.castTime = Math.round(secs * 1000);
            this.castSlider.value = String(this.castTime);
            this.updatePreview();
        });
        this.castInput.addEventListener('blur', () => { this.castInput.value = fmt1(this.castTime / 1000); });

        // ── Cooldown ──────────────────────────────────────────────────────────
        this.cdSlider.addEventListener('input', () => {
            this.cooldown = Number(this.cdSlider.value);
            this.cdInput.value = fmt1(this.cooldown / 1000);
            this.updatePreview();
        });
        this.cdInput.addEventListener('input', () => {
            const secs = Math.min(10, Math.max(0, Number(this.cdInput.value) || 0));
            this.cooldown = Math.round(secs * 1000);
            this.cdSlider.value = String(this.cooldown);
            this.updatePreview();
        });
        this.cdInput.addEventListener('blur', () => { this.cdInput.value = fmt1(this.cooldown / 1000); });

        // ── Per-proj power ────────────────────────────────────────────────────
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

        // ── Per-proj offset + direction ───────────────────────────────────────
        const bindProj = (
            slider: HTMLInputElement, input: HTMLInputElement,
            min: number, max: number, decimals: number,
            prop: keyof ProjState,
        ) => {
            const curr = () => this.projStates[this.selectedProjIdx];
            slider.addEventListener('input', () => {
                const v = parseFloat(parseFloat(slider.value).toFixed(decimals));
                (curr() as unknown as Record<string, number>)[prop as string] = v;
                input.value = v.toFixed(decimals);
                this.syncViz(); this.commitToActiveSlot();
            });
            input.addEventListener('input', () => {
                const v = parseFloat(Math.min(max, Math.max(min, parseFloat(input.value) || 0)).toFixed(decimals));
                (curr() as unknown as Record<string, number>)[prop as string] = v;
                slider.value = String(v);
                this.syncViz(); this.commitToActiveSlot();
            });
            input.addEventListener('blur', () => {
                input.value = ((curr() as unknown as Record<string, number>)[prop as string]).toFixed(decimals);
            });
        };

        bindProj(this.rightSlider,  this.rightInput,  -3,   3, 1, 'right');
        bindProj(this.upSlider,     this.upInput,     -1,   4, 1, 'up');
        bindProj(this.fwdSlider,    this.fwdInput,    -3,   3, 1, 'forward');
        bindProj(this.yawSlider,    this.yawInput,  -180, 180, 0, 'yaw');
        bindProj(this.pitchSlider,  this.pitchInput,  -90,  90, 0, 'pitch');

        // ── Chain stage inputs (delegated) ────────────────────────────────────
        this.chainSectionEl.addEventListener('input', e => {
            const t = e.target as HTMLInputElement | HTMLSelectElement;
            const si = t.dataset['si'];
            if (si === undefined) return;
            const field = t.dataset['stageField'];
            if (!field) return;
            this.handleStageField(Number(si), field, t.value);
        });
        this.chainSectionEl.addEventListener('change', e => {
            const t = e.target as HTMLInputElement;
            const si = t.dataset['si'];
            if (si === undefined) return;
            if (t.dataset['stageField'] === 'stationary') {
                this.stageChain[Number(si)].stationary = t.checked;
                this.renderStageChain();
                this.chainUpdatePreview();
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    open(): void {
        this.isOpen = true;
        this.overlay.style.display = 'flex';
        this.viz.start();
        this.syncViz();
    }
    close(): void {
        this.isOpen = false;
        this.overlay.style.display = 'none';
        this.viz.stop();
    }
    toggle(): void { this.isOpen ? this.close() : this.open(); }
    get visible(): boolean { return this.isOpen; }
    getSlot(i: number): Spell | null { return this.slots[i] ?? null; }
}
