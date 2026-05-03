import type { StageElement } from './types';

const ELEM_ICON: Partial<Record<StageElement, string>> = {
    fire: '🔥', ice: '❄', lightning: '⚡', heal: '💚', carrier: '→', cloud: '☁',
};
const ELEM_NAME: Partial<Record<StageElement, string>> = {
    fire: 'Fire', ice: 'Ice', lightning: 'Lightning', heal: 'Heal', carrier: 'Carrier', cloud: 'Cloud',
};
const ELEM_DESC: Partial<Record<StageElement, string>> = {
    fire:      'Burns enemies over time.',
    ice:       'Slows enemy movement.',
    lightning: 'Chains to nearby enemies.',
    heal:      'Floats forward, pulses healing to all nearby (friend & foe).',
    carrier:   'Launches child stages after a delay.',
    cloud:     'Stationary zone that fires child stages on a pulse.',
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

    show(choices: StageElement[], onPick: (choice: StageElement) => void): void {
        const cards = choices.map(c => `
            <button data-val="${c}" style="
                background:#16102a;color:#eee;
                border:2px solid #7733cc;border-radius:14px;
                padding:24px 28px;font-size:16px;
                cursor:pointer;min-width:150px;max-width:180px;
                transition:border-color 0.15s;
            ">
                <div style="font-size:44px;margin-bottom:10px;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${ELEM_ICON[c] ?? c}</div>
                <div style="font-weight:700;font-size:18px;margin-bottom:8px">${ELEM_NAME[c] ?? c}</div>
                <div style="font-size:12px;color:#aaa;line-height:1.4">${ELEM_DESC[c] ?? ''}</div>
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
                onPick(btn.dataset['val'] as StageElement);
            });
        });
    }

    hide(): void {
        this.el.style.display = 'none';
    }
}
