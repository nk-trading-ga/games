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
  /**
   * The other trainers, in the order you meet them. Each gets a bit more puff,
   * and hits a bit harder, so the last battle is the hardest one. Their hits
   * are scaled down from yours so a child who taps anything at all still wins
   * most battles: a turn of ours is about 16, theirs about 16 × 0.6 ≈ 10 at
   * first, so the first battle takes them ten turns to win and us about four.
   * The later trainers bring evolved and Mega beasts, but by then yours has
   * evolved too (see EVOLVE), and its puff and its hits grow with its form.
   */
  trainers: [
    {name: "Pip", form: 0, puff: 70, hitScale: 0.6},
    {name: "Juno", form: 0, puff: 90, hitScale: 0.65},
    {name: "Bo", form: 1, puff: 125, hitScale: 0.7},
    {name: "Rex", form: 2, puff: 165, hitScale: 0.75},
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
  knockback: 0.55,
  /** Idle breathing: how much it squashes and how fast. */
  breathe: 0.025,
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

export const CITY = {
  /**
   * The street, far below. The arena is on the roof of a skyscraper, so the
   * rest of the city's towers rise from down here and only their tops come up
   * round it — which leaves the sky, its clouds and its lightning in view.
   */
  streetLevel: -14,
  /** Buildings stand in a ring between these distances from the middle. */
  innerRadius: 11,
  outerRadius: 36,
  buildings: 72,
  /** How tall a building can be, lowest to highest, from the street. */
  minHeight: 11,
  maxHeight: 24,
  /** Of the windows on a building, how many have a light on. */
  litWindows: 0.45,
};

export const STORM = {
  /** Seconds between flashes of lightning over the city, as [least, most]. */
  gap: [3.5, 8] as const,
  /** How long the whole scene stays lit up by a flash. */
  flash: 0.35,
  /**
   * The thunder comes after the flash, the way it does when the storm is a
   * little way off.
   */
  thunderDelay: 0.5,
  /** Raindrops, and how fast they fall in units a second. */
  drops: 700,
  rainSpeed: 22,
};

/**
 * The three forms of every beast: as it starts, evolved, and Mega Evolved.
 * Each is bigger, has more puff and hits harder than the last.
 */
export const FORM_SCALE = [1, 1.15, 1.32] as const;
export const FORM_PUFF = [100, 130, 170] as const;
export const FORM_HIT = [1, 1.2, 1.45] as const;

export const EVOLVE = {
  /**
   * How many fights a beast has to win to evolve, and to Mega Evolve. Counted
   * for each beast and kept between visits, so one that has evolved stays
   * evolved. Winning the first fight evolves it, the third Mega Evolves it,
   * so a first run through the four trainers shows both.
   */
  winsToEvolve: 1,
  winsToMega: 3,
  /** The evolution: glowing and spinning faster, then the burst. */
  glow: 2.2,
  burst: 0.6,
};

export const DEX = {
  /** Every generated beast comes from this seed: change it, change them all. */
  seed: 2026,
  /**
   * Species, the five starters included. Three cards each, one per form, and
   * one more for the Darkness King: 333 × 3 + 1 = 1000 cards.
   */
  species: 333,
};

/**
 * How often each rarity turns up — Common, Rare, Epic, Legendary, Mythic — as
 * weights. A booster pack has five cards; the last is the lucky one.
 */
export const PACKS = {
  cards: 5,
  odds: [70, 24, 5, 1, 0] as const,
  luckyOdds: [0, 60, 28, 11, 1] as const,
  /** Packs to start with, and what winning a fight earns. */
  start: 3,
  perWin: 1,
  forChampion: 3,
};

export const HUNT = {
  /** Which rarities wild beasts come in. */
  odds: [60, 28, 10, 2, 0] as const,
  /** Critter Balls to start with, and how many a won fight gives. */
  startBalls: 10,
  ballsPerWin: 2,
  /**
   * The chance a ball holds, by rarity, with a beast at full puff. It goes up
   * as its puff goes down, by `weakBonus` at no puff at all; and a beast
   * knocked out can't get away.
   */
  catchChance: [0.5, 0.35, 0.22, 0.12, 0.05] as const,
  weakBonus: 0.5,
  /** Wild beasts hit softer than trainers' do. */
  hitScale: 0.55,
};

export const BOSS = {
  /** How much bigger than a normal beast a boss stands. */
  scale: 1.6,
  /**
   * But never taller than this, in world units: past it the head goes off the
   * top of the screen. A tall boss is grown less than a squat one.
   */
  maxHeight: 3.3,
  /**
   * A boss stands this much further back than a trainer's beast, so all of
   * it — head, horns, crown — fits on screen.
   */
  pushBack: 2.6,
  /**
   * Puff for each boss in turn, the last being the Darkness King, and how
   * hard they hit. Low hitting for their size, so a child whose beast has
   * evolved wins most boss fights; it takes a while, which is what makes it a
   * boss. The Darkness King hits about 16 × 1.9 × 0.4 ≈ 12 a turn, 16 when
   * enraged, so a Mega beast's 170 puff lasts the eleven or so turns it takes
   * to bring down his 360.
   */
  puff: [200, 215, 230, 245, 260, 275, 290, 305, 320, 360] as const,
  hitScale: [
    0.35, 0.35, 0.36, 0.36, 0.37, 0.37, 0.38, 0.38, 0.38, 0.4,
  ] as const,
  /** Below this much of its puff, a boss is enraged: it glows and hits harder. */
  rageAt: 0.5,
  rageHit: 1.3,
  /** What beating one wins. */
  packs: 3,
  balls: 5,
  /** Seconds between flashes of lightning while a boss is out. */
  stormGap: [0.8, 2] as const,
};
