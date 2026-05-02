import { ArcRotateCamera, PointerEventTypes, Scene, Vector3 } from '@babylonjs/core';
import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, CAMERA_SENSITIVITY } from './constants';

const CAMERA_LOOK_UP_MAX = Math.PI / 2 + Math.PI / 3; // 60° past horizontal
const CAMERA_GROUND_Y   = 0.3;                         // minimum camera height

export function createCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3.5, 9, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = CAMERA_MIN_ZOOM;
    camera.upperRadiusLimit = CAMERA_MAX_ZOOM;
    camera.upperBetaLimit = CAMERA_LOOK_UP_MAX;
    camera.lowerBetaLimit = 0.15;

    // Track the user's intended zoom separately so radius compensation doesn't overwrite it
    let userRadius = camera.radius;

    canvas.addEventListener('wheel', e => {
        userRadius = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, userRadius + e.deltaY * 0.02));
        e.preventDefault();
    }, { passive: false });

    let rotating = false;
    scene.onPointerObservable.add((info) => {
        const e = info.event as PointerEvent;
        if (info.type === PointerEventTypes.POINTERDOWN && e.button === 0) {
            rotating = true;
            canvas.requestPointerLock();
        } else if (info.type === PointerEventTypes.POINTERUP && e.button === 0) {
            rotating = false;
            if (document.pointerLockElement === canvas) document.exitPointerLock();
        } else if (info.type === PointerEventTypes.POINTERMOVE && rotating) {
            camera.alpha -= e.movementX * CAMERA_SENSITIVITY;
            camera.beta = Math.max(
                camera.lowerBetaLimit!,
                Math.min(camera.upperBetaLimit!, camera.beta - e.movementY * CAMERA_SENSITIVITY)
            );
        }
    });

    // Each frame: shrink radius as needed to keep the camera above the ground
    scene.onBeforeRenderObservable.add(() => {
        const cosB = Math.cos(camera.beta);
        if (cosB < 0) {
            // camera is below target height — limit radius so cam.y stays above CAMERA_GROUND_Y
            const maxR = (camera.target.y - CAMERA_GROUND_Y) / (-cosB);
            camera.radius = Math.min(userRadius, Math.max(CAMERA_MIN_ZOOM, maxR));
        } else {
            camera.radius = userRadius;
        }
    });

    return camera;
}
