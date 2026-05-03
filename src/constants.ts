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
export const ENEMY_MAX_NORMAL = 20;
export const ENEMY_SPAWN_INTERVAL = 3000; // ms between normal enemy spawns

// Boss
export const BOSS_MAX_HP = 300;
export const BOSS_SCALE = 2.5;
export const BOSS_MELEE_DAMAGE = 20;
export const BOSS_MELEE_INTERVAL = 1500;
export const BOSS_PICKUP_RANGE = 2.0; // units to trigger spellbook pickup

// Combat
export const FIREBALL_HIT_RADIUS = 1.0;

// Projectile speeds
export const FIRE_SPEED      = 0.45;
export const ICE_SPEED       = 0.38;
export const LIGHTNING_SPEED = 1.6;

// Fire trajectory & lifetime
export const FIRE_GRAVITY      = -0.007;  // vel.y change per frame
export const FIRE_MIN_DURATION = 2000;    // ms at power=1
export const FIRE_MAX_DURATION = 6000;    // ms at power=100
export const GROUND_Y          = 0.21;    // projectile radius — ground contact threshold

// Ice trajectory
export const ICE_FALL_RATE     = 0.002;   // downward velocity added per frame
export const ICE_MAX_FALL_SPEED = 0.04;   // terminal velocity (snow-like cap)
export const ICE_DRAG           = 0.97;   // horizontal momentum multiplier per frame (lose ~50% in ~0.4s)
export const ICE_MIN_SLOW  = 0.65;    // slowFactor at power=1  (~35% speed reduction)
export const ICE_MAX_SLOW  = 0.10;    // slowFactor at power=100 (~90% speed reduction)
export const ICE_MAX_DURATION = 5000; // ms fallback expiry

// Lightning travel
export const LIGHTNING_BASE_RANGE  = 18;   // units from spawn at power=1
export const LIGHTNING_RANGE_POWER = 0.22; // extra units per power point
export const LIGHTNING_MAX_CHAINS  = 4;    // chain jumps at power=100

// Mana
export const PLAYER_MAX_MANA    = 100;
export const MANA_REGEN_RATE    = 8;   // per second
export const MANA_COST_FACTOR   = 0.2; // multiplied against base cost (1.0 = full cost, lower = cheaper)

// Fire DoT
export const FIRE_BURN_DURATION = 3000; // ms total
export const FIRE_BURN_INTERVAL = 500;  // ms between ticks

// Ice slow
export const ICE_SLOW_DURATION = 3000; // ms

// Lightning chain
export const LIGHTNING_CHAIN_RANGE = 8;   // units between enemies for each chain jump
export const LIGHTNING_CHAIN_MULT  = 0.6; // damage fraction per chain jump

// Heal element
export const HEAL_SPEED           = 0.22;  // units/frame (slow, snow-like)
export const HEAL_FALL_RATE       = 0.0008; // gentle gravity
export const HEAL_MIN_HEIGHT      = 0.45;  // hover above ground
export const HEAL_DRAG            = 0.985; // horizontal momentum decay
export const HEAL_TICK_INTERVAL   = 600;   // ms between heal pulses
export const HEAL_PER_TICK        = 8;     // HP healed per entity per pulse
export const HEAL_RADIUS          = 3.5;   // AoE radius in world units
export const HEAL_MAX_DURATION    = 12000; // ms hard fallback expiry
export const HEAL_PASSIVE_DECAY   = 0.12;  // fraction of healAmount depleted per second passively

// Staged spell system
export const STAGE_CARRIER_SPEED = 0.3;  // units/frame for 'none' element stages
