import { PLAYER_MAX_HP } from './constants';

export class HUD {
    private readonly hpFill: HTMLElement;
    private readonly hpText: HTMLElement;
    private readonly gameOverEl: HTMLElement;

    constructor() {
        this.hpFill = document.getElementById('hp-fill')!;
        this.hpText = document.getElementById('hp-text')!;
        this.gameOverEl = document.getElementById('game-over')!;
    }

    updateHP(hp: number): void {
        this.hpFill.style.width = `${(hp / PLAYER_MAX_HP) * 100}%`;
        this.hpText.textContent = String(hp);
    }

    showGameOver(): void {
        this.gameOverEl.style.display = 'flex';
    }
}
