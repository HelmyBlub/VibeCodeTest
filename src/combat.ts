import {
    Color3, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import {
    ENEMY_MAX_HP, FIREBALL_COOLDOWN, FIREBALL_DAMAGE,
    FIREBALL_HIT_RADIUS, FIREBALL_LIFETIME, FIREBALL_SPEED,
} from './constants';
import type { Enemy, Fireball } from './types';

export class CombatSystem {
    private readonly fireballs: Fireball[] = [];
    private lastFireTime = 0;
    private readonly mat: StandardMaterial;

    constructor(private readonly scene: Scene) {
        this.mat = new StandardMaterial('fbMat', scene);
        this.mat.diffuseColor = new Color3(1, 0.4, 0);
        this.mat.emissiveColor = new Color3(1, 0.3, 0);
    }

    castFireball(origin: Vector3, direction: Vector3): void {
        if (Date.now() - this.lastFireTime < FIREBALL_COOLDOWN) return;
        this.lastFireTime = Date.now();

        const mesh = MeshBuilder.CreateSphere('fb', { diameter: 0.42, segments: 6 }, this.scene);
        mesh.position = origin.clone().add(direction.scale(0.6));
        mesh.material = this.mat;

        const light = new PointLight('fbLight', mesh.position.clone(), this.scene);
        light.diffuse = new Color3(1, 0.5, 0);
        light.intensity = 1.5;
        light.range = 6;

        this.fireballs.push({ mesh, light, vel: direction.scale(FIREBALL_SPEED), life: FIREBALL_LIFETIME });
    }

    update(enemies: Enemy[], onKill: (en: Enemy) => void): void {
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const fb = this.fireballs[i];
            fb.mesh.position.addInPlace(fb.vel);
            fb.light.position.copyFrom(fb.mesh.position);
            fb.life--;

            let hit = false;
            for (const en of enemies) {
                if (en.hp <= 0) continue;
                const dist = Vector3.Distance(fb.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                if (dist < FIREBALL_HIT_RADIUS) {
                    en.hp -= FIREBALL_DAMAGE;
                    en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);
                    if (en.hp <= 0) onKill(en);
                    hit = true;
                    break;
                }
            }

            if (hit || fb.life <= 0) {
                fb.mesh.dispose();
                fb.light.dispose();
                this.fireballs.splice(i, 1);
            }
        }
    }
}
