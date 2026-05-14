import {
    Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { getTerrainHeight } from './world/terrain';
import {
    BOSS_MELEE_INTERVAL, BOSS_SCALE,
    BRUTE_HP_MULT, BRUTE_SPEED,
    ENEMY_MAX_HP, ENEMY_MELEE_DAMAGE, ENEMY_MELEE_INTERVAL, ENEMY_MELEE_RANGE, ENEMY_SPEED,
    FIRE_BURN_INTERVAL,
    REGEN_HP_MULT, REGEN_SPEED, REGEN_RATE, REGEN_TICK_INTERVAL,
    FLYER_HP_MULT, FLYER_SPEED, FLYER_HEIGHT, FLYER_MIN_DIST, FLYER_MAX_DIST,
    FLYER_SHOOT_RANGE, FLYER_SHOT_INTERVAL, FLYER_PROJECTILE_SPEED, FLYER_PROJECTILE_DAMAGE,
    FLYER_HIT_RADIUS, FLYER_PROJECTILE_LIFETIME,
    CAMP_PATROL_AGGRO, BOSS_AGGRO_RANGE,
} from './constants';
import type { Enemy, EnemyType, FlyerProjectile } from './types';

export class EnemyManager {
    readonly enemies: Enemy[] = [];
    onKill?: (en: Enemy) => void;

    private readonly bodyMat:       StandardMaterial;
    private readonly headMat:       StandardMaterial;
    private readonly bruteBodyMat:  StandardMaterial;
    private readonly bruteHeadMat:  StandardMaterial;
    private readonly regenBodyMat:  StandardMaterial;
    private readonly regenHeadMat:  StandardMaterial;
    private readonly flyerBodyMat:  StandardMaterial;
    private readonly flyerWingMat:  StandardMaterial;
    private readonly flyerHeadMat:  StandardMaterial;
    private readonly hpBgMat:       StandardMaterial;
    private readonly hpBarMat:      StandardMaterial;
    private readonly bossHpBarMat:  StandardMaterial;
    private readonly burnMat:       StandardMaterial;
    private readonly flyerProjMat:    StandardMaterial;
    private readonly aggroIndicatorMat: StandardMaterial;

    private readonly flyerProjectiles: FlyerProjectile[] = [];

    constructor(private readonly scene: Scene) {
        this.bodyMat = new StandardMaterial('enBodyMat', scene);
        this.bodyMat.diffuseColor = new Color3(0.7, 0.1, 0.1);

        this.headMat = new StandardMaterial('enHeadMat', scene);
        this.headMat.diffuseColor = new Color3(0.6, 0.3, 0.2);

        this.bruteBodyMat = new StandardMaterial('bruteBodyMat', scene);
        this.bruteBodyMat.diffuseColor = new Color3(0.65, 0.3, 0.05);

        this.bruteHeadMat = new StandardMaterial('bruteHeadMat', scene);
        this.bruteHeadMat.diffuseColor = new Color3(0.55, 0.25, 0.08);

        this.regenBodyMat = new StandardMaterial('regenBodyMat', scene);
        this.regenBodyMat.diffuseColor = new Color3(0.1, 0.65, 0.2);

        this.regenHeadMat = new StandardMaterial('regenHeadMat', scene);
        this.regenHeadMat.diffuseColor = new Color3(0.2, 0.82, 0.3);

        this.flyerBodyMat = new StandardMaterial('flyerBodyMat', scene);
        this.flyerBodyMat.diffuseColor = new Color3(0.05, 0.5, 0.65);

        this.flyerWingMat = new StandardMaterial('flyerWingMat', scene);
        this.flyerWingMat.diffuseColor = new Color3(0.1, 0.65, 0.78);

        this.flyerHeadMat = new StandardMaterial('flyerHeadMat', scene);
        this.flyerHeadMat.diffuseColor = new Color3(0.05, 0.7, 0.7);

        this.hpBgMat = new StandardMaterial('enHpBgMat', scene);
        this.hpBgMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.hpBgMat.emissiveColor = new Color3(0.05, 0.05, 0.05);

        this.hpBarMat = new StandardMaterial('enHpBarMat', scene);
        this.hpBarMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
        this.hpBarMat.emissiveColor = new Color3(0.4, 0.0, 0.0);

        this.bossHpBarMat = new StandardMaterial('bossHpBarMat', scene);
        this.bossHpBarMat.diffuseColor = new Color3(0.7, 0.1, 0.9);
        this.bossHpBarMat.emissiveColor = new Color3(0.3, 0.0, 0.4);

        this.burnMat = new StandardMaterial('burnMat', scene);
        this.burnMat.diffuseColor  = new Color3(1.0, 0.35, 0.0);
        this.burnMat.emissiveColor = new Color3(0.8, 0.25, 0.0);
        this.burnMat.alpha = 0.55;

        this.flyerProjMat = new StandardMaterial('flyerProjMat', scene);
        this.flyerProjMat.diffuseColor  = new Color3(0.9, 0.2, 0.85);
        this.flyerProjMat.emissiveColor = new Color3(0.55, 0.08, 0.5);

        this.aggroIndicatorMat = new StandardMaterial('aggroIndicatorMat', scene);
        this.aggroIndicatorMat.diffuseColor  = new Color3(1.0, 0.85, 0.0);
        this.aggroIndicatorMat.emissiveColor = new Color3(0.8, 0.6, 0.0);
    }

    get normalCount(): number {
        return this.enemies.filter(e => !e.isBoss && e.hp > 0).length;
    }

    get bossAlive(): boolean {
        return this.enemies.some(e => e.isBoss && e.hp > 0);
    }

    spawn(x: number, z: number, baseHp = ENEMY_MAX_HP, type: EnemyType = 'simple'): void {
        const id = this.enemies.length;
        const root = new TransformNode(`en${id}`, this.scene);
        const extraMeshes: Mesh[] = [];

        let hp: number, speed: number, eb: Mesh, eh: Mesh;
        let hpBarY: number, burnD: number, burnY: number;

        switch (type) {
            case 'brute': {
                hp = Math.round(baseHp * BRUTE_HP_MULT);
                speed = BRUTE_SPEED;
                root.position = new Vector3(x, 0, z);
                eb = MeshBuilder.CreateCapsule(`enB${id}`, { height: 1.9, radius: 0.52, tessellation: 10 }, this.scene);
                eb.position.y = 0.95; eb.parent = root; eb.material = this.bruteBodyMat;
                eh = MeshBuilder.CreateSphere(`enH${id}`, { diameter: 0.62, segments: 6 }, this.scene);
                eh.position.y = 2.15; eh.parent = root; eh.material = this.bruteHeadMat;
                hpBarY = 3.0; burnD = 1.05; burnY = 0.95;
                break;
            }
            case 'regen': {
                hp = Math.round(baseHp * REGEN_HP_MULT);
                speed = REGEN_SPEED;
                root.position = new Vector3(x, 0, z);
                // Round blob body instead of capsule
                eb = MeshBuilder.CreateSphere(`enB${id}`, { diameter: 1.0, segments: 8 }, this.scene);
                eb.position.y = 0.5; eb.parent = root; eb.material = this.regenBodyMat;
                eh = MeshBuilder.CreateSphere(`enH${id}`, { diameter: 0.42, segments: 6 }, this.scene);
                eh.position.y = 1.12; eh.parent = root; eh.material = this.regenHeadMat;
                hpBarY = 1.75; burnD = 1.1; burnY = 0.5;
                break;
            }
            case 'flyer': {
                hp = Math.round(baseHp * FLYER_HP_MULT);
                speed = FLYER_SPEED;
                root.position = new Vector3(x, FLYER_HEIGHT, z);
                // Compact sphere body
                eb = MeshBuilder.CreateSphere(`enB${id}`, { diameter: 0.8, segments: 8 }, this.scene);
                eb.position.y = 0; eb.parent = root; eb.material = this.flyerBodyMat;
                eh = MeshBuilder.CreateSphere(`enH${id}`, { diameter: 0.35, segments: 6 }, this.scene);
                eh.position.y = 0.55; eh.parent = root; eh.material = this.flyerHeadMat;
                // Wings — flat boxes angled slightly upward
                const wL = MeshBuilder.CreateBox(`enWL${id}`, { width: 1.0, height: 0.07, depth: 0.4 }, this.scene);
                wL.position = new Vector3(-0.9, 0, 0); wL.rotation.z = 0.3;
                wL.parent = root; wL.material = this.flyerWingMat;
                const wR = MeshBuilder.CreateBox(`enWR${id}`, { width: 1.0, height: 0.07, depth: 0.4 }, this.scene);
                wR.position = new Vector3(0.9, 0, 0); wR.rotation.z = -0.3;
                wR.parent = root; wR.material = this.flyerWingMat;
                extraMeshes.push(wL, wR);
                hpBarY = 1.1; burnD = 0.85; burnY = 0;
                break;
            }
            default: { // simple
                hp = baseHp;
                speed = ENEMY_SPEED;
                root.position = new Vector3(x, 0, z);
                eb = MeshBuilder.CreateCapsule(`enB${id}`, { height: 1.6, radius: 0.3, tessellation: 10 }, this.scene);
                eb.position.y = 0.8; eb.parent = root; eb.material = this.bodyMat;
                eh = MeshBuilder.CreateSphere(`enH${id}`, { diameter: 0.45, segments: 6 }, this.scene);
                eh.position.y = 1.85; eh.parent = root; eh.material = this.headMat;
                hpBarY = 2.6; burnD = 0.75; burnY = 0.8;
                break;
            }
        }

        const hpBg = MeshBuilder.CreateBox(`enHpBg${id}`, { width: 1.0, height: 0.13, depth: 0.06 }, this.scene);
        hpBg.position.y = hpBarY; hpBg.parent = root;
        hpBg.material = this.hpBgMat; hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const hpBar = MeshBuilder.CreateBox(`enHpBar${id}`, { width: 1.0, height: 0.13, depth: 0.08 }, this.scene);
        hpBar.position.y = hpBarY; hpBar.parent = root;
        hpBar.material = this.hpBarMat; hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const burnIndicator = MeshBuilder.CreateSphere(`enBurn${id}`, { diameter: burnD, segments: 6 }, this.scene);
        burnIndicator.position.y = burnY; burnIndicator.parent = root;
        burnIndicator.material = this.burnMat; burnIndicator.isVisible = false;

        const aggroIndicator = this.makeAggroIndicator(`enAggro${id}`, hpBarY + 0.7, root);

        this.enemies.push({
            root, eb, eh, hpBg, hpBar, burnIndicator, aggroIndicator, extraMeshes,
            hp, maxHp: hp, isBoss: false, type, speed,
            lastMelee: 0, meleeDamage: ENEMY_MELEE_DAMAGE,
            burnEnd: 0, burnDamage: 0, lastBurnTick: 0,
            slowEnd: 0, slowFactor: 1,
            regenRate: type === 'regen' ? REGEN_RATE : 0, lastRegen: 0,
            lastShot: 0,
            homePos: root.position.clone(), aggroRange: CAMP_PATROL_AGGRO, aggroed: false,
            lastAggroAt: 0,
        });
    }

    spawnBoss(x: number, z: number, hp: number, meleeDamage: number, type: EnemyType, onDeath: (pos: Vector3) => void): void {
        const id = this.enemies.length;
        const s = 1 / BOSS_SCALE; // local-space compensator for HP bar
        const yPos = type === 'flyer' ? FLYER_HEIGHT : 0;

        const root = new TransformNode(`boss${id}`, this.scene);
        root.position = new Vector3(x, yPos, z);
        root.scaling = new Vector3(BOSS_SCALE, BOSS_SCALE, BOSS_SCALE);

        const extraMeshes: Mesh[] = [];
        let eb: Mesh, eh: Mesh, hpBarY: number, burnY: number;

        switch (type) {
            case 'brute': {
                eb = MeshBuilder.CreateCapsule(`bossB${id}`, { height: 1.9, radius: 0.52, tessellation: 12 }, this.scene);
                eb.position.y = 0.95; eb.parent = root; eb.material = this.bruteBodyMat;
                eh = MeshBuilder.CreateSphere(`bossH${id}`, { diameter: 0.62, segments: 8 }, this.scene);
                eh.position.y = 2.15; eh.parent = root; eh.material = this.bruteHeadMat;
                hpBarY = 3.2; burnY = 0.95;
                break;
            }
            case 'regen': {
                eb = MeshBuilder.CreateSphere(`bossB${id}`, { diameter: 1.0, segments: 8 }, this.scene);
                eb.position.y = 0.5; eb.parent = root; eb.material = this.regenBodyMat;
                eh = MeshBuilder.CreateSphere(`bossH${id}`, { diameter: 0.42, segments: 6 }, this.scene);
                eh.position.y = 1.12; eh.parent = root; eh.material = this.regenHeadMat;
                hpBarY = 2.2; burnY = 0.5;
                break;
            }
            case 'flyer': {
                eb = MeshBuilder.CreateSphere(`bossB${id}`, { diameter: 0.8, segments: 8 }, this.scene);
                eb.position.y = 0; eb.parent = root; eb.material = this.flyerBodyMat;
                eh = MeshBuilder.CreateSphere(`bossH${id}`, { diameter: 0.35, segments: 6 }, this.scene);
                eh.position.y = 0.55; eh.parent = root; eh.material = this.flyerHeadMat;
                const wL = MeshBuilder.CreateBox(`bossWL${id}`, { width: 1.0, height: 0.07, depth: 0.4 }, this.scene);
                wL.position = new Vector3(-0.9, 0, 0); wL.rotation.z = 0.3;
                wL.parent = root; wL.material = this.flyerWingMat;
                const wR = MeshBuilder.CreateBox(`bossWR${id}`, { width: 1.0, height: 0.07, depth: 0.4 }, this.scene);
                wR.position = new Vector3(0.9, 0, 0); wR.rotation.z = -0.3;
                wR.parent = root; wR.material = this.flyerWingMat;
                extraMeshes.push(wL, wR);
                hpBarY = 1.5; burnY = 0;
                break;
            }
            default: { // simple boss (first boss type before brute was added)
                eb = MeshBuilder.CreateCapsule(`bossB${id}`, { height: 1.6, radius: 0.3, tessellation: 12 }, this.scene);
                eb.position.y = 0.8; eb.parent = root; eb.material = this.bodyMat;
                eh = MeshBuilder.CreateSphere(`bossH${id}`, { diameter: 0.45, segments: 8 }, this.scene);
                eh.position.y = 1.85; eh.parent = root; eh.material = this.headMat;
                hpBarY = 2.7; burnY = 0.8;
                break;
            }
        }

        const barW = 1.6 * s;
        const hpBg = MeshBuilder.CreateBox(`bossHpBg${id}`, { width: barW, height: 0.1 * s, depth: 0.06 }, this.scene);
        hpBg.position.y = hpBarY; hpBg.parent = root;
        hpBg.material = this.hpBgMat; hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const hpBar = MeshBuilder.CreateBox(`bossHpBar${id}`, { width: barW, height: 0.1 * s, depth: 0.08 }, this.scene);
        hpBar.position.y = hpBarY; hpBar.parent = root;
        hpBar.material = this.bossHpBarMat; hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const burnIndicator = MeshBuilder.CreateSphere(`bossBurn${id}`, { diameter: 0.8, segments: 6 }, this.scene);
        burnIndicator.position.y = burnY; burnIndicator.parent = root;
        burnIndicator.material = this.burnMat; burnIndicator.isVisible = false;

        const aggroIndicator = this.makeAggroIndicator(`bossAggro${id}`, hpBarY + 0.5 / BOSS_SCALE, root);

        const bossSpeed = type === 'flyer' ? FLYER_SPEED
            : type === 'brute' ? BRUTE_SPEED
            : ENEMY_SPEED;

        this.enemies.push({
            root, eb, eh, hpBg, hpBar, burnIndicator, aggroIndicator, extraMeshes,
            hp, maxHp: hp, isBoss: true, type, speed: bossSpeed,
            lastMelee: 0, meleeDamage,
            burnEnd: 0, burnDamage: 0, lastBurnTick: 0,
            slowEnd: 0, slowFactor: 1,
            regenRate: type === 'regen' ? REGEN_RATE * 2 : 0, lastRegen: 0,
            lastShot: 0,
            homePos: root.position.clone(), aggroRange: BOSS_AGGRO_RANGE, aggroed: false,
            lastAggroAt: 0, onDeath,
        });
    }

    private makeAggroIndicator(name: string, localY: number, parent: TransformNode): Mesh {
        // Two billboard boxes forming a '!' above the HP bar
        const bar = MeshBuilder.CreateBox(`${name}Bar`, { width: 0.12, height: 0.3, depth: 0.12 }, this.scene);
        bar.position.y = localY + 0.15; bar.parent = parent;
        bar.material = this.aggroIndicatorMat;
        bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
        bar.isVisible = false;

        const dot = MeshBuilder.CreateBox(`${name}Dot`, { width: 0.12, height: 0.12, depth: 0.12 }, this.scene);
        dot.position.y = localY - 0.12; dot.parent = parent;
        dot.material = this.aggroIndicatorMat;
        dot.billboardMode = Mesh.BILLBOARDMODE_ALL;
        dot.isVisible = false;

        // Return the bar as the "handle" — store dot in extraMeshes via caller is impractical,
        // so attach dot as metadata on bar for joint disposal
        (bar as any)._aggroDot = dot;
        return bar;
    }

    kill(en: Enemy): void {
        this.onKill?.(en);
        const deathPos = new Vector3(en.root.position.x, 0, en.root.position.z);
        const onDeath  = en.onDeath;
        en.eb.dispose(); en.eh.dispose();
        en.hpBg.dispose(); en.hpBar.dispose();
        en.burnIndicator.dispose();
        const dot = (en.aggroIndicator as any)._aggroDot as Mesh | undefined;
        dot?.dispose(); en.aggroIndicator.dispose();
        for (const m of en.extraMeshes) m.dispose();
        en.root.dispose();
        onDeath?.(deathPos);
    }

    private setAggroVisible(en: Enemy, visible: boolean): void {
        en.aggroIndicator.isVisible = visible;
        const dot = (en.aggroIndicator as any)._aggroDot as Mesh | undefined;
        if (dot) dot.isVisible = visible;
    }

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

            // Fire DoT tick
            const burning = now < en.burnEnd;
            en.burnIndicator.isVisible = burning;
            if (burning && now - en.lastBurnTick >= FIRE_BURN_INTERVAL) {
                en.lastBurnTick = now;
                en.hp -= en.burnDamage;
                en.hpBar.scaling.x = Math.max(0, en.hp / en.maxHp);
                if (en.hp <= 0) { this.kill(en); continue; }
            }

            // Regen HP tick
            if (en.regenRate > 0 && en.hp < en.maxHp && now - en.lastRegen >= REGEN_TICK_INTERVAL) {
                en.lastRegen = now;
                en.hp = Math.min(en.maxHp, en.hp + Math.round(en.regenRate * REGEN_TICK_INTERVAL / 1000));
                en.hpBar.scaling.x = en.hp / en.maxHp;
            }

            if (en.type === 'flyer') {
                this.updateFlyer(en, playerPos, now, onHitPlayer);
            } else {
                this.updateGroundEnemy(en, playerPos, now, onHitPlayer);
            }

            // Aggro indicator: show for 1.5 s after first noticing the player
            this.setAggroVisible(en, en.lastAggroAt > 0 && now - en.lastAggroAt < 1500);
        }

        this.updateFlyerProjectiles(playerPos, now, onHitPlayer);
    }

    private updateGroundEnemy(en: Enemy, playerPos: Vector3, now: number, onHitPlayer: (dmg: number) => void): void {
        const meleeInterval  = en.isBoss ? BOSS_MELEE_INTERVAL : ENEMY_MELEE_INTERVAL;
        const effectiveRange = en.isBoss ? ENEMY_MELEE_RANGE * BOSS_SCALE : ENEMY_MELEE_RANGE;
        const speed = now < en.slowEnd ? en.speed * en.slowFactor : en.speed;

        const toPlayer = playerPos.subtract(en.root.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();

        // Aggro / leash: aggro at aggroRange, leash at aggroRange * 1.5
        if (en.aggroRange > 0) {
            if (dist <= en.aggroRange && !en.aggroed) {
                en.aggroed = true;
                en.lastAggroAt = now;
            }
            if (dist > en.aggroRange * 1.5) en.aggroed = false;

            if (!en.aggroed) {
                const toHome = en.homePos.subtract(en.root.position);
                toHome.y = 0;
                if (toHome.length() > 0.5) {
                    const step = toHome.normalize().scaleInPlace(speed * 1.5);
                    en.root.position.addInPlace(step);
                    en.root.rotation.y = Math.atan2(step.x, step.z);
                }
                en.root.position.y = getTerrainHeight(en.root.position.x, en.root.position.z);
                return;
            }
        }

        if (dist > effectiveRange) {
            const step = toPlayer.normalize().scaleInPlace(speed);
            en.root.position.addInPlace(step);
            en.root.rotation.y = Math.atan2(step.x, step.z);
        } else {
            if (now - en.lastMelee > meleeInterval) {
                en.lastMelee = now;
                onHitPlayer(en.meleeDamage);
            }
        }
        en.root.position.y = getTerrainHeight(en.root.position.x, en.root.position.z);
    }

    private updateFlyer(en: Enemy, playerPos: Vector3, now: number, onHitPlayer: (dmg: number) => void): void {
        // Hover at fixed height above terrain
        en.root.position.y = getTerrainHeight(en.root.position.x, en.root.position.z) + FLYER_HEIGHT;

        // Horizontal distance maintenance
        const toPlayer = playerPos.subtract(en.root.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        const speed = now < en.slowEnd ? en.speed * en.slowFactor : en.speed;

        // Aggro / leash (horizontal)
        if (en.aggroRange > 0) {
            if (dist <= en.aggroRange && !en.aggroed) {
                en.aggroed = true;
                en.lastAggroAt = now;
            }
            if (dist > en.aggroRange * 1.5) en.aggroed = false;

            if (!en.aggroed) {
                const toHome = new Vector3(en.homePos.x - en.root.position.x, 0, en.homePos.z - en.root.position.z);
                if (toHome.length() > 0.5) {
                    const step = toHome.normalize().scaleInPlace(speed * 1.5);
                    en.root.position.addInPlace(step);
                }
                return;
            }
        }

        if (dist < FLYER_MIN_DIST) {
            // Back away from player
            const step = toPlayer.normalize().scaleInPlace(-speed);
            en.root.position.addInPlace(step);
            en.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z); // still face player
        } else if (dist > FLYER_MAX_DIST) {
            // Close in on player
            const step = toPlayer.normalize().scaleInPlace(speed);
            en.root.position.addInPlace(step);
            en.root.rotation.y = Math.atan2(step.x, step.z);
        }

        // Shoot only when close enough
        if (dist <= FLYER_SHOOT_RANGE && now - en.lastShot >= FLYER_SHOT_INTERVAL) {
            en.lastShot = now;
            this.spawnFlyerProjectile(en.root.position, playerPos);
        }
    }

    private spawnFlyerProjectile(flyerPos: Vector3, playerPos: Vector3): void {
        const id = this.flyerProjectiles.length;
        const mesh = MeshBuilder.CreateSphere(`flyProj${id}`, { diameter: 0.35, segments: 5 }, this.scene);
        mesh.position = flyerPos.clone();
        mesh.material = this.flyerProjMat;

        const dir = playerPos.subtract(flyerPos).normalize();
        this.flyerProjectiles.push({
            mesh,
            vel: dir.scaleInPlace(FLYER_PROJECTILE_SPEED),
            spawnTime: Date.now(),
        });
    }

    private updateFlyerProjectiles(playerPos: Vector3, now: number, onHitPlayer: (dmg: number) => void): void {
        // Player center is roughly 1 unit above root
        const playerCenter = new Vector3(playerPos.x, playerPos.y + 1, playerPos.z);

        for (let i = this.flyerProjectiles.length - 1; i >= 0; i--) {
            const p = this.flyerProjectiles[i];

            if (now - p.spawnTime > FLYER_PROJECTILE_LIFETIME || p.mesh.position.y < -1) {
                p.mesh.dispose();
                this.flyerProjectiles.splice(i, 1);
                continue;
            }

            p.mesh.position.addInPlace(p.vel);

            if (Vector3.Distance(p.mesh.position, playerCenter) < FLYER_HIT_RADIUS) {
                onHitPlayer(FLYER_PROJECTILE_DAMAGE);
                p.mesh.dispose();
                this.flyerProjectiles.splice(i, 1);
            }
        }
    }
}
