import { SPELL_DAMAGE } from './constants';
import type { Spell, SpellElement, SpellPower, SpellCastTime } from './types';

const MANA_BASE = 20;
const POWER_MULT: Record<SpellPower, number>    = { low: 0.7, medium: 1.0, high: 1.6 };
const CAST_MULT: Record<SpellCastTime, number>  = { instant: 1.5, short: 1.1, long: 0.7 };

export function calcManaCost(power: SpellPower, castTime: SpellCastTime): number {
    return Math.round(MANA_BASE * POWER_MULT[power] * CAST_MULT[castTime]);
}

const ELEMENT_DESC: Record<SpellElement, string> = {
    fire:      'Burns enemies over time',
    ice:       'Slows enemy movement',
    lightning: 'Instant burst + knockback',
};
const CAST_DESC: Record<SpellCastTime, string> = {
    instant: 'Fires instantly',
    short:   '0.6 s channel',
    long:    '1.5 s channel',
};

function spellLabel(s: Spell): string {
    const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
    return `${cap(s.element)} · ${cap(s.power)} · ${cap(s.castTime)} · ${s.manaCost} mana`;
}

export class SpellCreator {
    private element:  SpellElement  = 'fire';
    private power:    SpellPower    = 'medium';
    private castTime: SpellCastTime = 'instant';
    readonly slots: (Spell | null)[] = [null, null, null, null];
    private readonly overlay: HTMLElement;
    private isOpen = false;

    constructor() {
        this.overlay = document.getElementById('spell-creator')!;
        // default spell in slot 1 so combat works immediately
        this.slots[0] = { element: 'fire', power: 'medium', castTime: 'instant', manaCost: calcManaCost('medium', 'instant') };
        this.render();
    }

    private render(): void {
        const cost = calcManaCost(this.power, this.castTime);
        const cap  = (x: string) => x[0].toUpperCase() + x.slice(1);

        const eBtn = (el: SpellElement, label: string) =>
            `<button class="sc-btn${this.element === el ? ' active' : ''}" data-element="${el}">${label}</button>`;
        const pBtn = (pw: SpellPower, label: string) =>
            `<button class="sc-btn${this.power === pw ? ' active' : ''}" data-power="${pw}">${label}</button>`;
        const cBtn = (ct: SpellCastTime, label: string) =>
            `<button class="sc-btn${this.castTime === ct ? ' active' : ''}" data-cast="${ct}">${label}</button>`;

        const slotRows = this.slots
            .map((s, i) => `<div class="sc-slot-row"><span class="sc-slot-num">${i + 1}</span>${s ? spellLabel(s) : '<em>Empty</em>'}</div>`)
            .join('');

        this.overlay.innerHTML = `<div class="sc-panel">
  <h2 class="sc-title">SPELL CREATOR</h2>

  <div class="sc-section">
    <div class="sc-label">ELEMENT</div>
    <div class="sc-row">
      ${eBtn('fire', '🔥 Fire')}
      ${eBtn('ice', '❄ Ice')}
      ${eBtn('lightning', '⚡ Lightning')}
    </div>
  </div>

  <div class="sc-section">
    <div class="sc-label">POWER</div>
    <div class="sc-row">
      ${pBtn('low', 'Low')}
      ${pBtn('medium', 'Medium')}
      ${pBtn('high', 'High')}
    </div>
  </div>

  <div class="sc-section">
    <div class="sc-label">CAST TIME</div>
    <div class="sc-row">
      ${cBtn('instant', 'Instant')}
      ${cBtn('short', 'Short')}
      ${cBtn('long', 'Long')}
    </div>
  </div>

  <div class="sc-preview">
    <div class="sc-cost">Mana Cost: <strong>${cost}</strong> &nbsp;·&nbsp; Damage: <strong>${SPELL_DAMAGE[this.power]}</strong></div>
    <div class="sc-desc">${cap(this.power)} power · ${CAST_DESC[this.castTime]} · ${ELEMENT_DESC[this.element]}</div>
  </div>

  <div class="sc-section">
    <div class="sc-label">SAVE TO SLOT</div>
    <div class="sc-row">
      <button class="sc-btn sc-slot-save" data-slot="0">1</button>
      <button class="sc-btn sc-slot-save" data-slot="1">2</button>
      <button class="sc-btn sc-slot-save" data-slot="2">3</button>
      <button class="sc-btn sc-slot-save" data-slot="3">4</button>
    </div>
  </div>

  <div class="sc-slots">
    <div class="sc-label">YOUR SPELLS</div>
    ${slotRows}
  </div>

  <div class="sc-footer">Tab — close &nbsp;·&nbsp; 1–4 — cast in combat</div>
</div>`;

        this.overlay.onclick = (e) => {
            const t = e.target as HTMLElement;
            if (t.dataset['element']) {
                this.element = t.dataset['element'] as SpellElement;
                this.render();
            } else if (t.dataset['power']) {
                this.power = t.dataset['power'] as SpellPower;
                this.render();
            } else if (t.dataset['cast']) {
                this.castTime = t.dataset['cast'] as SpellCastTime;
                this.render();
            } else if (t.classList.contains('sc-slot-save') && t.dataset['slot'] !== undefined) {
                this.slots[Number(t.dataset['slot'])] = {
                    element: this.element, power: this.power,
                    castTime: this.castTime, manaCost: calcManaCost(this.power, this.castTime),
                };
                this.render();
            }
        };
    }

    open():   void { this.isOpen = true;  this.overlay.style.display = 'flex'; }
    close():  void { this.isOpen = false; this.overlay.style.display = 'none'; }
    toggle(): void { this.isOpen ? this.close() : this.open(); }
    get visible(): boolean { return this.isOpen; }
    getSlot(i: number): Spell | null { return this.slots[i] ?? null; }
}
