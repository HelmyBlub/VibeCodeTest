export interface InputState {
    keys: Record<string, boolean>;
}

export function createInput(): InputState {
    const keys: Record<string, boolean> = {};

    window.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        const tag = (document.activeElement as HTMLElement)?.tagName;
        const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
        if (!isInput && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', e => {
        keys[e.key.toLowerCase()] = false;
    });

    return { keys };
}
