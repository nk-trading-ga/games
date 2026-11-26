// The beasts, and what each of them can do. The five here are the starters,
// built by hand; dex.ts makes the rest of the thousand cards from the same
// five body plans and adds them to SPECIES.

export type Kind = "fire" | "water" | "leaf" | "spark" | "rock";

/** What a move looks like when it is used. */
export type EffectKind =
  "tackle" | "fireball" | "bubbles" | "leaves" | "zap" | "rocks";

export interface Move {
  name: string;
  /** "tackle" runs at the other critter; the rest are thrown from afar. */
  power: "tackle" | "special" | "superMove";
  effect: EffectKind;
  icon: string;
}

/** The five body plans every beast is built on. */
export type Body = "wolf" | "shark" | "giant" | "scorpion" | "golem";

/**
 * A beast's colours beyond its body colour. The starters leave it out and use
 * the colours their builders were drawn with; generated beasts set it.
 */
export interface Look {
  /** Legs, jaws, brows: the darker parts. */
  dark: number;
  /** Flames, fins, thorns, lava, crystals: the part that marks its kind. */
  accent: number;
  /** A second accent, for flame tips, bone and the like. */
  accent2: number;
  eye: number;
  /** Belly and muzzle. */
  belly: number;
}

/** What changes when a beast evolves: its name, its look, its card. */
export interface Form {
  name: string;
  blurb: string;
  colour: number;
  light: number;
  look?: Look;
  extras?: number;
}

/**
 * Extra parts a generated beast can have, as bits: added on top of its body
 * plan by models.ts, which is most of what makes one beast look unlike the
 * next.
 */
export const EXTRA = {
  horns: 1,
  spikes: 2,
  wings: 4,
  crown: 8,
  armour: 16,
  gem: 32,
} as const;

export const RARITY = [
  "Common",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
] as const;
export const RARITY_STARS = ["★", "★★", "★★★", "★★★★", "✦✦✦✦✦"] as const;

export interface Critter {
  id: string;
  /**
   * Which form it is in: 0 as it starts, 1 evolved, 2 Mega Evolved. Everything
   * in CRITTERS is form 0; `atForm` gives the same beast in another form.
   */
  form: number;
  /** Its place in SPECIES; its card number comes from this and its form. */
  index: number;
  name: string;
  kind: Kind;
  body: Body;
  look?: Look;
  /** Which EXTRA parts it has. */
  extras: number;
  /** Stretch: how wide and tall it is next to the plain body plan. */
  shape: {wide: number; tall: number};
  /** 0 common, 1 rare, 2 epic: how rare its first form is. */
  tier: number;
  /** For the card's details: in metres and kilos, and where it lives. */
  height: number;
  weight: number;
  home: string;
  /** One line for the card, in words a child can read. */
  blurb: string;
  /** Main body colour, also the card's colour. */
  colour: number;
  /** A lighter colour for the card's background and the particles. */
  light: number;
  /** The noise it makes: a pitch in Hz and how much it swoops. */
  cry: {pitch: number; swoop: number};
  moves: readonly [Move, Move, Move];
  /** Its evolved form and its Mega form. */
  evolutions: readonly [Form, Form];
}

export const KIND_ICON: Record<Kind, string> = {
  fire: "🔥",
  water: "💧",
  leaf: "🍃",
  spark: "⚡",
  rock: "🪨",
};

export const KIND_NAME: Record<Kind, string> = {
  fire: "Fire",
  water: "Water",
  leaf: "Leaf",
  spark: "Spark",
  rock: "Rock",
};

/**
 * Who is strong against whom. Water puts out fire, fire burns leaves, leaves
 * drink up water and crack rock, spark zaps water, rock smothers fire and
 * shrugs off spark. Each kind is strong against at least one other and weak
 * against at least one other, so no pick is a bad pick.
 */
export const STRONG_AGAINST: Record<Kind, ReadonlyArray<Kind>> = {
  fire: ["leaf"],
  water: ["fire", "rock"],
  leaf: ["water", "rock"],
  spark: ["water"],
  rock: ["fire", "spark"],
};

