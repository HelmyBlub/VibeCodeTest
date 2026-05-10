import {
    Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { BOSS_PICKUP_RANGE } from './constants';

// Visual tinting per unlockable content
const BOOK_COLORS: Record<string, { diffuse: Color3; emissive: Color3; light: Color3 }> = {
    fire:      { diffuse: new Color3(0.9, 0.3, 0.05), emissive: new Color3(0.6, 0.15, 0.0),  light: new Color3(1.0, 0.5, 0.1) },
    ice:       { diffuse: new Color3(0.3, 0.7, 1.0),  emissive: new Color3(0.1, 0.35, 0.6),  light: new Color3(0.4, 0.8, 1.0) },
    lightning: { diffuse: new Color3(0.9, 0.85, 0.1), emissive: new Color3(0.5, 0.45, 0.0),  light: new Color3(1.0, 1.0, 0.3) },
    heal:      { diffuse: new Color3(0.1, 0.8, 0.3),  emissive: new Color3(0.05, 0.45, 0.15),light: new Color3(0.2, 1.0, 0.4) },
    carrier:   { diffuse: new Color3(0.8, 0.2, 1.0),  emissive: new Color3(0.35, 0.05, 0.55),light: new Color3(0.7, 0.3, 1.0) },
    cloud:     { diffuse: new Color3(0.7, 0.75, 0.85),emissive: new Color3(0.3, 0.35, 0.45), light: new Color3(0.8, 0.85, 1.0) },
    castTime:  { diffuse: new Color3(0.95, 0.75, 0.1),emissive: new Color3(0.5, 0.35, 0.0),  light: new Color3(1.0, 0.85, 0.2) },
    cooldown:  { diffuse: new Color3(0.2, 0.3, 0.85), emissive: new Color3(0.08, 0.12, 0.45),light: new Color3(0.3, 0.5, 1.0) },
};

const DEFAULT_COLORS = {
    diffuse:  new Color3(0.8, 0.2, 1.0),
    emissive: new Color3(0.35, 0.05, 0.55),
    light:    new Color3(0.7, 0.3, 1.0),
};

export class SpellbookPickup {
    readonly content: string;
    private readonly mesh: Mesh;
    private readonly light: PointLight;
    private readonly spawnTime: number;

    constructor(scene: Scene, position: Vector3, content: string) {
        this.content   = content;
        this.spawnTime = Date.now();

        const colors = BOOK_COLORS[content] ?? DEFAULT_COLORS;

        const mat = new StandardMaterial(`spellbookMat_${content}`, scene);
        mat.diffuseColor  = colors.diffuse;
        mat.emissiveColor = colors.emissive;

        this.mesh = MeshBuilder.CreateBox(`spellbook_${content}`, { width: 0.55, height: 0.75, depth: 0.1 }, scene);
        this.mesh.position = new Vector3(position.x, 1.0, position.z);
        this.mesh.material = mat;

        this.light = new PointLight(`spellbookLight_${content}`, new Vector3(0, 0, 0), scene);
        this.light.diffuse   = colors.light;
        this.light.intensity = 1.2;
        this.light.range     = 6;
        this.light.parent    = this.mesh;
    }

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
