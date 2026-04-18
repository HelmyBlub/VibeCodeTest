# Game Vision

## Concept

A fantasy action RPG where the player's core power comes not from finding better gear,
but from learning to **craft better spells**. The game is built around a spell creation
system that starts simple and expands through discovery — rewarding creative thinking
and experimentation over grinding.

## Core Loop

```
Explore world → find Spellbooks → unlock new spell options
     ↑                                        ↓
Test spells ←── enter combat mode ←── craft new spells
     ↓
Face enemies with specific weaknesses
     → forces creative spell design to counter them
```

## The Spell Creation System

The heart of the game. The player enters a dedicated creation mode with a visual
interface to build spells from unlocked components.

**Base parameters (always available):**
- **Element** — defines damage type and enemy interactions (fire, ice, lightning, ...)
- **Power** — higher power = higher mana cost
- **Cast time** — longer cast = lower mana cost, enabling powerful spells for sustained fights at the cost of mobility

**Spellbook modifiers (unlocked through play):**
- Each spellbook adds one new option to the spell creation interface
- Examples:
  - *Tracking* — spell homes in on enemies, increased mana cost
  - *Cluster Bomb* — on impact, drops delayed explosive grenades
  - More discovered through play

**Design intent:**
The system needs heavy iteration and playtesting to find the right balance between
freedom and overwhelming choice. Spellbooks are the pacing mechanism — they drip-feed
new options so the player is never overwhelmed, but always has something new to try.

A spell that feels powerful and was crafted by the player should be a core emotional
reward of the game.

## Progression

- No traditional leveling or loot
- Power comes entirely from **what Spellbooks you've found** and **how well you use them**
- Spellbooks are found by:
  - Exploring the world
  - Defeating strong enemies / bosses
- The meta-game is optimizing spell builds against the challenge ahead

## Enemies

Enemies are designed to challenge the spell creation system, not just punish the player.
Each enemy type should make the player think: *"what spell would work best here?"*

- Start very simple (basic melee enemies, as already prototyped)
- Gradually introduce elemental resistances, immunities, movement patterns
- Enemy design follows spell system development — first build a fun creation system,
  then design enemies that challenge it

## Classes

Starting focus: **Mage**. Open to additional classes if they integrate naturally with
the spell creation concept (e.g. a class that modifies how spells are delivered,
not what spells do).

## Scope

| Phase | Description |
|---|---|
| Prototype | Validate the spell creation system is fun |
| Early game | First biome, ~5 Spellbooks, first boss |
| Mid game | Multiple zones, 15–20 Spellbooks, enemy variety |
| Full game | 40h experience, full Spellbook collection, multiple bosses |

The full vision is a 40-hour game. Everything before that is finding out whether
the core mechanic — crafting a spell and feeling powerful — actually delivers.
