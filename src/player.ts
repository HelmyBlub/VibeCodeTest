import {
    Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { BOUNDARY, GRAVITY, JUMP_FORCE, MOVE_SPEED, PLAYER_MAX_HP } from './constants';
import { HUD } from './hud';

export class Player {
    readonly root: TransformNode;
    hp = PLAYER_MAX_HP;
    alive = true;

    private velocityY = 0;
    private onGround = true;

    constructor(scene: Scene, private readonly hud: HUD) {
        this.root = new TransformNode('player', scene);
        this.root.position = Vector3.Zero();

        const bodyMat = new StandardMaterial('playerBodyMat', scene);
        bodyMat.diffuseColor = new Color3(0.15, 0.35, 0.75);
        const body = MeshBuilder.CreateCapsule('playerBody', { height: 1.6, radius: 0.3, tessellation: 12 }, scene);
        body.position.y = 0.8;
        body.parent = this.root;
        body.material = bodyMat;

        const headMat = new StandardMaterial('playerHeadMat', scene);
        headMat.diffuseColor = new Color3(0.9, 0.75, 0.6);
        const head = MeshBuilder.CreateSphere('playerHead', { diameter: 0.45, segments: 8 }, scene);
        head.position.y = 1.85;
        head.parent = this.root;
        head.material = headMat;
    }

    get position(): Vector3 {
        return this.root.position;
    }

    takeDamage(amount: number): void {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hud.updateHP(this.hp);
        if (this.hp <= 0) {
            this.alive = false;
            this.hud.showGameOver();
        }
    }

    update(keys: Record<string, boolean>, forward: Vector3, right: Vector3): void {
        if (this.alive) {
            const move = Vector3.Zero();
            if (keys['w'] || keys['arrowup'])    move.addInPlace(forward);
            if (keys['s'] || keys['arrowdown'])  move.subtractInPlace(forward);
            if (keys['a'] || keys['arrowleft'])  move.subtractInPlace(right);
            if (keys['d'] || keys['arrowright']) move.addInPlace(right);

            if (move.length() > 0.01) {
                move.normalize().scaleInPlace(MOVE_SPEED);
                const next = this.root.position.add(move);
                next.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, next.x));
                next.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, next.z));
                this.root.position.copyFrom(next);
                this.root.rotation.y = Math.atan2(move.x, move.z);
            }

            if (keys[' '] && this.onGround) {
                this.velocityY = JUMP_FORCE;
                this.onGround = false;
            }
        }

        this.velocityY += GRAVITY;
        this.root.position.y += this.velocityY;
        if (this.root.position.y <= 0) {
            this.root.position.y = 0;
            this.velocityY = 0;
            this.onGround = true;
        }
    }
}
