import {
  CRITTERS,
  EXTRA,
  SPECIES,
  atForm,
  rarityOf,
  type Body,
  type Critter,
  type Form,
  type Kind,
  type Look,
  type Move,
} from "./critters";
import {DEX, FORM_HIT, FORM_PUFF} from "./config";
import {mulberry} from "./anim";

// The thousand cards. Five starters are drawn by hand in critters.ts; the rest
// are made here, the same way every time from one seed: a body plan, a kind,
// colours from that kind, a stretch of the shape, a few extra parts (horns,
// wings, a crown…), a name, three moves, and a few facts for its card. Each
// species has three forms — first, evolved, Mega — so three cards, and the
// thousandth card is one beast of its own.

const KINDS: ReadonlyArray<Kind> = ["fire", "water", "leaf", "spark", "rock"];
const BODIES: ReadonlyArray<Body> = [
  "wolf",
  "shark",
  "giant",
  "scorpion",
  "golem",
];

/** First halves of names, by kind: for the first form, then the evolved one. */
const PREFIX: Record<Kind, readonly [Array<string>, Array<string>]> = {
  fire: [
    ["Ember", "Cinder", "Scorch", "Ash", "Flare", "Pyro", "Char", "Smoke"],
    ["Inferno", "Molten", "Volcan", "Pyre", "Furnace", "Solar", "Scald"],
  ],
  water: [
    ["Tide", "Brine", "Surf", "Ripple", "Coral", "Kelp", "Mist", "Reef"],
    ["Abyss", "Tsunami", "Maelstrom", "Kraken", "Torrent", "Typhoon"],
  ],
  leaf: [
    ["Thorn", "Vine", "Moss", "Fern", "Bramble", "Briar", "Root", "Spore"],
    ["Jungle", "Elder", "Grove", "Timber", "Venom", "Thicket", "Canopy"],
  ],
  spark: [
    ["Volt", "Zap", "Static", "Buzz", "Jolt", "Flash", "Shock", "Arc"],
    ["Storm", "Thunder", "Tempest", "Plasma", "Blitz", "Cyclone", "Nova"],
  ],
  rock: [
    ["Stone", "Crag", "Flint", "Slate", "Grit", "Shale", "Cliff", "Rubble"],
    ["Granite", "Obsidian", "Quake", "Basalt", "Onyx", "Tremor", "Summit"],
  ],
};

/** Second halves, by body: a name says what kind of beast it is. */
const SUFFIX: Record<Body, Array<string>> = {
  wolf: ["fang", "maw", "howl", "claw", "hound", "mane", "snarl", "prowl"],
  shark: ["jaw", "fin", "tooth", "chomp", "gill", "ripper", "gnash"],
  giant: ["king", "brute", "horn", "hulk", "stomp", "beast", "back"],
  scorpion: ["sting", "tail", "pincer", "crawler", "scuttle", "needle"],
  golem: ["titan", "fist", "crusher", "golem", "hammer", "guard", "slab"],
};

/** Body colours to choose from, by kind, and accents to go with them. */
const PALETTE: Record<Kind, {body: Array<number>; accent: Array<number>}> = {
  fire: {
    body: [0xd63a1c, 0xb8321a, 0xe0601c, 0x8a2a14, 0x4a1c14, 0xf08a24],
    accent: [0xff8a1f, 0xffd23a, 0xff3a12, 0xff5ecf],
  },
  water: {
    body: [0x2a5fa8, 0x1f7fa8, 0x2a3f8a, 0x3aa8c8, 0x14306a, 0x5a8ac8],
    accent: [0x6ff0ff, 0x9cc8ff, 0xffffff, 0x3ad0c0],
  },
  leaf: {
    body: [0x2f7d32, 0x4a8a2a, 0x1d5a20, 0x6a8a2a, 0x2a6a4a, 0x6a5a2a],
    accent: [0x7ed957, 0xd8b67a, 0xff7fb8, 0xb8ff5a],
  },
  spark: {
    body: [0xf2b705, 0xe0a800, 0xffd23a, 0xc8c020, 0x5a4a8a, 0x2a2438],
    accent: [0x8ff7ff, 0xffffff, 0xfff27a, 0x9a5bff],
  },
  rock: {
    body: [0x6d665e, 0x8a7a6a, 0x5c554e, 0x4a4a5a, 0x9a8a7a, 0x2a2630],
    accent: [0xff6a1f, 0xb06bff, 0x5fe0ff, 0xffd23a],
  },
};

