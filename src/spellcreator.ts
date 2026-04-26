import type { ProjectileConfig, Spell, SpellElement, SpellStage, StageElement, StageTrigger } from './types';
import { SpellVisualization, type EditMode } from './spellviz';
import { MANA_COST_FACTOR } from './constants';

// ── Formulas ──────────────────────────────────────────────────────────────────

function cdMult(cooldown: number): number { return 0.7 + (cooldown / 10000) * 0.8; }

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

// ── Types ────────────────────────────────────────────────────────────────────

type SpellMode = 'simple' | 'chain';

interface StageDraft {
    element:    StageElement;
    power:      number;
    pitch:      number;
    yaw:        number;
    count:      number;
    spread:     number;
    yawSpread:  number;
    stationary: boolean;
    trigger:    StageTrigger;
    triggerMs:  number;
    duration:   number;
    children:   StageDraft[];
}

interface ProjState {
    right: number; up: number; forward: number;
    pitch: number; yaw: number;
    element: SpellElement; power: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ELEMENT_EMOJI: Record<SpellElement, string> = { fire: '🔥', ice: '❄', lightning: '⚡' };
const STAGE_ELEM_ICON: Record<StageElement, string> = { fire: '🔥', ice: '❄', lightning: '⚡', none: '○' };
const ELEMENT_DESC: Record<SpellElement, string> = {
    fire: 'burns over time', ice: 'slows movement', lightning: 'arcs to nearby target',
};

function fmt1(n: number): string { return (Math.round(n * 10) / 10).toFixed(1); }

function defaultProjState(): ProjState {
    return { right: 0, up: 0, forward: 0.5, pitch: 0, yaw: 0, element: 'fire', power: 50 };
}

function defaultStageDraft(): StageDraft {
    return { element: 'none', power: 50, pitch: 45, yaw: 0, count: 1, spread: 0, yawSpread: 0,
             stationary: false, trigger: 'delay', triggerMs: 1500, duration: 3000, children: [] };
}

function defaultStageRoots(): StageDraft[] {
    return [{
        element: 'none', power: 50, pitch: 75, yaw: 0, count: 1, spread: 0, yawSpread: 0,
        stationary: false, trigger: 'delay', triggerMs: 2000, duration: 3000,
        children: [{
            element: 'none', power: 50, pitch: 0, yaw: 0, count: 1, spread: 0, yawSpread: 0,
            stationary: true, trigger: 'interval', triggerMs: 500, duration: 4000,
            children: [{
                element: 'ice', power: 60, pitch: -80, yaw: 0, count: 3, spread: 3, yawSpread: 30,
                stationary: false, trigger: 'impact', triggerMs: 0, duration: 2000, children: [],
            }],
        }],
    }];
}

function draftToStage(d: StageDraft, cooldown: number, castTime: number): SpellStage {
    return {
        element: d.element, power: d.power, pitch: d.pitch, yaw: d.yaw,
        count: d.count, spread: d.spread, yawSpread: d.yawSpread,
        stationary: d.stationary, trigger: d.trigger, triggerMs: d.triggerMs, duration: d.duration,
        damage:     d.element !== 'none' ? calcDamage(d.power, cooldown) : 0,
        burnDamage: d.element === 'fire'  ? calcBurnDamage(d.power, cooldown) : 0,
        children:   d.children.map(c => draftToStage(c, cooldown, castTime)),
    };
}

function stageToDraft(s: SpellStage): StageDraft {
    return {
        element: s.element, power: s.power, pitch: s.pitch, yaw: s.yaw,
        count: s.count, spread: s.spread, yawSpread: s.yawSpread,
        stationary: s.stationary, trigger: s.trigger, triggerMs: s.triggerMs, duration: s.duration,
        children: s.children.map(stageToDraft),
    };
}

function slotIcons(s: Spell): string {
    if (s.stages?.length) return '⛓';
    const projs = s.projectiles;
    const first = projs[0].element;
    if (projs.every(p => p.element === first)) return ELEMENT_EMOJI[first];
    return projs.map(p => ELEMENT_EMOJI[p.element]).join('');
}

function spellLabel(s: Spell, active: boolean): string {
    const ct  = s.castTime === 0 ? 'Instant' : `${fmt1(s.castTime / 1000)}s cast`;
    const cd  = s.cooldown === 0 ? 'No CD'   : `${fmt1(s.cooldown / 1000)}s CD`;
    const tag = active ? ' <em class="sc-editing-tag">editing</em>' : '';
    if (s.stages?.length) return `⛓ Chain · ${ct} · ${cd} · ${s.manaCost} mp${tag}`;
    const icons = slotIcons(s);
    if (s.projectiles.length === 1) {
        const p = s.projectiles[0];
        return `${icons} ${p.element[0].toUpperCase() + p.element.slice(1)} · Pwr ${p.power} · ${ct} · ${cd} · ${p.damage} dmg · ${s.manaCost} mp${tag}`;
    }
    const elements = [...new Set(s.projectiles.map(p => p.element))];
    const elLabel  = elements.length === 1 ? elements[0][0].toUpperCase() + elements[0].slice(1) : 'Mixed';
    return `${icons} ${elLabel} · ×${s.projectiles.length} proj · ${ct} · ${cd} · ${s.manaCost} mp${tag}`;
}

const MAX_PROJECTILES = 6;
const VIZ_W = 400;
const VIZ_H = 460;

// ── SpellCreator ──────────────────────────────────────────────────────────────

export class SpellCreator {
    private castTime = 0;
    private cooldown = 2000;
    private spellMode: SpellMode = 'simple';

    private projStates: ProjState[] = [defaultProjState()];
    private selectedProjIdx = 0;
    private activeSlot = 0;
    private stageRoots: StageDraft[] = defaultStageRoots();
    private selectedStagePath: number[] | null = null;
    private dragSourcePath:   number[] | null = null;

    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;
    private viz!: SpellVisualization;

