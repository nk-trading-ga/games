// The five critters you can pick from, and what each of them can do.

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
    id: "emberpup",
    name: "Emberpup",
    kind: "fire",
    blurb: "A warm little pup with a flame for a tail.",
    colour: 0xff7a2f,
    light: 0xffd2a8,
    cry: {pitch: 520, swoop: 1.6},
    moves: [
      {name: "Pounce", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Fire Ball", power: "special", effect: "fireball", icon: "🔥"},
      {name: "Fire Storm", power: "superMove", effect: "fireball", icon: "⭐"},
    ],
  },
  {
    id: "splashfin",
    name: "Splashfin",
    kind: "water",
    blurb: "A round, bouncy seal who loves to blow bubbles.",
    colour: 0x3ea8ff,
    light: 0xbfe4ff,
    cry: {pitch: 380, swoop: 0.7},
    moves: [
      {name: "Belly Bump", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Bubble Blast", power: "special", effect: "bubbles", icon: "💧"},
      {name: "Big Wave", power: "superMove", effect: "bubbles", icon: "⭐"},
    ],
  },
  {
    id: "thornbun",
    name: "Thornbun",
    kind: "leaf",
    blurb: "A bunny with leafy ears and a flower on top.",
    colour: 0x56c25a,
    light: 0xcdf2c0,
    cry: {pitch: 700, swoop: 1.3},
    moves: [
      {name: "Hop Kick", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Leaf Swirl", power: "special", effect: "leaves", icon: "🍃"},
      {name: "Petal Storm", power: "superMove", effect: "leaves", icon: "⭐"},
    ],
  },
  {
    id: "sparkbug",
    name: "Sparkbug",
    kind: "spark",
    blurb: "A shiny beetle that crackles when it's happy.",
    colour: 0xffcc1f,
    light: 0xfff0a6,
    cry: {pitch: 880, swoop: 0.5},
    moves: [
      {name: "Buzz Bump", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Zap", power: "special", effect: "zap", icon: "⚡"},
      {name: "Thunder Storm", power: "superMove", effect: "zap", icon: "⭐"},
    ],
  },
  {
    id: "pebblet",
    name: "Pebblet",
    kind: "rock",
    blurb: "A sleepy rock with moss on its head and a gem on its back.",
    colour: 0x9a8f80,
    light: 0xe2dbcf,
    cry: {pitch: 240, swoop: 0.8},
    moves: [
      {name: "Roll", power: "tackle", effect: "tackle", icon: "💥"},
      {name: "Rock Drop", power: "special", effect: "rocks", icon: "🪨"},
      {name: "Rock Slide", power: "superMove", effect: "rocks", icon: "⭐"},
    ],
  },
];

export function critterById(id: string): Critter | undefined {
  return CRITTERS.find(c => c.id === id);
}
