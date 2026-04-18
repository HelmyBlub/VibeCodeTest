export interface InputState {
    keys: Record<string, boolean>;
}

export function createInput(): InputState {
    const keys: Record<string, boolean> = {};

    window.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', e => {
        keys[e.key.toLowerCase()] = false;
    });

    return { keys };
}
