import {
    Color3, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import {
    ENEMY_MAX_HP, FIRE_BURN_DAMAGE, FIRE_BURN_DURATION, FIREBALL_HIT_RADIUS,
    FIREBALL_LIFETIME, FIREBALL_SPEED, ICE_SLOW_DURATION, LIGHTNING_KNOCKBACK, SPELL_DAMAGE,
} from './constants';
import type { Enemy, Fireball, Spell, SpellElement } from './types';

const ELEMENT_COLOR: Record<SpellElement, [Color3, Color3]> = {
    fire:      [new Color3(1, 0.4, 0),    new Color3(1, 0.3, 0)],
    ice:       [new Color3(0, 0.6, 1),    new Color3(0, 0.8, 1)],
    lightning: [new Color3(1, 0.85, 0.1), new Color3(1, 0.9, 0.2)],
};

export class CombatSystem {
    private readonly projectiles: Fireball[] = [];
    private readonly mats: Record<SpellElement, StandardMaterial>;

    constructor(private readonly scene: Scene) {
        this.mats = {
            fire:      this.makeMat('matFire',      ELEMENT_COLOR.fire),
            ice:       this.makeMat('matIce',       ELEMENT_COLOR.ice),
            lightning: this.makeMat('matLightning', ELEMENT_COLOR.lightning),
        };
    }

    private makeMat(id: string, [diffuse, emissive]: [Color3, Color3]): StandardMaterial {
        const m = new StandardMaterial(id, this.scene);
        m.diffuseColor  = diffuse;
        m.emissiveColor = emissive;
        return m;
    }

    castSpell(origin: Vector3, direction: Vector3, spell: Spell): boolean {
        const [, emissive] = ELEMENT_COLOR[spell.element];
        const mesh = MeshBuilder.CreateSphere('spell', { diameter: 0.42, segments: 6 }, this.scene);
        mesh.position = origin.clone().add(direction.scale(0.6));
        mesh.material = this.mats[spell.element];

        const light = new PointLight('spellLight', mesh.position.clone(), this.scene);
        light.diffuse   = emissive;
        light.intensity = 1.5;
        light.range     = 6;

        this.projectiles.push({
            mesh, light,
            vel:        direction.scale(FIREBALL_SPEED),
            life:       FIREBALL_LIFETIME,
            damage:     SPELL_DAMAGE[spell.power],
            element:    spell.element,
            burnDamage: FIRE_BURN_DAMAGE[spell.power],
        });
        return true;
    }

    update(enemies: Enemy[], onKill: (en: Enemy) => void): void {
        const now = Date.now();

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.mesh.position.addInPlace(p.vel);
            p.light.position.copyFrom(p.mesh.position);
            p.life--;

            let hit = false;
            for (const en of enemies) {
                if (en.hp <= 0) continue;
                const dist = Vector3.Distance(p.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                if (dist < FIREBALL_HIT_RADIUS) {
                    en.hp -= p.damage;
                    en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);

                    // elemental effects
                    switch (p.element) {
                        case 'fire':
                            en.burnEnd      = now + FIRE_BURN_DURATION;
                            en.burnDamage   = p.burnDamage;
                            en.lastBurnTick = now;
                            break;
                        case 'ice':
                            en.slowEnd = now + ICE_SLOW_DURATION;
                            break;
                        case 'lightning': {
                            const dir = p.vel.clone().normalize();
                            en.knockback.x = dir.x * LIGHTNING_KNOCKBACK;
                            en.knockback.z = dir.z * LIGHTNING_KNOCKBACK;
                            break;
                        }
                    }

                    if (en.hp <= 0) onKill(en);
                    hit = true;
                    break;
                }
            }

            if (hit || p.life <= 0) {
                p.mesh.dispose();
                p.light.dispose();
                this.projectiles.splice(i, 1);
            }
        }
    }
}
