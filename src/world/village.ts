import {
    Color3, MeshBuilder, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { getTerrainHeight } from './terrain';

export interface HouseCollider {
    x: number; z: number; halfW: number; halfD: number;
}

// Axis-aligned bounding boxes for house wall collision (matches the box meshes in buildHouse)
export const HOUSE_COLLIDERS: HouseCollider[] = [
    { x: 5,   z: -8,  halfW: 4.2, halfD: 3.2 },  // Inn
    { x: 14,  z: 4,   halfW: 2.7, halfD: 2.4 },  // House east
    { x: -10, z: -5,  halfW: 2.9, halfD: 2.6 },  // House west
    { x: -4,  z: 12,  halfW: 2.2, halfD: 2.2 },  // Cottage north
    { x: 16,  z: -14, halfW: 2.4, halfD: 2.2 },  // Cottage SE
    { x: -14, z: 8,   halfW: 1.9, halfD: 1.9 },  // Shed NW
];

interface HouseConfig {
    x: number; z: number;
    w: number; h: number; d: number;
    wallColor: Color3;
    roofColor: Color3;
    rotY?: number;
}

export function buildVillage(scene: Scene): void {
    const houses: HouseConfig[] = [
        // Inn — large central building
        { x: 5,   z: -8,  w: 8,   h: 4.5, d: 6,   wallColor: new Color3(0.85, 0.78, 0.62), roofColor: new Color3(0.45, 0.20, 0.10) },
        // House east
        { x: 14,  z: 4,   w: 5,   h: 3.2, d: 4.5, wallColor: new Color3(0.80, 0.73, 0.58), roofColor: new Color3(0.35, 0.15, 0.08) },
        // House west
        { x: -10, z: -5,  w: 5.5, h: 3.5, d: 5,   wallColor: new Color3(0.88, 0.82, 0.68), roofColor: new Color3(0.30, 0.18, 0.10) },
        // Cottage north
        { x: -4,  z: 12,  w: 4,   h: 3.0, d: 4,   wallColor: new Color3(0.83, 0.76, 0.60), roofColor: new Color3(0.22, 0.35, 0.12), rotY: 0.3 },
        // Cottage SE
        { x: 16,  z: -14, w: 4.5, h: 3.0, d: 4,   wallColor: new Color3(0.78, 0.72, 0.58), roofColor: new Color3(0.40, 0.18, 0.08) },
        // Storage shed NW
        { x: -14, z: 8,   w: 3.5, h: 2.8, d: 3.5, wallColor: new Color3(0.65, 0.55, 0.42), roofColor: new Color3(0.22, 0.22, 0.22), rotY: 0.5 },
    ];

    houses.forEach((cfg, i) => buildHouse(scene, cfg, i));
    buildWell(scene);
    buildPathStones(scene);
    buildFenceLine(scene);
}

function buildHouse(scene: Scene, cfg: HouseConfig, idx: number): void {
    const y = getTerrainHeight(cfg.x, cfg.z);

    const wallMat = new StandardMaterial(`wallMat${idx}`, scene);
    wallMat.diffuseColor = cfg.wallColor;
    wallMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const body = MeshBuilder.CreateBox(`house${idx}`, {
        width: cfg.w, height: cfg.h, depth: cfg.d,
    }, scene);
    body.position = new Vector3(cfg.x, y + cfg.h / 2, cfg.z);
    body.rotation.y = cfg.rotY ?? 0;
    body.material = wallMat;

    // 4-sided pyramid roof via tapered cylinder
    const roofMat = new StandardMaterial(`roofMat${idx}`, scene);
    roofMat.diffuseColor = cfg.roofColor;
    roofMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const roofSpan = Math.max(cfg.w, cfg.d) + 0.8;
    const roof = MeshBuilder.CreateCylinder(`roof${idx}`, {
        diameterBottom: roofSpan * 1.42,
        diameterTop: 0.15,
        height: cfg.h * 0.65,
        tessellation: 4,
    }, scene);
    roof.position = new Vector3(cfg.x, y + cfg.h + cfg.h * 0.32, cfg.z);
    roof.rotation.y = (cfg.rotY ?? 0) + Math.PI / 4;
    roof.material = roofMat;
}

function buildWell(scene: Scene): void {
    const y = getTerrainHeight(2, 2);

    const stoneMat = new StandardMaterial('wellStoneMat', scene);
    stoneMat.diffuseColor = new Color3(0.55, 0.52, 0.48);
    stoneMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const base = MeshBuilder.CreateCylinder('wellBase', {
        diameter: 2.2, height: 0.4, tessellation: 12,
    }, scene);
    base.position = new Vector3(2, y + 0.2, 2);
    base.material = stoneMat;

    const wall = MeshBuilder.CreateCylinder('wellWall', {
        diameter: 1.8, height: 1.0, tessellation: 12,
    }, scene);
    wall.position = new Vector3(2, y + 0.9, 2);
    wall.material = stoneMat;

    // Dark water surface inside the well
    const waterMat = new StandardMaterial('wellWaterMat', scene);
    waterMat.diffuseColor = new Color3(0.05, 0.12, 0.22);
    waterMat.specularColor = new Color3(0.2, 0.3, 0.4);
    const water = MeshBuilder.CreateDisc('wellWater', { radius: 0.75, tessellation: 12 }, scene);
    water.rotation.x = Math.PI / 2;
    water.position = new Vector3(2, y + 0.42, 2);
    water.material = waterMat;

    const postMat = new StandardMaterial('wellPostMat', scene);
    postMat.diffuseColor = new Color3(0.35, 0.22, 0.10);

    for (const side of [-1, 1]) {
        const post = MeshBuilder.CreateBox(`wellPost${side}`, {
            width: 0.18, height: 1.6, depth: 0.18,
        }, scene);
        post.position = new Vector3(2 + side * 0.8, y + 1.4 + 0.8, 2);
        post.material = postMat;
    }

    const beam = MeshBuilder.CreateBox('wellBeam', { width: 1.8, height: 0.18, depth: 0.18 }, scene);
    beam.position = new Vector3(2, y + 3.1, 2);
    beam.material = postMat;
}

function buildPathStones(scene: Scene): void {
    const pathMat = new StandardMaterial('pathMat', scene);
    pathMat.diffuseColor = new Color3(0.60, 0.57, 0.50);
    pathMat.specularColor = new Color3(0, 0, 0);

    // Stone path leading north from village toward exit gate
    for (let zPos = 20; zPos <= 113; zPos += 5) {
        const xOff = Math.sin(zPos * 0.68) * 1.8;
        const y = getTerrainHeight(xOff, zPos);
        const stone = MeshBuilder.CreateBox(`pathStone${zPos}`, {
            width: 2.6 + Math.sin(zPos * 1.3) * 0.4,
            height: 0.12,
            depth: 3.8,
        }, scene);
        stone.position = new Vector3(xOff, y + 0.06, zPos);
        stone.rotation.y = Math.sin(zPos * 0.4) * 0.12;
        stone.material = pathMat;
    }
}

function buildFenceLine(scene: Scene): void {
    const fenceMat = new StandardMaterial('fenceMat', scene);
    fenceMat.diffuseColor = new Color3(0.52, 0.38, 0.20);

    // Partial fence along the south edge of the Inn
    const postXs = [-22, -18, -14, -10, -6, -2, 2, 6, 10, 14, 18, 22];
    const fenceZ = -20;
    postXs.forEach((px, i) => {
        const y = getTerrainHeight(px, fenceZ);
        const post = MeshBuilder.CreateBox(`fPost${i}`, { width: 0.22, height: 1.4, depth: 0.22 }, scene);
        post.position = new Vector3(px, y + 0.7, fenceZ);
        post.material = fenceMat;

        if (i < postXs.length - 1) {
            const nextX = postXs[i + 1];
            const mid = (px + nextX) / 2;
            const ym = getTerrainHeight(mid, fenceZ);
            const rail = MeshBuilder.CreateBox(`fRail${i}`, {
                width: Math.abs(nextX - px) + 0.05,
                height: 0.12,
                depth: 0.12,
            }, scene);
            rail.position = new Vector3(mid, ym + 1.0, fenceZ);
            rail.material = fenceMat;
        }
    });
}
