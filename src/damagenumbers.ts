import { Matrix, Scene, Vector3, Viewport } from '@babylonjs/core';
import type { StageElement } from './types';

const ELEM_COLOR: Partial<Record<StageElement, string>> = {
    fire:      '#ff8833',
    ice:       '#55ddff',
    lightning: '#ffee22',
    heal:      '#44ff88',
    carrier:   '#aaaaee',
    cloud:     '#66ccdd',
};

const MAX_AGE = 55; // frames (~0.9s at 60fps)

interface DmgNum {
    el:       HTMLElement;
    worldPos: Vector3;
    age:      number;
}

export class DamageNumbers {
    private readonly nums: DmgNum[] = [];
    private readonly container: HTMLElement;

    constructor(private readonly scene: Scene, private readonly canvas: HTMLCanvasElement) {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position:      'fixed',
            top:           '0',
            left:          '0',
            width:         '100%',
            height:        '100%',
            pointerEvents: 'none',
            zIndex:        '150',
            overflow:      'hidden',
        });
        document.body.appendChild(this.container);
    }

    spawn(worldPos: Vector3, amount: number, element: StageElement): void {
        const el = document.createElement('div');
        const color = ELEM_COLOR[element] ?? '#ffffff';
        Object.assign(el.style, {
            position:    'absolute',
            color,
            fontFamily:  'sans-serif',
            fontWeight:  '700',
            fontSize:    '15px',
            textShadow:  '0 1px 3px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
            whiteSpace:  'nowrap',
            userSelect:  'none',
            transform:   'translate(-50%, -50%)',
        });
        el.textContent = String(amount);
        this.container.appendChild(el);
        this.nums.push({ el, worldPos: worldPos.clone(), age: 0 });
    }

    update(): void {
        if (!this.nums.length) return;

        const renderW = this.canvas.width;
        const renderH = this.canvas.height;
        const rect    = this.canvas.getBoundingClientRect();
        const scaleX  = rect.width  / renderW;
        const scaleY  = rect.height / renderH;
        const viewport = new Viewport(0, 0, renderW, renderH);
        const transform = this.scene.getTransformMatrix();

        for (let i = this.nums.length - 1; i >= 0; i--) {
            const n = this.nums[i];
            n.age++;
            if (n.age >= MAX_AGE) {
                n.el.remove();
                this.nums.splice(i, 1);
                continue;
            }
            const t = n.age / MAX_AGE;
            // Rise upward in world space
            const lifted = n.worldPos.add(new Vector3(0, t * 2.0, 0));
            const screen = Vector3.Project(lifted, Matrix.Identity(), transform, viewport);
            if (screen.z < 0 || screen.z > 1) {
                n.el.style.display = 'none';
                continue;
            }
            n.el.style.display = '';
            n.el.style.left    = `${screen.x * scaleX + rect.left}px`;
            n.el.style.top     = `${screen.y * scaleY + rect.top}px`;
            // Fade out with slight acceleration: opaque for first half, then fades
            const fade = t < 0.5 ? 1.0 : 1.0 - ((t - 0.5) / 0.5) ** 1.5;
            n.el.style.opacity = String(Math.max(0, fade));
        }
    }
}