    // DOM refs — simple mode
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
    // DOM refs — chain mode
    private simpleSectionEl!:  HTMLElement;
    private chainSectionEl!:   HTMLElement;
    private stageTreeEl!:      HTMLElement;
    private stageEditorEl!:    HTMLElement;
    private modeBtns!:         HTMLElement[];

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        this.buildHTML();
        this.bindEvents();
        this.commitToActiveSlot();
    }

    // ── Tree navigation ───────────────────────────────────────────────────────

    private getNode(path: number[]): StageDraft {
        let node = this.stageRoots[path[0]];
        for (let i = 1; i < path.length; i++) node = node.children[path[i]];
        return node;
    }

    private getParentArray(path: number[]): StageDraft[] {
        if (path.length === 1) return this.stageRoots;
        let node = this.stageRoots[path[0]];
        for (let i = 1; i < path.length - 1; i++) node = node.children[path[i]];
        return node.children;
    }

    private extractNode(path: number[]): StageDraft {
        const arr = this.getParentArray(path);
        return arr.splice(path[path.length - 1], 1)[0];
    }

    // After removing `removed`, adjust `target` if they share the same parent and removed came before.
    private adjustPathAfterRemoval(removed: number[], target: number[]): number[] {
        if (removed.length !== target.length) return target;
        for (let i = 0; i < removed.length - 1; i++) {
            if (removed[i] !== target[i]) return target;
        }
        const ri = removed[removed.length - 1], ti = target[target.length - 1];
        return ri < ti ? [...target.slice(0, -1), ti - 1] : target;
    }

    private moveNode(srcPath: number[], tgtPath: number[], pos: 'before' | 'after' | 'into'): void {
        const isSelf = tgtPath.length >= srcPath.length && srcPath.every((v, i) => tgtPath[i] === v);
        if (isSelf) return;

        const node   = this.extractNode(srcPath);
        const adjTgt = this.adjustPathAfterRemoval(srcPath, tgtPath);

        if (pos === 'into') {
            const tgt = this.getNode(adjTgt);
            if (tgt.element !== 'none') return;
            tgt.children.push(node);
            this.selectedStagePath = [...adjTgt, tgt.children.length - 1];
        } else {
            const arr = this.getParentArray(adjTgt);
            let idx   = adjTgt[adjTgt.length - 1];
            if (pos === 'after') idx++;
            arr.splice(idx, 0, node);
            this.selectedStagePath = [...adjTgt.slice(0, -1), idx];
        }

        this.renderStageTree();
        this.renderStageEditor();
        this.chainUpdatePreview();
    }

    // ── Spell building ────────────────────────────────────────────────────────

