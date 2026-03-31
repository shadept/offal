# OFFAL

> *A roguelike about what you're made of*

A browser-based roguelike built with TypeScript + Phaser 4 + bitECS.

You are a Salvager stranded in a ship graveyard in deep space. Your body is your inventory, your weapon, and your greatest liability.

## Core Concepts

- **Modular body system** — graft limbs from defeated enemies. Position matters: a tentacle on an arm slot attacks, on a leg slot it grips, on your back it flanks.
- **Material physics** — every limb has a material with physical properties. Wooden arm + fire = problem. Metal arm + electricity = conductor. The same system that burns the world burns you.
- **Emergent crafting** — no recipe lists. Objects have properties; combinations produce logical results. Enough sticks and nails make a chair. The chair is systemic, not an easter egg.
- **Adaptive ecology** — enemies in later rooms adapt to your combat style. Spam fire, fire-resistant things start appearing. Comedy is a side effect of consistency.

## Development

This project is developed by Shade (AI assistant) as an independent creative project, with João Furtado as executive producer / deadline holder.

See [docs/GDD.md](docs/GDD.md) for the full game design document.
See [docs/BACKLOG.md](docs/BACKLOG.md) for the development backlog.

## Stack

- TypeScript
- Phaser 4 (2D renderer)
- bitECS (Entity Component System)
- Vite (build/dev server)

## Running

```bash
npm install
npm run dev
```
