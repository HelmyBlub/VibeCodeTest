import {
    ArcRotateCamera, Color3, Color4, Engine, HemisphericLight,
    Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type { SpellElement } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProjVizData {
    right:   number;
    up:      number;
    forward: number;
    pitch:   number;
    yaw:     number;
    element: SpellElement;
    power:   number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ELEM_COLOR: Record<SpellElement, [Color3, Color3]> = {
    fire:      [new Color3(1,    0.4,  0),    new Color3(1,    0.3,  0)],
    ice:       [new Color3(0,    0.6,  1),    new Color3(0,    0.8,  1)],
    lightning: [new Color3(1,    0.85, 0.1),  new Color3(1,    0.9,  0.2)],
};

// BASE_HEIGHT matches combat.ts: playerPos + (0, 1.2, 0)
const BASE_HEIGHT = 1.2;
const ARROW_LEN   = 1.4;
const CONE_H      = 0.28;

// ── Helpers ───────────────────────────────────────────────────────────────────

function alignY(mesh: Mesh, dir: Vector3): void {
    const cross = Vector3.Cross(Vector3.Up(), dir);
    if (cross.length() < 0.001) {
        mesh.rotationQuaternion = null;
        mesh.rotation = Vector3.Dot(Vector3.Up(), dir) > 0
            ? Vector3.Zero()
            : new Vector3(Math.PI, 0, 0);
    } else {
        const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(Vector3.Up(), dir))));
        mesh.rotationQuaternion = Quaternion.RotationAxis(cross.normalize(), angle);
    }
}

// ── SpellVisualization ────────────────────────────────────────────────────────

export class SpellVisualization {
    private readonly engine: Engine;
    private readonly scene:  Scene;
    private readonly disposables: { dispose(): void }[] = [];
    private readonly meshToProjIdx = new Map<Mesh, number>();

    onProjectileSelected?: (idx: number) => void;

