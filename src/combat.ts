import {
    Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import {
    ENEMY_MAX_HP,
    FIRE_BURN_DURATION, FIRE_GRAVITY, FIRE_MAX_DURATION, FIRE_MIN_DURATION,
    FIRE_SPEED, FIREBALL_HIT_RADIUS, GROUND_Y,
    ICE_DRAG, ICE_FALL_RATE, ICE_MAX_DURATION, ICE_MAX_FALL_SPEED, ICE_MAX_SLOW, ICE_MIN_SLOW,
    ICE_SLOW_DURATION, ICE_SPEED,
    LIGHTNING_BASE_RANGE, LIGHTNING_CHAIN_MULT, LIGHTNING_CHAIN_RANGE,
    LIGHTNING_MAX_CHAINS, LIGHTNING_RANGE_POWER, LIGHTNING_SPEED,
    STAGE_CARRIER_SPEED,
} from './constants';
import type {
    Enemy, Fireball, ProjectileConfig, Spell, SpellElement,
    SpellStage, StageElement,
} from './types';

// ── Element colours ───────────────────────────────────────────────────────────

const ELEMENT_COLOR: Record<SpellElement, [Color3, Color3]> = {
    fire:      [new Color3(1, 0.4, 0),    new Color3(1, 0.3, 0)],
    ice:       [new Color3(0, 0.6, 1),    new Color3(0, 0.8, 1)],
    lightning: [new Color3(1, 0.85, 0.1), new Color3(1, 0.9, 0.2)],
};

const STAGE_COLOR: Record<StageElement, [Color3, Color3]> = {
    fire:      ELEMENT_COLOR.fire,
    ice:       ELEMENT_COLOR.ice,
    lightning: ELEMENT_COLOR.lightning,
    carrier:   [new Color3(0.6, 0.6, 0.85), new Color3(0.4, 0.4, 0.65)],
    cloud:     [new Color3(0.4, 0.7,  0.90), new Color3(0.3, 0.5, 0.70)],
};

// ── Internal types ────────────────────────────────────────────────────────────

interface ChainFlash { mesh: Mesh; light: PointLight; life: number; }

interface LiveStage {
    config:     SpellStage;   // children embedded in config.children
    mesh:       Mesh;
    light:      PointLight;
    mat:        StandardMaterial;
    vel:        Vector3;
    spawnTime:  number;
    lastFire:   number;
    fired:      boolean;
    fireCount:  number;   // cloud: how many interval ticks have fired
    hitEnemies: Set<Enemy>;
    grounded:   boolean;
    spawnPos:   Vector3;  // lightning: range check origin
    maxRange:   number;   // lightning: dispose distance
    initDir:    Vector3;  // world-space direction at spawn, used as forward reference for children
}

// ── CombatSystem ──────────────────────────────────────────────────────────────

export class CombatSystem {
    private readonly projectiles: Fireball[]  = [];
    private readonly liveStages:  LiveStage[] = [];
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

    // ── Salvo (simple) casting ────────────────────────────────────────────────

    castSpell(playerPos: Vector3, playerForward: Vector3, spell: Spell): void {
        const right   = Vector3.Cross(Vector3.Up(), playerForward).normalize();
        const basePos = playerPos.add(new Vector3(0, 1.2, 0));

        for (const pc of spell.projectiles) {
            const worldOffset = right.scale(pc.right)
                .add(Vector3.Up().scale(pc.up))
                .add(playerForward.scale(pc.forward));

            const dir = this.pitchYawDir(pc.pitch, pc.yaw, playerForward, right);
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

        const now      = Date.now();
        const spawnPos = mesh.position.clone();
        const t        = pc.power / 100;

        let vel: Vector3; let maxDuration: number;
        let maxRange: number; let chainsLeft: number; let slowFactor: number;

        switch (pc.element) {
            case 'fire':
                vel         = direction.scale(FIRE_SPEED);
                maxDuration = FIRE_MIN_DURATION + t * (FIRE_MAX_DURATION - FIRE_MIN_DURATION);
                maxRange    = 0; chainsLeft = 0; slowFactor = 1;
                break;
            case 'ice':
                vel         = direction.scale(ICE_SPEED);
                maxDuration = ICE_MAX_DURATION;
                maxRange    = 0; chainsLeft = 0;
                slowFactor  = ICE_MIN_SLOW - t * (ICE_MIN_SLOW - ICE_MAX_SLOW);
                break;
            case 'lightning':
                vel         = direction.scale(LIGHTNING_SPEED);
                maxDuration = 10000;
                maxRange    = LIGHTNING_BASE_RANGE + pc.power * LIGHTNING_RANGE_POWER;
                chainsLeft  = Math.floor(t * LIGHTNING_MAX_CHAINS);
                slowFactor  = 1;
                break;
        }

        this.projectiles.push({
            mesh, light, vel,
            damage: pc.damage, element: pc.element, burnDamage: pc.burnDamage,
            spawnTime: now, maxDuration,
            grounded: false, hitEnemies: new Set(),
            spawnPos, maxRange, chainsLeft, slowFactor,
        });
    }

    private spawnChainFlash(pos: Vector3): void {
        const mesh = MeshBuilder.CreateSphere('chainFlash', { diameter: 0.55, segments: 4 }, this.scene);
        mesh.position = pos.clone();
        mesh.material = this.flashMat;
        const light = new PointLight('chainLight', pos.clone(), this.scene);
        light.diffuse = new Color3(1, 1, 0.3); light.intensity = 2.5; light.range = 7;
        this.flashes.push({ mesh, light, life: 10 });
    }

    private applyLightningChains(
        p: Fireball, primary: Enemy, enemies: Enemy[], onKill: (en: Enemy) => void,
    ): void {
        const chained = new Set<Enemy>([primary]);
        let source = primary; let remaining = p.chainsLeft;
        while (remaining > 0) {
            let nearest: Enemy | null = null; let nearestDist = LIGHTNING_CHAIN_RANGE;
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
            chained.add(nearest); source = nearest; remaining--;
        }
    }

    // ── Chain (staged) casting ────────────────────────────────────────────────

    castStagedSpell(playerPos: Vector3, playerForward: Vector3, spell: Spell): void {
        if (!spell.stages?.length) return;
        const right  = Vector3.Cross(Vector3.Up(), playerForward).normalize();
        const origin = playerPos.add(new Vector3(0, 1.2, 0));

        for (const s0 of spell.stages) {
            for (let i = 0; i < s0.count; i++) {
                const yaw = this.fanYaw(s0.yaw, s0.count, s0.yawSpread, i);
                const dir = this.pitchYawDir(s0.pitch, yaw, playerForward, right);
                const spawnPos = origin.clone();
                spawnPos.addInPlace(right.scale(s0.offsetX ?? 0));
                spawnPos.addInPlace(Vector3.Up().scale(s0.offsetY ?? 0));
                spawnPos.addInPlace(playerForward.scale(s0.offsetZ ?? 0));
                this.spawnLiveStage(spawnPos, dir, s0);
            }
        }
    }

    private spawnLiveStage(pos: Vector3, dir: Vector3, cfg: SpellStage): void {
        const [diffuse, emit] = STAGE_COLOR[cfg.element];

        const mat = new StandardMaterial(`stMat`, this.scene);
        mat.diffuseColor  = diffuse;
        mat.emissiveColor = emit;

        let mesh: Mesh;
        if (cfg.stationary) {
            mesh = MeshBuilder.CreateSphere('stArea', { diameter: 1.8, segments: 8 }, this.scene);
            mat.alpha = 0.4;
        } else {
            mesh = MeshBuilder.CreateSphere('stProj', { diameter: 0.42, segments: 6 }, this.scene);
        }
        mesh.position = pos.clone();
        mesh.material  = mat;

        const light = new PointLight('stLight', pos.clone(), this.scene);
        light.diffuse   = emit;
        light.intensity = cfg.stationary ? 0.6 : 1.5;
        light.range     = cfg.stationary ? 5 : 6;

        const vel      = cfg.stationary ? Vector3.Zero() : dir.scale(this.stageSpeed(cfg.element));
        const maxRange = cfg.element === 'lightning'
            ? LIGHTNING_BASE_RANGE + cfg.power * LIGHTNING_RANGE_POWER
            : Infinity;

        this.liveStages.push({
            config: cfg, mesh, light, mat, vel,
            spawnTime:  Date.now(),
            lastFire:   Date.now(),
            fired:      false,
            fireCount:  0,
            hitEnemies: new Set(),
            grounded:   false,
            spawnPos:   pos.clone(),
            maxRange,
            initDir:    dir.clone(),
        });
    }

    private triggerNext(ls: LiveStage): void {
        const children = ls.config.children;
        if (!children.length) return;
        const base = ls.mesh.position.clone();

        // use parent's spawn direction as forward so child pitch/yaw are parent-relative
        const fwd    = ls.initDir.clone();
        const cross  = Vector3.Cross(Vector3.Up(), fwd);
        const cross2 = Vector3.Cross(new Vector3(0, 0, 1), fwd);
        const right  = cross.length()  > 0.001 ? cross.normalize()  :
                       cross2.length() > 0.001 ? cross2.normalize() : new Vector3(-1, 0, 0);

        for (const child of children) {
            // cloud.count means tick count, not simultaneous spawns — always spawn one cloud
            const spawnCount = child.element === 'cloud' ? 1 : child.count;
            for (let i = 0; i < spawnCount; i++) {
                const spawnPos = base.clone();
                spawnPos.addInPlace(right.scale(child.offsetX ?? 0));
                spawnPos.addInPlace(Vector3.Up().scale(child.offsetY ?? 0));
                spawnPos.addInPlace(fwd.scale(child.offsetZ ?? 0));
                if (child.spread > 0) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * child.spread;
                    spawnPos.x += Math.cos(a) * r;
                    spawnPos.z += Math.sin(a) * r;
                }
                const yaw = this.fanYaw(child.yaw, child.count, child.yawSpread, i);
                const dir = this.pitchYawDir(child.pitch, yaw, fwd, right);
                this.spawnLiveStage(spawnPos, dir, child);
            }
        }
    }

    private disposeLiveStage(ls: LiveStage, idx: number): void {
        ls.mesh.dispose(); ls.light.dispose(); ls.mat.dispose();
        this.liveStages.splice(idx, 1);
    }

    private moveStage(ls: LiveStage): void {
        if (ls.config.stationary || ls.grounded) return;
        switch (ls.config.element) {
            case 'fire':
                ls.vel.y += FIRE_GRAVITY;
                break;
            case 'ice':
                ls.vel.y = Math.max(-ICE_MAX_FALL_SPEED, ls.vel.y - ICE_FALL_RATE);
                ls.vel.x *= ICE_DRAG; ls.vel.z *= ICE_DRAG;
                break;
            // lightning and none: constant velocity, no changes
        }
        ls.mesh.position.addInPlace(ls.vel);
        ls.light.position.copyFrom(ls.mesh.position);
        if (ls.mesh.position.y <= GROUND_Y) {
            ls.mesh.position.y = GROUND_Y;
            ls.vel.setAll(0);
            ls.grounded = true;
        }
    }

    private applyStageHitEffect(
        ls: LiveStage, en: Enemy, enemies: Enemy[], onKill: (e: Enemy) => void, now: number,
    ): void {
        switch (ls.config.element) {
            case 'fire':
                en.burnEnd      = now + (ls.config.burnDuration ?? FIRE_BURN_DURATION);
                en.burnDamage   = ls.config.burnDamage;
                en.lastBurnTick = now;
                break;
            case 'ice':
                en.slowEnd    = now + ICE_SLOW_DURATION;
                en.slowFactor = 1 - (ls.config.slowPercent ?? 50) / 100;
                break;
            case 'lightning': {
                const jumps = ls.config.jumpCount ?? 1;
                let source = en; let remaining = jumps;
                const chained = new Set<Enemy>([en]);
                while (remaining > 0) {
                    let nearest: Enemy | null = null; let nd = LIGHTNING_CHAIN_RANGE;
                    for (const other of enemies) {
                        if (chained.has(other) || other.hp <= 0) continue;
                        const d = Vector3.Distance(source.root.position, other.root.position);
                        if (d < nd) { nd = d; nearest = other; }
                    }
                    if (!nearest) break;
                    const cdmg = Math.round(ls.config.damage * LIGHTNING_CHAIN_MULT);
                    nearest.hp -= cdmg;
                    nearest.hpBar.scaling.x = Math.max(0, nearest.hp / ENEMY_MAX_HP);
                    if (nearest.hp <= 0) onKill(nearest);
                    this.spawnChainFlash(nearest.root.position.add(new Vector3(0, 2.5, 0)));
                    chained.add(nearest); source = nearest; remaining--;
                }
                break;
            }
            // 'none': no combat effect
        }
    }

    private updateLiveStages(enemies: Enemy[], onKill: (en: Enemy) => void): void {
        const now = Date.now();

        for (let i = this.liveStages.length - 1; i >= 0; i--) {
            const ls  = this.liveStages[i];
            const age = now - ls.spawnTime;
            const cfg = ls.config;

            this.moveStage(ls);

            if (cfg.element === 'carrier') {
                // ── Carrier: moves, fires children once, then disposes ────────
                if (cfg.trigger === 'delay' && !ls.fired && age >= cfg.triggerMs) {
                    ls.fired = true; this.triggerNext(ls);
                    this.disposeLiveStage(ls, i); continue;
                }
                if (cfg.trigger === 'impact' && ls.grounded && !ls.fired) {
                    ls.fired = true; this.triggerNext(ls);
                    this.disposeLiveStage(ls, i); continue;
                }
            } else if (cfg.element === 'cloud') {
                // ── Cloud: stationary, fires children every triggerMs for count ticks ──
                if (ls.fireCount >= cfg.count) {
                    this.disposeLiveStage(ls, i); continue;
                }
                if (now - ls.lastFire >= cfg.triggerMs) {
                    ls.lastFire = now; ls.fireCount++; this.triggerNext(ls);
                }
            } else if (!cfg.stationary) {
                // ── Elemental projectile: element-specific expiry, no chaining ─
                if (cfg.element === 'ice' && ls.grounded) {
                    this.disposeLiveStage(ls, i); continue;
                }
                if (cfg.element === 'lightning') {
                    const traveled = Vector3.Distance(ls.mesh.position, ls.spawnPos);
                    if (traveled >= ls.maxRange) { this.disposeLiveStage(ls, i); continue; }
                }
                if (cfg.element === 'fire' && ls.grounded && age >= cfg.duration) {
                    this.disposeLiveStage(ls, i); continue;
                }

                // Enemy collision
                for (const en of enemies) {
                    if (en.hp <= 0 || ls.hitEnemies.has(en)) continue;
                    const dist = Vector3.Distance(
                        ls.mesh.position,
                        en.root.position.add(new Vector3(0, 1, 0)),
                    );
                    if (dist >= FIREBALL_HIT_RADIUS) continue;

                    ls.hitEnemies.add(en);
                    en.hp -= cfg.damage;
                    en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);
                    this.applyStageHitEffect(ls, en, enemies, onKill, now);
                    if (en.hp <= 0) onKill(en);
                    // lightning stops on first hit; fire/ice pass through
                    if (cfg.element === 'lightning') { this.disposeLiveStage(ls, i); break; }
                }
            }
        }
    }

    // ── Shared helpers ────────────────────────────────────────────────────────

    private pitchYawDir(pitchDeg: number, yawDeg: number, forward: Vector3, right: Vector3): Vector3 {
        const pr = pitchDeg * Math.PI / 180;
        const yr = yawDeg   * Math.PI / 180;
        const cosP = Math.cos(pr);
        const localUp = Vector3.Cross(forward, right).normalize();
        return right.scale(Math.sin(yr) * cosP)
            .add(localUp.scale(Math.sin(pr)))
            .add(forward.scale(Math.cos(yr) * cosP))
            .normalize();
    }

    // count=1 → random within ±spread/2. count>1 → evenly fanned across spread.
    private fanYaw(base: number, count: number, spread: number, i: number): number {
        if (count === 1) return base + (Math.random() - 0.5) * spread;
        if (spread === 0) return base;
        return base + ((i / (count - 1)) - 0.5) * spread;
    }

    private stageSpeed(el: StageElement): number {
        switch (el) {
            case 'fire':      return FIRE_SPEED;
            case 'ice':       return ICE_SPEED;
            case 'lightning': return LIGHTNING_SPEED;
            case 'carrier':   return STAGE_CARRIER_SPEED;
        case 'cloud':     return 0;
        }
    }

    // ── Main update ───────────────────────────────────────────────────────────

    update(enemies: Enemy[], onKill: (en: Enemy) => void): void {
        const now = Date.now();

        // Chain flashes
        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const f = this.flashes[i];
            if (--f.life <= 0) {
                f.mesh.dispose(); f.light.dispose();
                this.flashes.splice(i, 1);
            }
        }

        // Salvo projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p   = this.projectiles[i];
            const age = now - p.spawnTime;

            switch (p.element) {
                case 'fire':
                    if (!p.grounded) {
                        p.vel.y += FIRE_GRAVITY;
                        p.mesh.position.addInPlace(p.vel);
                        if (p.mesh.position.y <= GROUND_Y) {
                            p.mesh.position.y = GROUND_Y;
                            p.vel.setAll(0); p.grounded = true;
                        }
                        p.light.position.copyFrom(p.mesh.position);
                    }
                    break;
                case 'ice':
                    p.vel.y = Math.max(-ICE_MAX_FALL_SPEED, p.vel.y - ICE_FALL_RATE);
                    p.vel.x *= ICE_DRAG; p.vel.z *= ICE_DRAG;
                    p.mesh.position.addInPlace(p.vel);
                    p.light.position.copyFrom(p.mesh.position);
                    break;
                case 'lightning':
                    p.mesh.position.addInPlace(p.vel);
                    p.light.position.copyFrom(p.mesh.position);
                    break;
            }

            const expired = age >= p.maxDuration
                || (p.element === 'ice' && p.mesh.position.y <= GROUND_Y)
                || (p.element === 'lightning' && Vector3.Distance(p.mesh.position, p.spawnPos) >= p.maxRange);

            if (expired) {
                p.mesh.dispose(); p.light.dispose();
                this.projectiles.splice(i, 1);
                continue;
            }

            if (p.grounded) {
                // Grounded fire: refresh burn on nearby enemies
                for (const en of enemies) {
                    if (en.hp <= 0) continue;
                    const dist = Vector3.Distance(p.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                    if (dist < FIREBALL_HIT_RADIUS) {
                        en.burnEnd = now + FIRE_BURN_DURATION;
                        en.burnDamage = p.burnDamage;
                    }
                }
                continue;
            }

            let consumed = false;
            for (const en of enemies) {
                if (en.hp <= 0) continue;
                const dist = Vector3.Distance(p.mesh.position, en.root.position.add(new Vector3(0, 1, 0)));
                if (dist >= FIREBALL_HIT_RADIUS) continue;

                if (p.element === 'fire') {
                    if (!p.hitEnemies.has(en)) {
                        p.hitEnemies.add(en);
                        en.hp -= p.damage;
                        en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);
                        if (en.hp <= 0) onKill(en);
                    }
                    en.burnEnd = now + FIRE_BURN_DURATION;
                    en.burnDamage = p.burnDamage;
                } else {
                    en.hp -= p.damage;
                    en.hpBar.scaling.x = Math.max(0, en.hp / ENEMY_MAX_HP);
                    if (p.element === 'ice') {
                        en.slowEnd = now + ICE_SLOW_DURATION;
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
                p.mesh.dispose(); p.light.dispose();
                this.projectiles.splice(i, 1);
            }
        }

        this.updateLiveStages(enemies, onKill);
    }
}
