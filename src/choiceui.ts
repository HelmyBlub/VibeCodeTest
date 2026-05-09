const ITEM_ICON: Record<string, string> = {
    fire: '🔥', ice: '❄', lightning: '⚡', heal: '💚', carrier: '→', cloud: '☁',
    castTime: '✦', cooldown: '⟳',
};
const ITEM_NAME: Record<string, string> = {
    fire: 'Fire', ice: 'Ice', lightning: 'Lightning', heal: 'Heal', carrier: 'Carrier', cloud: 'Cloud',
    castTime: 'Cast Time', cooldown: 'Cooldown',
};
const ITEM_DESC: Record<string, string> = {
    fire:      'Burns enemies over time.',
    ice:       'Slows enemy movement.',
    lightning: 'Chains to nearby enemies.',
    heal:      'Floats forward, pulses healing to all nearby (friend & foe).',
    carrier:   'Launches child stages after a delay.',
    cloud:     'Stationary zone that fires child stages on a pulse.',
    castTime:  'Add a channel time to spells — reduces mana cost in exchange for interruption risk.',
    cooldown:  'Add a cooldown to spells — increases damage in exchange for waiting time.',
};

export class ChoiceUI {
    private readonly el: HTMLElement;

    constructor() {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
            position:       'fixed',
            inset:          '0',
            display:        'none',
            background:     'rgba(0,0,0,0.72)',
            zIndex:         '300',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            '28px',
            fontFamily:     'sans-serif',
        });
        document.body.appendChild(this.el);
    }

    show(choices: string[], onPick: (choice: string) => void): void {
        const cards = choices.map(c => `
            <button data-val="${c}" style="
                background:#16102a;color:#eee;
                border:2px solid #7733cc;border-radius:14px;
                padding:24px 28px;font-size:16px;
                cursor:pointer;min-width:150px;max-width:180px;
                transition:border-color 0.15s;
            ">
                <div style="font-size:44px;margin-bottom:10px;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${ITEM_ICON[c] ?? c}</div>
                <div style="font-weight:700;font-size:18px;margin-bottom:8px">${ITEM_NAME[c] ?? c}</div>
                <div style="font-size:12px;color:#aaa;line-height:1.4">${ITEM_DESC[c] ?? ''}</div>
            </button>
        `).join('');

        this.el.innerHTML = `
            <div style="color:#fff;font-size:22px;font-weight:600;text-shadow:0 0 12px #9955ff">
                Boss defeated! Choose a new spell type:
            </div>
            <div style="display:flex;gap:20px">${cards}</div>
        `;

        this.el.style.display = 'flex';

        this.el.querySelectorAll<HTMLElement>('[data-val]').forEach(btn => {
            btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#cc88ff'; });
            btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#7733cc'; });
            btn.addEventListener('click', () => {
                this.hide();
                onPick(btn.dataset['val']!);
            });
        });
    }

    hide(): void {
        this.el.style.display = 'none';
    }
}
