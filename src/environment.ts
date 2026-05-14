import {
    Color4, DirectionalLight, HemisphericLight, Scene, Vector3,
} from '@babylonjs/core';
import { buildTerrain } from './world/terrain';
import { buildVillage } from './world/village';
import { buildPuzzleMarkers } from './world/markers';

export function buildEnvironment(scene: Scene): void {
    scene.clearColor = new Color4(0.45, 0.65, 0.9, 1);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.75;
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
    sun.intensity = 0.55;
    sun.position = new Vector3(30, 50, 30);

    buildTerrain(scene);
    buildVillage(scene);
    buildPuzzleMarkers(scene);
}
