# Critter Cards

Pick one of five critter cards, then battle the other trainers. Tap a move and
your critter jumps out of its card to use its special powers.

A touch-native 3D web game for a child on an iPad. TypeScript + Three.js +
Vite, built to one self-contained `index.html` and published by the gallery in
the repo root.

## How it plays

1. **Pick your beast.** Five cards, each a different kind of beast. Tap one
   to look at it, then tap **I pick …!**
2. **Battle.** Each trainer's card floats up off the grass, shakes and glows,
   and their critter pops out of it. Then yours does.
3. **Tap a move.** Every critter has three:
   - a **bump** (a bite, a slash, a smash) — it charges the other beast;
   - its **special move** — thrown from where it stands;
   - its **super move** (⭐) — greyed out until it has charged up over two
     turns, then it glows. Bigger, more of everything, and the screen shakes.
4. When a beast runs out of **puff** it is knocked out: it spins back into its
   card, and the card turns face down.
5. Beat all four other trainers to be **Champion** 🏆.

Losing is gentle: your beast is knocked out and you fight that battle again. The other trainers hit softer than you do, so a child tapping anything
at all wins most battles.

| Beast     | Kind     | What it is                          | Special      | Super           |
| --------- | -------- | ----------------------------------- | ------------ | --------------- |
| Blazefang | 🔥 Fire  | a horned wolf with a burning mane   | Fire Blast   | Inferno         |
| Tidejaw   | 💧 Water | a shark that walks on land          | Water Cannon | Tsunami         |
| Thornclaw | 🍃 Leaf  | a thorn-covered jungle giant        | Thorn Storm  | Jungle Fury     |
| Voltsting | ⚡ Spark | a scorpion with a lightning tail    | Thunderbolt  | Lightning Storm |
| Rockjaw   | 🪨 Rock  | a rock golem with lava in its chest | Boulder Drop | Earthquake      |

The beasts are meant to look fearsome — glowing slit eyes under a scowl, fangs,
claws, horns and spikes — and to hit hard: every hit shakes the screen and
blasts a shockwave across the floor, and a bump rips red claw marks across the
other beast. Nothing is gory, and losing is still gentle.

## A thousand cards

There are **1,000 cards**, numbered #1 to #1000, each with its own name, look,
colours, moves, size, home and rarity — ★ Common, ★★ Rare, ★★★ Epic, ★★★★
Legendary, and one ✦✦✦✦✦ Mythic: #1000, the Darkness King.

Five beasts are drawn by hand (`src/critters.ts`); `src/dex.ts` makes the other
328 species from one seed, the same way every time: one of **twelve body
plans** — the starters' wolf, shark, giant, scorpion and golem, and a dragon,
hooded serpent, raptor, spider, fortress tortoise, ape and walking squid
(`src/bodies.ts`) — a kind, colours from that kind, a stretch of the shape, a
**pattern** (plain, stripes, spots or a dark saddle), a few extra parts —
horns, back spikes, bat wings, a crown, armour, a gem, a third eye, tusks — a
name made of two halves (Pyrotooth, Smokedrake, Cinderwidow), three moves and
some facts.
Three forms each makes 999 cards, and the Darkness King makes 1,000. Card art
is drawn the first time a card is wanted, and the latest 90 are kept.

**Home** has six things to do:

- **👹 Boss Battles** — ten bosses, one after another: a giant Mega beast of
  each of the nine kinds, each on a different body plan (from the Lord of
  Flames to the Shadow Lord), and last the Darkness King, Ruler of the
  Darkness. A boss arrives with a
  warning, a storm of lightning and the ground shaking, and climbs out of a
  huge hole; it is half as big again as a beast (never so tall its head leaves
  the screen) and has a long puff bar. At half puff it is **enraged** — it
  glows red, hits harder and uses its super move more. Beating one wins its
  card, 3 packs and 5 Critter Balls, and opens the next; the Darkness King's is
  card #1000. A boss win counts toward evolving. Numbers are `BOSS` in
  `src/config.ts`.
- **⚔️ Fight Trainers** — the four fights. Each win gives a booster pack and 2
  Critter Balls; beating all four gives 3 more packs.
- **👫 2 Players** — two people on one iPad. Each picks a beast from the
  cards on it, a coin toss says who goes first, and they take turns tapping
  their moves; a bubble over the moves says whose turn it is, blue for
  Player 1 and red for Player 2. The winner gets a trophy, and **Rematch!**
  keeps the same beasts. Nothing is counted toward evolving, and nothing is
  won or lost from the book.
- **🌃 Hunt Wild Beasts** — a wild beast climbs out of a dark hole in the
  roof. Fight it, and throw a **Critter Ball** 🔮 (dark metal with a glowing
  ring) to catch it: the weaker it is, the better the chance it stays in. One
  worn right out can't escape at all. You start with 10 balls.
- **🎁 Open Packs** — tear one open and flip its five cards one at a time. The
  last card is the lucky one, never a Common. You start with 3 packs.
- **📖 My Cards** — the book of all 1,000, twenty to a page, with "?" for the
  ones still to find. Tap a card for everything about it, and to fight with it.

The odds, prizes and catch chances are `PACKS` and `HUNT` in
`src/config.ts`.

## Kinds

Nine kinds, each with its own special move:

| Kind        | Special move looks like                          |
| ----------- | ------------------------------------------------ |
| 🔥 Fire     | fireballs                                        |
| 💧 Water    | jets of water                                    |
| 🍃 Leaf     | thorns shot like arrows                          |
| ⚡ Spark    | lightning out of the sky                         |
| 🪨 Rock     | boulders falling                                 |
| 🐲 Dragon   | a stream of purple-and-blue dragon fire          |
| 🔮 Psychic  | glowing pink rings that squeeze the target       |
| 🥊 Fighting | a flurry of glowing fists                        |
| 🌑 Dark     | black spikes bursting out of the ground round it |