    private makeSpell(): Spell {
        const projectiles: ProjectileConfig[] = this.projStates.map(p => ({
            ...p, damage: calcDamage(p.power, this.cooldown), burnDamage: calcBurnDamage(p.power, this.cooldown),
        }));
        return { castTime: this.castTime, cooldown: this.cooldown,
                 manaCost: this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0), projectiles };
    }

    private makeChainSpell(): Spell {
        const stages = this.stageRoots.map(r => draftToStage(r, this.cooldown, this.castTime));
        return { castTime: this.castTime, cooldown: this.cooldown,
                 manaCost: Math.max(1, this.chainMana(this.stageRoots)), projectiles: [], stages };
    }

    private chainMana(nodes: StageDraft[]): number {
        return nodes.reduce((s, n) =>
            s + (n.element !== 'none' ? calcManaCost(n.power, this.castTime) : 5) + this.chainMana(n.children), 0);
    }

    private commitToActiveSlot(): void {
        this.slots[this.activeSlot] = this.spellMode === 'chain' ? this.makeChainSpell() : this.makeSpell();
        if (this.slotTabsEl) this.renderSlotTabs();
    }

    // ── Slot management ───────────────────────────────────────────────────────

    private selectSlot(i: number): void {
        this.activeSlot = i;
        const spell = this.slots[i];
        if (spell?.stages?.length) {
            this.castTime   = spell.castTime; this.cooldown = spell.cooldown;
            this.stageRoots = spell.stages.map(stageToDraft);
            this.setMode('chain');
        } else if (spell) {
            this.castTime   = spell.castTime; this.cooldown = spell.cooldown;
            this.projStates = spell.projectiles.map(p => ({
                right: p.right, up: p.up, forward: p.forward,
                pitch: p.pitch, yaw: p.yaw, element: p.element, power: p.power,
            }));
            this.setMode('simple');
        } else {
            this.castTime = 0; this.cooldown = 2000;
            this.projStates = [defaultProjState()]; this.stageRoots = defaultStageRoots();
        }
        this.selectedProjIdx = 0;
        this.renderSlotTabs(); this.renderCopyRow(); this.loadEditorUI(); this.updatePreview();
    }

    private copyToSlot(i: number): void {
        this.slots[i] = this.spellMode === 'chain' ? this.makeChainSpell() : this.makeSpell();
        this.renderSlotTabs(); this.updateSlotList();
    }

    private renderSlotTabs(): void {
        this.slotTabsEl.innerHTML = [0,1,2,3].map(i => {
            const s = this.slots[i]; const icon = s ? slotIcons(s) + ' ' : '';
            return `<button class="sc-btn sc-slot-tab${i===this.activeSlot?' active':''}" data-slot-tab="${i}">${icon}Slot ${i+1}</button>`;
        }).join('');
    }

    private renderCopyRow(): void {
        const btns = [0,1,2,3].filter(i => i !== this.activeSlot)
            .map(i => `<button class="sc-btn sc-slot-copy" data-slot-copy="${i}">→ Slot ${i+1}</button>`).join('');
        this.copyRowEl.innerHTML = `<span class="sc-copy-label">Copy to:</span>${btns}`;
    }

    // ── Mode toggle ───────────────────────────────────────────────────────────

    private setMode(mode: SpellMode): void {
        this.spellMode = mode;
        this.simpleSectionEl.style.display = mode === 'simple' ? '' : 'none';
        this.chainSectionEl.style.display  = mode === 'chain'  ? '' : 'none';
        this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset['mode'] === mode));
        if (mode === 'chain') {
            if (!this.selectedStagePath && this.stageRoots.length) this.selectedStagePath = [0];
            this.renderStageTree(); this.renderStageEditor();
        } else {
            this.loadEditorUI();
        }
        this.updatePreview();
    }

    // ── Simple mode editor ────────────────────────────────────────────────────

    private loadEditorUI(): void {
        this.castSlider.value = String(this.castTime); this.castInput.value = fmt1(this.castTime / 1000);
        this.cdSlider.value   = String(this.cooldown); this.cdInput.value   = fmt1(this.cooldown / 1000);
        this.renderProjTabs(); this.loadProjToEditor();
    }

    private projTabsHTML(): string {
        const tabs = this.projStates.map((p, i) =>
            `<button class="sc-btn sc-proj-tab${i===this.selectedProjIdx?' active':''}" data-proj="${i}">${ELEMENT_EMOJI[p.element]} #${i+1}</button>`
        ).join('');
        const addBtn    = this.projStates.length < MAX_PROJECTILES ? `<button class="sc-btn sc-proj-add">+ Add</button>` : '';
        const copyBtn   = this.projStates.length < MAX_PROJECTILES ? `<button class="sc-btn sc-proj-copy">⊕ Copy</button>` : '';
        const removeBtn = this.projStates.length > 1 ? `<button class="sc-btn sc-proj-remove">× Remove</button>` : '';
        return tabs + addBtn + copyBtn + removeBtn;
    }

    private renderProjTabs(): void { this.projTabsEl.innerHTML = this.projTabsHTML(); }

    private loadProjToEditor(): void {
        const p = this.projStates[this.selectedProjIdx];
        this.projElementBtns.forEach(b => b.classList.toggle('active', b.dataset['projElement'] === p.element));
        this.projPowerSlider.value = String(p.power); this.projPowerInput.value = String(p.power);
        this.rightSlider.value = String(p.right);   this.rightInput.value = p.right.toFixed(1);
        this.upSlider.value    = String(p.up);       this.upInput.value    = p.up.toFixed(1);
        this.fwdSlider.value   = String(p.forward);  this.fwdInput.value   = p.forward.toFixed(1);
        this.yawSlider.value   = String(p.yaw);      this.yawInput.value   = String(p.yaw);
        this.pitchSlider.value = String(p.pitch);    this.pitchInput.value = String(p.pitch);
    }

    // ── Chain: compact tree ───────────────────────────────────────────────────

    private renderStageTree(): void {
        let html = '';
        for (let i = 0; i < this.stageRoots.length; i++)
            html += this.renderTreeRow(this.stageRoots[i], [i], 0);
        html += `<button class="sc-btn sc-stage-add-root" style="margin-top:6px;width:100%;font-size:12px">+ Add root stage</button>`;
        this.stageTreeEl.innerHTML = html;
    }

    private renderTreeRow(s: StageDraft, path: number[], depth: number): string {
        const ps       = path.join(',');
        const isSel    = this.selectedStagePath?.join(',') === ps;
        const canDel   = path.length > 1 || this.stageRoots.length > 1;
        const icon     = STAGE_ELEM_ICON[s.element];
        const label    = s.element === 'none' ? (s.stationary ? 'Area' : 'Carrier') : s.element[0].toUpperCase() + s.element.slice(1);

        const meta: string[] = [];
        if (s.element !== 'none') meta.push(`pwr:${s.power}`);
        if (s.count > 1) meta.push(`×${s.count}`);
        if (!s.stationary && s.element !== 'none') {
            meta.push(s.pitch > 0 ? `↑${s.pitch}°` : s.pitch < 0 ? `↓${Math.abs(s.pitch)}°` : '→');
        }
        if (s.element === 'none' && s.children.length > 0) {
            const t = s.trigger === 'delay' ? `d:${fmt1(s.triggerMs/1000)}s`
                    : s.trigger === 'interval' ? `/${s.triggerMs}ms`
                    : 'on hit';
            meta.push(t);
        }
        if (s.children.length > 0) meta.push(`→${s.children.length}`);

        let html = `
<div class="sc-tree-item${isSel ? ' active' : ''}" style="padding-left:${depth * 14 + 6}px"
     draggable="true" data-drag-path="${ps}" data-drag-element="${s.element}">
  <span class="sc-drag-handle">⠿</span>
  <span class="sc-tree-select" data-path="${ps}">${icon} <strong>${label}</strong>${meta.length ? ' <em class="sc-tree-meta">'+meta.join(' · ')+'</em>' : ''}</span>
  ${canDel ? `<button class="sc-btn sc-stage-del" data-path="${ps}">×</button>` : ''}
</div>`;
        for (let i = 0; i < s.children.length; i++)
            html += this.renderTreeRow(s.children[i], [...path, i], depth + 1);
        return html;
    }

    // ── Chain: stage editor ───────────────────────────────────────────────────

    private renderStageEditor(): void {
        if (!this.selectedStagePath || !this.stageRoots.length) {
            this.stageEditorEl.innerHTML = '<em style="color:#555;font-size:12px">Select a stage from the tree above</em>';
            return;
        }
        const s  = this.getNode(this.selectedStagePath);
        const ps = this.selectedStagePath.join(',');

        const elemBtns = (['none', 'fire', 'ice', 'lightning'] as StageElement[]).map(el =>
            `<button class="sc-btn sc-stage-elem-btn${s.element===el?' active':''}" data-path="${ps}" data-val="${el}">${STAGE_ELEM_ICON[el]} ${el==='none'?'None':el[0].toUpperCase()+el.slice(1)}</button>`
        ).join('');

        const powerRow = s.element !== 'none' ? `
<div class="sc-stage-inline">
  <span class="sc-stage-lbl">Power</span>
  <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="power" min="1" max="100" step="1" value="${s.power}">
  <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="powerN" min="1" max="100" value="${s.power}">
</div>` : '';

        const dirRows = !s.stationary ? `
<div class="sc-stage-inline">
  <span class="sc-stage-lbl">Pitch</span>
  <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="pitch" min="-90" max="90" step="1" value="${s.pitch}">
  <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="pitchN" min="-90" max="90" value="${s.pitch}">
  <span class="sc-unit">°</span>
</div>
<div class="sc-stage-inline">
  <span class="sc-stage-lbl">Yaw</span>
  <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="yaw" min="-180" max="180" step="1" value="${s.yaw}">
  <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="yawN" min="-180" max="180" value="${s.yaw}">
  <span class="sc-unit">°</span>
</div>` : '';

        const durationRow = s.stationary ? `
<div class="sc-stage-inline">
  <span class="sc-stage-lbl">Lifetime</span>
  <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="duration" min="500" max="10000" step="100" value="${s.duration}">
  <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="durationN" min="0.5" max="10" step="0.1" value="${(s.duration/1000).toFixed(1)}">
  <span class="sc-unit">s</span>
</div>` : '';

        const triggerSection = s.element === 'none' ? `
<div class="sc-stage-connector">
  <span class="sc-conn-arrow">▼ then</span>
  <select class="sc-stage-trigger" data-path="${ps}" data-stage-field="trigger">
    <option value="delay"${s.trigger==='delay'?' selected':''}>Delay</option>
    <option value="impact"${s.trigger==='impact'?' selected':''}>Impact</option>
    <option value="interval"${s.trigger==='interval'?' selected':''}>Interval</option>
  </select>
  ${s.trigger !== 'impact' ? `<input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="triggerMs" min="100" max="10000" value="${s.triggerMs}"><span class="sc-unit">ms</span>` : ''}
  <button class="sc-btn sc-stage-add-child" data-path="${ps}" style="margin-left:auto">+ Child</button>
</div>` : '';

        // Breadcrumb
        const crumb = this.buildCrumb(this.selectedStagePath);

        this.stageEditorEl.innerHTML = `
<div class="sc-stage-crumb">${crumb}</div>
<div class="sc-stage-editor-body">
  <div class="sc-stage-inline sc-stage-elems">${elemBtns}</div>
  ${powerRow}
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Count</span>
    <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="count" min="1" max="6" value="${s.count}">
    <label class="sc-stage-check-lbl"><input type="checkbox" data-path="${ps}" data-stage-field="stationary" ${s.stationary?'checked':''}> Stationary</label>
  </div>
  ${dirRows}
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Spread</span>
    <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="spread" min="0" max="5" step="0.1" value="${s.spread}">
    <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="spreadN" min="0" max="5" step="0.1" value="${s.spread.toFixed(1)}">
  </div>
  <div class="sc-stage-inline">
    <span class="sc-stage-lbl">Yaw fan</span>
    <input type="range" class="sc-slider" data-path="${ps}" data-stage-field="yawSpread" min="0" max="180" step="1" value="${s.yawSpread}">
    <input type="number" class="sc-number sc-num-narrow" data-path="${ps}" data-stage-field="yawSpreadN" min="0" max="180" value="${s.yawSpread}">
    <span class="sc-unit">°</span>
  </div>
  ${durationRow}
  ${triggerSection}
</div>`;
    }

    private buildCrumb(path: number[]): string {
        const parts: string[] = [];
        let node = this.stageRoots[path[0]];
        parts.push(STAGE_ELEM_ICON[node.element] + ' ' + this.stageLabel(node));
        for (let i = 1; i < path.length; i++) {
            node = node.children[path[i]];
            parts.push(STAGE_ELEM_ICON[node.element] + ' ' + this.stageLabel(node));
        }
        return parts.join(' › ');
    }

    private stageLabel(s: StageDraft): string {
        if (s.element === 'none') return s.stationary ? 'Area' : 'Carrier';
        return s.element[0].toUpperCase() + s.element.slice(1);
    }

    // ── Chain: field update ───────────────────────────────────────────────────

    private handleStageField(path: number[], field: string, value: string): void {
        const s  = this.getNode(path);
        const ps = path.join(',');

        const num = (lo: number, hi: number, round = true) =>
            Math.max(lo, Math.min(hi, round ? Math.round(Number(value)) : parseFloat(Number(value).toFixed(1))));

        const sync = (a: string, b: string, val: string) => {
            [a, b].forEach(f => {
                const el = this.stageEditorEl.querySelector<HTMLInputElement>(`[data-path="${ps}"][data-stage-field="${f}"]`);
                if (el) el.value = val;
            });
        };

        switch (field) {
            case 'power':     case 'powerN':     s.power     = num(1,100);    sync('power','powerN',String(s.power));           break;
            case 'pitch':     case 'pitchN':     s.pitch     = num(-90,90);   sync('pitch','pitchN',String(s.pitch));           break;
            case 'yaw':       case 'yawN':       s.yaw       = num(-180,180); sync('yaw','yawN',String(s.yaw));                 break;
            case 'yawSpread': case 'yawSpreadN': s.yawSpread = num(0,180);    sync('yawSpread','yawSpreadN',String(s.yawSpread)); break;
            case 'spread':    case 'spreadN':    s.spread    = num(0,5,false); sync('spread','spreadN',s.spread.toFixed(1));    break;
            case 'count':     s.count     = num(1, 6);                                                                          break;
            case 'triggerMs': s.triggerMs = num(100, 10000);                                                                    break;
            case 'duration': {
                s.duration = num(500, 10000);
                const en = this.stageEditorEl.querySelector<HTMLInputElement>(`[data-path="${ps}"][data-stage-field="durationN"]`);
                if (en) en.value = (s.duration / 1000).toFixed(1);
                this.renderStageTree(); this.chainUpdatePreview(); return;
            }
            case 'durationN': {
                s.duration = Math.max(500, Math.min(10000, Math.round(Number(value) * 1000)));
                const el = this.stageEditorEl.querySelector<HTMLInputElement>(`[data-path="${ps}"][data-stage-field="duration"]`);
                if (el) el.value = String(s.duration);
                this.renderStageTree(); this.chainUpdatePreview(); return;
            }
            case 'trigger': {
                s.trigger = value as StageTrigger;
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
        }
        this.renderStageTree();
        this.chainUpdatePreview();
    }

    private chainUpdatePreview(): void {
        const ctLabel = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime/1000)} s channel`;
        const cdLabel = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown/1000)} s cooldown`;
        const lines: string[] = [];
        const walk = (nodes: StageDraft[], depth: number) => {
            for (const s of nodes) {
                const pad  = '&nbsp;&nbsp;'.repeat(depth);
                const icon = STAGE_ELEM_ICON[s.element];
                const dmg  = s.element !== 'none' ? ` · ${calcDamage(s.power, this.cooldown)} dmg` : '';
                const trig = s.element === 'none' && s.children.length
                    ? ` → ${s.trigger}${s.trigger!=='impact' ? ' '+s.triggerMs+'ms' : ''}` : '';
                lines.push(`<span class="sc-proj-preview-item">${pad}${icon} ${this.stageLabel(s)}${s.count>1?' ×'+s.count:''}${dmg}${trig}</span>`);
                walk(s.children, depth + 1);
            }
        };
        walk(this.stageRoots, 0);
        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${Math.max(1,this.chainMana(this.stageRoots))}</strong></div>
