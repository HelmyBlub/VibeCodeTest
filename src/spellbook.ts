import {
    Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { BOSS_PICKUP_RANGE } from './constants';

export class SpellbookPickup {
    private readonly mesh: Mesh;
    private readonly light: PointLight;
    private readonly spawnTime: number;

    constructor(scene: Scene, position: Vector3) {
        this.spawnTime = Date.now();

        const mat = new StandardMaterial('spellbookMat', scene);
        mat.diffuseColor  = new Color3(0.8, 0.2, 1.0);
        mat.emissiveColor = new Color3(0.35, 0.05, 0.55);

        this.mesh = MeshBuilder.CreateBox('spellbook', { width: 0.55, height: 0.75, depth: 0.1 }, scene);
        this.mesh.position = new Vector3(position.x, 1.0, position.z);
        this.mesh.material = mat;

        this.light = new PointLight('spellbookLight', new Vector3(0, 0, 0), scene);
        this.light.diffuse    = new Color3(0.7, 0.3, 1.0);
        this.light.intensity  = 1.2;
        this.light.range      = 6;
        this.light.parent     = this.mesh;
    }

    // Returns true when player is close enough to pick up
    update(playerPos: Vector3): boolean {
        const t = (Date.now() - this.spawnTime) / 1000;
        this.mesh.position.y = 1.0 + Math.sin(t * 2.5) * 0.2;
        this.mesh.rotation.y = t * 1.2;

        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        return Math.sqrt(dx * dx + dz * dz) < BOSS_PICKUP_RANGE;
    }

    dispose(): void {
        this.mesh.dispose();
        this.light.dispose();
    }
}