const BUMP: Record<Body, Array<[string, string]>> = {
  wolf: [
    ["Fang Bite", "🦷"],
    ["Pounce", "💥"],
    ["Maul", "💥"],
  ],
  shark: [
    ["Chomp", "🦷"],
    ["Jaw Crush", "🦷"],
    ["Ram", "💥"],
  ],
  giant: [
    ["Claw Slash", "💥"],
    ["Stomp", "💥"],
    ["Big Punch", "👊"],
  ],
  scorpion: [
    ["Sting", "💥"],
    ["Pincer Snap", "💥"],
    ["Tail Whip", "💥"],
  ],
  golem: [
    ["Smash", "👊"],
    ["Body Slam", "💥"],
    ["Rock Fist", "👊"],
  ],
};

const SPECIAL: Record<Kind, {effect: Move["effect"]; icon: string}> = {
  fire: {effect: "fireball", icon: "🔥"},
  water: {effect: "bubbles", icon: "💧"},
  leaf: {effect: "leaves", icon: "🌵"},
  spark: {effect: "zap", icon: "⚡"},
  rock: {effect: "rocks", icon: "🪨"},
};

const SPECIAL_NAMES: Record<Kind, readonly [Array<string>, Array<string>]> = {
  fire: [
    ["Fire Blast", "Flame Burst", "Lava Spit", "Ember Storm", "Heat Wave"],
    ["Inferno", "Firestorm", "Meteor", "Volcano", "Sun Blast"],
  ],
  water: [
    ["Water Cannon", "Hydro Blast", "Bubble Beam", "Tidal Spray", "Geyser"],
    ["Tsunami", "Whirlpool", "Flood", "Deep Crush", "Hurricane"],
  ],
  leaf: [
    ["Thorn Storm", "Vine Lash", "Razor Leaf", "Spore Cloud", "Seed Shot"],
    ["Jungle Fury", "Forest Rage", "Thorn Quake", "Root Crush", "Wild Bloom"],
  ],
  spark: [
    ["Thunderbolt", "Zap Cannon", "Shock Wave", "Spark Burst", "Static"],
    ["Lightning Storm", "Thunder Fall", "Mega Volt", "Plasma Blast", "Blitz"],
  ],
  rock: [
    ["Boulder Drop", "Rock Throw", "Stone Rain", "Gravel Blast", "Rock Fall"],
    ["Earthquake", "Rock Slide", "Avalanche", "Mountain Fall", "Landslide"],
  ],
};

const SHAPE: Record<Body, string> = {
  wolf: "A prowling hunter on four legs",
  shark: "A shark that walks on land",
  giant: "A hulking giant on two legs",
  scorpion: "A scuttling scorpion with a deadly tail",
  golem: "A living mountain of stone",
};

const NATURE: Record<Kind, string> = {
  fire: "that breathes fire.",
  water: "that rules the flooded streets.",
  leaf: "covered in thorns and vines.",
  spark: "crackling with lightning.",
  rock: "as hard as a mountain.",
};

const HOMES: Record<Kind, Array<string>> = {
  fire: ["the burning factory", "the lava tunnels", "the smoky rooftops"],
  water: ["the flooded subway", "the dark harbour", "the storm drains"],
  leaf: ["the overgrown park", "the vine tower", "the rooftop jungle"],
  spark: ["the power station", "the lightning tower", "the neon alleys"],
  rock: ["the old quarry", "the broken bridge", "the deep tunnels"],
};

const FACTS = [
  "It hunts when the lightning flashes.",
  "Its roar can shatter windows.",
  "It sleeps on the tallest towers.",
  "Nobody has ever seen it blink.",
  "It can smell you from a mile away.",
  "It only comes out in the rain.",
  "It guards its home all night long.",
  "Its eyes glow in the dark.",
  "It can climb straight up a wall.",
  "It never forgets a face.",
];

/** A typical height and weight for each body plan, before it grows. */
const SIZE: Record<Body, [number, number]> = {
  wolf: [1.2, 180],
  shark: [1.6, 380],
  giant: [2.3, 600],
  scorpion: [1.0, 90],
  golem: [2.5, 1400],
};

