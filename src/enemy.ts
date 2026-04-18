import {
    Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import {
    ENEMY_MAX_HP, ENEMY_MELEE_DAMAGE, ENEMY_MELEE_INTERVAL,
    ENEMY_MELEE_RANGE, ENEMY_SPEED,
} from './constants';
import type { Enemy } from './types';

export class EnemyManager {
    readonly enemies: Enemy[] = [];

    private readonly bodyMat: StandardMaterial;
    private readonly headMat: StandardMaterial;
    private readonly hpBgMat: StandardMaterial;
    private readonly hpBarMat: StandardMaterial;

    constructor(private readonly scene: Scene) {
        this.bodyMat = new StandardMaterial('enBodyMat', scene);
        this.bodyMat.diffuseColor = new Color3(0.7, 0.1, 0.1);

        this.headMat = new StandardMaterial('enHeadMat', scene);
        this.headMat.diffuseColor = new Color3(0.6, 0.3, 0.2);

        this.hpBgMat = new StandardMaterial('enHpBgMat', scene);
        this.hpBgMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.hpBgMat.emissiveColor = new Color3(0.05, 0.05, 0.05);

        this.hpBarMat = new StandardMaterial('enHpBarMat', scene);
        this.hpBarMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
        this.hpBarMat.emissiveColor = new Color3(0.4, 0.0, 0.0);
    }

    spawn(x: number, z: number): void {
        const id = this.enemies.length;
        const root = new TransformNode(`en${id}`, this.scene);
        root.position = new Vector3(x, 0, z);

        const eb = MeshBuilder.CreateCapsule(`enB${id}`, { height: 1.6, radius: 0.3, tessellation: 10 }, this.scene);
        eb.position.y = 0.8; eb.parent = root; eb.material = this.bodyMat;

        const eh = MeshBuilder.CreateSphere(`enH${id}`, { diameter: 0.45, segments: 6 }, this.scene);
        eh.position.y = 1.85; eh.parent = root; eh.material = this.headMat;

        const hpBg = MeshBuilder.CreateBox(`enHpBg${id}`, { width: 1.0, height: 0.13, depth: 0.06 }, this.scene);
        hpBg.position.y = 2.6; hpBg.parent = root;
        hpBg.material = this.hpBgMat;
        hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const hpBar = MeshBuilder.CreateBox(`enHpBar${id}`, { width: 1.0, height: 0.13, depth: 0.08 }, this.scene);
        hpBar.position.y = 2.6; hpBar.parent = root;
        hpBar.material = this.hpBarMat;
        hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;

        this.enemies.push({ root, eb, eh, hpBg, hpBar, hp: ENEMY_MAX_HP, lastMelee: 0 });
    }

    kill(en: Enemy): void {
        en.eb.dispose(); en.eh.dispose();
        en.hpBg.dispose(); en.hpBar.dispose(); en.root.dispose();
    }

    update(playerPos: Vector3, onHitPlayer: (damage: number) => void): void {
        const now = Date.now();
        for (const en of this.enemies) {
            if (en.hp <= 0) continue;
            const toPlayer = playerPos.subtract(en.root.position);
            toPlayer.y = 0;
            const dist = toPlayer.length();

            if (dist > ENEMY_MELEE_RANGE) {
                const step = toPlayer.normalize().scaleInPlace(ENEMY_SPEED);
                en.root.position.addInPlace(step);
                en.root.rotation.y = Math.atan2(step.x, step.z);
            } else if (now - en.lastMelee > ENEMY_MELEE_INTERVAL) {
                en.lastMelee = now;
                onHitPlayer(ENEMY_MELEE_DAMAGE);
            }
        }
    }
}
