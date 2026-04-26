import type { Spell, SpellElement, SpellStage, StageElement, StageTrigger } from './types';
import { SpellVisualization, type StageVizItem } from './spellviz';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const ELEMENT_EMOJI: Record<SpellElement, string> = { fire: '🔥', ice: '❄', lightning: '⚡' };
const STAGE_ELEM_ICON: Record<StageElement, string> = { fire: '🔥', ice: '❄', lightning: '⚡', none: '○' };

function fmt1(n: number): string { return (Math.round(n * 10) / 10).toFixed(1); }

function defaultStageDraft(): StageDraft {
    return { element: 'none', power: 50, pitch: 45, yaw: 0, count: 1, spread: 0, yawSpread: 0,
             stationary: false, trigger: 'delay', triggerMs: 1500, duration: 3000, children: [] };
}

function defaultStageRoots(): StageDraft[] {
    return [{
        element: 'fire', power: 50, pitch: 0, yaw: 0, count: 1, spread: 0, yawSpread: 0,
        stationary: false, trigger: 'delay', triggerMs: 1500, duration: 3000, children: [],
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

export function collectSpellElements(stages: SpellStage[]): SpellElement[] {
    const elems: SpellElement[] = [];
    for (const s of stages) {
        if (s.element !== 'none') elems.push(s.element as SpellElement);
        elems.push(...collectSpellElements(s.children));
    }
    return elems;
}

function slotIcons(s: Spell): string {
    const elems  = collectSpellElements(s.stages ?? []);
    if (!elems.length) return '⛓';
    const unique = [...new Set(elems)];
    return unique.map(e => ELEMENT_EMOJI[e]).join('');
}

function spellLabel(s: Spell, active: boolean): string {
    const ct  = s.castTime === 0 ? 'Instant' : `${fmt1(s.castTime / 1000)}s cast`;
    const cd  = s.cooldown === 0 ? 'No CD'   : `${fmt1(s.cooldown / 1000)}s CD`;
    const tag = active ? ' <em class="sc-editing-tag">editing</em>' : '';
    return `${slotIcons(s)} · ${ct} · ${cd} · ${s.manaCost} mp${tag}`;
}

// ── SpellCreator ──────────────────────────────────────────────────────────────

export class SpellCreator {
    private castTime = 0;
    private cooldown = 2000;
    private activeSlot = 0;

    private stageRoots: StageDraft[]    = defaultStageRoots();
    private selectedStagePath: number[] | null = [0];
    private dragSourcePath:    number[] | null = null;

    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;
    private viz!: SpellVisualization;

    // DOM refs
    private previewEl!:     HTMLElement;
    private slotListEl!:    HTMLElement;
    private slotTabsEl!:    HTMLElement;
    private copyRowEl!:     HTMLElement;
    private castSlider!:    HTMLInputElement;
    private castInput!:     HTMLInputElement;
    private cdSlider!:      HTMLInputElement;
    private cdInput!:       HTMLInputElement;
    private stageTreeEl!:   HTMLElement;
    private stageEditorEl!: HTMLElement;
    private vizHintEl!:     HTMLElement;

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        this.buildHTML();
        this.bindEvents();
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

    // ── Viz ───────────────────────────────────────────────────────────────────

    private toVizItem(s: StageDraft, role: StageVizItem['role'], childIndex?: number): StageVizItem {
        return { pitch: s.pitch, yaw: s.yaw, element: s.element,
                 stationary: s.stationary, count: s.count, yawSpread: s.yawSpread, role, childIndex };
    }

    private updateViz(): void {
        if (!this.isOpen) return;
        const items: StageVizItem[] = [];
        if (this.selectedStagePath && this.stageRoots.length) {
            const path = this.selectedStagePath;
            // all stages from root up to (but not including) the immediate parent
            for (let len = 1; len <= path.length - 2; len++)
                items.push(this.toVizItem(this.getNode(path.slice(0, len)), 'ancestor'));
            if (path.length > 1)
                items.push(this.toVizItem(this.getNode(path.slice(0, -1)), 'parent'));
            const sel = this.getNode(path);
            items.push(this.toVizItem(sel, 'selected'));
            sel.children.forEach((c, i) => items.push(this.toVizItem(c, 'child', i)));
        }
        this.viz.update(items);
    }

    private cloneNode(node: StageDraft, deep: boolean): StageDraft {
        return { ...node, children: deep ? node.children.map(c => this.cloneNode(c, true)) : [] };
    }

    private copyStage(deep: boolean): void {
        if (!this.selectedStagePath) return;
        const path = this.selectedStagePath;
        const copy = this.cloneNode(this.getNode(path), deep);
        const arr  = this.getParentArray(path);
        const idx  = path[path.length - 1] + 1;
        arr.splice(idx, 0, copy);
        this.selectedStagePath = [...path.slice(0, -1), idx];
        this.renderStageTree();
        this.renderStageEditor();
        this.chainUpdatePreview();
    }

    // ── Spell building ────────────────────────────────────────────────────────

    private makeSpell(): Spell {
        const stages = this.stageRoots.map(r => draftToStage(r, this.cooldown, this.castTime));
        return { castTime: this.castTime, cooldown: this.cooldown,
                 manaCost: Math.max(1, this.chainMana(this.stageRoots)), projectiles: [], stages };
    }

    private chainMana(nodes: StageDraft[]): number {
        return nodes.reduce((s, n) =>
            s + (n.element !== 'none' ? calcManaCost(n.power, this.castTime) : 5) + this.chainMana(n.children), 0);
    }

    private commitToActiveSlot(): void {
        this.slots[this.activeSlot] = this.makeSpell();
        if (this.slotTabsEl) this.renderSlotTabs();
    }

    // ── Slot management ───────────────────────────────────────────────────────

    private selectSlot(i: number): void {
        this.activeSlot = i;
        const spell = this.slots[i];
        if (spell?.stages?.length) {
            this.castTime   = spell.castTime;
            this.cooldown   = spell.cooldown;
            this.stageRoots = spell.stages.map(stageToDraft);
        } else {
            this.castTime   = 0;
            this.cooldown   = 2000;
            this.stageRoots = defaultStageRoots();
        }
        this.selectedStagePath = this.stageRoots.length ? [0] : null;
        this.castSlider.value  = String(this.castTime);  this.castInput.value = fmt1(this.castTime / 1000);
        this.cdSlider.value    = String(this.cooldown);   this.cdInput.value   = fmt1(this.cooldown / 1000);
        this.renderSlotTabs(); this.renderCopyRow();
        this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview();
    }

    private copyToSlot(i: number): void {
        this.slots[i] = this.makeSpell();
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

    // ── Stage tree ────────────────────────────────────────────────────────────

    private renderStageTree(): void {
        let html = '';
        for (let i = 0; i < this.stageRoots.length; i++)
            html += this.renderTreeRow(this.stageRoots[i], [i], 0);
        html += `<button class="sc-btn sc-stage-add-root" style="margin-top:6px;width:100%;font-size:12px">+ Add stage</button>`;
        this.stageTreeEl.innerHTML = html;
    }

    private renderTreeRow(s: StageDraft, path: number[], depth: number): string {
        const ps     = path.join(',');
        const isSel  = this.selectedStagePath?.join(',') === ps;
        const canDel = path.length > 1 || this.stageRoots.length > 1;
        const icon   = STAGE_ELEM_ICON[s.element];
        const label  = s.element === 'none' ? (s.stationary ? 'Area' : 'Carrier') : s.element[0].toUpperCase() + s.element.slice(1);

        const meta: string[] = [];
        if (s.element !== 'none') meta.push(`pwr:${s.power}`);
        if (s.count > 1) meta.push(`×${s.count}`);
        if (!s.stationary && s.element !== 'none')
            meta.push(s.pitch > 0 ? `↑${s.pitch}°` : s.pitch < 0 ? `↓${Math.abs(s.pitch)}°` : '→');
        if (s.element === 'none' && s.children.length > 0) {
            const t = s.trigger === 'delay' ? `d:${fmt1(s.triggerMs/1000)}s`
                    : s.trigger === 'interval' ? `/${s.triggerMs}ms` : 'on hit';
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

    // ── Stage editor ──────────────────────────────────────────────────────────

    private renderStageEditor(): void {
        if (!this.selectedStagePath || !this.stageRoots.length) {
            this.stageEditorEl.innerHTML = '<em style="color:#555;font-size:12px">Select a stage above</em>';
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

        this.stageEditorEl.innerHTML = `
<div class="sc-stage-crumb-row">
  <div class="sc-stage-crumb">${this.buildCrumb(this.selectedStagePath)}</div>
  <div style="display:flex;gap:5px;flex-shrink:0">
    <button class="sc-btn sc-stage-copy-single" style="font-size:11px;padding:3px 8px">⊕ Copy</button>
    <button class="sc-btn sc-stage-copy-tree"   style="font-size:11px;padding:3px 8px">⊕ Clone</button>
  </div>
</div>
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

    // ── Stage field update ────────────────────────────────────────────────────

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
            case 'power':     case 'powerN':     s.power     = num(1,100);    sync('power','powerN',String(s.power));             break;
            case 'pitch':     case 'pitchN':     s.pitch     = num(-90,90);   sync('pitch','pitchN',String(s.pitch));             break;
            case 'yaw':       case 'yawN':       s.yaw       = num(-180,180); sync('yaw','yawN',String(s.yaw));                   break;
            case 'yawSpread': case 'yawSpreadN': s.yawSpread = num(0,180);    sync('yawSpread','yawSpreadN',String(s.yawSpread)); break;
            case 'spread':    case 'spreadN':    s.spread    = num(0,5,false); sync('spread','spreadN',s.spread.toFixed(1));      break;
            case 'count':     s.count     = num(1, 6);     break;
            case 'triggerMs': s.triggerMs = num(100, 10000); break;
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

    // ── Preview ───────────────────────────────────────────────────────────────

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
                    ? ` → ${s.trigger}${s.trigger !== 'impact' ? ' '+s.triggerMs+'ms' : ''}` : '';
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
        this.updateViz();
    }

    private updateSlotList(): void {
        this.slotListEl.innerHTML = '<div class="sc-label">YOUR SPELLS</div>' +
            this.slots.map((s, i) =>
                `<div class="sc-slot-row"><span class="sc-slot-num">${i+1}</span>${s ? spellLabel(s, i===this.activeSlot) : '<em>Empty</em>'}</div>`
            ).join('');
    }

    // ── HTML skeleton ─────────────────────────────────────────────────────────

    private buildHTML(): void {
        const VIZ_W = 400, VIZ_H = 460;
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

    <div class="sc-section">
      <div class="sc-label">STAGES</div>
      <div id="sc-stage-tree"></div>
    </div>

    <div class="sc-section">
      <div class="sc-label">SELECTED STAGE</div>
      <div id="sc-stage-editor"></div>
    </div>

    <div class="sc-preview" id="sc-preview"></div>
    <div id="sc-slot-list" class="sc-slots"></div>
    <div class="sc-footer">Tab — close &nbsp;·&nbsp; 1–4 — cast in combat</div>
  </div>

  <div class="sc-viz-side">
    <canvas id="sc-viz-canvas" class="sc-viz-canvas" width="${VIZ_W}" height="${VIZ_H}"></canvas>
    <div class="sc-viz-hint">Drag to orbit · Click parent/child · Hold G: rotate direction</div>
  </div>
</div>`;

        this.previewEl    = this.overlay.querySelector<HTMLElement>('#sc-preview')!;
        this.slotListEl   = this.overlay.querySelector<HTMLElement>('#sc-slot-list')!;
        this.slotTabsEl   = this.overlay.querySelector<HTMLElement>('#sc-slot-tabs')!;
        this.copyRowEl    = this.overlay.querySelector<HTMLElement>('#sc-copy-row')!;
        this.stageTreeEl  = this.overlay.querySelector<HTMLElement>('#sc-stage-tree')!;
        this.stageEditorEl = this.overlay.querySelector<HTMLElement>('#sc-stage-editor')!;

        const get = (id: string) => this.overlay.querySelector<HTMLInputElement>(`#${id}`)!;
        this.castSlider  = get('sc-cast-slider'); this.castInput = get('sc-cast-input');
        this.cdSlider    = get('sc-cd-slider');   this.cdInput   = get('sc-cd-input');
        this.vizHintEl   = this.overlay.querySelector<HTMLElement>('.sc-viz-hint')!;

        const vizCanvas  = this.overlay.querySelector<HTMLCanvasElement>('#sc-viz-canvas')!;
        this.viz = new SpellVisualization(vizCanvas);

        this.viz.onDirectionEdited = (delta) => {
            if (!this.selectedStagePath) return;
            const s  = this.getNode(this.selectedStagePath);
            const ps = this.selectedStagePath.join(',');
            s.pitch = Math.max(-90,  Math.min(90,  s.pitch + delta.pitch));
            s.yaw   = Math.max(-180, Math.min(180, s.yaw   + delta.yaw));
            // sync editor inputs in-place so the DOM doesn't rebuild mid-drag
            const setField = (field: string, val: string) => {
                const el = this.stageEditorEl.querySelector<HTMLInputElement>(`[data-path="${ps}"][data-stage-field="${field}"]`);
                if (el) el.value = val;
            };
            setField('pitch',  String(s.pitch)); setField('pitchN', String(s.pitch));
            setField('yaw',    String(s.yaw));   setField('yawN',   String(s.yaw));
            this.renderStageTree();
            this.chainUpdatePreview(); // also calls updateViz()
        };

        this.viz.onStageSelected = (role, childIndex) => {
            if (!this.selectedStagePath) return;
            if (role === 'parent' && this.selectedStagePath.length > 1) {
                this.selectedStagePath = this.selectedStagePath.slice(0, -1);
            } else if (role === 'child' && childIndex !== undefined) {
                const sel = this.getNode(this.selectedStagePath);
                if (childIndex < sel.children.length)
                    this.selectedStagePath = [...this.selectedStagePath, childIndex];
            }
            this.renderStageTree(); this.renderStageEditor(); this.updateViz();
        };

        this.viz.onEditModeChanged = (mode) => {
            this.vizHintEl.textContent = mode === 'rotate'
                ? '↻ ROTATE — drag left/right: yaw · up/down: pitch'
                : 'Drag to orbit · Click parent/child · Hold G: rotate direction';
        };

        this.renderStageTree();
        this.renderStageEditor();
        this.chainUpdatePreview();
        this.updateSlotList();
    }

    // ── Event binding ─────────────────────────────────────────────────────────

    private bindEvents(): void {
        this.overlay.addEventListener('click', e => {
            const t = e.target as HTMLElement;

            const slotTab = t.dataset['slotTab'];
            if (slotTab !== undefined) { this.selectSlot(Number(slotTab)); return; }
            const slotCopy = t.dataset['slotCopy'];
            if (slotCopy !== undefined) { this.copyToSlot(Number(slotCopy)); return; }

            // Tree row select
            const selEl = t.classList.contains('sc-tree-select') ? t : t.closest<HTMLElement>('.sc-tree-select');
            if (selEl && !t.closest('button')) {
                this.selectedStagePath = selEl.dataset['path']!.split(',').map(Number);
                this.renderStageTree(); this.renderStageEditor(); this.updateViz(); return;
            }

            // Structural buttons
            if (t.classList.contains('sc-stage-del')) {
                const path       = t.dataset['path']!.split(',').map(Number);
                const deletedIdx = path[path.length - 1];
                const parentArr  = this.getParentArray(path);
                parentArr.splice(deletedIdx, 1);

                const sel      = this.selectedStagePath;
                const affected = sel && sel.length >= path.length && path.every((v, i) => sel[i] === v);
                if (affected) {
                    if (parentArr.length > 0)  this.selectedStagePath = [...path.slice(0,-1), Math.min(deletedIdx, parentArr.length-1)];
                    else if (path.length > 1)  this.selectedStagePath = path.slice(0, -1);
                    else                        this.selectedStagePath = null;
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
                const path  = t.dataset['path']!.split(',').map(Number);
                const node  = this.getNode(path);
                const newEl = t.dataset['val'] as StageElement;
                node.element = newEl;
                if (newEl !== 'none') node.children = [];
                this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview(); return;
            }
            if (t.classList.contains('sc-stage-copy-single')) { this.copyStage(false); return; }
            if (t.classList.contains('sc-stage-copy-tree'))   { this.copyStage(true);  return; }
        });

        // Cast time
        this.castSlider.addEventListener('input', () => {
            this.castTime = Number(this.castSlider.value);
            this.castInput.value = fmt1(this.castTime / 1000); this.chainUpdatePreview();
        });
        this.castInput.addEventListener('input', () => {
            this.castTime = Math.round(Math.min(3, Math.max(0, Number(this.castInput.value)||0)) * 1000);
            this.castSlider.value = String(this.castTime); this.chainUpdatePreview();
        });
        this.castInput.addEventListener('blur', () => { this.castInput.value = fmt1(this.castTime / 1000); });

        // Cooldown
        this.cdSlider.addEventListener('input', () => {
            this.cooldown = Number(this.cdSlider.value);
            this.cdInput.value = fmt1(this.cooldown / 1000); this.chainUpdatePreview();
        });
        this.cdInput.addEventListener('input', () => {
            this.cooldown = Math.round(Math.min(10, Math.max(0, Number(this.cdInput.value)||0)) * 1000);
            this.cdSlider.value = String(this.cooldown); this.chainUpdatePreview();
        });
        this.cdInput.addEventListener('blur', () => { this.cdInput.value = fmt1(this.cooldown / 1000); });

        // Stage editor input delegation
        this.overlay.addEventListener('input', e => {
            const t = e.target as HTMLInputElement | HTMLSelectElement;
            const ps = t.dataset['path'], field = t.dataset['stageField'];
            if (!ps || !field) return;
            this.handleStageField(ps.split(',').map(Number), field, t.value);
        });
        this.overlay.addEventListener('change', e => {
            const t = e.target as HTMLInputElement;
            const ps = t.dataset['path'];
            if (!ps || t.dataset['stageField'] !== 'stationary') return;
            this.getNode(ps.split(',').map(Number)).stationary = t.checked;
            this.renderStageTree(); this.renderStageEditor(); this.chainUpdatePreview();
        });

        // Drag-and-drop reordering
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
            clearDrop(); this.dragSourcePath = null;
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
            clearDrop(); this.dragSourcePath = null;
            if (!item || !src || !pos) return;
            this.moveNode(src, item.dataset['dragPath']!.split(',').map(Number), pos);
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    open():   void { this.isOpen = true;  this.overlay.style.display = 'flex'; this.viz.start(); this.updateViz(); }
    close():  void { this.isOpen = false; this.overlay.style.display = 'none'; this.viz.stop(); }
    toggle(): void { this.isOpen ? this.close() : this.open(); }
    get visible(): boolean { return this.isOpen; }
    getSlot(i: number): Spell | null { return this.slots[i] ?? null; }
}