const darken = (c: number, k: number) => mix(c, 0x0a0812, k);

function mix(a: number, b: number, k: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

const rng = mulberry(DEX.seed);
const pick = <T>(list: ReadonlyArray<T>): T =>
  list[Math.floor(rng() * list.length)];

function look(kind: Kind, body: number, form: number): Look {
  const p = PALETTE[kind];
  const accent = pick(p.accent);
  // The Mega form goes dark and its accents glow: it belongs to the darkness.
  return {
    dark: darken(body, form === 2 ? 0.8 : 0.6),
    accent: form === 2 ? pick([accent, 0x9a5bff, 0xff3b5c]) : accent,
    accent2: pick(p.accent.filter(a => a !== accent)),
    eye: form === 0 ? pick([0xffe14a, 0xff3b3b, 0xff6a1f]) : accent,
    belly: mix(body, 0xffffff, 0.45),
  };
}

function randomExtras(chance: number): number {
  let bits = 0;
  for (const bit of Object.values(EXTRA)) {
    if (rng() < chance) {
      bits |= bit;
    }
  }
  return bits;
}

/** One more extra part than it had, for an evolution. */
function addExtra(bits: number, prefer?: number): number {
  if (prefer !== undefined && !(bits & prefer)) {
    return bits | prefer;
  }
  const free = Object.values(EXTRA).filter(b => !(bits & b));
  return free.length ? bits | pick(free) : bits;
}

function makeSpecies(index: number, used: Set<string>): Critter {
  const kind = KINDS[index % KINDS.length];
  const body = BODIES[Math.floor(index / KINDS.length) % BODIES.length];
  const [first, second] = PREFIX[kind];
  let suffix = pick(SUFFIX[body]);
  let name = "";
  let evolvedName = "";
  for (let tries = 0; tries < 200; tries++) {
    suffix = pick(SUFFIX[body]);
    name = pick(first) + suffix;
    evolvedName = pick(second) + suffix;
    if (!used.has(name) && !used.has(evolvedName)) {
      break;
    }
  }
  used.add(name);
  used.add(evolvedName);

  const colour = pick(PALETTE[kind].body);
  const tier = rng() < 0.6 ? 0 : rng() < 0.75 ? 1 : 2;
  const extras = randomExtras(0.25);
  const grown = darken(colour, 0.15);
  const mega = darken(colour, 0.55);
  const looks = [
    look(kind, colour, 0),
    look(kind, grown, 1),
    look(kind, mega, 2),
  ];
  const forms: [Form, Form] = [
    {
      name: evolvedName,
      blurb: `Bigger and fiercer. ${pick(FACTS)}`,
      colour: grown,
      light: mix(looks[1].accent, 0xffffff, 0.3),
      look: looks[1],
      extras: addExtra(extras),
    },
    {
      name: `Mega ${evolvedName}`,
      blurb: "Its Mega form glows with the power of the darkness.",
      colour: mega,
      light: mix(looks[2].accent, 0xffffff, 0.2),
      look: looks[2],
      extras: addExtra(addExtra(extras, EXTRA.wings), EXTRA.horns),
    },
  ];
  const bump = pick(BUMP[body]);
  const special = SPECIAL[kind];
  const [plainNames, superNames] = SPECIAL_NAMES[kind];
  const [height, weight] = SIZE[body];
  const size = 0.85 + rng() * 0.35;
  return {
    id: `beast-${index}`,
    form: 0,
    index,
    name,
    kind,
    body,
    look: looks[0],
    extras,
    shape: {wide: 0.88 + rng() * 0.27, tall: 0.9 + rng() * 0.22},
    tier,
    height: Math.round(height * size * 10) / 10,
    weight: Math.round(weight * size ** 3),
    home: pick(HOMES[kind]),
    blurb: `${SHAPE[body]} ${NATURE[kind]}`,
    colour,
    light: mix(looks[0].accent, 0xffffff, 0.35),
    cry: {pitch: 70 + rng() * 220, swoop: 0.4 + rng() * 0.5},
    moves: [
      {name: bump[0], power: "tackle", effect: "tackle", icon: bump[1]},
      {name: pick(plainNames), power: "special", ...special},
      {name: pick(superNames), power: "superMove", ...special, icon: "⭐"},
    ],
    evolutions: forms,
  };
}

/** The thousandth card: one beast, already in its last form, all its own. */
function makeKing(index: number): Critter {
  const kingLook: Look = {
    dark: 0x07050c,
    accent: 0x9a5bff,
    accent2: 0xff3b5c,
    eye: 0xff3b5c,
    belly: 0x2a1a3a,
  };
  const king: Form = {
    name: "Darkness King",
    blurb: "The ruler of the darkness world. Only one exists.",
    colour: 0x140c20,
    light: 0xc8a0ff,
    look: kingLook,
    extras: EXTRA.horns | EXTRA.wings | EXTRA.crown | EXTRA.armour | EXTRA.gem,
  };
  return {
    id: "darkness-king",
    form: 2,
    index,
    ...king,
    look: kingLook,
    extras: king.extras ?? 0,
    kind: "spark",
    body: "giant",
    shape: {wide: 1.15, tall: 1.1},
    tier: 4,
    height: 4.2,
    weight: 3300,
    home: "the top of the tallest tower",
    cry: {pitch: 55, swoop: 0.5},
    moves: [
      {name: "Shadow Claw", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Dark Thunder", power: "special", effect: "zap", icon: "⚡"},
      {name: "End of Night", power: "superMove", effect: "zap", icon: "⭐"},
    ],
    evolutions: [king, king],
  };
}

const used = new Set(CRITTERS.map(c => c.name));
for (const c of CRITTERS) {
  for (const f of c.evolutions) {
    used.add(f.name);
  }
}
for (let i = SPECIES.length; i < DEX.species; i++) {
  SPECIES.push(makeSpecies(i, used));
}
SPECIES.push(makeKing(SPECIES.length));

/** How many cards there are. */
export const CARD_COUNT = DEX.species * 3 + 1;

/** The beast on card number n, from 1 to CARD_COUNT. */
export function cardByNumber(n: number): Critter {
  if (n >= CARD_COUNT) {
    return SPECIES[SPECIES.length - 1];
  }
  const index = Math.floor((n - 1) / 3);
  return atForm(SPECIES[index], (n - 1) % 3);
}

/** Every card number of a given rarity, worked out once. */
const BY_RARITY: Array<Array<number>> = [[], [], [], [], []];
for (let n = 1; n <= CARD_COUNT; n++) {
  BY_RARITY[rarityOf(cardByNumber(n))].push(n);
}

/** A random card number, rarer cards coming up less often. */
export function randomCard(odds: ReadonlyArray<number>): number {
  let roll = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let r = 0; r < odds.length; r++) {
    roll -= odds[r];
    if (roll <= 0 && BY_RARITY[r].length > 0) {
      const list = BY_RARITY[r];
      return list[Math.floor(Math.random() * list.length)];
    }
  }
  return BY_RARITY[0][0];
}

/**
 * How much puff it has and how hard it hits (100 is a plain first form).
 * Later forms and rarer species have more of both.
 */
export function statsOf(critter: Critter): {puff: number; power: number} {
  const tier = Math.min(critter.tier, 4);
  const form = Math.min(critter.form, 2);
  return {
    puff: (FORM_PUFF[form] ?? 100) + tier * 10,
    power: Math.round((FORM_HIT[form] ?? 1) * (1 + tier * 0.08) * 100),
  };
}

/** The boss fights, in order: one giant for each kind, then the king. */
export interface BossDef {
  /** The card of the beast it is, which beating it wins. */
  n: number;
  title: string;
}

const BOSS_TITLES: Record<Kind, string> = {
  fire: "Lord of Flames",
  water: "Terror of the Deep",
  leaf: "Jungle Tyrant",
  spark: "Storm Emperor",
  rock: "Mountain Breaker",
};

export const BOSSES: ReadonlyArray<BossDef> = [
  ...KINDS.map((kind, i) => {
    // A generated beast of each kind in its Mega form, each on a different
    // body plan so no two bosses look alike.
    const body = BODIES[i];
    const big = SPECIES.find(
      c =>
        c.index >= CRITTERS.length &&
        c.tier < 4 &&
        c.kind === kind &&
        c.body === body,
    );
    const species = big ?? SPECIES[CRITTERS.length];
    return {n: species.index * 3 + 3, title: BOSS_TITLES[kind]};
  }),
  {n: CARD_COUNT, title: "Ruler of the Darkness"},
];
