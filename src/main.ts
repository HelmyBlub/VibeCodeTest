import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { buildEnvironment } from './environment';
import { Player } from './player';
import { createCamera } from './camera';
import { createInput } from './input';
import { EnemyManager } from './enemy';
import { CombatSystem } from './combat';
import { HUD } from './hud';
import { SpellCreator, calcDamage, calcBurnDamage, calcManaCost } from './spellcreator';
import { Hotbar } from './hotbar';
import { SpellbookPickup } from './spellbook';
import { ChoiceUI } from './choiceui';
import { TypeLevelSystem } from './typelevel';
import { DamageNumbers } from './damagenumbers';
import {
    BOSS_MAX_HP, BOSS_MELEE_DAMAGE,
    BOUNDARY, ENEMY_MAX_NORMAL, ENEMY_SPAWN_INTERVAL, MANA_REGEN_RATE,
} from './constants';
import type { Spell, SpellElement, SpellStage, StageElement } from './types';

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
const spellCreator  = new SpellCreator();
const hotbar        = new Hotbar();
const choiceUI      = new ChoiceUI();
const typeLevels    = new TypeLevelSystem();
const damageNumbers = new DamageNumbers(scene, canvas);

// ── Unlocks ───────────────────────────────────────────────────────────────────

const ALL_TYPES: StageElement[] = ['fire', 'ice', 'lightning', 'heal', 'carrier', 'cloud'];
const startElement = (['fire', 'ice', 'lightning'] as SpellElement[])[Math.floor(Math.random() * 3)];
const unlocked = new Set<StageElement>([startElement]);

spellCreator.setUnlockedTypes(unlocked);
spellCreator.setDefaultElement(startElement);
typeLevels.setVisibleTypes(unlocked);

function onLevelUp(): void {
    const dmgMult  = typeLevels.getGlobalDamageMultiplier();
    const manaMult = typeLevels.getGlobalManaCostFactor();
    combat.setDamageMultiplier(dmgMult);
    spellCreator.setDisplayMultipliers(dmgMult, manaMult);
}

enemyManager.onKill = (en) => {
    const leveled = typeLevels.addXp(en.lastHitChain ?? [], en.maxHp);
    if (leveled) onLevelUp();
};

combat.onHealXp = (chain, amount) => {
    const leveled = typeLevels.addXp(chain, amount);
    if (leveled) onLevelUp();
};

combat.onDamageDealt = (pos, amount, element) => {
    damageNumbers.spawn(pos, amount, element);
};

// ── Starter spell ─────────────────────────────────────────────────────────────

function makeStarterStage(element: SpellElement): SpellStage {
    const cooldown = 2000;
    return {
        element, power: 50, pitch: 0, yaw: 0,
        count: 1, spread: 0, yawSpread: 0,
        stationary: false, trigger: 'delay', triggerMs: 500, duration: 3000,
        damage:      calcDamage(50, cooldown),
        burnDamage:  element === 'fire'      ? calcBurnDamage(50, cooldown) : 0,
        burnDuration: element === 'fire'     ? 3000 : undefined,
        slowPercent:  element === 'ice'      ? 50   : undefined,
        jumpCount:    element === 'lightning' ? 2    : undefined,
        offsetX: 0, offsetY: 1.5, offsetZ: 0.5,
        children: [],
    };
}

const starterSpell: Spell = {
    castTime: 0, cooldown: 2000,
    manaCost: calcManaCost(50, 0),
    projectiles: [],
    stages: [makeStarterStage(startElement)],
};
spellCreator.slots[0] = starterSpell;

// ── Cast state ────────────────────────────────────────────────────────────────

const castBarEl    = document.getElementById('cast-bar')!;
const castBarFill  = document.getElementById('cast-bar-fill')! as HTMLElement;
const castBarLabel = document.getElementById('cast-bar-label')!;

interface CastState {
    spell:     Spell;
    slotIndex: number;
    startTime: number;
    duration:  number;
    manaPaid:  number;
}
let casting: CastState | null = null;

const slotLastCast   = [0, 0, 0, 0];
const slotCooldownMs = [0, 0, 0, 0];
let creatorOpenedAt  = 0;

const INTERRUPT_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function cancelCast(): void {
    if (!casting) return;
    player.regenMana(casting.manaPaid);
    casting = null;
    castBarEl.style.display = 'none';
}

function fireSpell(spell: Spell, slotIndex: number): void {
    const forward = player.position.subtract(camera.position);
    forward.y = 0;
    if (forward.length() < 0.01) return;
    combat.castStagedSpell(player.position, forward.normalize(), spell);
    slotLastCast[slotIndex]   = Date.now();
    slotCooldownMs[slotIndex] = spell.cooldown;
}

// ── Game loop state ───────────────────────────────────────────────────────────

let spellbook:        SpellbookPickup | null = null;
let choiceOpen        = false;
let lastSpawnTime     = 0;
let bossSpawnPending  = true;   // spawn first boss shortly after game start
let bossSpawnAt       = Date.now() + 5000; // 5s initial delay
let bossesDefeated    = 0;

