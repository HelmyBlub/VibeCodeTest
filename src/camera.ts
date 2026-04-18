import { ArcRotateCamera, PointerEventTypes, Scene, Vector3 } from '@babylonjs/core';
import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, CAMERA_SENSITIVITY } from './constants';

export function createCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3.5, 9, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = CAMERA_MIN_ZOOM;
    camera.upperRadiusLimit = CAMERA_MAX_ZOOM;
    camera.upperBetaLimit = Math.PI / 2 - 0.05;
    camera.lowerBetaLimit = 0.15;

    canvas.addEventListener('wheel', e => {
        camera.radius = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, camera.radius + e.deltaY * 0.02));
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

    return camera;
}
