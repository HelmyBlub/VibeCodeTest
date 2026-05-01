import {
    ArcRotateCamera, Color3, Color4, Engine, HemisphericLight,
    Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type { StageElement, StageTrigger } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StageVizItem {
    pitch:       number;       // -90 to 90
    yaw:         number;       // -180 to 180
    element:     StageElement;
    stationary:  boolean;
    count:       number;
    yawSpread:   number;       // degrees
    role:        'ancestor' | 'parent' | 'selected' | 'sibling' | 'child';
    childIndex?: number;
    trigger:     StageTrigger;
    triggerMs:   number;
    offsetX:     number;
    offsetY:     number;
    offsetZ:     number;
}

export type EditMode = 'none' | 'rotate' | 'moveH' | 'moveV';

// ── Constants ─────────────────────────────────────────────────────────────────

const ELEM_COLOR: Record<StageElement, Color3> = {
    fire:      new Color3(1,    0.40, 0.05),
    ice:       new Color3(0.15, 0.70, 1),
    lightning: new Color3(1,    0.85, 0.1),
    carrier:   new Color3(0.55, 0.55, 0.70),
    cloud:     new Color3(0.40, 0.70, 0.90),
};

const ARROW_LEN:  Record<StageVizItem['role'], number> = { ancestor: 1.4, parent: 1.8, selected: 2.8, sibling: 1.8, child: 1.8 };
// STAGE_CARRIER_SPEED (0.3 u/frame) ÷ 16.67 (ms/frame at 60fps) = actual game units per ms
const CARRIER_MS_TO_LEN = 0.018;
const CARRIER_MIN_LEN   = 0.3;
const CARRIER_MAX_LEN   = 60;
const ROLE_ALPHA: Record<StageVizItem['role'], number> = { ancestor: 0.15, parent: 0.38, selected: 1.0, sibling: 0.45, child: 0.60 };
const SHAFT_DIA:  Record<StageVizItem['role'], number> = { ancestor: 0.040, parent: 0.055, selected: 0.10, sibling: 0.055, child: 0.065 };
const DOT_DIA:    Record<StageVizItem['role'], number> = { ancestor: 0.15, parent: 0.28, selected: 0.42, sibling: 0.28, child: 0.34 };
const DOT_EM:     Record<StageVizItem['role'], number> = { ancestor: 0.25, parent: 0.50, selected: 0.70, sibling: 0.45, child: 0.60 };

const BASE_HEIGHT  = 1.35;
const CONE_H       = 0.28;
const ROTATE_SENS  = 0.38;
const MOVE_SENS    = 0.012;
const MAX_FAN_SHOW = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

function alignY(mesh: Mesh, dir: Vector3): void {
    const cross = Vector3.Cross(Vector3.Up(), dir);
    if (cross.length() < 0.001) {
        mesh.rotationQuaternion = null;
        mesh.rotation = Vector3.Dot(Vector3.Up(), dir) > 0
            ? Vector3.Zero() : new Vector3(Math.PI, 0, 0);
    } else {
        const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(Vector3.Up(), dir))));
        mesh.rotationQuaternion = Quaternion.RotationAxis(cross.normalize(), angle);
    }
}

function dirVec(pitchDeg: number, yawDeg: number): Vector3 {
    const pr = pitchDeg * Math.PI / 180;
    const yr = yawDeg   * Math.PI / 180;
    return new Vector3(
        Math.sin(yr) * Math.cos(pr),
        Math.sin(pr),
        Math.cos(yr) * Math.cos(pr),
    ).normalize();
}

function fanDirs(pitch: number, yaw: number, count: number, yawSpread: number): Vector3[] {
    const n = Math.min(count, MAX_FAN_SHOW);
    if (n <= 1) return [dirVec(pitch, yaw)];
    return Array.from({ length: n }, (_, i) => {
        const fanYaw = yaw - yawSpread / 2 + (i / (n - 1)) * yawSpread;
        return dirVec(pitch, fanYaw);
    });
}

// ── SpellVisualization ────────────────────────────────────────────────────────

export class SpellVisualization {
    private readonly engine:  Engine;
    private readonly scene:   Scene;
    private readonly cam:     ArcRotateCamera;
    private readonly canvas:  HTMLCanvasElement;
    private readonly disposables: { dispose(): void }[] = [];
    private readonly meshToItem   = new Map<Mesh, StageVizItem>();