export const CRITTERS: ReadonlyArray<Critter> = [
  {
    id: "blazefang",
    form: 0,
    index: 0,
    body: "wolf",
    extras: 0,
    shape: {wide: 1, tall: 1},
    tier: 1,
    height: 1.3,
    weight: 210,
    home: "the burning factory",
    name: "Blazefang",
    kind: "fire",
    blurb: "A horned wolf with a burning mane. Its bite is red hot.",
    colour: 0xd63a1c,
    light: 0xffb37a,
    cry: {pitch: 150, swoop: 0.55},
    moves: [
      {name: "Fang Bite", power: "tackle", effect: "tackle", icon: "🦷"},
      {name: "Fire Blast", power: "special", effect: "fireball", icon: "🔥"},
      {name: "Inferno", power: "superMove", effect: "fireball", icon: "⭐"},
    ],
    evolutions: [
      {
        name: "Infernofang",
        blurb:
          "Bigger, with more horns and a mane of fire down its whole back.",
        colour: 0xc02810,
        light: 0xffa060,
      },
      {
        name: "Mega Infernofang",
        blurb:
          "Its fire burns blue. Wings of flame, armour, and horns like a dragon's.",
        colour: 0x8a1408,
        light: 0x9fdcff,
      },
    ],
  },
  {
    id: "tidejaw",
    form: 0,
    index: 1,
    body: "shark",
    extras: 0,
    shape: {wide: 1, tall: 1},
    tier: 1,
    height: 1.7,
    weight: 420,
    home: "the flooded subway",
    name: "Tidejaw",
    kind: "water",
    blurb: "A shark that walks on land, with rows and rows of teeth.",
    colour: 0x2a5fa8,
    light: 0x9cc8ff,
    cry: {pitch: 110, swoop: 0.7},
    moves: [
      {name: "Chomp", power: "tackle", effect: "tackle", icon: "🦷"},
      {name: "Water Cannon", power: "special", effect: "bubbles", icon: "💧"},
      {name: "Tsunami", power: "superMove", effect: "bubbles", icon: "⭐"},
    ],
    evolutions: [
      {
        name: "Abyssjaw",
        blurb: "A giant shark with bony armour and two rows of teeth.",
        colour: 0x1f4a8a,
        light: 0x86b8ff,
      },
      {
        name: "Mega Abyssjaw",
        blurb:
          "From the darkest deep, with glowing stripes and a glowing lure.",
        colour: 0x13284f,
        light: 0x6ff0ff,
      },
    ],
  },
  {
    id: "thornclaw",
    form: 0,
    index: 2,
    body: "giant",
    extras: 0,
    shape: {wide: 1, tall: 1},
    tier: 1,
    height: 2.4,
    weight: 640,
    home: "the overgrown park",
    name: "Thornclaw",
    kind: "leaf",
    blurb: "A giant of the jungle, covered in thorns as sharp as knives.",
    colour: 0x2f7d32,
    light: 0xa8e08f,
    cry: {pitch: 95, swoop: 0.8},
    moves: [
      {name: "Claw Slash", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Thorn Storm", power: "special", effect: "leaves", icon: "🌵"},
      {name: "Jungle Fury", power: "superMove", effect: "leaves", icon: "⭐"},
    ],
    evolutions: [
      {
        name: "Thornking",
        blurb: "Taller, with thorn horns and a coat of armour made of bark.",
        colour: 0x2a6e2c,
        light: 0x9ed884,
      },
      {
        name: "Mega Thornking",
        blurb:
          "A crown of thorns, vines round its arms, and poison-green eyes.",
        colour: 0x1d5a20,
        light: 0xb8ff5a,
      },
    ],
  },
  {
    id: "voltsting",
    form: 0,
    index: 3,
    body: "scorpion",
    extras: 0,
    shape: {wide: 1, tall: 1},
    tier: 1,
    height: 1.1,
    weight: 95,
    home: "the power station",
    name: "Voltsting",
    kind: "spark",
    blurb: "A giant scorpion. Its tail is full of lightning.",
    colour: 0xf2b705,
    light: 0xfff0a6,
    cry: {pitch: 260, swoop: 0.4},
    moves: [
      {name: "Sting", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Thunderbolt", power: "special", effect: "zap", icon: "⚡"},
      {
        name: "Lightning Storm",
        power: "superMove",
        effect: "zap",
        icon: "⭐",
      },
    ],
    evolutions: [
      {
        name: "Stormstinger",
        blurb: "Two stingers, spikes all over its shell, and bigger pincers.",
        colour: 0xe0a800,
        light: 0xffe68a,
      },
      {
        name: "Mega Stormstinger",
        blurb: "It can fly. Three lightning stingers and a crown of spikes.",
        colour: 0xd99a00,
        light: 0x8ff7ff,
      },
    ],
  },
  {
    id: "rockjaw",
    form: 0,
    index: 4,
    body: "golem",
    extras: 0,
    shape: {wide: 1, tall: 1},
    tier: 1,
    height: 2.6,
    weight: 1500,
    home: "the old quarry",
    name: "Rockjaw",
    kind: "rock",
    blurb: "A rock giant with lava inside. It can smash a mountain.",
    colour: 0x6d665e,
    light: 0xd6cbbd,
    cry: {pitch: 70, swoop: 0.6},
    moves: [
      {name: "Smash", power: "tackle", effect: "tackle", icon: "👊"},
      {name: "Boulder Drop", power: "special", effect: "rocks", icon: "🪨"},
      {name: "Earthquake", power: "superMove", effect: "rocks", icon: "⭐"},
    ],
    evolutions: [
      {
        name: "Magmatitan",
        blurb: "Lava pours through its cracks. Rock horns and boulder fists.",
        colour: 0x5c554e,
        light: 0xffb070,
      },
      {
        name: "Mega Magmatitan",
        blurb:
          "Black as night, with a volcano on its back and lava everywhere.",
        colour: 0x2a2630,
        light: 0xff8a3a,
      },
    ],
  },
];

export function critterById(id: string): Critter | undefined {
  return CRITTERS.find(c => c.id === id);
}

/** The same beast in another form: 0 as it starts, 1 evolved, 2 Mega. */
export function atForm(critter: Critter, form: number): Critter {
  const base = SPECIES[critter.index] ?? critter;
  if (form <= base.form) {
    return base;
  }
  const evolved = base.evolutions[Math.min(form, 2) - 1];
  return {
    ...base,
    ...evolved,
    extras: base.extras | (evolved.extras ?? 0),
    form,
  };
}

/**
 * Every species: the five starters, then everything dex.ts generates. Index i
 * is species i, so `atForm` can find a beast's other forms from any one.
 */
export const SPECIES: Array<Critter> = [...CRITTERS];

/** The number on its card: three per species, one for each form. */
export function cardNumber(critter: Critter): number {
  // The one-of-a-kind beast has only its last form, and the last number.
  if (critter.tier >= 4) {
    return critter.index * 3 + 1;
  }
  return critter.index * 3 + critter.form + 1;
}

/** Rarity: rarer species, and later forms, are rarer cards. */
export function rarityOf(critter: Critter): number {
  if (critter.tier >= 4) {
    return 4;
  }
  const r = Math.min(3, critter.tier + critter.form);
  return critter.form === 2 ? Math.max(2, r) : r;
}

export const FORM_NAME = ["", "Evolved", "Mega"] as const;
