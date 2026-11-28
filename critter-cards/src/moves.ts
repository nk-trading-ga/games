import type {Kind, Move} from "./critters";

// What a move does, read from its name, so it does what it says: Big Punch
// throws a punch, Fang Bite bites, Tail Swipe swings the tail round, Geyser
// blows water up out of the ground, Meteor drops a burning rock from the sky.

/** The ways a beast can hit up close, running in. */
export type Melee =
  | "bite"
  | "punch"
  | "kick"
  | "slash"
  | "tail"
  | "slam"
  | "sting"
  | "squeeze"
  | "ram"
  | "pounce"
  | "spit";

/** The ways a move can come at its target from a distance. */
export type Ranged =
  /** Thrown or shot across: the kind's own move (fireballs, jets…). */
  | "volley"
  /** Round bubbles, floating over. */
  | "bubbles"
  /** Something huge falling out of the sky. */
  | "meteor"
  /** Stars raining down. */
  | "stars"
  /** Bursting up out of the ground under the target. */
  | "erupt"
  /** A wall of it rolling across the roof. */
  | "wave"
  /** Rings blasting out from the attacker. */
  | "pulse"
  /** A whirl spinning round the target. */
  | "vortex"
  /** Everything sucked into a dark point, then burst. */
  | "blackHole"
  /** One long blazing beam. */
  | "beam"
  /** Giant jaws snapping shut on the target. */
  | "jaws"
  /** Giant claw marks. */
  | "slashes"
  /** A cloud of it, smothering the target. */
  | "cloud"
  /** A giant flower opening and bursting. */
  | "bloom"
  /** A bubble of power closing in and squeezing. */
  | "crush";

export type Style = {melee: Melee} | {ranged: Ranged};

/** First match wins, so the more particular words come first. */
const MELEE: Array<[RegExp, Melee]> = [
  [/pincer|sting|stab|needle|strike/i, "sting"],
  [/bite|chomp|snap|jaw|fang|maw/i, "bite"],
  [/punch|fist|smash|jab/i, "punch"],
  [/kick/i, "kick"],
  [/tail|swipe|whip|slap/i, "tail"],
  [/stomp|pound|slam|bash/i, "slam"],
  [/squeeze|constrict|grapple|grip|crush/i, "squeeze"],
  [/headbutt|ram|roll|charge|bump/i, "ram"],
  [/pounce|leap/i, "pounce"],
  [/ink|splat|spit/i, "spit"],
  [/slash|claw|scratch|maul/i, "slash"],
];

const RANGED: Array<[RegExp, Style]> = [
  // Fighting moves that are really a beast running in.
  [/kick/i, {melee: "kick"}],
  [/champion smash/i, {melee: "slam"}],
  [/bubble/i, {ranged: "bubbles"}],
  [/black hole/i, {ranged: "blackHole"}],
  [/whirlpool|hurricane|cyclone/i, {ranged: "vortex"}],
  [
    /meteor|sky inferno|mountain fall|thunder fall|eclipse|midnight|nightmare/i,
    {ranged: "meteor"},
  ],
  [/star|cosmic|astral/i, {ranged: "stars"}],
  [
    /volcano|geyser|root|vine|quake|earthquake|shadow spike/i,
    {ranged: "erupt"},
  ],
  [/heat wave|tsunami|flood|tidal|landslide|avalanche/i, {ranged: "wave"}],
  [/pulse|roar|shock wave|psi wave|gloom|hex|dream/i, {ranged: "pulse"}],
  [/beam|cannon|plasma|mega volt|sun blast|hydro/i, {ranged: "beam"}],
  [/fang|bite|jaw/i, {ranged: "jaws"}],
  [/slash/i, {ranged: "slashes"}],
  [/spore|cloud|ink|static/i, {ranged: "cloud"}],
  [/bloom/i, {ranged: "bloom"}],
  [/crush|brain/i, {ranged: "crush"}],
];

/**
 * Some moves are better as their kind's own throw than as anything their
 * name might suggest: a Water Cannon is jets of water, which is just what the
 * water kind throws.
 */
const KEEP_VOLLEY = /water cannon/i;

export function styleOf(move: Move): Style {
  if (move.power === "tackle") {
    for (const [re, melee] of MELEE) {
      if (re.test(move.name)) {
        return {melee};
      }
    }
    return {melee: "slash"};
  }
  if (KEEP_VOLLEY.test(move.name)) {
    return {ranged: "volley"};
  }
  for (const [re, style] of RANGED) {
    if (re.test(move.name)) {
      return style;
    }
  }
  return {ranged: "volley"};
}

/**
 * How a beast reacts to being hit, so every kind of hit looks different:
 * punched, its head snaps back; burned, it hops about with flames on it;
 * zapped, it shakes and flickers; soaked, it shakes itself off like a dog.
 */
export type Reaction =
  | "head"
  | "side"
  | "spin"
  | "flatten"
  | "burn"
  | "shock"
  | "wet"
  | "float"
  | "shadow"
  | "squeeze";

const BY_KIND: Record<Kind, Reaction> = {
  fire: "burn",
  water: "wet",
  leaf: "side",
  spark: "shock",
  rock: "flatten",
  dragon: "burn",
  psychic: "float",
  fighting: "head",
  dark: "shadow",
};

const BY_MELEE: Record<Melee, Reaction> = {
  bite: "head",
  punch: "head",
  kick: "head",
  ram: "head",
  slash: "side",
  pounce: "side",
  sting: "side",
  tail: "spin",
  slam: "flatten",
  squeeze: "squeeze",
  spit: "shadow",
};

const BY_RANGED: Partial<Record<Ranged, Reaction>> = {
  meteor: "flatten",
  vortex: "spin",
  blackHole: "spin",
  jaws: "head",
  slashes: "side",
  bloom: "float",
  crush: "squeeze",
  stars: "float",
  bubbles: "wet",
};

export function reactionOf(style: Style, kind: Kind): Reaction {
  if ("melee" in style) {
    return BY_MELEE[style.melee];
  }
  return BY_RANGED[style.ranged] ?? BY_KIND[kind];
}

/** The hits worth slowing time down for: the big, satisfying ones. */
export function isHeavy(style: Style): boolean {
  if ("melee" in style) {
    return ["punch", "kick", "ram", "slam", "bite"].includes(style.melee);
  }
  return ["meteor", "jaws", "blackHole"].includes(style.ranged);
}
