// Player
export const MOVE_SPEED = 0.1;
export const GRAVITY = -0.01;
export const JUMP_FORCE = 0.25;
export const BOUNDARY = 47;
export const PLAYER_MAX_HP = 100;

// Camera
export const CAMERA_SENSITIVITY = 1 / 700;
export const CAMERA_MIN_ZOOM = 3;
export const CAMERA_MAX_ZOOM = 18;

// Enemies
export const ENEMY_MAX_HP = 50;
export const ENEMY_SPEED = 0.028;
export const ENEMY_MELEE_RANGE = 1.8;
export const ENEMY_MELEE_DAMAGE = 10;
export const ENEMY_MELEE_INTERVAL = 1000;

// Combat
export const FIREBALL_SPEED = 0.45;
export const FIREBALL_LIFETIME = 110;
export const FIREBALL_HIT_RADIUS = 1.0;

// Mana
export const PLAYER_MAX_MANA = 100;
export const MANA_REGEN_RATE = 8; // per second

// Spells
export const CAST_DURATION     = { instant: 0, short: 600, long: 1500 }  as const;
export const SPELL_DAMAGE      = { low: 15, medium: 25, high: 40 }        as const;
export const COOLDOWN_DURATION = { none: 0, short: 2000, long: 5000 }     as const;
export const COOLDOWN_DMG_MULT = { none: 0.7, short: 1.0, long: 1.5 }     as const;

// Fire DoT
export const FIRE_BURN_DURATION = 3000; // ms total
export const FIRE_BURN_INTERVAL = 500;  // ms between ticks
export const FIRE_BURN_DAMAGE   = { low: 3, medium: 5, high: 8 } as const;

// Ice slow
export const ICE_SLOW_DURATION = 3000; // ms
export const ICE_SLOW_FACTOR   = 0.3;  // multiplied against base speed

// Lightning chain
export const LIGHTNING_CHAIN_RANGE = 8;   // units from primary target
export const LIGHTNING_CHAIN_MULT  = 0.6; // secondary damage fraction
