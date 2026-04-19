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

export interface Spell {
    element:    SpellElement;
    power:      number;  // 1–100
    castTime:   number;  // ms, 0–3000
    cooldown:   number;  // ms, 0–10000
    manaCost:   number;
    damage:     number;
    burnDamage: number;
}
