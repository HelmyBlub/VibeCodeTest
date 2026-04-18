import type { Mesh, PointLight, TransformNode, Vector3 } from '@babylonjs/core';

export interface Enemy {
    root: TransformNode;
    eb: Mesh;
    eh: Mesh;
    hpBg: Mesh;
    hpBar: Mesh;
    hp: number;
    lastMelee: number;
}

export interface Fireball {
    mesh: Mesh;
    light: PointLight;
    vel: Vector3;
    life: number;
}
