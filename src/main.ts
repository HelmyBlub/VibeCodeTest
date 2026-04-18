import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { buildEnvironment } from './environment';
import { Player } from './player';
import { createCamera } from './camera';
import { createInput } from './input';
import { EnemyManager } from './enemy';
import { CombatSystem } from './combat';
import { HUD } from './hud';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

buildEnvironment(scene);

const hud = new HUD();
const player = new Player(scene, hud);
const camera = createCamera(scene, canvas);
const input = createInput();
const enemyManager = new EnemyManager(scene);
const combat = new CombatSystem(scene);

const spawnPoints: [number, number][] = [
    [-18, -18], [18, -18], [-18, 18], [18, 18], [0, -22], [22, 0], [-22, 0],
];
spawnPoints.forEach(([x, z]) => enemyManager.spawn(x, z));

window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'q' || !player.alive) return;
    const dir = player.position.subtract(camera.position);
    dir.y = 0;
    if (dir.length() > 0.01) {
        combat.castFireball(
            player.position.add(new Vector3(0, 1.2, 0)),
            dir.normalize(),
        );
    }
});

scene.onBeforeRenderObservable.add(() => {
    const camToChar = player.position.subtract(camera.position);
    camToChar.y = 0;
    if (camToChar.length() < 0.01) return;

    const forward = camToChar.normalize();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();

    player.update(input.keys, forward, right);
    combat.update(enemyManager.enemies, en => enemyManager.kill(en));

    if (player.alive) {
        enemyManager.update(player.position, dmg => player.takeDamage(dmg));
    }

    camera.target.copyFrom(player.position);
    camera.target.y += 1;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
