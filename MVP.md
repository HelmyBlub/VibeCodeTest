# MVP — Spell Creation Prototype

## Goal

Answer one question: **Is the spell creation system fun?**

A player should be able to open the spell creator, build a spell, enter combat,
use it against enemies, and feel the urge to go back and improve it.
If that loop works, the game has a foundation. If not, we iterate until it does.

## What to Build

### 1. Spell Creation UI
A dedicated screen (separate from combat) where the player builds a spell.

**First version — 3 parameters:**
- **Element**: Fire (damage over time) | Ice (slow) | Lightning (instant burst)
- **Power**: Low / Medium / High — scales mana cost up
- **Cast Time**: Instant / Short / Long — scales mana cost down

Display the resulting spell's mana cost and a short description of what it does.
Player can save up to 4 spells and bind them to keys `1` `2` `3` `4`.

### 2. Combat Mode
The existing prototype is the base. Extend it with:
- **Mana bar** — visible HUD element, regenerates slowly over time
- **Hotkey casting** — press `1`–`4` to cast the equipped spell
- **Element effects** on enemies:
  - Fire → damage over time (burning visual)
  - Ice → slows enemy movement
  - Lightning → instant damage, small knockback
- **Enemy HP bars** already exist, just make sure they reflect elemental damage correctly

### 3. Two Enemy Types
- **Basic grunt** — no resistance, tests that spells work at all
- **Fire-resistant enemy** — takes less damage from fire, forces the player to think about element choice

### 4. One Spellbook (unlock mid-session)
Place one Spellbook pickup in the world. When collected, it unlocks **Tracking** in the
spell creation UI. This validates the full loop:
craft → fight → find upgrade → craft again.

## What NOT to Build Yet

- World exploration / open world
- Multiple biomes or zones
- More than 2 enemy types
- Saving / loading spells between sessions
- Visual spell animations beyond basic projectile
- Any class other than mage
- Story or lore

## Success Criteria

The MVP is working if a playtester:
1. Opens the spell creator and builds at least 2 different spells without help
2. Notices that the fire-resistant enemy forces them to change their spell
3. Finds the Spellbook and goes back to the creator to use Tracking
4. Wants to keep playing or asks "what else can I unlock?"

## Build Order

1. Spell creation UI (screen + parameters + hotkey binding)
2. Mana system (bar, cost, regeneration)
3. Hotkey casting — fire the right spell depending on `1`–`4`
4. Elemental effects (fire DoT, ice slow, lightning knockback)
5. Fire-resistant enemy variant
6. Spellbook pickup in the world
7. Playtest and iterate
