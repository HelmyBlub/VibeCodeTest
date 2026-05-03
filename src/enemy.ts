import {
    Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import {
    BOSS_MAX_HP, BOSS_MELEE_DAMAGE, BOSS_MELEE_INTERVAL, BOSS_SCALE,
    ENEMY_MAX_HP, ENEMY_MELEE_DAMAGE, ENEMY_MELEE_INTERVAL, ENEMY_MELEE_RANGE, ENEMY_SPEED,
    FIRE_BURN_INTERVAL,
} from './constants';
import type { Enemy } from './types';

export class EnemyManager {
    readonly enemies: Enemy[] = [];

    private readonly bodyMat:    StandardMaterial;
    private readonly headMat:    StandardMaterial;
    private readonly bossBodyMat: StandardMaterial;
    private readonly bossHeadMat: StandardMaterial;
    private readonly hpBgMat:    StandardMaterial;
    private readonly hpBarMat:   StandardMaterial;
    private readonly bossHpBarMat: StandardMaterial;

    private bossDeath: (() => void) | null = null;

    constructor(private readonly scene: Scene) {
        this.bodyMat = new StandardMaterial('enBodyMat', scene);
        this.bodyMat.diffuseColor = new Color3(0.7, 0.1, 0.1);

        this.headMat = new StandardMaterial('enHeadMat', scene);
        this.headMat.diffuseColor = new Color3(0.6, 0.3, 0.2);

        this.bossBodyMat = new StandardMaterial('bossBodyMat', scene);
        this.bossBodyMat.diffuseColor = new Color3(0.5, 0.05, 0.7);
        this.bossBodyMat.emissiveColor = new Color3(0.1, 0.0, 0.15);

        this.bossHeadMat = new StandardMaterial('bossHeadMat', scene);
        this.bossHeadMat.diffuseColor = new Color3(0.4, 0.05, 0.6);

        this.hpBgMat = new StandardMaterial('enHpBgMat', scene);
        this.hpBgMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.hpBgMat.emissiveColor = new Color3(0.05, 0.05, 0.05);

        this.hpBarMat = new StandardMaterial('enHpBarMat', scene);
        this.hpBarMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
        this.hpBarMat.emissiveColor = new Color3(0.4, 0.0, 0.0);

        this.bossHpBarMat = new StandardMaterial('bossHpBarMat', scene);
        this.bossHpBarMat.diffuseColor = new Color3(0.7, 0.1, 0.9);
        this.bossHpBarMat.emissiveColor = new Color3(0.3, 0.0, 0.4);
    }

    get normalCount(): number {
        return this.enemies.filter(e => !e.isBoss && e.hp > 0).length;
    }

    get bossAlive(): boolean {
        return this.enemies.some(e => e.isBoss && e.hp > 0);
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

        this.enemies.push({
            root, eb, eh, hpBg, hpBar,
            hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP, isBoss: false,
            lastMelee: 0,
            burnEnd: 0, burnDamage: 0, lastBurnTick: 0,
            slowEnd: 0, slowFactor: 1,
        });
    }

    spawnBoss(x: number, z: number, onDeath: () => void): void {
        this.bossDeath = onDeath;
        const id = this.enemies.length;
        const root = new TransformNode(`boss${id}`, this.scene);
        root.position = new Vector3(x, 0, z);
        root.scaling = new Vector3(BOSS_SCALE, BOSS_SCALE, BOSS_SCALE);

        const eb = MeshBuilder.CreateCapsule(`bossB${id}`, { height: 1.6, radius: 0.3, tessellation: 12 }, this.scene);
        eb.position.y = 0.8; eb.parent = root; eb.material = this.bossBodyMat;

        const eh = MeshBuilder.CreateSphere(`bossH${id}`, { diameter: 0.45, segments: 8 }, this.scene);
        eh.position.y = 1.85; eh.parent = root; eh.material = this.bossHeadMat;

        // HP bar is larger and compensated for scale (width in local space = 1.6/BOSS_SCALE to appear wider)
        const barWidth = 1.6 / BOSS_SCALE;
        const hpBg = MeshBuilder.CreateBox(`bossHpBg${id}`, { width: barWidth, height: 0.1 / BOSS_SCALE, depth: 0.06 }, this.scene);
        hpBg.position.y = 2.7; hpBg.parent = root;
        hpBg.material = this.hpBgMat;
        hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const hpBar = MeshBuilder.CreateBox(`bossHpBar${id}`, { width: barWidth, height: 0.1 / BOSS_SCALE, depth: 0.08 }, this.scene);
        hpBar.position.y = 2.7; hpBar.parent = root;
        hpBar.material = this.bossHpBarMat;
        hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;

        this.enemies.push({
            root, eb, eh, hpBg, hpBar,
            hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, isBoss: true,
            lastMelee: 0,
            burnEnd: 0, burnDamage: 0, lastBurnTick: 0,
            slowEnd: 0, slowFactor: 1,
        });
    }

    kill(en: Enemy): void {
        const wasBoss = en.isBoss;
        en.eb.dispose(); en.eh.dispose();
        en.hpBg.dispose(); en.hpBar.dispose(); en.root.dispose();
        if (wasBoss) {
            this.bossDeath?.();
            this.bossDeath = null;
        }
    }

    // Prune disposed (hp<=0) enemies from array — safe to call between frames
    private cleanup(): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].hp <= 0) this.enemies.splice(i, 1);
        }
    }

    update(playerPos: Vector3, onHitPlayer: (damage: number) => void): void {
        this.cleanup();
        const now = Date.now();
        for (const en of this.enemies) {
            if (en.hp <= 0) continue;

            const meleeDmg = en.isBoss ? BOSS_MELEE_DAMAGE : ENEMY_MELEE_DAMAGE;
            const meleeInterval = en.isBoss ? BOSS_MELEE_INTERVAL : ENEMY_MELEE_INTERVAL;

            // fire: damage over time
            if (now < en.burnEnd && now - en.lastBurnTick >= FIRE_BURN_INTERVAL) {
                en.lastBurnTick = now;
                en.hp -= en.burnDamage;
                en.hpBar.scaling.x = Math.max(0, en.hp / en.maxHp);
                if (en.hp <= 0) { this.kill(en); continue; }
            }

            // movement toward player (slowed if iced)
            const toPlayer = playerPos.subtract(en.root.position);
            toPlayer.y = 0;
            const dist = toPlayer.length();

            // melee range accounts for boss scale
            const effectiveRange = en.isBoss ? ENEMY_MELEE_RANGE * BOSS_SCALE : ENEMY_MELEE_RANGE;
            const speed = now < en.slowEnd ? ENEMY_SPEED * en.slowFactor : ENEMY_SPEED;

            if (dist > effectiveRange) {
                const step = toPlayer.normalize().scaleInPlace(speed);
                en.root.position.addInPlace(step);
                en.root.rotation.y = Math.atan2(step.x, step.z);
            } else if (now - en.lastMelee > meleeInterval) {
                en.lastMelee = now;
                onHitPlayer(meleeDmg);
            }
        }
    }
}
