import type { Spell, SpellElement, SpellStage } from './types';

function collectElements(stages: SpellStage[]): SpellElement[] {
    const out: SpellElement[] = [];
    for (const s of stages) {
        if (s.element !== 'carrier' && s.element !== 'cloud') out.push(s.element as SpellElement);
        out.push(...collectElements(s.children));
    }
    return out;
}

const ELEMENT_EMOJI: Record<SpellElement, string> = {
    fire:      '🔥',
    ice:       '❄',
    lightning: '⚡',
    heal:      '💚',
};

export class Hotbar {
    private readonly slotEls:    HTMLElement[];
    private readonly iconEls:    HTMLElement[];
    private readonly nameEls:    HTMLElement[];
    private readonly cdEls:      HTMLElement[];
    private readonly manaEls:    HTMLElement[];
    private readonly timerEls:   HTMLElement[];
    private readonly prevSpells: (Spell | null)[];

    constructor() {
        this.slotEls   = [0,1,2,3].map(i => document.getElementById(`hb-slot-${i}`)!);
        this.iconEls   = [0,1,2,3].map(i => document.getElementById(`hb-icon-${i}`)!);
        this.nameEls   = [0,1,2,3].map(i => document.getElementById(`hb-name-${i}`)!);
        this.cdEls     = [0,1,2,3].map(i => document.getElementById(`hb-cd-${i}`)!);
        this.manaEls   = [0,1,2,3].map(i => document.getElementById(`hb-mana-${i}`)!);
        this.timerEls  = [0,1,2,3].map(i => document.getElementById(`hb-timer-${i}`)!);
        this.prevSpells = [null, null, null, null];
    }

    update(spells: (Spell | null)[], lastCast: number[], cooldownMs: number[], playerMana: number, manaCostFactor = 1.0, frozenAt?: number): void {
        const now = frozenAt ?? Date.now();

        for (let i = 0; i < 4; i++) {
            const spell  = spells[i];
            const slot   = this.slotEls[i];
            const cdEl   = this.cdEls[i];
            const timer  = this.timerEls[i];

            // static content — only update when spell changes
            if (spell !== this.prevSpells[i]) {
                this.prevSpells[i] = spell;
                if (spell) {
                    const elems  = collectElements(spell.stages ?? []);
                    const unique = [...new Set(elems)] as SpellElement[];
                    const single = unique.length === 1;
                    this.iconEls[i].textContent = elems.length ? unique.map(e => ELEMENT_EMOJI[e]).join('') : '⛓';
                    this.nameEls[i].textContent = single ? unique[0][0].toUpperCase() + unique[0].slice(1)
                        : elems.length ? 'Mixed' : 'Chain';
                    if (single) slot.dataset['element'] = unique[0];
                    else delete slot.dataset['element'];
                } else {
                    this.iconEls[i].textContent = '';
                    this.nameEls[i].textContent = '';
                    delete slot.dataset['element'];
                }
            }

            if (!spell) {
                slot.className = 'hb-slot hb-empty';
                cdEl.style.height = '0%';
                timer.textContent = '';
                continue;
            }

            // cooldown — use the duration locked in at cast time, not the current spell's CD
            const cdDuration  = cooldownMs[i];
            const remaining   = Math.max(0, cdDuration - (now - lastCast[i]));
            const cdFraction  = cdDuration > 0 ? remaining / cdDuration : 0;
            const onCooldown  = remaining > 0;
            const effectiveCost = Math.ceil(spell.manaCost * manaCostFactor);
            this.manaEls[i].textContent = String(effectiveCost);
            const noMana = playerMana < effectiveCost;

            // show mana warning only when not on cooldown (cooldown already blocks casting)
            const showManaWarn = noMana && !onCooldown;

            let cls = 'hb-slot';
            if (onCooldown)   cls += ' hb-on-cd';
            if (showManaWarn) cls += ' hb-no-mana';
            slot.className = cls;

            cdEl.style.height = `${cdFraction * 100}%`;
            timer.textContent = onCooldown && remaining > 400 ? `${(remaining / 1000).toFixed(1)}` : '';
        }
    }
}
