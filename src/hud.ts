import { PLAYER_MAX_HP, PLAYER_MAX_MANA } from './constants';

export class HUD {
    private readonly hpFill:   HTMLElement;
    private readonly hpText:   HTMLElement;
    private readonly manaFill: HTMLElement;
    private readonly manaText: HTMLElement;
    private readonly gameOverEl: HTMLElement;

    constructor() {
        this.hpFill   = document.getElementById('hp-fill')!;
        this.hpText   = document.getElementById('hp-text')!;
        this.manaFill = document.getElementById('mana-fill')!;
        this.manaText = document.getElementById('mana-text')!;
        this.gameOverEl = document.getElementById('game-over')!;
    }

    updateHP(hp: number): void {
        this.hpFill.style.width = `${(hp / PLAYER_MAX_HP) * 100}%`;
        this.hpText.textContent = String(hp);
    }

    updateMana(mana: number): void {
        this.manaFill.style.width = `${(mana / PLAYER_MAX_MANA) * 100}%`;
        this.manaText.textContent = String(Math.floor(mana));
    }

    showGameOver(): void {
        this.gameOverEl.style.display = 'flex';
    }
}
