import {
    Color3, Color4, DirectionalLight, HemisphericLight,
    MeshBuilder, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';

export function buildEnvironment(scene: Scene): void {
    scene.clearColor = new Color4(0.45, 0.65, 0.9, 1);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.7;
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
    sun.intensity = 0.5;
    sun.position = new Vector3(30, 50, 30);

    const ground = MeshBuilder.CreateGround('ground', { width: 100, height: 100 }, scene);
    const groundMat = new StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new Color3(0.25, 0.55, 0.15);
    groundMat.specularColor = new Color3(0, 0, 0);
    ground.material = groundMat;

    const foliageMat = new StandardMaterial('foliageMat', scene);
    foliageMat.diffuseColor = new Color3(0.1, 0.4, 0.1);
    const trunkMat = new StandardMaterial('trunkMat', scene);
    trunkMat.diffuseColor = new Color3(0.4, 0.25, 0.1);

    const treePositions: [number, number][] = [
        [8, 8], [-10, 5], [5, -12], [-7, -9],
        [15, -3], [-14, 12], [12, 15], [-5, 18],
    ];
    treePositions.forEach(([x, z], i) => {
        const trunk = MeshBuilder.CreateCylinder(`trunk${i}`, { height: 2, diameterTop: 0.3, diameterBottom: 0.45 }, scene);
        trunk.position = new Vector3(x, 1, z);
        trunk.material = trunkMat;
        const foliage = MeshBuilder.CreateSphere(`foliage${i}`, { diameter: 3, segments: 6 }, scene);
        foliage.position = new Vector3(x, 3.6, z);
        foliage.scaling.y = 1.2;
        foliage.material = foliageMat;
    });

    const rockMat = new StandardMaterial('rockMat', scene);
    rockMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    const rockPositions: [number, number][] = [[3, 6], [-4, -3], [10, -8], [-12, -6]];
    rockPositions.forEach(([x, z], i) => {
        const rock = MeshBuilder.CreateSphere(`rock${i}`, { diameter: 1.2, segments: 5 }, scene);
        rock.position = new Vector3(x, 0.4, z);
        rock.scaling = new Vector3(1, 0.65, 1.3);
        rock.material = rockMat;
    });
}