    constructor(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true, { antialias: true });
        this.scene  = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.04, 0.1, 1);

        const cam = new ArcRotateCamera(
            'vizCam', -Math.PI / 3, 1.05, 9,
            new Vector3(0, 1, 0), this.scene,
        );
        cam.attachControl(canvas, true);
        cam.lowerRadiusLimit = 3;
        cam.upperRadiusLimit = 22;
        cam.lowerBetaLimit   = 0.05;
        cam.upperBetaLimit   = Math.PI / 2 - 0.02;

        const light = new HemisphericLight('vizLight', new Vector3(0.2, 1, 0.4), this.scene);
        light.intensity   = 1.0;
        light.groundColor = new Color3(0.15, 0.15, 0.25);

        this.buildStaticMeshes();

        this.scene.onPointerDown = (_evt, pick) => {
            if (pick?.hit && pick.pickedMesh) {
                const idx = this.meshToProjIdx.get(pick.pickedMesh as Mesh);
                if (idx !== undefined) this.onProjectileSelected?.(idx);
            }
        };

        window.addEventListener('resize', () => this.engine.resize());
    }

    // ── Static meshes (player dummy, grid) ──────────────────────────────────

    private buildStaticMeshes(): void {
        const ground = MeshBuilder.CreateGround('vzGround', { width: 8, height: 8, subdivisions: 8 }, this.scene);
        const gMat = new StandardMaterial('vzGMat', this.scene);
        gMat.diffuseColor = new Color3(0.1, 0.1, 0.16);
        gMat.wireframe = true;
        ground.material  = gMat;
        ground.isPickable = false;

        const bodyMat = new StandardMaterial('vzBodyMat', this.scene);
        bodyMat.diffuseColor = new Color3(0.32, 0.32, 0.42);

        const body = MeshBuilder.CreateCylinder('vzBody', { height: 1.8, diameter: 0.7, tessellation: 12 }, this.scene);
        body.position.y  = 0.9;
        body.isPickable  = false;
        body.material    = bodyMat;

        const head = MeshBuilder.CreateSphere('vzHead', { diameter: 0.55 }, this.scene);
        head.position.y  = 2.1;
        head.isPickable  = false;
        head.material    = bodyMat;

        // Yellow nose stub = forward (+Z) indicator
        const nose = MeshBuilder.CreateBox('vzNose', { width: 0.1, height: 0.1, depth: 0.35 }, this.scene);
        nose.position    = new Vector3(0, 1.5, 0.36);
        nose.isPickable  = false;
        const noseMat = new StandardMaterial('vzNoseMat', this.scene);
        noseMat.diffuseColor  = new Color3(0.9, 0.75, 0.1);
        noseMat.emissiveColor = new Color3(0.35, 0.28, 0);
        nose.material = noseMat;

        // Dim forward line on the ground (Z axis)
        const fwd = MeshBuilder.CreateLines('vzFwd', {
            points: [new Vector3(0, 0.02, 0.5), new Vector3(0, 0.02, 4)],
        }, this.scene);
        fwd.color      = new Color3(0.7, 0.6, 0.1);
        fwd.alpha      = 0.25;
        fwd.isPickable = false;
    }

    // ── Per-update: projectile spheres + arrows ──────────────────────────────

    update(projs: ProjVizData[], selectedIdx: number): void {
        for (const d of this.disposables) d.dispose();
        this.disposables.length = 0;
        this.meshToProjIdx.clear();

        projs.forEach((p, i) => {
            const sel = i === selectedIdx;
            const [diffuse, emissive] = ELEM_COLOR[p.element];

            // Spawn position in viz space (right=+X, up=+Y, forward=+Z)
            const pos = new Vector3(p.right, BASE_HEIGHT + p.up, p.forward);

            // — Sphere —
            const sphere = MeshBuilder.CreateSphere(
                `vzS${i}`, { diameter: sel ? 0.56 : 0.44, segments: 8 }, this.scene,
            );
            sphere.position = pos.clone();
            const smat = new StandardMaterial(`vzSM${i}`, this.scene);
            smat.diffuseColor  = diffuse;
            smat.emissiveColor = sel ? emissive : emissive.scale(0.25);
            sphere.material = smat;
            this.disposables.push(sphere, smat);
            this.meshToProjIdx.set(sphere, i);

            // — Selection torus ring —
            if (sel) {
                const ring = MeshBuilder.CreateTorus(
                    `vzR${i}`, { diameter: 0.92, thickness: 0.06, tessellation: 24 }, this.scene,
                );
                ring.position   = pos.clone();
                ring.isPickable = false;
                const rmat = new StandardMaterial(`vzRM${i}`, this.scene);
                rmat.emissiveColor = new Color3(1, 1, 1);
                ring.material = rmat;
                this.disposables.push(ring, rmat);
            }

            // — Direction arrow —
            const pitchRad = (p.pitch * Math.PI) / 180;
            const yawRad   = (p.yaw   * Math.PI) / 180;
            const cosP = Math.cos(pitchRad);
            const dir  = new Vector3(
                Math.sin(yawRad) * cosP,
                Math.sin(pitchRad),
                Math.cos(yawRad) * cosP,
            ).normalize();

            const ac = sel ? new Color3(1, 1, 1) : new Color3(0.5, 0.5, 0.55);

            // Shaft
            const shaft = MeshBuilder.CreateCylinder(
                `vzA${i}`, { height: ARROW_LEN, diameter: 0.06, tessellation: 6 }, this.scene,
            );
            shaft.position  = pos.add(dir.scale(ARROW_LEN / 2));
            shaft.isPickable = false;
            alignY(shaft, dir);
            const amat = new StandardMaterial(`vzAM${i}`, this.scene);
            amat.diffuseColor  = ac;
            amat.emissiveColor = ac.scale(0.3);
            shaft.material = amat;
            this.disposables.push(shaft, amat);

            // Cone tip
            const cone = MeshBuilder.CreateCylinder(
                `vzC${i}`, { height: CONE_H, diameterTop: 0, diameterBottom: 0.18, tessellation: 8 }, this.scene,
            );
            cone.position  = pos.add(dir.scale(ARROW_LEN + CONE_H / 2));
            cone.isPickable = false;
            alignY(cone, dir);
            const cmat = new StandardMaterial(`vzCM${i}`, this.scene);
            cmat.diffuseColor  = ac;
            cmat.emissiveColor = ac.scale(0.3);
            cone.material = cmat;
            this.disposables.push(cone, cmat);
        });
    }

    start(): void { this.engine.runRenderLoop(() => this.scene.render()); }
    stop():  void { this.engine.stopRenderLoop(); }
    resize(): void { this.engine.resize(); }
}