<div class="sc-proj-preview-list">${lines.join('')}</div>
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
        ${[0,1,2,3].map(i=>`<button class="sc-btn sc-slot-tab${i===this.activeSlot?' active':''}" data-slot-tab="${i}">Slot ${i+1}</button>`).join('')}
      </div>
      <div class="sc-copy-row" id="sc-copy-row">
        <span class="sc-copy-label">Copy to:</span>
        ${[0,1,2,3].filter(i=>i!==this.activeSlot).map(i=>`<button class="sc-btn sc-slot-copy" data-slot-copy="${i}">→ Slot ${i+1}</button>`).join('')}
      </div>
    </div>

    <div class="sc-section">
      <div class="sc-label">SPELL MODE</div>
      <div class="sc-row">
        <button class="sc-btn sc-mode-btn${this.spellMode==='simple'?' active':''}" data-mode="simple">⚡ Salvo</button>
        <button class="sc-btn sc-mode-btn${this.spellMode==='chain'?' active':''}" data-mode="chain">⛓ Chain</button>
      </div>
    </div>

    <div class="sc-section">
      <div class="sc-label">CAST TIME <span class="sc-range-hint">0 – 3 s</span></div>
      <div class="sc-slider-row">
        <input type="range" class="sc-slider" id="sc-cast-slider" min="0" max="3000" step="50" value="${this.castTime}">
        <input type="number" class="sc-number" id="sc-cast-input" min="0" max="3" step="any" value="${fmt1(this.castTime/1000)}">
      </div>
    </div>

    <div class="sc-section">
      <div class="sc-label">COOLDOWN <span class="sc-range-hint">0 – 10 s</span></div>
      <div class="sc-slider-row">
        <input type="range" class="sc-slider" id="sc-cd-slider" min="0" max="10000" step="100" value="${this.cooldown}">
        <input type="number" class="sc-number" id="sc-cd-input" min="0" max="10" step="any" value="${fmt1(this.cooldown/1000)}">
      </div>
    </div>

    <div id="sc-simple-section">
      <div class="sc-section">
        <div class="sc-label">PROJECTILES <span class="sc-range-hint">max ${MAX_PROJECTILES} · click in view to select</span></div>
        <div class="sc-row sc-proj-tabs" id="sc-proj-tabs">${this.projTabsHTML()}</div>
        <div class="sc-proj-editor">
          <div class="sc-label sc-sub-label">ELEMENT</div>
          <div class="sc-row" id="sc-proj-element-btns">
            <button class="sc-btn sc-proj-elem${p0.element==='fire'?' active':''}" data-proj-element="fire">🔥 Fire</button>
            <button class="sc-btn sc-proj-elem${p0.element==='ice'?' active':''}" data-proj-element="ice">❄ Ice</button>
            <button class="sc-btn sc-proj-elem${p0.element==='lightning'?' active':''}" data-proj-element="lightning">⚡ Lightning</button>
          </div>
          <div class="sc-label sc-sub-label" style="margin-top:10px">POWER <span class="sc-range-hint">1 – 100</span></div>
          <div class="sc-slider-row">
            <input type="range" class="sc-slider" id="sc-proj-power-slider" min="1" max="100" step="1" value="${p0.power}">
            <input type="number" class="sc-number sc-num-narrow" id="sc-proj-power-input" min="1" max="100" step="any" value="${p0.power}">
          </div>
          <div class="sc-label sc-sub-label" style="margin-top:12px">SPAWN OFFSET <span class="sc-range-hint">R=right  U=up  F=forward</span></div>
          <div class="sc-slider-row"><span class="sc-axis">R</span>
            <input type="range" class="sc-slider" id="sc-right-slider" min="-3" max="3" step="0.1" value="0">
            <input type="number" class="sc-number sc-num-narrow" id="sc-right-input" min="-3" max="3" step="any" value="0.0">
          </div>
          <div class="sc-slider-row"><span class="sc-axis">U</span>
            <input type="range" class="sc-slider" id="sc-up-slider" min="-1" max="4" step="0.1" value="0">
            <input type="number" class="sc-number sc-num-narrow" id="sc-up-input" min="-1" max="4" step="any" value="0.0">
          </div>
          <div class="sc-slider-row"><span class="sc-axis">F</span>
            <input type="range" class="sc-slider" id="sc-fwd-slider" min="-3" max="3" step="0.1" value="0">
            <input type="number" class="sc-number sc-num-narrow" id="sc-fwd-input" min="-3" max="3" step="any" value="0.0">
          </div>
          <div class="sc-label sc-sub-label" style="margin-top:12px">FLY DIRECTION <span class="sc-range-hint">yaw: left/right · pitch: up/down</span></div>
          <div class="sc-slider-row"><span class="sc-axis">Yaw</span>
            <input type="range" class="sc-slider" id="sc-yaw-slider" min="-180" max="180" step="1" value="0">
            <input type="number" class="sc-number sc-num-narrow" id="sc-yaw-input" min="-180" max="180" step="any" value="0">
            <span class="sc-unit">°</span>
          </div>
          <div class="sc-slider-row"><span class="sc-axis">Pitch</span>
            <input type="range" class="sc-slider" id="sc-pitch-slider" min="-90" max="90" step="1" value="0">
            <input type="number" class="sc-number sc-num-narrow" id="sc-pitch-input" min="-90" max="90" step="any" value="0">
            <span class="sc-unit">°</span>
          </div>
        </div>
      </div>
    </div>

    <div id="sc-chain-section" style="display:none">
      <div class="sc-section">
        <div class="sc-label">STAGES</div>
        <div id="sc-stage-tree"></div>
      </div>
      <div class="sc-section">
        <div class="sc-label">SELECTED STAGE</div>
        <div id="sc-stage-editor"></div>
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

        this.previewEl       = this.overlay.querySelector<HTMLElement>('#sc-preview')!;
        this.slotListEl      = this.overlay.querySelector<HTMLElement>('#sc-slot-list')!;
        this.slotTabsEl      = this.overlay.querySelector<HTMLElement>('#sc-slot-tabs')!;
        this.copyRowEl       = this.overlay.querySelector<HTMLElement>('#sc-copy-row')!;
        this.projTabsEl      = this.overlay.querySelector<HTMLElement>('#sc-proj-tabs')!;
        this.projElementBtns = [...this.overlay.querySelectorAll<HTMLElement>('[data-proj-element]')];
        this.simpleSectionEl = this.overlay.querySelector<HTMLElement>('#sc-simple-section')!;
        this.chainSectionEl  = this.overlay.querySelector<HTMLElement>('#sc-chain-section')!;
        this.stageTreeEl     = this.overlay.querySelector<HTMLElement>('#sc-stage-tree')!;
        this.stageEditorEl   = this.overlay.querySelector<HTMLElement>('#sc-stage-editor')!;
        this.modeBtns        = [...this.overlay.querySelectorAll<HTMLElement>('[data-mode]')];

        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;
        this.castSlider = get('sc-cast-slider'); this.castInput = get('sc-cast-input');
        this.cdSlider   = get('sc-cd-slider');   this.cdInput   = get('sc-cd-input');
        this.projPowerSlider = get('sc-proj-power-slider'); this.projPowerInput = get('sc-proj-power-input');
        this.rightSlider = get('sc-right-slider'); this.rightInput = get('sc-right-input');
        this.upSlider    = get('sc-up-slider');    this.upInput    = get('sc-up-input');
        this.fwdSlider   = get('sc-fwd-slider');   this.fwdInput   = get('sc-fwd-input');
        this.yawSlider   = get('sc-yaw-slider');   this.yawInput   = get('sc-yaw-input');
        this.pitchSlider = get('sc-pitch-slider'); this.pitchInput = get('sc-pitch-input');
        this.vizHintEl   = this.overlay.querySelector<HTMLElement>('.sc-viz-hint')!;

        const vizCanvas = this.overlay.querySelector<HTMLCanvasElement>('#sc-viz-canvas')!;
        this.viz = new SpellVisualization(vizCanvas);
        this.viz.onProjectileSelected = (idx) => {
            this.selectedProjIdx = idx; this.renderProjTabs(); this.loadProjToEditor(); this.syncViz();
        };
        this.viz.onProjectileEdited = (edits) => {
            const p = this.projStates[this.selectedProjIdx];
            if (edits.right   !== undefined) p.right   = Math.min(3,   Math.max(-3,   p.right   + edits.right));
            if (edits.up      !== undefined) p.up      = Math.min(4,   Math.max(-1,   p.up      + edits.up));
            if (edits.forward !== undefined) p.forward = Math.min(3,   Math.max(-3,   p.forward + edits.forward));
            if (edits.yaw     !== undefined) p.yaw     = Math.min(180, Math.max(-180, p.yaw     + edits.yaw));
            if (edits.pitch   !== undefined) p.pitch   = Math.min(90,  Math.max(-90,  p.pitch   + edits.pitch));
            this.loadProjToEditor(); this.syncViz();
        };
        this.viz.onEditModeChanged = (mode: EditMode) => {
            if (mode === 'none')      this.vizHintEl.textContent = 'Drag to orbit · Click to select · Hold G: move · Hold R: rotate direction';
            else if (mode === 'move') this.vizHintEl.textContent = '⬢ MOVE — left/right: R offset · up/down: F offset · Shift: U offset';
            else                      this.vizHintEl.textContent = '↻ ROTATE — left/right: yaw  ·  up/down: pitch';
        };

        this.renderStageTree();
        this.updatePreview();
        this.updateSlotList();
    }

    // ── Viz ───────────────────────────────────────────────────────────────────

    private syncViz(): void {
        this.viz.update(this.spellMode === 'chain' ? [] : this.projStates, this.selectedProjIdx);
    }

    // ── Preview & slot list ───────────────────────────────────────────────────

    private updatePreview(): void {
        if (this.spellMode === 'chain') { this.chainUpdatePreview(); return; }
        const ctLabel   = this.castTime === 0 ? 'Fires instantly' : `${fmt1(this.castTime/1000)} s channel`;
        const cdLabel   = this.cooldown === 0 ? 'No cooldown'     : `${fmt1(this.cooldown/1000)} s cooldown`;
        const totalMana = this.projStates.reduce((s, p) => s + calcManaCost(p.power, this.castTime), 0);
        const projLines = this.projStates.map((p, i) => {
            const dmg = calcDamage(p.power, this.cooldown), burn = calcBurnDamage(p.power, this.cooldown);
            const dmgStr = p.element === 'fire' ? `${dmg}+${burn}/tick` : `${dmg}`;
            return `<span class="sc-proj-preview-item">${ELEMENT_EMOJI[p.element]} #${i+1} Pwr ${p.power} · ${dmgStr} · ${ELEMENT_DESC[p.element]}</span>`;
        }).join('');
        this.previewEl.innerHTML = `
<div class="sc-cost">Mana: <strong>${totalMana}</strong>${this.projStates.length>1?` &nbsp;·&nbsp; ${this.projStates.length} projectiles`:''}</div>
<div class="sc-proj-preview-list">${projLines}</div>
<div class="sc-desc">${ctLabel} · ${cdLabel}</div>`;
        this.commitToActiveSlot(); this.updateSlotList(); this.syncViz();
    }

    private updateSlotList(): void {
        this.slotListEl.innerHTML = '<div class="sc-label">YOUR SPELLS</div>' +
            this.slots.map((s, i) =>
                `<div class="sc-slot-row"><span class="sc-slot-num">${i+1}</span>${s ? spellLabel(s, i===this.activeSlot) : '<em>Empty</em>'}</div>`
            ).join('');
    }

    // ── Event binding ─────────────────────────────────────────────────────────

    private bindEvents(): void {
        this.overlay.addEventListener('click', e => {
            const t = e.target as HTMLElement;

            const slotTab = t.dataset['slotTab'];
            if (slotTab !== undefined) { this.selectSlot(Number(slotTab)); return; }
            const slotCopy = t.dataset['slotCopy'];
            if (slotCopy !== undefined) { this.copyToSlot(Number(slotCopy)); return; }
            const mode = t.dataset['mode'];
            if (mode) { this.setMode(mode as SpellMode); return; }

            // Simple mode
            if (t.classList.contains('sc-proj-tab')) {
                this.selectedProjIdx = Number(t.dataset['proj']);
                this.renderProjTabs(); this.loadProjToEditor(); this.syncViz(); return;
            }
            if (t.classList.contains('sc-proj-add')) {
                if (this.projStates.length >= MAX_PROJECTILES) return;
                this.projStates.push(defaultProjState()); this.selectedProjIdx = this.projStates.length - 1;
                this.renderProjTabs(); this.loadProjToEditor(); this.updatePreview(); return;
            }
            if (t.classList.contains('sc-proj-copy')) {
                if (this.projStates.length >= MAX_PROJECTILES) return;
                this.projStates.push({...this.projStates[this.selectedProjIdx]}); this.selectedProjIdx = this.projStates.length - 1;
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

            // Chain: tree row select
            const selEl = t.classList.contains('sc-tree-select') ? t : t.closest<HTMLElement>('.sc-tree-select');
            if (selEl && !t.closest('button')) {
                const ps = selEl.dataset['path']!;
                this.selectedStagePath = ps.split(',').map(Number);
                this.renderStageTree(); this.renderStageEditor(); return;
            }

            // Chain: structural buttons
            if (t.classList.contains('sc-stage-del')) {
                const path = t.dataset['path']!.split(',').map(Number);
                const deletedIdx = path[path.length - 1];
                const parentArr = this.getParentArray(path);
                parentArr.splice(deletedIdx, 1);

                // If the deleted node was selected (or an ancestor of selection), pick a new selection
                const sel = this.selectedStagePath;
                const affected = sel && sel.length >= path.length && path.every((v, i) => sel[i] === v);
                if (affected) {
                    if (parentArr.length > 0) {
                        const newIdx = Math.min(deletedIdx, parentArr.length - 1);
                        this.selectedStagePath = [...path.slice(0, -1), newIdx];
                    } else if (path.length > 1) {
                        this.selectedStagePath = path.slice(0, -1);
                    } else {
                        this.selectedStagePath = null;
                    }
                }
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-add-child')) {
                const path = t.dataset['path']!.split(',').map(Number);
                const node = this.getNode(path);
                node.children.push(defaultStageDraft());
                this.selectedStagePath = [...path, node.children.length - 1];
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-add-root')) {
                this.stageRoots.push(defaultStageDraft());
                this.selectedStagePath = [this.stageRoots.length - 1];
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-elem-btn')) {
                const path = t.dataset['path']!.split(',').map(Number);
                const node = this.getNode(path);
                const newEl = t.dataset['val'] as StageElement;
                node.element = newEl;
                if (newEl !== 'none') node.children = [];
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
        });

        // Cast time
        this.castSlider.addEventListener('input', () => {
            this.castTime = Number(this.castSlider.value); this.castInput.value = fmt1(this.castTime / 1000); this.updatePreview();
        });
        this.castInput.addEventListener('input', () => {
            this.castTime = Math.round(Math.min(3, Math.max(0, Number(this.castInput.value)||0)) * 1000);
            this.castSlider.value = String(this.castTime); this.updatePreview();
        });
        this.castInput.addEventListener('blur', () => { this.castInput.value = fmt1(this.castTime / 1000); });

        // Cooldown
        this.cdSlider.addEventListener('input', () => {
            this.cooldown = Number(this.cdSlider.value); this.cdInput.value = fmt1(this.cooldown / 1000); this.updatePreview();
        });
        this.cdInput.addEventListener('input', () => {
            this.cooldown = Math.round(Math.min(10, Math.max(0, Number(this.cdInput.value)||0)) * 1000);
            this.cdSlider.value = String(this.cooldown); this.updatePreview();
        });
        this.cdInput.addEventListener('blur', () => { this.cdInput.value = fmt1(this.cooldown / 1000); });

        // Per-proj power
        this.projPowerSlider.addEventListener('input', () => {
            const v = Math.round(Number(this.projPowerSlider.value));
            this.projStates[this.selectedProjIdx].power = v; this.projPowerInput.value = String(v); this.updatePreview();
        });
        this.projPowerInput.addEventListener('input', () => {
            const v = Math.min(100, Math.max(1, Math.round(Number(this.projPowerInput.value)||1)));
            this.projStates[this.selectedProjIdx].power = v; this.projPowerSlider.value = String(v); this.updatePreview();
        });
        this.projPowerInput.addEventListener('blur', () => { this.projPowerInput.value = String(this.projStates[this.selectedProjIdx].power); });

        // Per-proj offset + direction
        const bindProj = (slider: HTMLInputElement, input: HTMLInputElement, min: number, max: number, decimals: number, prop: keyof ProjState) => {
            const curr = () => this.projStates[this.selectedProjIdx];
            slider.addEventListener('input', () => {
                const v = parseFloat(parseFloat(slider.value).toFixed(decimals));
                (curr() as unknown as Record<string,number>)[prop as string] = v;
                input.value = v.toFixed(decimals); this.syncViz(); this.commitToActiveSlot();
            });
            input.addEventListener('input', () => {
                const v = parseFloat(Math.min(max, Math.max(min, parseFloat(input.value)||0)).toFixed(decimals));
                (curr() as unknown as Record<string,number>)[prop as string] = v;
                slider.value = String(v); this.syncViz(); this.commitToActiveSlot();
            });
            input.addEventListener('blur', () => { input.value = ((curr() as unknown as Record<string,number>)[prop as string]).toFixed(decimals); });
        };
        bindProj(this.rightSlider, this.rightInput, -3, 3, 1, 'right');
        bindProj(this.upSlider, this.upInput, -1, 4, 1, 'up');
        bindProj(this.fwdSlider, this.fwdInput, -3, 3, 1, 'forward');
        bindProj(this.yawSlider, this.yawInput, -180, 180, 0, 'yaw');
        bindProj(this.pitchSlider, this.pitchInput, -90, 90, 0, 'pitch');

        // Chain: stage editor input delegation
        this.chainSectionEl.addEventListener('input', e => {
            const t = e.target as HTMLInputElement | HTMLSelectElement;
            const ps = t.dataset['path'], field = t.dataset['stageField'];
            if (!ps || !field) return;
            this.handleStageField(ps.split(',').map(Number), field, t.value);
        });
        this.chainSectionEl.addEventListener('change', e => {
            const t = e.target as HTMLInputElement;
            const ps = t.dataset['path'];
            if (!ps || t.dataset['stageField'] !== 'stationary') return;
            this.getNode(ps.split(',').map(Number)).stationary = t.checked;
            this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview();
        });

        // Chain: drag-and-drop reordering
        let dropEl:  HTMLElement | null = null;
        let dropPos: 'before' | 'after' | 'into' | null = null;

        const clearDrop = () => {
            dropEl?.classList.remove('drop-before', 'drop-after', 'drop-into');
            dropEl = null; dropPos = null;
        };

        this.stageTreeEl.addEventListener('dragstart', e => {
            if ((e.target as HTMLElement).closest('button')) { e.preventDefault(); return; }
            const item = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-path]');
            if (!item) return;
            this.dragSourcePath = item.dataset['dragPath']!.split(',').map(Number);
            item.classList.add('dragging');
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', item.dataset['dragPath']!);
        });

        this.stageTreeEl.addEventListener('dragend', () => {
            this.stageTreeEl.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            clearDrop();
            this.dragSourcePath = null;
        });

        this.stageTreeEl.addEventListener('dragover', e => {
            e.preventDefault();
            if (!this.dragSourcePath) return;
            const item = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-path]');
            if (!item) { clearDrop(); return; }

            const tgtPath = item.dataset['dragPath']!.split(',').map(Number);
            const isSelf  = tgtPath.length >= this.dragSourcePath.length &&
                this.dragSourcePath.every((v, i) => tgtPath[i] === v);
            if (isSelf) { clearDrop(); return; }

            const rect     = item.getBoundingClientRect();
            const pct      = (e.clientY - rect.top) / rect.height;
            const canChild = item.dataset['dragElement'] === 'none';
            const newPos: 'before' | 'after' | 'into' =
                canChild && pct > 0.33 && pct < 0.67 ? 'into' : pct <= 0.5 ? 'before' : 'after';

            if (item === dropEl && newPos === dropPos) return;
            clearDrop();
            dropEl = item; dropPos = newPos;
            item.classList.add(`drop-${newPos}`);
            e.dataTransfer!.dropEffect = 'move';
        });

        this.stageTreeEl.addEventListener('dragleave', e => {
            if (!this.stageTreeEl.contains(e.relatedTarget as Node)) clearDrop();
        });

        this.stageTreeEl.addEventListener('drop', e => {
            e.preventDefault();
            const item = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-path]');
            const src  = this.dragSourcePath;
            const pos  = dropPos;
            this.stageTreeEl.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            clearDrop();
            this.dragSourcePath = null;
            if (!item || !src || !pos) return;
            this.moveNode(src, item.dataset['dragPath']!.split(',').map(Number), pos);
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    open():   void { this.isOpen = true;  this.overlay.style.display = 'flex'; this.viz.start(); this.syncViz(); }
    close():  void { this.isOpen = false; this.overlay.style.display = 'none'; this.viz.stop(); }
    toggle(): void { this.isOpen ? this.close() : this.open(); }
    get visible(): boolean { return this.isOpen; }
    getSlot(i: number): Spell | null { return this.slots[i] ?? null; }
}
