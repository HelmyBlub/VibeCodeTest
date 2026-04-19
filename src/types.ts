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
    knockback:    Vector3;
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
export type SpellPower   = 'low'  | 'medium' | 'high';
export type SpellCastTime = 'instant' | 'short' | 'long';

export interface Spell {
    element:  SpellElement;
    power:    SpellPower;
    castTime: SpellCastTime;
    manaCost: number;
}
