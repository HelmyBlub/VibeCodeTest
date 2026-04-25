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
}

export interface Fireball {
    mesh:       Mesh;
    light:      PointLight;
    vel:        Vector3;
    life:       number;
    damage:     number;
    element:    SpellElement;
    burnDamage: number;
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
