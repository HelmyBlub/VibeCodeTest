import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { buildEnvironment } from './environment';
import { Player } from './player';
import { createCamera } from './camera';
import { createInput } from './input';
import { EnemyManager } from './enemy';
import { CombatSystem } from './combat';
import { HUD } from './hud';
import { SpellCreator } from './spellcreator';
import { Hotbar } from './hotbar';
import { MANA_REGEN_RATE } from './constants';
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
const hotbar       = new Hotbar();

const castBarEl    = document.getElementById('cast-bar')!;
const castBarFill  = document.getElementById('cast-bar-fill')! as HTMLElement;
const castBarLabel = document.getElementById('cast-bar-label')!;

const spawnPoints: [number, number][] = [
    [-18, -18], [18, -18], [-18, 18], [18, 18], [0, -22], [22, 0], [-22, 0],
];
spawnPoints.forEach(([x, z]) => enemyManager.spawn(x, z));

interface CastState {
    spell:      Spell;
    slotIndex:  number;
    startTime:  number;
    duration:   number;
}
let casting: CastState | null = null;

const slotLastCast   = [0, 0, 0, 0]; // timestamp of last cast per slot
const slotCooldownMs = [0, 0, 0, 0]; // cooldown duration locked in at cast time
let creatorOpenedAt  = 0;            // for freezing cooldowns while creator is open

const INTERRUPT_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function cancelCast(): void {
    if (!casting) return;
    player.regenMana(casting.spell.manaCost);
    casting = null;
    castBarEl.style.display = 'none';
}

function fireSpell(spell: Spell, slotIndex: number): void {
    const forward = player.position.subtract(camera.position);
    forward.y = 0;
    if (forward.length() < 0.01) return;
    combat.castSpell(player.position, forward.normalize(), spell);
    slotLastCast[slotIndex]   = Date.now();
    slotCooldownMs[slotIndex] = spell.cooldown;
}

window.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
        e.preventDefault();
        cancelCast();
        if (!spellCreator.visible) {
            creatorOpenedAt = Date.now();
        } else {
            // shift lastCast forward by time spent in creator so CDs don't tick
            const paused = Date.now() - creatorOpenedAt;
            for (let i = 0; i < 4; i++) {
                if (slotLastCast[i] > 0) slotLastCast[i] += paused;
            }
        }
        spellCreator.toggle();
        return;
    }

    if (spellCreator.visible || !player.alive) return;

    const isJump = e.key === ' ';
    if (casting && (INTERRUPT_KEYS.includes(e.key.toLowerCase()) || (isJump && player.onGround))) {
        cancelCast();
        return;
    }

    const slotIndex = ['1', '2', '3', '4'].indexOf(e.key);
    if (slotIndex === -1 || casting) return;

    const spell = spellCreator.getSlot(slotIndex);
    if (!spell) return;

    // cooldown check uses the duration locked in at cast time (not the new spell's CD)
    if (Date.now() - slotLastCast[slotIndex] < slotCooldownMs[slotIndex]) return;

    if (!player.spendMana(spell.manaCost)) return;

    const duration = spell.castTime;
    if (duration === 0) {
        fireSpell(spell, slotIndex);
    } else {
        casting = { spell, slotIndex, startTime: Date.now(), duration };
        const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
        castBarLabel.textContent = `Casting ${cap(spell.projectiles[0].element)}… (move to cancel)`;
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

    // always update hotbar; pass creatorOpenedAt when paused so the timer freezes visually
    hotbar.update(spellCreator.slots, slotLastCast, slotCooldownMs, player.mana,
        spellCreator.visible ? creatorOpenedAt : undefined);

    if (spellCreator.visible) return;

    const jumpInterrupt = input.keys[' '] && player.onGround;
    if (casting && (INTERRUPT_KEYS.some(k => input.keys[k]) || jumpInterrupt)) {
        cancelCast();
    }

    if (casting) {
        const progress = Math.min(1, (Date.now() - casting.startTime) / casting.duration);
        castBarFill.style.width = `${progress * 100}%`;
        if (progress >= 1) {
            fireSpell(casting.spell, casting.slotIndex);
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
