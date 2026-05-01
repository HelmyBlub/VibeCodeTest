import type { Mesh, PointLight, TransformNode, Vector3 } from '@babylonjs/core';

export interface Enemy {
    root: TransformNode;
    eb: Mesh;
    eh: Mesh;
    hpBg: Mesh;
    hpBar: Mesh;
    hp: number;
    lastMelee: number;
    // elemental effects
    burnEnd:      number;
    burnDamage:   number;
    lastBurnTick: number;
    slowEnd:      number;
    slowFactor:   number;
}

export interface Fireball {
    mesh:        Mesh;
    light:       PointLight;
    vel:         Vector3;
    damage:      number;
    element:     SpellElement;
    burnDamage:  number;
    spawnTime:   number;   // Date.now() at spawn
    maxDuration: number;   // ms until time-based expiry
    grounded:    boolean;  // fire: true once it hits ground and stays
    hitEnemies:  Set<Enemy>; // fire: enemies already dealt direct damage to (pass-through)
    spawnPos:    Vector3;  // lightning: origin for range check
    maxRange:    number;   // lightning: dispose when this far from spawnPos
    chainsLeft:  number;   // lightning: remaining chain jumps
    slowFactor:  number;   // ice: per-projectile speed multiplier on enemy (power-scaled)
}

export type SpellElement = 'fire' | 'ice' | 'lightning';
export type StageElement = SpellElement | 'carrier' | 'cloud';
export type StageTrigger = 'delay' | 'impact' | 'interval';

export interface SpellStage {
    element:      StageElement;
    power:        number;     // 1–100
    pitch:        number;     // degrees -90 to 90
    yaw:          number;     // degrees -180 to 180
    count:        number;     // simultaneous spawns
    spread:       number;     // random position offset radius (world units)
    yawSpread:    number;     // yaw fan angle (degrees); count=1 → random, count>1 → even fan
    stationary:   boolean;    // area/cloud vs flying projectile
    trigger:      StageTrigger;
    triggerMs:    number;     // ms for delay period or interval period
    duration:     number;     // total stage lifetime ms (stationary only)
    damage:       number;     // computed at spell-build time
    burnDamage:   number;     // computed at spell-build time
    burnDuration?: number;    // fire: DoT duration ms
    slowPercent?:  number;    // ice: slow strength 0–90 (%)
    jumpCount?:    number;    // lightning: chain jumps 0–8
    offsetX?:      number;    // spawn offset from parent (world units)
    offsetY?:      number;
    offsetZ?:      number;
    children:     SpellStage[];
}

export interface ProjectileConfig {
    right:      number;       // offset to player's right,    -3 to 3 units
    up:         number;       // offset upward,               -1 to 4 units
    forward:    number;       // offset forward,              -3 to 3 units
    pitch:      number;       // degrees up (+) / down (-),   -90 to 90
    yaw:        number;       // degrees left (-) / right (+) from forward, -180 to 180
    element:    SpellElement;
    power:      number;       // 1–100
    damage:     number;
    burnDamage: number;
}

export interface Spell {
    castTime:    number;          // ms, 0–3000
    cooldown:    number;          // ms, 0–10000
    manaCost:    number;
    projectiles: ProjectileConfig[];
    stages?:     SpellStage[];    // if present and non-empty: chain mode
}
