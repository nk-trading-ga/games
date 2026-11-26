// Every tunable number in the game, grouped by system.

export const ARENA = {
  /** Where each critter stands. The player's is near the camera, on the left. */
  playerSpot: {x: -2.1, z: 1.3},
  foeSpot: {x: 2.1, z: -1.3},
  /**
   * How far beside its critter a card lies once the critter is out. To the
   * side rather than in front, so the player's card never covers its critter.
   */
  cardBeside: 1.15,
  /** Radius of the grassy platform the battle happens on. */
  radius: 7,
};

export const CAMERA = {
  position: {x: -3.5, y: 2.8, z: 7.6},
  lookAt: {x: 0.3, y: 0.85, z: -0.1},
  /** Vertical field of view on a landscape screen. */
  fov: 38,
  /**
   * The horizontal angle the camera must always see, in degrees. On a tall,
   * narrow phone the vertical fov is widened until this much fits across, so
   * both critters stay on screen. 50° keeps both critters and their cards
   * in on a phone held upright without shrinking them to dots.
   */
  minHorizontalFov: 50,
};

export const CARD = {
  width: 1.0,
  height: 1.4,
  thickness: 0.03,
  /** Pixel size of the art drawn on a card, for the screen and the 3D card. */
  artWidth: 320,
  artHeight: 448,
  /** How high a card floats when its critter comes out. */
  riseHeight: 1.35,
  /** The card's size when it lies beside its critter, as a fraction. */
  restScale: 0.55,
};

export const TIMING = {
  /** Card rising up off the grass and turning to face you. */
  cardRise: 0.7,
  /** The card shaking and glowing before the critter pops out. */
  cardGlow: 0.55,
  /** The critter growing out of the card. */
  popOut: 0.45,
  /** Dropping from the card down onto its spot. */
  drop: 0.35,
  /** A pause between one critter's move and the other's, to take it in. */
  betweenTurns: 0.7,
  /** How long a line in the message banner stays before the action. */
  announce: 0.75,
  /** Shrinking back into the card when it has no puff left. */
  faint: 0.9,
  /** A critter hit: how long it flashes white. */
  hitFlash: 0.28,
};

export const BATTLE = {
  /** Puff (hit points) for the player's critter in every battle. */
  playerPuff: 100,
  /**
   * The other trainers, in the order you meet them. Each gets a bit more puff,
   * and hits a bit harder, so the last battle is the hardest one. Their hits
   * are scaled down from yours so a child who taps anything at all still wins
   * most battles: a turn of ours is about 16, theirs about 16 × 0.6 ≈ 10 at
   * first, so the first battle takes them ten turns to win and us about four.
   */
  trainers: [
    {name: "Pip", puff: 70, hitScale: 0.6},
    {name: "Juno", puff: 85, hitScale: 0.7},
    {name: "Bo", puff: 100, hitScale: 0.8},
    {name: "Rex", puff: 115, hitScale: 0.9},
  ],
  /** Damage of each kind of move, as [lowest, highest]. */
  damage: {
    tackle: [9, 12] as const,
    special: [14, 18] as const,
    superMove: [27, 32] as const,
  },
  /** The bonus when a move's kind is strong against the target's. */
  superHitScale: 1.5,
  /** Turns of your own before your super move is ready. */
  superCharge: 2,
};

export const MOTION = {
  /** How far a tackle runs at the other critter, as a fraction of the gap. */
  tackleReach: 0.72,
  tackleOut: 0.28,
  tackleBack: 0.35,
  /** How far a critter is knocked back by a hit. */
  knockback: 0.35,
  /** Idle breathing: how much it squashes and how fast. */
  breathe: 0.035,
  breatheRate: 2.4,
};

export const EFFECTS = {
  /** Screen shake for a super move, in world units, and how long it lasts. */
  shake: 0.16,
  shakeTime: 0.45,
  /** Seconds a projectile takes to cross from one critter to the other. */
  flight: 0.55,
  /** Gap between one projectile and the next in a volley. */
  stagger: 0.09,
  /** How much bigger everything is in a super move. */
  superScale: 1.6,
};