The attacks are meant to look real (`src/fx.ts`): fire and magic are
hundreds of soft glowing particles that add their light together, so they burn
white where they're thickest and fade to their colour at the edges; smoke and
dust roll up after them; a fireball, a ring or a fist carries a real light
that shines on the floor and on both beasts, and every blast flashes one;
rocks are lumpy boulders with a cracked stone texture and bumps that catch the
light; water and the dark kind's obsidian spikes are glossy and reflect a soft
room of light; and lightning lights up the whole roof.

**Every move does what it is called** (`src/moves.ts` reads the name). Up
close: a bite snaps giant jaws shut, a punch throws a glowing fist, a kick is a
spinning kick, a tail swipe turns a full circle, a stomp or a slam leaps high
and crashes down in a cloud of dust, a sting darts in with a needle, a squeeze
wraps coils round the target, a headbutt or a ram charges flat out and leaves
stars spinning round its head, and an ink splat spits. From a distance: a
meteor falls burning out of the sky; a geyser, a volcano, roots or an
earthquake burst up out of the ground; a tsunami, a flood or a heat wave rolls
across the roof as a wall; a roar, a pulse or a shock wave blasts out in
rings; a whirlpool or a hurricane spins round the target; a black hole sucks
everything in and bursts; a cannon or a beam is one long blazing beam; a fang
is giant jaws; a cloud smothers; a bloom is a giant flower opening; a crush
closes in and squeezes; stars rain down. Anything else is its kind's own
throw. Each comes in its kind's colours and materials.

**They never stand still.** Out of their cards they bounce on their feet like
boxers, sway and rock, and now and then show off — two quick jabs at the air,
a roar, a hop. To attack they wind up first, crouching and leaning back (and
twisting, for a punch), then throw their whole body into it.

**They react to being hit, differently for each kind of hit**
(`reactionOf` in `src/moves.ts`): punched, kicked, rammed or bitten, the head
snaps back and it rocks on its heels; slashed, it twists away; a tail swipe or
a whirlpool spins it round; stomped or hit by a meteor, it squashes flat;
burned, it hops from foot to foot glowing, with flames licking off it; zapped,
it jolts and flickers with sparks; soaked, it shakes itself off like a dog;
psychic power lifts it off the ground, turning, and drops it; the dark makes it
shrink and shudder in black smoke; squeezed, it's squished thin. The big hits
— punches, kicks, rams, slams, bites, meteors, every super move, and a
knockout — go into **slow motion** for a moment (`LIVELY` in
`src/config.ts`).

Who beats whom is `STRONG_AGAINST` in `src/critters.ts`: every kind is strong
against at least one other and weak against at least one other. The five
starters are the first five kinds; generated beasts cycle through all nine,
and there is a boss for each kind — ten bosses with the Darkness King.

## Evolution and Mega Evolution

Every beast has three forms. Each is bigger, has more puff and hits harder
(`FORM_SCALE`, `FORM_PUFF`, `FORM_HIT` in `src/config.ts`):

| First form | Evolved      | Mega Evolved      |
| ---------- | ------------ | ----------------- |
| Blazefang  | Infernofang  | Mega Infernofang  |
| Tidejaw    | Abyssjaw     | Mega Abyssjaw     |
| Thornclaw  | Thornking    | Mega Thornking    |
| Voltsting  | Stormstinger | Mega Stormstinger |
| Rockjaw    | Magmatitan   | Mega Magmatitan   |

A beast **evolves after its first win** and **Mega Evolves after its third**
(a catch counts as a win),
right there on the roof: it glows, spins faster and faster, and bursts into its
new form with a new name, a new card and full puff. Wins are counted for each
beast and saved, so an evolved beast stays evolved, and the pick screen shows
each one in the form it has reached. The later trainers bring evolved and Mega
beasts too. A Mega beast smoulders, dark sparks rising round it all the time.

Each builder in `src/models.ts` makes all three forms: the evolved form adds
horns, spikes and armour to the first, and the Mega form adds again and changes
colours — blue fire, glowing stripes, a crown, wings, a volcano.

The fights happen in a **darkness world**: a stone arena on the roof of a
skyscraper in a city at night, black towers with windows lit here and there,
neon rings on the floor, rain, low storm clouds, and lightning striking the
towers every few seconds — the whole scene flashes, then the thunder comes.

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
  critters.ts  the five starters, forms, rarity, card numbers, who beats whom
  dex.ts       the other 995 cards, made from one seed; packs' and hunts' draws
  menu.ts      home, booster packs, the card book, a card's details
  parts.ts     the kit: painted spheres, cones, limbs, eyes, fangs, claws
  models.ts    the starters' five bodies, extra parts, patterns, toon and outline
  bodies.ts    seven more body plans, and where extras go on each
  cards.ts     card art drawn on a canvas, with a portrait rendered from the model
  stage.ts     renderer, the darkness city and its storm, camera, particles
  battle.ts    one battle as a script: summon, turns, hits, faint
  moves.ts     what each move does, read from its name
  effects.ts   every move's look: fire, water, meteors, beams, jaws, coils…
  fx.ts        glowing particles, smoke, attack lights, rock and leaf textures
  anim.ts      a clock whose waits and tweens are promises
  ui.ts        pick screen, puff panels, moves, popups, result card
  audio.ts     every sound synthesised with Web Audio
  save.ts      cards owned, packs, balls, fighter, wins, bosses, trophies
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
