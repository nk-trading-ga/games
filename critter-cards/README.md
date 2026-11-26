# Critter Cards

Pick one of five critter cards, then battle the other trainers. Tap a move and
your critter jumps out of its card to use its special powers.

A touch-native 3D web game for a child on an iPad. TypeScript + Three.js +
Vite, built to one self-contained `index.html` and published by the gallery in
the repo root.

## How it plays

1. **Pick your critter.** Five cards, each a different kind of critter. Tap one
   to look at it, then tap **I pick …!**
2. **Battle.** Each trainer's card floats up off the grass, shakes and glows,
   and their critter pops out of it. Then yours does.
3. **Tap a move.** Every critter has three:
   - a **bump** (💥) — it runs at the other critter;
   - its **special move** — thrown from where it stands;
   - its **super move** (⭐) — greyed out until it has charged up over two
     turns, then it glows. Bigger, more of everything, and the screen shakes.
4. When a critter runs out of **puff** it spins back into its card, and the
   card turns face down for a rest.
5. Beat all four other trainers to be **Champion** 🏆.

Losing is gentle: your critter "needs a little rest" and you try that battle
again. The other trainers hit softer than you do, so a child tapping anything
at all wins most battles.

| Critter   | Kind     | Special      | Super         |
| --------- | -------- | ------------ | ------------- |
| Emberpup  | 🔥 Fire  | Fire Ball    | Fire Storm    |
| Splashfin | 💧 Water | Bubble Blast | Big Wave      |
| Thornbun  | 🍃 Leaf  | Leaf Swirl   | Petal Storm   |
| Sparkbug  | ⚡ Spark | Zap          | Thunder Storm |
| Pebblet   | 🪨 Rock  | Rock Drop    | Rock Slide    |

A special or super move that is strong against the other critter's kind is a
**Super hit!** for half as much again. Who beats whom is `STRONG_AGAINST` in
`src/critters.ts`.

## Running it

```bash
npm --prefix critter-cards run dev
```

## Commands

```bash
npm --prefix critter-cards run dev         # dev server, hot reload
npm --prefix critter-cards run typecheck   # tsc --noEmit
npm --prefix critter-cards run build       # typechecks, then one dist/index.html
```

## Layout

```
src/
  config.ts    every tunable number: spots, camera, timings, puff, damage
  critters.ts  the five critters, their moves, and who is strong against whom
  models.ts    each critter built from painted primitives, toon-shaded, outlined
  cards.ts     card art drawn on a canvas, with a portrait rendered from the model
  stage.ts     renderer, the meadow, camera, particle pools
  battle.ts    one battle as a script: summon, turns, hits, faint
  effects.ts   fireballs, bubbles, leaves, lightning, falling rocks
  anim.ts      a clock whose waits and tweens are promises
  ui.ts        pick screen, puff panels, moves, popups, result card
  audio.ts     every sound synthesised with Web Audio
  save.ts      last critter picked, trophies, sound on or off
```

There are no model, texture or sound files. The card art is drawn at start-up,
and the picture on each card is that critter's own 3D model, rendered once by a
small throwaway renderer.

## Verifying a change

In a dev build `window.game` is the live game. Stop its real-time loop and step
it yourself — yielding between frames, because the battle is a chain of
promises and they only move on when the microtask queue gets a turn:

```js
const g = window.game;
g.running = false;
for (let i = 0; i < 120; i++) {
  g.step(1 / 60);
  await new Promise(r => setTimeout(r, 0));
}
```

`g.battle` is the battle in progress; its fighters' `puff` can be set directly
to jump to the end of one.
