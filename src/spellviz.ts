import {
    ArcRotateCamera, Color3, Color4, Engine, HemisphericLight,
    LinesMesh, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type { StageElement, StageTrigger } from './types';
import {
    FIRE_GRAVITY, FIRE_MAX_DURATION, FIRE_MIN_DURATION, FIRE_SPEED,
    ICE_DRAG, ICE_FALL_RATE, ICE_MAX_DURATION, ICE_MAX_FALL_SPEED, ICE_SPEED,
} from './constants';

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
    power:       number;
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

// Same math as combat's pitchYawDir — direction relative to an explicit forward/right frame.
function pitchYawDirVec(pitchDeg: number, yawDeg: number, fwd: Vector3, right: Vector3): Vector3 {
    const pr = pitchDeg * Math.PI / 180;
    const yr = yawDeg   * Math.PI / 180;
    const cosP = Math.cos(pr);
    // Use local up (Cross(fwd, right)) so pitch stays well-defined even when fwd is vertical.
    // For horizontal fwd this equals world Up; for vertical fwd it avoids gimbal lock.
    const localUp = Vector3.Cross(fwd, right).normalize();
    return right.scale(Math.sin(yr) * cosP)
        .add(localUp.scale(Math.sin(pr)))
        .add(fwd.scale(Math.cos(yr) * cosP))
        .normalize();
}

function fanDirs(pitch: number, yaw: number, count: number, yawSpread: number, fwd: Vector3, right: Vector3): Vector3[] {
    const n = Math.min(count, MAX_FAN_SHOW);
    if (n <= 1) return [pitchYawDirVec(pitch, yaw, fwd, right)];
    return Array.from({ length: n }, (_, i) => {
        const fanYaw = yaw - yawSpread / 2 + (i / (n - 1)) * yawSpread;
        return pitchYawDirVec(pitch, fanYaw, fwd, right);
    });
}

function deriveRight(fwd: Vector3, fallback: Vector3): Vector3 {
    const cross = Vector3.Cross(Vector3.Up(), fwd);
    if (cross.length() > 0.001) return cross.normalize();
    const cross2 = Vector3.Cross(new Vector3(0, 0, 1), fwd);
    return cross2.length() > 0.001 ? cross2.normalize() : fallback;
}

// Rotate v around a unit axis by angle radians (Rodrigues formula).
function rotateVec(v: Vector3, axis: Vector3, angle: number): Vector3 {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dot = Vector3.Dot(axis, v);
    return v.scale(cos).add(Vector3.Cross(axis, v).scale(sin)).add(axis.scale(dot * (1 - cos)));
}

// ── Trajectory simulation ─────────────────────────────────────────────────────

const TRAJ_SAMPLE = 3; // simulate every N frames, giving a smooth curve without thousands of points

function simulateTrajectory(
    element: 'fire' | 'ice',
    pitchDeg: number, yawDeg: number,
    power: number,
    origin: Vector3,
    fwd: Vector3, right: Vector3,
): Vector3[] {
    const dir   = pitchYawDirVec(pitchDeg, yawDeg, fwd, right);
    const speed = element === 'fire' ? FIRE_SPEED : ICE_SPEED;
    let vx = dir.x * speed;
    let vy = dir.y * speed;
    let vz = dir.z * speed;
    let px = origin.x, py = origin.y, pz = origin.z;

    const t = power / 100;
    const maxFrames = element === 'fire'
        ? Math.round((FIRE_MIN_DURATION + t * (FIRE_MAX_DURATION - FIRE_MIN_DURATION)) * 60 / 1000)
        : Math.round(ICE_MAX_DURATION * 60 / 1000);

    const pts: Vector3[] = [new Vector3(px, py, pz)];
    for (let f = 1; f <= maxFrames; f++) {
        if (element === 'fire') {
            vy += FIRE_GRAVITY;
        } else {
            vy  = Math.max(-ICE_MAX_FALL_SPEED, vy - ICE_FALL_RATE);
            vx *= ICE_DRAG;
            vz *= ICE_DRAG;
        }
        px += vx; py += vy; pz += vz;

        if (py <= 0) { pts.push(new Vector3(px, 0, pz)); break; }
        if (f % TRAJ_SAMPLE === 0) pts.push(new Vector3(px, py, pz));
    }
    // guarantee at least 2 points so CreateLines doesn't fail
    if (pts.length < 2) pts.push(new Vector3(px, Math.max(0, py), pz));
    return pts;
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

    // Parent frame of the currently selected stage — updated each update() call
    // so the rotate drag can always work in world space.
    private selPitch       = 0;
    private selYaw         = 0;
    private selParentFwd   = new Vector3(0, 0, 1);
    private selParentRight = new Vector3(1, 0, 0);

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
                const SENS = ROTATE_SENS * Math.PI / 180;
                // Current world-space direction of the selected stage
                const D = pitchYawDirVec(this.selPitch, this.selYaw, this.selParentFwd, this.selParentRight);
                // 1. Horizontal drag → rotate around world Y (changes compass direction)
                const D1 = rotateVec(D, new Vector3(0, 1, 0), dx * SENS);
                // 2. Vertical drag → change world elevation
                //    Elevation axis = Cross(horizontal component of D1, worldY) — always tilts toward/away from world up
                const Dh = new Vector3(D1.x, 0, D1.z);
                const elevAxis = Dh.length() > 0.001
                    ? Vector3.Cross(Dh.normalize(), new Vector3(0, 1, 0))
                    : new Vector3(1, 0, 0); // fallback when D1 is nearly vertical
                const D2 = rotateVec(D1, elevAxis, -dy * SENS);
                // 3. Decompose D2 back to parent-relative pitch/yaw
                const localUp = Vector3.Cross(this.selParentFwd, this.selParentRight).normalize();
                const newPitch = Math.asin(Math.max(-1, Math.min(1, Vector3.Dot(D2, localUp)))) * 180 / Math.PI;
                const newYaw   = Math.atan2(Vector3.Dot(D2, this.selParentRight), Vector3.Dot(D2, this.selParentFwd)) * 180 / Math.PI;
                this.onDirectionEdited?.({ pitch: newPitch - this.selPitch, yaw: newYaw - this.selYaw });
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

        // chain fwd/right through each level, matching combat's pitchYawDir logic
        const WFW = new Vector3(0, 0, 1);
        const WRT = new Vector3(1, 0, 0);

        let cur = origin.clone();
        let curFwd = WFW.clone(), curRight = WRT.clone();
        for (const anc of ancestors) {
            const o = cur.add(new Vector3(anc.offsetX, anc.offsetY, anc.offsetZ));
            const { endpoint, primaryDir } = this.buildItem(anc, o, curFwd, curRight);
            cur = endpoint;
            curFwd  = primaryDir;
            curRight = deriveRight(curFwd, curRight);
        }

        let selOrigin = cur.clone();
        let selFwd = curFwd.clone(), selRight = curRight.clone();
        if (parent) {
            const o = cur.add(new Vector3(parent.offsetX, parent.offsetY, parent.offsetZ));
            const { endpoint, primaryDir } = this.buildItem(parent, o, curFwd, curRight);
            selOrigin = endpoint;
            selFwd    = primaryDir;
            selRight  = deriveRight(selFwd, curRight);
        }

        // siblings share the same reference frame as the selected (both are children of parent)
        for (const sib of siblings) {
            const o = selOrigin.add(new Vector3(sib.offsetX, sib.offsetY, sib.offsetZ));
            this.buildItem(sib, o, selFwd, selRight);
        }

        // Capture the selected stage's parent frame for world-space drag editing.
        if (selected) {
            this.selPitch       = selected.pitch;
            this.selYaw         = selected.yaw;
            this.selParentFwd   = selFwd.clone();
            this.selParentRight = selRight.clone();
        }

        let childOrigin = selOrigin.clone();
        let childFwd = selFwd.clone(), childRight = selRight.clone();
        if (selected) {
            const o = selOrigin.add(new Vector3(selected.offsetX, selected.offsetY, selected.offsetZ));
            const { endpoint, primaryDir } = this.buildItem(selected, o, selFwd, selRight);
            childOrigin = endpoint;
            childFwd    = primaryDir;
            childRight  = deriveRight(childFwd, selRight);
        }

        for (const child of children) {
            const o = childOrigin.add(new Vector3(child.offsetX, child.offsetY, child.offsetZ));
            this.buildItem(child, o, childFwd, childRight);
        }

        this.cam.target.copyFrom(selOrigin);
    }

    // Returns the chain endpoint and the primary direction used, so the caller can thread
    // the reference frame to the next level (matching combat's parent-relative pitchYawDir).
    private buildItem(
        item: StageVizItem, origin: Vector3,
        fwd: Vector3, right: Vector3,
    ): { endpoint: Vector3; primaryDir: Vector3 } {
        const color    = ELEM_COLOR[item.element];
        const alpha    = ROLE_ALPHA[item.role];
        const isCarrierDelay = item.element === 'carrier' && item.trigger === 'delay';
        const len      = isCarrierDelay
            ? Math.min(CARRIER_MAX_LEN, Math.max(CARRIER_MIN_LEN, item.triggerMs * CARRIER_MS_TO_LEN))
            : ARROW_LEN[item.role];
        const pickable = item.role !== 'ancestor';
        const tag      = `${item.role}${item.childIndex ?? ''}`;

        if (item.stationary) {
            const endpoint = this.buildBlob(item, origin, color, alpha, len * 0.55, pickable, tag);
            // stationary stages pass their own direction to children (cloud inherits parent fwd unchanged)
            const primaryDir = pitchYawDirVec(item.pitch, item.yaw, fwd, right);
            return { endpoint, primaryDir };
        }

        // fire and ice follow curved trajectories — simulate physics instead of a straight arrow
        if (item.element === 'fire' || item.element === 'ice') {
            return this.buildTrajectoryItem(item, origin, color, alpha, pickable, tag, fwd, right);
        }

        const dirs = fanDirs(item.pitch, item.yaw, item.count, item.yawSpread, fwd, right);
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
        return { endpoint: origin.add(dirs[0].scale(len)), primaryDir: dirs[0] };
    }

    private buildTrajectoryItem(
        item: StageVizItem, origin: Vector3,
        color: Color3, alpha: number, pickable: boolean, tag: string,
        fwd: Vector3, right: Vector3,
    ): { endpoint: Vector3; primaryDir: Vector3 } {
        const n = Math.min(item.count, MAX_FAN_SHOW);
        let primaryLanding = origin.clone();

        for (let fi = 0; fi < n; fi++) {
            const fanYaw = n <= 1 ? item.yaw
                : item.yaw - item.yawSpread / 2 + (fi / (n - 1)) * item.yawSpread;
            const pts = simulateTrajectory(item.element as 'fire' | 'ice', item.pitch, fanYaw, item.power, origin, fwd, right);
            if (fi === 0) primaryLanding = pts[pts.length - 1].clone();

            const line = MeshBuilder.CreateLines(`vzTraj_${tag}_${fi}`, { points: pts }, this.scene) as LinesMesh;
            line.color      = color;
            line.alpha      = alpha;
            line.isPickable = false; // too thin to click reliably
            this.disposables.push(line);
        }

        // landing marker at primary endpoint
        const lx = primaryLanding.x, lz = primaryLanding.z;
        const ring = MeshBuilder.CreateTorus(`vzLand_${tag}`, { diameter: 0.55, thickness: 0.06, tessellation: 20 }, this.scene);
        ring.position   = new Vector3(lx, 0.02, lz);
        ring.isPickable = pickable;
        const rMat = this.mat(`vzRM_${tag}`, color, alpha, DOT_EM[item.role]);
        ring.material   = rMat;
        this.disposables.push(ring, rMat);
        if (pickable) this.meshToItem.set(ring, item);

        // spawn-point dot
        const dot  = MeshBuilder.CreateSphere(`vzDot_${tag}`, { diameter: DOT_DIA[item.role], segments: 6 }, this.scene);
        dot.position   = origin.clone();
        dot.isPickable = pickable;
        const dMat = this.mat(`vzDM_${tag}`, color, alpha, DOT_EM[item.role]);
        dot.material   = dMat;
        this.disposables.push(dot, dMat);
        if (pickable) this.meshToItem.set(dot, item);

        if (item.role === 'selected') this.buildSelectionRing(origin);
        const toEnd = primaryLanding.subtract(origin);
        const primaryDir = toEnd.length() > 0.001 ? toEnd.normalize() : fwd;
        return { endpoint: primaryLanding, primaryDir };
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
