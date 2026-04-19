import { COOLDOWN_DURATION } from './constants';
import type { Spell, SpellElement } from './types';

const ELEMENT_EMOJI: Record<SpellElement, string> = {
    fire:      '🔥',
    ice:       '❄',
    lightning: '⚡',
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

    update(spells: (Spell | null)[], lastCast: number[], playerMana: number): void {
        const now = Date.now();

        for (let i = 0; i < 4; i++) {
            const spell  = spells[i];
            const slot   = this.slotEls[i];
            const cdEl   = this.cdEls[i];
            const timer  = this.timerEls[i];

            // static content — only update when spell changes
            if (spell !== this.prevSpells[i]) {
                this.prevSpells[i] = spell;
                if (spell) {
                    this.iconEls[i].textContent = ELEMENT_EMOJI[spell.element];
                    this.nameEls[i].textContent = spell.element[0].toUpperCase() + spell.element.slice(1);
                    slot.dataset['element'] = spell.element;
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

            // cooldown
            const cdDuration  = COOLDOWN_DURATION[spell.cooldown];
            const remaining   = Math.max(0, cdDuration - (now - lastCast[i]));
            const cdFraction  = cdDuration > 0 ? remaining / cdDuration : 0;
            const onCooldown  = remaining > 0;
            const noMana      = playerMana < spell.manaCost;

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
