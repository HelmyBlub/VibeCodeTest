import {
    Color3, MeshBuilder, Scene, StandardMaterial,
    Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';

export function getTerrainHeight(x: number, z: number): number {
    const r = Math.sqrt(x * x + z * z);

    // Mountain ring surrounding the area
    const ringInner = 100;
    const ringOuter = 182;
    let mountH = 0;
    if (r > ringInner) {
        const t = Math.min(1, (r - ringInner) / (ringOuter - ringInner));
        mountH = t * t * t * 30;
    }

    // North exit gap (z+ direction): atan2(x,z)=0 means due north
    const angle = Math.abs(Math.atan2(x, z));
    if (r > ringInner && angle < 0.45) {
        const blend = Math.max(0, 1 - angle / 0.45);
        mountH *= 1 - blend * blend * blend;
    }

    // Interior rolling hills, decay near mountain ring
    const hillDecay = Math.max(0, 1 - Math.pow(r / 92, 3));
    // Flatten the village area around (3, -3)
    const vr = Math.sqrt((x - 3) * (x - 3) + (z + 3) * (z + 3));
    const vFlat = Math.max(0, 1 - Math.pow(vr / 25, 2));

    const hills = (
        Math.sin(x * 0.09 + 0.5)  * Math.cos(z * 0.07 - 0.3)  * 3.5 +
        Math.sin(x * 0.14 - 1.1)  * Math.cos(z * 0.12 + 0.7)  * 2.0 +
        Math.sin(x * 0.06 + 2.3)  * Math.cos(z * 0.05 - 1.5)  * 4.5 +
        Math.sin(x * 0.21 - 0.8)  * Math.cos(z * 0.19 + 1.2)  * 1.0
    ) * hillDecay * (1 - vFlat);

    return Math.max(0, mountH + Math.max(0, hills));
}

export function buildTerrain(scene: Scene): void {
    const SIZE = 370;
    const SUBS = 180;

    const ground = MeshBuilder.CreateGround('terrain', {
        width: SIZE, height: SIZE, subdivisions: SUBS, updatable: true,
    }, scene);

    const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] = getTerrainHeight(positions[i], positions[i + 2]);
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);

    const normals: number[] = [];
    VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
    ground.refreshBoundingInfo();

    const mat = new StandardMaterial('terrainMat', scene);
    mat.diffuseColor = new Color3(0.25, 0.52, 0.18);
    mat.specularColor = new Color3(0, 0, 0);
    ground.material = mat;

    placeTrees(scene);
    placeRocks(scene);
}

function placeTrees(scene: Scene): void {
    const foliageMat = new StandardMaterial('foliageMat', scene);
    foliageMat.diffuseColor = new Color3(0.1, 0.4, 0.1);
    const trunkMat = new StandardMaterial('trunkMat', scene);
    trunkMat.diffuseColor = new Color3(0.4, 0.25, 0.1);

    const positions: [number, number][] = [
        // Village perimeter
        [22, 5], [-18, 12], [15, -22], [-24, -8], [28, -18], [-20, 22], [25, 25], [-28, -20],
        // Mid-range hills
        [42, 18], [-40, 30], [34, -52], [-55, -14], [58, -30], [-44, 54],
        [38, 65], [-62, 42], [65, 48], [-32, -68], [50, -64], [-70, -30],
        [48, -40], [-38, -48], [62, 22], [-50, 12], [40, 58], [-65, 24],
        // Mountain foothills (larger radius)
        [78, 32], [-80, 22], [50, 85], [-45, 82], [82, -45], [-72, -58],
        [35, -85], [-32, 88], [80, 62], [-62, -75], [90, 12], [-85, -18],
        [55, 92], [-48, -90], [28, -95], [65, -80],
        // Flanking the north path
        [20, 60], [-18, 65], [10, 75], [-22, 52], [24, 52],
        [15, 88], [-12, 90], [28, 80], [-30, 78],
    ];

    positions.forEach(([x, z], i) => {
        const r = Math.sqrt(x * x + z * z);
        if (r > 99) return;
        const vr = Math.sqrt((x - 3) * (x - 3) + (z + 3) * (z + 3));
        if (vr < 20) return;

        const y = getTerrainHeight(x, z);
        const trunk = MeshBuilder.CreateCylinder(`trunk${i}`, {
            height: 2.2, diameterTop: 0.3, diameterBottom: 0.5,
        }, scene);
        trunk.position = new Vector3(x, y + 1.1, z);
        trunk.material = trunkMat;

        const foliage = MeshBuilder.CreateSphere(`foliage${i}`, { diameter: 3.2, segments: 6 }, scene);
        foliage.position = new Vector3(x, y + 3.8, z);
        foliage.scaling.y = 1.2;
        foliage.material = foliageMat;
    });
}

function placeRocks(scene: Scene): void {
    const rockMat = new StandardMaterial('rockMat', scene);
    rockMat.diffuseColor = new Color3(0.50, 0.48, 0.44);
    rockMat.specularColor = new Color3(0.08, 0.08, 0.08);

    const mtnRockMat = new StandardMaterial('mtnRockMat', scene);
    mtnRockMat.diffuseColor = new Color3(0.40, 0.38, 0.35);
    mtnRockMat.specularColor = new Color3(0.05, 0.05, 0.05);

    // [x, z, scale]
    const rocks: [number, number, number][] = [
        [8, 12, 0.7], [-10, -14, 0.9], [18, -6, 0.6], [-16, 8, 1.0],
        [44, -18, 1.1], [-40, 48, 0.85], [28, 78, 0.9], [-58, -38, 1.2],
        [38, 38, 0.8], [-48, -55, 1.0], [64, 12, 1.3], [-24, -40, 0.75],
        [52, 60, 0.9], [-62, 30, 1.1], [30, -78, 0.95], [-35, 65, 0.8],
        // Mountain ring rocks (larger)
        [105, 22, 2.5], [-108, 30, 3.0], [65, 100, 2.8], [-58, 98, 2.2],
        [110, -42, 2.6], [-95, -55, 3.2], [48, -105, 2.4], [-42, 108, 2.7],
        [95, 68, 2.9], [-108, 14, 2.3], [28, 110, 2.5], [82, -82, 3.0],
        [115, 48, 3.5], [-112, -38, 2.8], [60, -108, 3.1], [-72, 102, 2.6],
        [78, 88, 2.4], [-88, 75, 2.7], [105, -65, 2.9], [-78, -88, 3.1],
    ];

    rocks.forEach(([x, z, scale], i) => {
        const y = getTerrainHeight(x, z);
        const rock = MeshBuilder.CreateSphere(`rock${i}`, { diameter: scale * 1.4, segments: 5 }, scene);
        rock.position = new Vector3(x, y + scale * 0.35, z);
        rock.scaling = new Vector3(1.0 + Math.sin(i) * 0.3, 0.65, 1.3 + Math.cos(i) * 0.2);
        const r = Math.sqrt(x * x + z * z);
        rock.material = r > 98 ? mtnRockMat : rockMat;
    });
}
