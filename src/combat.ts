import {
    Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import {
    ENEMY_MAX_HP, FIRE_BURN_DURATION, FIRE_GRAVITY, FIRE_MAX_DURATION, FIRE_MIN_DURATION,
    FIRE_SPEED, FIREBALL_HIT_RADIUS, GROUND_Y,
    ICE_DRAG, ICE_FALL_RATE, ICE_MAX_DURATION, ICE_MAX_FALL_SPEED, ICE_MAX_SLOW, ICE_MIN_SLOW,
    ICE_SLOW_DURATION, ICE_SPEED,
    LIGHTNING_BASE_RANGE, LIGHTNING_CHAIN_MULT, LIGHTNING_CHAIN_RANGE,
    LIGHTNING_MAX_CHAINS, LIGHTNING_RANGE_POWER, LIGHTNING_SPEED,
} from './constants';
import type { Enemy, Fireball, ProjectileConfig, Spell, SpellElement } from './types';

const ELEMENT_COLOR: Record<SpellElement, [Color3, Color3]> = {
    fire:      [new Color3(1, 0.4, 0),    new Color3(1, 0.3, 0)],
    ice:       [new Color3(0, 0.6, 1),    new Color3(0, 0.8, 1)],
    lightning: [new Color3(1, 0.85, 0.1), new Color3(1, 0.9, 0.2)],
};

interface ChainFlash { mesh: Mesh; light: PointLight; life: number; }

export class CombatSystem {
    private readonly projectiles: Fireball[] = [];
    private readonly flashes:     ChainFlash[] = [];
    private readonly mats: Record<SpellElement, StandardMaterial>;
    private readonly flashMat: StandardMaterial;

    constructor(private readonly scene: Scene) {
        this.mats = {
            fire:      this.makeMat('matFire',      ELEMENT_COLOR.fire),
            ice:       this.makeMat('matIce',       ELEMENT_COLOR.ice),
            lightning: this.makeMat('matLightning', ELEMENT_COLOR.lightning),
        };
        this.flashMat = new StandardMaterial('chainFlashMat', scene);
        this.flashMat.emissiveColor = new Color3(1, 1, 0.3);
        this.flashMat.diffuseColor  = new Color3(1, 0.9, 0.1);
    }

    private makeMat(id: string, [diffuse, emissive]: [Color3, Color3]): StandardMaterial {
        const m = new StandardMaterial(id, this.scene);
        m.diffuseColor  = diffuse;
        m.emissiveColor = emissive;
        return m;
    }

    castSpell(playerPos: Vector3, playerForward: Vector3, spell: Spell): void {
        const right   = Vector3.Cross(Vector3.Up(), playerForward).normalize();
        const basePos = playerPos.add(new Vector3(0, 1.2, 0));

        for (const pc of spell.projectiles) {
            const worldOffset = right.scale(pc.right)
                .add(Vector3.Up().scale(pc.up))
                .add(playerForward.scale(pc.forward));

            const pitchRad = (pc.pitch * Math.PI) / 180;
            const yawRad   = (pc.yaw   * Math.PI) / 180;
            const cosP = Math.cos(pitchRad);

            const dir = right.scale(Math.sin(yawRad) * cosP)
                .add(Vector3.Up().scale(Math.sin(pitchRad)))
                .add(playerForward.scale(Math.cos(yawRad) * cosP))
                .normalize();

            this.spawnProjectile(basePos.add(worldOffset), dir, pc);
        }
    }

    private spawnProjectile(origin: Vector3, direction: Vector3, pc: ProjectileConfig): void {
        const [, emissive] = ELEMENT_COLOR[pc.element];
        const mesh = MeshBuilder.CreateSphere('spell', { diameter: 0.42, segments: 6 }, this.scene);
        mesh.position = origin.add(direction.scale(0.6));
        mesh.material = this.mats[pc.element];

        const light = new PointLight('spellLight', mesh.position.clone(), this.scene);
        light.diffuse   = emissive;
        light.intensity = 1.5;
        light.range     = 6;

        const now       = Date.now();
        const spawnPos  = mesh.position.clone();
        const t         = pc.power / 100;

        let vel: Vector3;
        let maxDuration: number;
        let maxRange: number;
        let chainsLeft: number;
        let slowFactor: number;

        switch (pc.element) {
            case 'fire':
                vel         = direction.scale(FIRE_SPEED);
                maxDuration = FIRE_MIN_DURATION + t * (FIRE_MAX_DURATION - FIRE_MIN_DURATION);
                maxRange    = 0;
                chainsLeft  = 0;
                slowFactor  = 1;
                break;
            case 'ice':
                vel         = direction.scale(ICE_SPEED);
                maxDuration = ICE_MAX_DURATION;
                maxRange    = 0;
                chainsLeft  = 0;
                slowFactor  = ICE_MIN_SLOW - t * (ICE_MIN_SLOW - ICE_MAX_SLOW);
                break;
            case 'lightning':
                vel         = direction.scale(LIGHTNING_SPEED);
                maxDuration = 10000; // fallback — range check expires it first
                maxRange    = LIGHTNING_BASE_RANGE + pc.power * LIGHTNING_RANGE_POWER;
                chainsLeft  = Math.floor(t * LIGHTNING_MAX_CHAINS);
                slowFactor  = 1;
                break;
        }

        this.projectiles.push({
            mesh, light, vel,
            damage:      pc.damage,
            element:     pc.element,
            burnDamage:  pc.burnDamage,
            spawnTime:   now,
            maxDuration,
            grounded:    false,
            hitEnemies:  new Set(),
            spawnPos,
            maxRange,
            chainsLeft,
            slowFactor,
        });
    }

    private spawnChainFlash(pos: Vector3): void {
        const mesh = MeshBuilder.CreateSphere('chainFlash', { diameter: 0.55, segments: 4 }, this.scene);
        mesh.position = pos.clone();
        mesh.material = this.flashMat;

        const light = new PointLight('chainLight', pos.clone(), this.scene);
        light.diffuse   = new Color3(1, 1, 0.3);
        light.intensity = 2.5;
        light.range     = 7;

        this.flashes.push({ mesh, light, life: 10 });
    }

    private applyLightningChains(
        p: Fireball, primary: Enemy, enemies: Enemy[], onKill: (en: Enemy) => void,
    ): void {
        const chained = new Set<Enemy>([primary]);
        let source    = primary;
        let remaining = p.chainsLeft;

        while (remaining > 0) {
            let nearest: Enemy | null = null;
            let nearestDist = LIGHTNING_CHAIN_RANGE;
            for (const other of enemies) {
                if (other.hp <= 0 || chained.has(other)) continue;
                const d = Vector3.Distance(source.root.position, other.root.position);
                if (d < nearestDist) { nearestDist = d; nearest = other; }
            }
            if (!nearest) break;

            const chainDmg = Math.round(p.damage * LIGHTNING_CHAIN_MULT);
            nearest.hp -= chainDmg;
            nearest.hpBar.scaling.x = Math.max(0, nearest.hp / ENEMY_MAX_HP);
            if (nearest.hp <= 0) onKill(nearest);
            this.spawnChainFlash(nearest.root.position.add(new Vector3(0, 2.5, 0)));

            chained.add(nearest);
            source = nearest;
            remaining--;
        }
    }

    update(enemies: Enemy[], onKill: (en: Enemy) => void): void {
        const now = Date.now();

        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const f = this.flashes[i];
            f.life--;
            if (f.life <= 0) {
                f.mesh.dispose();
                f.light.dispose();
                this.flashes.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p   = this.projectiles[i];
            const age = now - p.spawnTime;

            // --- movement ---
            switch (p.element) {
                case 'fire':
                    if (!p.grounded) {
                        p.vel.y += FIRE_GRAVITY;
                        p.mesh.position.addInPlace(p.vel);
                        if (p.mesh.position.y <= GROUND_Y) {
                            p.mesh.position.y = GROUND_Y;
                            p.vel.setAll(0);
                            p.grounded = true;
                        }
                        p.light.position.copyFrom(p.mesh.position);
                    }
                    break;
                case 'ice':
                    p.vel.y = Math.max(-ICE_MAX_FALL_SPEED, p.vel.y - ICE_FALL_RATE);
                    p.vel.x *= ICE_DRAG;
                    p.vel.z *= ICE_DRAG;
                    p.mesh.position.addInPlace(p.vel);
                    p.light.position.copyFrom(p.mesh.position);
                    break;
                case 'lightning':
                    p.mesh.position.addInPlace(p.vel);
                    p.light.position.copyFrom(p.mesh.position);
                    break;
            }

            // --- expiry ---
            const rangeExceeded = p.element === 'lightning'
                && Vector3.Distance(p.mesh.position, p.spawnPos) >= p.maxRange;
            const groundedIce   = p.element === 'ice' && p.mesh.position.y <= GROUND_Y;
            const timedOut      = age >= p.maxDuration;

            if (rangeExceeded || groundedIce || timedOut) {
                p.mesh.dispose();
                p.light.dispose();
                this.projectiles.splice(i, 1);
                continue;
            }

            // --- hit detection ---
            if (p.grounded) {
                // Grounded fire: refresh burn on enemies standing in it, no direct damage
                for (const en of enemies) {
                    if (en.hp <= 0) continue;
                    const dist = Vector3.Distance(p.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                    if (dist < FIREBALL_HIT_RADIUS) {
                        en.burnEnd      = now + FIRE_BURN_DURATION;
                        en.burnDamage   = p.burnDamage;
                    }
                }
                continue;
            }

            // Flying hit detection
            let consumed = false;
            for (const en of enemies) {
                if (en.hp <= 0) continue;
                const dist = Vector3.Distance(p.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                if (dist >= FIREBALL_HIT_RADIUS) continue;

                if (p.element === 'fire') {
                    // Fire passes through — direct damage only once per enemy, burn always refreshed
                    if (!p.hitEnemies.has(en)) {
                        p.hitEnemies.add(en);
                        en.hp -= p.damage;
                        en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);
                        if (en.hp <= 0) onKill(en);
                    }
                    en.burnEnd    = now + FIRE_BURN_DURATION;
                    en.burnDamage = p.burnDamage;
                } else {
                    en.hp -= p.damage;
                    en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);

                    if (p.element === 'ice') {
                        en.slowEnd    = now + ICE_SLOW_DURATION;
                        en.slowFactor = p.slowFactor;
                    } else {
                        this.applyLightningChains(p, en, enemies, onKill);
                    }

                    if (en.hp <= 0) onKill(en);
                    consumed = true;
                    break;
                }
            }

            if (consumed) {
                p.mesh.dispose();
                p.light.dispose();
                this.projectiles.splice(i, 1);
            }
        }
    }
}
