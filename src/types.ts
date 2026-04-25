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
    castTime:    number;  // ms, 0–3000
    cooldown:    number;  // ms, 0–10000
    manaCost:    number;  // sum of per-projectile costs
    projectiles: ProjectileConfig[];
}
