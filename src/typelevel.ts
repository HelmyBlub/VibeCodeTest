import type { StageElement } from './types';

const MAX_LEVEL = 99;

const ALL_ELEMENTS: StageElement[] = ['fire', 'ice', 'lightning', 'heal', 'carrier', 'cloud'];

const ELEM_ICON: Record<StageElement, string> = {
    fire: '🔥', ice: '❄', lightning: '⚡', heal: '💚', carrier: '→', cloud: '☁',
};
const ELEM_COLOR: Record<StageElement, string> = {
    fire: '#ff6633', ice: '#44bbff', lightning: '#ffdd22',
    heal: '#44ff88', carrier: '#9999dd', cloud: '#66cccc',
};

// Cumulative XP to reach level N: 200 * N * (N+1) / 2 = 100 * N * (N+1)
// XP required to go from level N-1 → N: 200 * N
function cumulativeXpForLevel(n: number): number {
    return 100 * n * (n + 1);
}

function levelFromXp(xp: number): number {
    // Solve 100*N*(N+1) <= xp:  N^2 + N - xp/100 = 0  →  N = floor((-1 + sqrt(1 + 4*xp/100)) / 2)
    return Math.min(MAX_LEVEL, Math.floor((-1 + Math.sqrt(1 + 4 * xp / 100)) / 2));
}

export class TypeLevelSystem {
    private readonly xp:     Record<StageElement, number>;
    private readonly levels: Record<StageElement, number>;
    private visibleTypes: Set<StageElement> = new Set();
    private readonly panelEl: HTMLElement;
    private readonly notifEl: HTMLElement;
    private notifTimer = 0;

    constructor() {
        this.xp     = Object.fromEntries(ALL_ELEMENTS.map(e => [e, 0])) as Record<StageElement, number>;
        this.levels = Object.fromEntries(ALL_ELEMENTS.map(e => [e, 0])) as Record<StageElement, number>;

        this.panelEl = document.createElement('div');
        Object.assign(this.panelEl.style, {
            position:      'fixed',
            top:           '16px',
            right:         '16px',
            display:       'flex',
            flexDirection: 'column',
            gap:           '5px',
            fontFamily:    'sans-serif',
            zIndex:        '50',
            pointerEvents: 'none',
        });
        document.body.appendChild(this.panelEl);

        this.notifEl = document.createElement('div');
        Object.assign(this.notifEl.style, {
            position:      'fixed',
            top:           '42%',
            left:          '50%',
            transform:     'translate(-50%, -50%)',
            background:    'rgba(0,0,0,0.80)',
            color:         '#fff',
            fontSize:      '20px',
            fontWeight:    '700',
            padding:       '14px 28px',
            borderRadius:  '12px',
            border:        '2px solid #cc88ff',
            display:       'none',
            zIndex:        '200',
            fontFamily:    'sans-serif',
            textAlign:     'center',
            pointerEvents: 'none',
        });
        document.body.appendChild(this.notifEl);
    }

    setVisibleTypes(types: Iterable<StageElement>): void {
        this.visibleTypes = new Set(types);
        this.render();
    }

    /**
     * Award XP to every unique element in the chain.
     * xpAmount: enemy.maxHp for kills, actual HP healed for heal ticks.
     * Returns true if any level-up occurred.
     */
    addXp(chain: StageElement[], xpAmount: number): boolean {
        if (!chain.length || xpAmount <= 0) return false;
        const unique = [...new Set(chain)];
        let anyLevelUp = false;
        for (const el of unique) {
            const prev = this.levels[el];
            this.xp[el] += xpAmount;
            this.levels[el] = levelFromXp(this.xp[el]);
            if (this.levels[el] > prev) {
                this.showLevelUp(el, this.levels[el]);
                anyLevelUp = true;
            }
        }
        this.render();
        return anyLevelUp;
    }

    /** Global damage multiplier: additive +5% per total level across all types. */
    getGlobalDamageMultiplier(): number {
        const total = ALL_ELEMENTS.reduce((s, el) => s + this.levels[el], 0);
        return 1.0 + total * 0.05;
    }

    /** Global mana cost factor: 0.97 ^ totalLevels — approaches 0, never reaches it. */
    getGlobalManaCostFactor(): number {
        const total = ALL_ELEMENTS.reduce((s, el) => s + this.levels[el], 0);
        return Math.pow(0.97, total);
    }

    private render(): void {
        const visible  = ALL_ELEMENTS.filter(el => this.visibleTypes.has(el));
        const dmgMult  = this.getGlobalDamageMultiplier();
        const manaMult = this.getGlobalManaCostFactor();
        const dmgPct   = Math.round((dmgMult - 1) * 100);
        const manaPct  = Math.round((1 - manaMult) * 100);

        const rows = visible.map(el => {
            const lv  = this.levels[el];
            const xp  = this.xp[el];
            let progress = 100;
            if (lv < MAX_LEVEL) {
                const lvXp   = cumulativeXpForLevel(lv);
                const nxtXp  = cumulativeXpForLevel(lv + 1);
                progress = ((xp - lvXp) / (nxtXp - lvXp)) * 100;
            }
            return `
                <div style="display:flex;align-items:center;gap:6px;
                    background:rgba(0,0,0,0.55);border-radius:8px;padding:4px 9px">
                    <span style="font-size:15px;
                        font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"
                    >${ELEM_ICON[el]}</span>
                    <span style="color:#ccc;font-size:12px;min-width:30px">Lv${lv}</span>
                    <div style="width:60px;height:7px;background:#333;border-radius:4px;overflow:hidden">
                        <div style="width:${progress}%;height:100%;
                            background:${ELEM_COLOR[el]};border-radius:4px;transition:width 0.2s"></div>
                    </div>
                </div>
            `;
        }).join('');

        const statsRow = visible.length > 0 ? `
            <div style="background:rgba(0,0,0,0.55);border-radius:8px;padding:4px 9px;
                font-size:11px;color:#bbb;display:flex;flex-direction:column;gap:2px">
                <span>⚔ DMG <span style="color:#ffdd88">+${dmgPct}%</span></span>
                <span>💧 MANA <span style="color:#88ddff">-${manaPct}%</span></span>
            </div>
        ` : '';

        this.panelEl.innerHTML = rows + statsRow;
    }

    private showLevelUp(el: StageElement, newLevel: number): void {
        const name = el.charAt(0).toUpperCase() + el.slice(1);
        this.notifEl.innerHTML =
            `${ELEM_ICON[el]} ${name} Level Up! → Lv${newLevel}<br>` +
            `<span style="font-size:13px;color:#aaa">All spells deal more damage!</span>`;
        this.notifEl.style.display = 'block';
        clearTimeout(this.notifTimer);
        this.notifTimer = window.setTimeout(() => { this.notifEl.style.display = 'none'; }, 2500);
    }
}
