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
    BOUNDARY, DEV_MODE, MANA_REGEN_RATE,
    FLYER_BOSS_HP_MULT,
} from './constants';
import type { EnemyType, Spell, SpellElement, SpellMod, SpellStage, StageElement } from './types';

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

const ALL_TYPES:      StageElement[] = ['fire', 'ice', 'lightning', 'heal', 'carrier', 'cloud'];
const ALL_SPELL_MODS: SpellMod[]     = ['castTime', 'cooldown'];
const startElement = (['fire', 'ice', 'lightning'] as SpellElement[])[Math.floor(Math.random() * 3)];
const unlocked     = new Set<StageElement>([startElement]);
const unlockedMods = new Set<SpellMod>();

spellCreator.setUnlockedTypes(unlocked);
spellCreator.setDefaultElement(startElement);

function syncLevels(): void {
    typeLevels.setVisible(new Set([...unlocked, ...unlockedMods]));
}
syncLevels();

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
    return {
        element, power: 50, pitch: 0, yaw: 0,
        count: 1, spread: 0, yawSpread: 0,
        stationary: false, trigger: 'delay', triggerMs: 500, duration: 3000,
        damage:      calcDamage(50, 0),
        burnDamage:  element === 'fire'       ? calcBurnDamage(50, 0) : 0,
        burnDuration: element === 'fire'      ? 3000 : undefined,
        slowPercent:  element === 'ice'       ? 50   : undefined,
        jumpCount:    element === 'lightning' ? 2    : undefined,
        offsetX: 0, offsetY: 0, offsetZ: 0,
        children: [],
    };
}

const starterSpell: Spell = {
    castTime: 0, cooldown: 0,
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

// ── Open world: camps ────────────────────────────────────────────────────────

interface Camp {
    center:       { x: number; z: number };
    bossType:     EnemyType;
    bossDrop:     string;       // specific unlockable this boss drops
    bossHp:       number;
    bossDmg:      number;
    patrolCount:  number;
    patrolRadius: number;
    bossDefeated: boolean;
}

const camps: Camp[] = [
    {
        center: { x: -70, z: -60 }, bossType: 'brute', bossDrop: 'fire',
        bossHp: BOSS_MAX_HP, bossDmg: BOSS_MELEE_DAMAGE,
        patrolCount: 4, patrolRadius: 22,
        bossDefeated: false,
    },
    {
        center: { x: 80, z: -80 }, bossType: 'regen', bossDrop: 'ice',
        bossHp: BOSS_MAX_HP, bossDmg: Math.round(BOSS_MELEE_DAMAGE * 0.75),
        patrolCount: 4, patrolRadius: 22,
        bossDefeated: false,
    },
    {
        center: { x: 0, z: 120 }, bossType: 'flyer', bossDrop: 'carrier',
        bossHp: Math.round(BOSS_MAX_HP * FLYER_BOSS_HP_MULT), bossDmg: Math.round(BOSS_MELEE_DAMAGE * 0.75),
        patrolCount: 3, patrolRadius: 28,
        bossDefeated: false,
    },
];

// If a boss would drop the player's starting element, swap it for lightning
// (which is normally a world book) so the player always gets a new unlock from each boss
for (const camp of camps) {
    if (camp.bossDrop === startElement) camp.bossDrop = 'lightning';
}

// World spellbooks for the remaining unlockables, scattered across the map
const WORLD_BOOK_DEFS: { content: string; x: number; z: number }[] = [
    { content: 'lightning', x:  35, z:  22 },
    { content: 'heal',      x: -42, z:  28 },
    { content: 'cloud',     x:  18, z: -42 },
    { content: 'castTime',  x: -32, z: -52 },
    { content: 'cooldown',  x:  52, z:  58 },
];

function spawnCamp(camp: Camp): void {
    const { x, z } = camp.center;

    // Patrol enemies evenly around the camp center
    for (let i = 0; i < camp.patrolCount; i++) {
        const angle = (i / camp.patrolCount) * Math.PI * 2;
        const r = camp.patrolRadius * (0.5 + Math.random() * 0.5);
        enemyManager.spawn(x + Math.cos(angle) * r, z + Math.sin(angle) * r, undefined, camp.bossType);
    }

    // Boss — drops its specific spellbook at its actual death position
    enemyManager.spawnBoss(x + 4, z + 4, camp.bossHp, camp.bossDmg, camp.bossType, (deathPos) => {
        camp.bossDefeated = true;
        spellbooks.push(new SpellbookPickup(scene, deathPos, camp.bossDrop));
    });
}

// Spawn all camps at game start — enemies stay put until player enters aggro range
for (const camp of camps) spawnCamp(camp);

// ── Spellbooks ────────────────────────────────────────────────────────────────

let spellbooks: SpellbookPickup[] = [];
let pickupOpen = false;

// Place world spellbooks at game start
function initWorldBooks(): void {
    const bossDrops = new Set(camps.map(c => c.bossDrop));
    for (const def of WORLD_BOOK_DEFS) {
        if (unlocked.has(def.content as StageElement)) continue;
        if (unlockedMods.has(def.content as SpellMod)) continue;
        if (bossDrops.has(def.content)) continue; // boss already covers this element
        spellbooks.push(new SpellbookPickup(scene, new Vector3(def.x, 0, def.z), def.content));
    }
}
initWorldBooks();

function unlockContent(content: string): void {
    if (ALL_SPELL_MODS.includes(content as SpellMod)) {
        unlockedMods.add(content as SpellMod);
        spellCreator.setUnlockedMods(unlockedMods);
    } else {
        unlocked.add(content as StageElement);
        spellCreator.setUnlockedTypes(unlocked);
    }
    syncLevels();
}

function handlePickup(): void {
    if (pickupOpen || spellbooks.length === 0) return;

    let pickedIdx = -1;
    for (let i = 0; i < spellbooks.length; i++) {
        const inRange = spellbooks[i].update(player.position);
        if (inRange && pickedIdx === -1) pickedIdx = i;
    }
    if (pickedIdx === -1) return;

    const book = spellbooks.splice(pickedIdx, 1)[0];
    const content = book.content;
    book.dispose();
    pickupOpen = true;

    choiceUI.showFound(content, () => {
        unlockContent(content);
        pickupOpen = false;
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
            combat.resyncClock();
        }
        spellCreator.toggle();
        return;
    }

    if (DEV_MODE && e.key === 'F1') {
        e.preventDefault();
        for (const t of ALL_TYPES)      unlocked.add(t);
        for (const m of ALL_SPELL_MODS) unlockedMods.add(m);
        spellCreator.setUnlockedTypes(unlocked);
        spellCreator.setUnlockedMods(unlockedMods);
        syncLevels();
        return;
    }

    if (spellCreator.visible || !player.alive || pickupOpen) return;

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

    if (spellCreator.visible || pickupOpen) return;

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

    // Spellbook pickup
    handlePickup();

    camera.target.copyFrom(player.position);
    camera.target.y += 1;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
