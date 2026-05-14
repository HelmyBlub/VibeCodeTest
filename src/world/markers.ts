import {
    Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { getTerrainHeight } from './terrain';

export function buildPuzzleMarkers(scene: Scene): void {
    buildIceMarker(scene);
    buildFireMarker(scene);
    buildLightningMarker(scene);
    buildExitGate(scene);
}

function makeSignMat(name: string, text: string, bgColor: string, scene: Scene): StandardMaterial {
    const dt = new DynamicTexture(`${name}Tex`, { width: 320, height: 80 }, scene);
    dt.drawText(text, null, null, 'bold 22px Arial', '#ffffff', bgColor, true);
    const mat = new StandardMaterial(`${name}Mat`, scene);
    mat.diffuseTexture = dt;
    mat.emissiveTexture = dt;
    mat.backFaceCulling = false;
    mat.specularColor = new Color3(0, 0, 0);
    return mat;
}

function buildIceMarker(scene: Scene): void {
    const x = 72; const z = 28;
    const y = getTerrainHeight(x, z);

    // Frozen pond disc
    const pondMat = new StandardMaterial('icePondMat', scene);
    pondMat.diffuseColor = new Color3(0.55, 0.75, 0.92);
    pondMat.specularColor = new Color3(0.5, 0.7, 0.9);
    pondMat.alpha = 0.82;
    const pond = MeshBuilder.CreateDisc('icePond', { radius: 10, tessellation: 32 }, scene);
    pond.rotation.x = Math.PI / 2;
    pond.position = new Vector3(x, y + 0.12, z);
    pond.material = pondMat;

    // Ice crystal pillar
    const crystalMat = new StandardMaterial('iceCrystalMat', scene);
    crystalMat.diffuseColor = new Color3(0.5, 0.82, 1.0);
    crystalMat.emissiveColor = new Color3(0.08, 0.25, 0.55);
    const crystal = MeshBuilder.CreateCylinder('iceCrystal', {
        diameterBottom: 0.9, diameterTop: 0.15, height: 2.5, tessellation: 6,
    }, scene);
    crystal.position = new Vector3(x, y + 1.25, z);
    crystal.material = crystalMat;

    // Smaller ice shards around the pillar
    const shardOffsets: [number, number][] = [[2.5, 1], [-2, 1.5], [1.5, -2.5], [-1.5, -1.5]];
    shardOffsets.forEach(([dx, dz], i) => {
        const sy = getTerrainHeight(x + dx, z + dz);
        const shard = MeshBuilder.CreateCylinder(`iceShard${i}`, {
            diameterBottom: 0.4, diameterTop: 0.05, height: 1.0 + i * 0.3, tessellation: 5,
        }, scene);
        shard.position = new Vector3(x + dx, sy + 0.5 + i * 0.15, z + dz);
        shard.rotation.z = Math.sin(i) * 0.3;
        shard.material = crystalMat;
    });

    const sign = MeshBuilder.CreatePlane('iceSign', { width: 5.5, height: 1.3 }, scene);
    sign.position = new Vector3(x, y + 4.2, z);
    sign.material = makeSignMat('iceSign', 'ICE CROSSING (puzzle)', '#1155aa', scene);
}

function buildFireMarker(scene: Scene): void {
    const x = -72; const z = 22;
    const y = getTerrainHeight(x, z);

    // Cluster of charred dead trees blocking the way
    const charMat = new StandardMaterial('charMat', scene);
    charMat.diffuseColor = new Color3(0.12, 0.09, 0.07);

    const treePosns: [number, number][] = [
        [-75, 25], [-71, 18], [-77, 16], [-69, 26], [-73, 30], [-79, 22],
    ];
    treePosns.forEach(([tx, tz], i) => {
        const ty = getTerrainHeight(tx, tz);
        const trunk = MeshBuilder.CreateCylinder(`charTrunk${i}`, {
            height: 3.5 + i * 0.4, diameterTop: 0.25, diameterBottom: 0.55,
        }, scene);
        trunk.position = new Vector3(tx, ty + (3.5 + i * 0.4) / 2, tz);
        trunk.rotation.z = Math.sin(i * 1.3) * 0.12;
        trunk.material = charMat;

        const branch = MeshBuilder.CreateCylinder(`charBranch${i}`, {
            height: 1.8, diameterTop: 0.1, diameterBottom: 0.28,
        }, scene);
        branch.position = new Vector3(tx + 0.5, ty + 3.2 + i * 0.2, tz + 0.3);
        branch.rotation.z = 0.6 + Math.sin(i) * 0.3;
        branch.rotation.y = i * 0.8;
        branch.material = charMat;
    });

    // Fire marker pillar
    const firePillarMat = new StandardMaterial('firePillarMat', scene);
    firePillarMat.diffuseColor = new Color3(0.9, 0.35, 0.05);
    firePillarMat.emissiveColor = new Color3(0.45, 0.12, 0.0);
    const pillar = MeshBuilder.CreateCylinder('firePillar', {
        diameterBottom: 0.9, diameterTop: 0.2, height: 2.5, tessellation: 6,
    }, scene);
    pillar.position = new Vector3(x + 4, y + 1.25, z - 2);
    pillar.material = firePillarMat;

    const sign = MeshBuilder.CreatePlane('fireSign', { width: 6, height: 1.3 }, scene);
    sign.position = new Vector3(x + 4, y + 4.2, z - 2);
    sign.material = makeSignMat('fireSign', 'BURN THE TREES (puzzle)', '#881800', scene);
}

function buildLightningMarker(scene: Scene): void {
    const x = 22; const z = 82;
    const y = getTerrainHeight(x, z);

    // Broken machinery — dark box with metal details
    const machineMat = new StandardMaterial('machineMat', scene);
    machineMat.diffuseColor = new Color3(0.28, 0.26, 0.24);
    machineMat.specularColor = new Color3(0.3, 0.3, 0.3);
    const machine = MeshBuilder.CreateBox('machine', { width: 3.2, height: 1.5, depth: 2.2 }, scene);
    machine.position = new Vector3(x, y + 0.75, z);
    machine.material = machineMat;

    // Metal accent band
    const metalMat = new StandardMaterial('metalMat', scene);
    metalMat.diffuseColor = new Color3(0.55, 0.50, 0.40);
    metalMat.specularColor = new Color3(0.5, 0.5, 0.4);
    const band = MeshBuilder.CreateBox('machineBand', { width: 3.3, height: 0.25, depth: 2.3 }, scene);
    band.position = new Vector3(x, y + 1.25, z);
    band.material = metalMat;

    // Lightning rod on top
    const rodMat = new StandardMaterial('rodMat', scene);
    rodMat.diffuseColor = new Color3(0.6, 0.55, 0.35);
    const rod = MeshBuilder.CreateCylinder('lightningRod', {
        diameterBottom: 0.18, diameterTop: 0.05, height: 2.0, tessellation: 6,
    }, scene);
    rod.position = new Vector3(x + 0.5, y + 2.5, z);
    rod.material = rodMat;

    // Glowing lightning pillar nearby
    const lightningMat = new StandardMaterial('lightningPillarMat', scene);
    lightningMat.diffuseColor = new Color3(0.9, 0.9, 0.2);
    lightningMat.emissiveColor = new Color3(0.35, 0.35, 0.0);
    const pillar = MeshBuilder.CreateCylinder('lightningPillar', {
        diameterBottom: 0.9, diameterTop: 0.2, height: 2.5, tessellation: 6,
    }, scene);
    pillar.position = new Vector3(x - 4, y + 1.25, z);
    pillar.material = lightningMat;

    const sign = MeshBuilder.CreatePlane('lightningSign', { width: 6.5, height: 1.3 }, scene);
    sign.position = new Vector3(x - 4, y + 4.2, z);
    sign.material = makeSignMat('lightningSign', 'ACTIVATE MOTOR (puzzle)', '#554400', scene);
}

function buildExitGate(scene: Scene): void {
    const x = 0; const z = 118;
    const y = getTerrainHeight(x, z);

    const stoneMat = new StandardMaterial('gateStoneMat', scene);
    stoneMat.diffuseColor = new Color3(0.48, 0.44, 0.40);
    stoneMat.specularColor = new Color3(0.08, 0.08, 0.08);

    // Two large gate pillars
    for (const side of [-5.5, 5.5]) {
        const pillar = MeshBuilder.CreateBox(`gatePillar${side}`, {
            width: 1.6, height: 7, depth: 1.6,
        }, scene);
        pillar.position = new Vector3(x + side, y + 3.5, z);
        pillar.material = stoneMat;

        const cap = MeshBuilder.CreateBox(`gateCap${side}`, {
            width: 2.2, height: 0.55, depth: 2.2,
        }, scene);
        cap.position = new Vector3(x + side, y + 7.3, z);
        cap.material = stoneMat;
    }

    // Crossbar connecting the pillars
    const bar = MeshBuilder.CreateBox('gateBar', { width: 9.5, height: 0.55, depth: 0.8 }, scene);
    bar.position = new Vector3(x, y + 6.5, z);
    bar.material = stoneMat;

    // Red energy barrier
    const barrierMat = new StandardMaterial('barrierMat', scene);
    barrierMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
    barrierMat.emissiveColor = new Color3(0.55, 0.04, 0.04);
    barrierMat.alpha = 0.55;
    barrierMat.backFaceCulling = false;
    const barrier = MeshBuilder.CreatePlane('exitBarrier', { width: 9.5, height: 5.5 }, scene);
    barrier.position = new Vector3(x, y + 3.2, z);
    barrier.material = barrierMat;

    // Sign above gate
    const sign = MeshBuilder.CreatePlane('exitSign', { width: 6.5, height: 1.3 }, scene);
    sign.position = new Vector3(x, y + 8.2, z);
    sign.material = makeSignMat('exitSign', 'BLOCKED - defeat the guardian', '#550000', scene);
}