function randomEdgePos(): { x: number; z: number } {
    const edge = BOUNDARY - 3;
    const side = Math.floor(Math.random() * 4);
    const along = (Math.random() * 2 - 1) * edge;
    switch (side) {
        case 0: return { x: -edge, z: along };
        case 1: return { x:  edge, z: along };
        case 2: return { x: along, z: -edge };
        default: return { x: along, z:  edge };
    }
}

function spawnBossNow(): void {
    bossSpawnPending = false;
    const { x, z } = randomEdgePos();
    const bossHp  = Math.round(BOSS_MAX_HP * (1 + bossesDefeated * 0.5));
    const bossDmg = Math.round(BOSS_MELEE_DAMAGE * (1 + bossesDefeated * 0.25));
    enemyManager.spawnBoss(x, z, bossHp, bossDmg, () => {
        bossesDefeated++;
        // Boss died — drop spellbook at its last known position
        const boss = enemyManager.enemies.find(e => e.isBoss);
        const dropPos = boss?.root.position ?? new Vector3(x, 0, z);
        spellbook = new SpellbookPickup(scene, dropPos);
    });
}

function handlePickup(): void {
    if (!spellbook || choiceOpen) return;
    const inRange = spellbook.update(player.position);
    if (!inRange) return;

    spellbook.dispose();
    spellbook = null;
    choiceOpen = true;

    // Build 3 random choices from not-yet-unlocked types
    const pool = ALL_TYPES.filter(t => !unlocked.has(t));
    const choices: StageElement[] = [];
    while (choices.length < 3 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        choices.push(pool.splice(idx, 1)[0]);
    }

    if (choices.length === 0) {
        // All types already unlocked — just spawn next boss
        choiceOpen = false;
        bossSpawnPending = true;
        bossSpawnAt = Date.now() + 2000;
        return;
    }

    choiceUI.show(choices, (picked) => {
        unlocked.add(picked);
        spellCreator.setUnlockedTypes(unlocked);
        typeLevels.setVisibleTypes(unlocked);
        choiceOpen = false;
        bossSpawnPending = true;
        bossSpawnAt = Date.now() + 2000;
    });
}

// ── Input ─────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { active!.blur(); return; }
    }
    if (e.key === 'Tab') {
        const creatorEl = document.getElementById('spell-creator');
        if (creatorEl?.contains(document.activeElement)) return;
        e.preventDefault();
        cancelCast();
        if (!spellCreator.visible) {
            creatorOpenedAt = Date.now();
        } else {
            const paused = Date.now() - creatorOpenedAt;
            for (let i = 0; i < 4; i++) {
                if (slotLastCast[i] > 0) slotLastCast[i] += paused;
            }
        }
        spellCreator.toggle();
        return;
    }

    if (spellCreator.visible || !player.alive || choiceOpen) return;

    const isJump = e.key === ' ';
    if (casting && (INTERRUPT_KEYS.includes(e.key.toLowerCase()) || (isJump && player.onGround))) {
        cancelCast();
        return;
    }

    const slotIndex = ['1', '2', '3', '4'].indexOf(e.key);
    if (slotIndex === -1 || casting) return;

    const spell = spellCreator.getSlot(slotIndex);
    if (!spell) return;

    if (Date.now() - slotLastCast[slotIndex] < slotCooldownMs[slotIndex]) return;
    const effectiveCost = Math.ceil(spell.manaCost * typeLevels.getGlobalManaCostFactor());
    if (!player.spendMana(effectiveCost)) return;

    const duration = spell.castTime;
    if (duration === 0) {
        fireSpell(spell, slotIndex);
    } else {
        casting = { spell, slotIndex, startTime: Date.now(), duration, manaPaid: effectiveCost };
        castBarLabel.textContent = 'Casting… (move to cancel)';
        castBarFill.style.width = '0%';
        castBarEl.style.display = 'block';
    }
});

// ── Render loop ───────────────────────────────────────────────────────────────

scene.onBeforeRenderObservable.add(() => {
    const camToChar = player.position.subtract(camera.position);
    camToChar.y = 0;
    if (camToChar.length() < 0.01) return;

    const forward = camToChar.normalize();
    const right   = Vector3.Cross(Vector3.Up(), forward).normalize();

    hotbar.update(spellCreator.slots, slotLastCast, slotCooldownMs, player.mana,
        typeLevels.getGlobalManaCostFactor(),
        spellCreator.visible ? creatorOpenedAt : undefined);
    damageNumbers.update();

    if (spellCreator.visible || choiceOpen) return;

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
    combat.update(enemyManager.enemies, en => enemyManager.kill(en),
        amt => player.healHp(amt), player.position);

    if (player.alive) {
        enemyManager.update(player.position, dmg => player.takeDamage(dmg));
    }

    const now = Date.now();

    // Normal enemy spawning — up to ENEMY_MAX_NORMAL at a time
    if (now - lastSpawnTime > ENEMY_SPAWN_INTERVAL && enemyManager.normalCount < ENEMY_MAX_NORMAL) {
        lastSpawnTime = now;
        const { x, z } = randomEdgePos();
        enemyManager.spawn(x, z);
    }

    // Boss spawning
    if (bossSpawnPending && !enemyManager.bossAlive && now >= bossSpawnAt) {
        spawnBossNow();
    }

    // Spellbook pickup
    if (spellbook) handlePickup();

    camera.target.copyFrom(player.position);
    camera.target.y += 1;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
