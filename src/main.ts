import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { buildEnvironment } from './environment';
import { Player } from './player';
import { createCamera } from './camera';
import { createInput } from './input';
import { EnemyManager } from './enemy';
import { CombatSystem } from './combat';
import { HUD } from './hud';
import { SpellCreator } from './spellcreator';
import { MANA_REGEN_RATE, CAST_DURATION } from './constants';
import type { Spell } from './types';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene  = new Scene(engine);

buildEnvironment(scene);

const hud          = new HUD();
const player       = new Player(scene, hud);
const camera       = createCamera(scene, canvas);
const input        = createInput();
const enemyManager = new EnemyManager(scene);
const combat       = new CombatSystem(scene);
const spellCreator = new SpellCreator();

const castBarEl    = document.getElementById('cast-bar')!;
const castBarFill  = document.getElementById('cast-bar-fill')! as HTMLElement;
const castBarLabel = document.getElementById('cast-bar-label')!;

const spawnPoints: [number, number][] = [
    [-18, -18], [18, -18], [-18, 18], [18, 18], [0, -22], [22, 0], [-22, 0],
];
spawnPoints.forEach(([x, z]) => enemyManager.spawn(x, z));

interface CastState {
    spell:     Spell;
    startTime: number;
    duration:  number;
}
let casting: CastState | null = null;

const INTERRUPT_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function cancelCast(): void {
    if (!casting) return;
    player.regenMana(casting.spell.manaCost); // refund
    casting = null;
    castBarEl.style.display = 'none';
}

window.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
        e.preventDefault();
        cancelCast();
        spellCreator.toggle();
        return;
    }

    if (spellCreator.visible || !player.alive) return;

    // movement/jump keys cancel an active cast (jump only interrupts if it would succeed)
    const isJump = e.key === ' ';
    if (casting && (INTERRUPT_KEYS.includes(e.key.toLowerCase()) || (isJump && player.onGround))) {
        cancelCast();
        return;
    }

    const slotIndex = ['1', '2', '3', '4'].indexOf(e.key);
    if (slotIndex === -1 || casting) return;

    const spell = spellCreator.getSlot(slotIndex);
    if (!spell) return;
    if (!player.spendMana(spell.manaCost)) return;

    const dir = player.position.subtract(camera.position);
    dir.y = 0;
    if (dir.length() < 0.01) return;
    dir.normalize();

    const duration = CAST_DURATION[spell.castTime];

    if (duration === 0) {
        combat.castSpell(player.position.add(new Vector3(0, 1.2, 0)), dir, spell);
    } else {
        casting = { spell, startTime: Date.now(), duration };
        const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
        castBarLabel.textContent = `Casting ${cap(spell.element)}… (move to cancel)`;
        castBarFill.style.width = '0%';
        castBarEl.style.display = 'block';
    }
});

scene.onBeforeRenderObservable.add(() => {
    const camToChar = player.position.subtract(camera.position);
    camToChar.y = 0;
    if (camToChar.length() < 0.01) return;

    const forward = camToChar.normalize();
    const right   = Vector3.Cross(Vector3.Up(), forward).normalize();

    if (spellCreator.visible) return;

    // cancel cast if an interrupt key is held (space only counts when on the ground)
    const jumpInterrupt = input.keys[' '] && player.onGround;
    if (casting && (INTERRUPT_KEYS.some(k => input.keys[k]) || jumpInterrupt)) {
        cancelCast();
    }

    // tick active cast
    if (casting) {
        const progress = Math.min(1, (Date.now() - casting.startTime) / casting.duration);
        castBarFill.style.width = `${progress * 100}%`;
        if (progress >= 1) {
            const dir = player.position.subtract(camera.position);
            dir.y = 0;
            if (dir.length() > 0.01) {
                combat.castSpell(
                    player.position.add(new Vector3(0, 1.2, 0)),
                    dir.normalize(),
                    casting.spell,
                );
            }
            casting = null;
            castBarEl.style.display = 'none';
        }
    }

    player.update(input.keys, forward, right);
    player.regenMana(MANA_REGEN_RATE / 60);
    combat.update(enemyManager.enemies, en => enemyManager.kill(en));

    if (player.alive) {
        enemyManager.update(player.position, dmg => player.takeDamage(dmg));
    }

    camera.target.copyFrom(player.position);
    camera.target.y += 1;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