    private active     = false;
    private editMode: EditMode = 'none';
    private dragging   = false;
    private lastX      = 0;
    private lastY      = 0;
    private gKeyHeld   = false;

    onDirectionEdited?: (delta: { pitch: number; yaw: number }) => void;
    onPositionEdited?:  (delta: { x: number; y: number; z: number }) => void;
    onStageSelected?:   (role: 'parent' | 'sibling' | 'child', childIndex?: number) => void;
    onEditModeChanged?: (mode: EditMode) => void;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new Engine(canvas, true, { antialias: true });
        this.scene  = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.04, 0.10, 1);

        this.cam = new ArcRotateCamera('vzCam', Math.PI / 4, 1.1, 9, new Vector3(0, 1, 0), this.scene);
        this.cam.attachControl(canvas, true);
        this.cam.lowerRadiusLimit = 4;
        this.cam.upperRadiusLimit = 70;
        this.cam.lowerBetaLimit   = 0.05;
        this.cam.upperBetaLimit   = Math.PI / 2 - 0.02;

        const light = new HemisphericLight('vzLight', new Vector3(0.2, 1, 0.4), this.scene);
        light.intensity   = 1.0;
        light.groundColor = new Color3(0.15, 0.15, 0.25);

        this.buildStaticMeshes();
        this.bindEvents();
        window.addEventListener('resize', () => this.engine.resize());
    }

    // ── Static scene ─────────────────────────────────────────────────────────

    private buildStaticMeshes(): void {
        const ground = MeshBuilder.CreateGround('vzGround', { width: 60, height: 60, subdivisions: 20 }, this.scene);
        const gMat = new StandardMaterial('vzGMat', this.scene);
        gMat.diffuseColor = new Color3(0.10, 0.10, 0.16);
        gMat.wireframe = true;
        ground.material = gMat;
        ground.isPickable = false;

        const bodyMat = new StandardMaterial('vzBodyMat', this.scene);
        bodyMat.diffuseColor = new Color3(0.32, 0.32, 0.42);

        const body = MeshBuilder.CreateCylinder('vzBody', { height: 1.8, diameter: 0.7, tessellation: 12 }, this.scene);
        body.position.y = 0.9;
        body.isPickable = false;
        body.material   = bodyMat;

        const head = MeshBuilder.CreateSphere('vzHead', { diameter: 0.55 }, this.scene);
        head.position.y = 2.1;
        head.isPickable = false;
        head.material   = bodyMat;

        const noseMat = new StandardMaterial('vzNoseMat', this.scene);
        noseMat.diffuseColor  = new Color3(0.9, 0.75, 0.1);
        noseMat.emissiveColor = new Color3(0.35, 0.28, 0);
        const nose = MeshBuilder.CreateBox('vzNose', { width: 0.1, height: 0.1, depth: 0.35 }, this.scene);
        nose.position   = new Vector3(0, 1.5, 0.36);
        nose.isPickable = false;
        nose.material   = noseMat;

        const fwd = MeshBuilder.CreateLines('vzFwd', {
            points: [new Vector3(0, 0.02, 0.5), new Vector3(0, 0.02, 4)],
        }, this.scene);
        fwd.color      = new Color3(0.7, 0.6, 0.1);
        fwd.alpha      = 0.22;
        fwd.isPickable = false;
    }

    // ── Events ────────────────────────────────────────────────────────────────

    private bindEvents(): void {
        this.scene.onPointerDown = (_evt, pick) => {
            if (this.editMode !== 'none') return;
            if (pick?.hit && pick.pickedMesh) {
                const item = this.meshToItem.get(pick.pickedMesh as Mesh);
                if (item && item.role !== 'selected')
                    this.onStageSelected?.(item.role as 'parent' | 'sibling' | 'child', item.childIndex);
            }
        };

        this.canvas.addEventListener('pointerdown', e => {
            this.dragging = true;
            this.lastX = e.clientX; this.lastY = e.clientY;
        });
        this.canvas.addEventListener('pointermove', e => {
            if (!this.dragging || this.editMode === 'none') return;
            const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
            this.lastX = e.clientX; this.lastY = e.clientY;
            if (this.editMode === 'rotate') {
                this.onDirectionEdited?.({ yaw: dx * ROTATE_SENS, pitch: -dy * ROTATE_SENS });
            } else if (this.editMode === 'moveH') {
                // camera-aware: map screen dx/dy to world XZ using camera's horizontal orientation
                const cx = this.cam.target.x - this.cam.position.x;
                const cz = this.cam.target.z - this.cam.position.z;
                const cl = Math.sqrt(cx * cx + cz * cz) || 1;
                const fx = cx / cl, fz = cz / cl;          // camera forward in XZ
                const rx = -fz,     rz = fx;                // camera right  in XZ (CCW 90°)
                this.onPositionEdited?.({
                    x: -(dx * rx + dy * fx) * MOVE_SENS,
                    y: 0,
                    z: -(dx * rz + dy * fz) * MOVE_SENS,
                });
            } else if (this.editMode === 'moveV') {
                this.onPositionEdited?.({ x: 0, y: -dy * MOVE_SENS, z: 0 });
            }
        });
        window.addEventListener('pointerup', () => { this.dragging = false; });

        window.addEventListener('keydown', e => {
            if (!this.active) return;
            if (e.key === 'g' || e.key === 'G') {
                this.gKeyHeld = true;
                this.enterEdit(e.shiftKey ? 'moveV' : 'moveH');
            } else if (e.key === 'Shift' && this.gKeyHeld) {
                this.enterEdit('moveV');
            } else if ((e.key === 'f' || e.key === 'F' || e.key === 'r' || e.key === 'R') && this.editMode === 'none') {
                this.enterEdit('rotate');
            }
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'g' || e.key === 'G') {
                this.gKeyHeld = false; this.exitEdit();
            } else if (e.key === 'Shift' && this.gKeyHeld && this.active) {
                this.enterEdit('moveH');
            } else if (e.key === 'f' || e.key === 'F' || e.key === 'r' || e.key === 'R') {
                this.exitEdit();
            }
        });
    }

    private enterEdit(mode: 'rotate' | 'moveH' | 'moveV'): void {
        this.editMode = mode;
        this.cam.detachControl();
        this.onEditModeChanged?.(mode);
    }

    private exitEdit(): void {
        if (this.editMode === 'none') return;
        this.editMode = 'none';
        this.dragging = false;
        this.cam.attachControl(this.canvas, true);
        this.onEditModeChanged?.('none');
    }

    // ── Dynamic update ───────────────────────────────────────────────────────

    update(items: StageVizItem[]): void {
        for (const d of this.disposables) d.dispose();
        this.disposables.length = 0;
        this.meshToItem.clear();

        const origin = new Vector3(0, BASE_HEIGHT, 0);

        const ancestors = items.filter(it => it.role === 'ancestor');
        const parent    = items.find(it => it.role === 'parent');
        const selected  = items.find(it => it.role === 'selected');
        const siblings  = items.filter(it => it.role === 'sibling');
        const children  = items.filter(it => it.role === 'child');

        let cur = origin.clone();
        for (const anc of ancestors) {
            const o = cur.add(new Vector3(anc.offsetX, anc.offsetY, anc.offsetZ));
            cur = this.buildItem(anc, o);
        }

        let selOrigin = cur.clone();
        if (parent) {
            const o = cur.add(new Vector3(parent.offsetX, parent.offsetY, parent.offsetZ));
            selOrigin = this.buildItem(parent, o);
        }

        for (const sib of siblings) {
            const o = selOrigin.add(new Vector3(sib.offsetX, sib.offsetY, sib.offsetZ));
            this.buildItem(sib, o);
        }

        let childOrigin = selOrigin.clone();
        if (selected) {
            const o = selOrigin.add(new Vector3(selected.offsetX, selected.offsetY, selected.offsetZ));
            childOrigin = this.buildItem(selected, o);
        }

        for (const child of children) {
            const o = childOrigin.add(new Vector3(child.offsetX, child.offsetY, child.offsetZ));
            this.buildItem(child, o);
        }

        this.cam.target.copyFrom(selOrigin);
    }

    private buildItem(item: StageVizItem, origin: Vector3): Vector3 {
        const color    = ELEM_COLOR[item.element];
        const alpha    = ROLE_ALPHA[item.role];
        const isCarrierDelay = item.element === 'carrier' && item.trigger === 'delay';
        const len      = isCarrierDelay
            ? Math.min(CARRIER_MAX_LEN, Math.max(CARRIER_MIN_LEN, item.triggerMs * CARRIER_MS_TO_LEN))
            : ARROW_LEN[item.role];
        const pickable = item.role !== 'ancestor';
        const tag      = `${item.role}${item.childIndex ?? ''}`;

        if (item.stationary) {
            return this.buildBlob(item, origin, color, alpha, len * 0.55, pickable, tag);
        }

        const dirs = fanDirs(item.pitch, item.yaw, item.count, item.yawSpread);
        for (let i = 0; i < dirs.length; i++) {
            this.buildArrow(item, origin, dirs[i], len, color, alpha, pickable, `${tag}_${i}`);
        }

        // spawn-point dot
        const dot  = MeshBuilder.CreateSphere(`vzDot_${tag}`, { diameter: DOT_DIA[item.role], segments: 6 }, this.scene);
        dot.position   = origin.clone();
        dot.isPickable = pickable;
        const dMat = this.mat(`vzDM_${tag}`, color, alpha, DOT_EM[item.role]);
        dot.material   = dMat;
        this.disposables.push(dot, dMat);
        if (pickable) this.meshToItem.set(dot, item);

        if (item.role === 'selected') this.buildSelectionRing(origin);
        return origin.add(dirs[0].scale(len)); // primary dir endpoint for children
    }

    private buildArrow(
        item: StageVizItem, origin: Vector3, dir: Vector3, len: number,
        color: Color3, alpha: number, pickable: boolean, tag: string,
    ): void {
        const shaftLen = len - CONE_H;
        const emScale  = item.role === 'selected' ? 0.4 : 0.12;

        const shaft = MeshBuilder.CreateCylinder(`vzShaft_${tag}`, {
            height: shaftLen, diameter: SHAFT_DIA[item.role], tessellation: 8,
        }, this.scene);
        shaft.position   = origin.add(dir.scale(shaftLen / 2));
        shaft.isPickable = pickable;
        alignY(shaft, dir);
        const sMat = this.mat(`vzSM_${tag}`, color, alpha, emScale);
        shaft.material = sMat;
        this.disposables.push(shaft, sMat);
        if (pickable) this.meshToItem.set(shaft, item);

        const tip  = origin.add(dir.scale(len));
        const cone = MeshBuilder.CreateCylinder(`vzCone_${tag}`, {
            height: CONE_H, diameterTop: 0, diameterBottom: 0.22, tessellation: 8,
        }, this.scene);
        cone.position   = tip.subtract(dir.scale(CONE_H / 2));
        cone.isPickable = pickable;
        alignY(cone, dir);
        const cMat = this.mat(`vzCM_${tag}`, color, alpha, emScale);
        cone.material = cMat;
        this.disposables.push(cone, cMat);
        if (pickable) this.meshToItem.set(cone, item);
    }

    private buildBlob(
        item: StageVizItem, origin: Vector3, color: Color3, alpha: number,
        dia: number, pickable: boolean, tag: string,
    ): Vector3 {
        const blob = MeshBuilder.CreateSphere(`vzBlob_${tag}`, { diameter: dia, segments: 10 }, this.scene);
        blob.position   = origin.clone();
        blob.isPickable = pickable;
        const bMat = this.mat(`vzBM_${tag}`, color, alpha, item.role === 'selected' ? 0.4 : 0.12);
        blob.material = bMat;
        this.disposables.push(blob, bMat);
        if (pickable) this.meshToItem.set(blob, item);

        if (item.role === 'selected') this.buildSelectionRing(origin);
        return origin.clone();
    }

    private buildSelectionRing(pos: Vector3): void {
        const ring = MeshBuilder.CreateTorus('vzSelRing', { diameter: 0.75, thickness: 0.065, tessellation: 28 }, this.scene);
        ring.position   = pos.clone();
        ring.isPickable = false;
        const rMat = new StandardMaterial('vzRMat', this.scene);
        rMat.emissiveColor = new Color3(1, 1, 1);
        ring.material = rMat;
        this.disposables.push(ring, rMat);
    }

    private mat(name: string, color: Color3, alpha: number, emScale: number): StandardMaterial {
        const m = new StandardMaterial(name, this.scene);
        m.diffuseColor  = color;
        m.emissiveColor = color.scale(emScale);
        m.alpha         = alpha;
        return m;
    }

    start(): void { this.active = true;  this.engine.runRenderLoop(() => this.scene.render()); }
    stop():  void { this.active = false; this.exitEdit(); this.engine.stopRenderLoop(); }
    resize(): void { this.engine.resize(); }
}
