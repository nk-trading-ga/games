// The five beasts you can pick from, and what each of them can do.

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

export interface Critter {
  id: string;
  name: string;
  kind: Kind;
  /** One line for the card, in words a child can read. */
  blurb: string;
  /** Main body colour, also the card's colour. */
  colour: number;
  /** A lighter colour for the card's background and the particles. */
  light: number;
  /** The noise it makes: a pitch in Hz and how much it swoops. */
  cry: {pitch: number; swoop: number};
  moves: readonly [Move, Move, Move];
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
  },
  {
    id: "tidejaw",
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
  },
  {
    id: "thornclaw",
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
  },
  {
    id: "voltsting",
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
  },
  {
    id: "rockjaw",
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
  },
];

export function critterById(id: string): Critter | undefined {
  return CRITTERS.find(c => c.id === id);
}
