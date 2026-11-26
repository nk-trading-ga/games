// What the game remembers between visits: the cards you have, your packs and
// Critter Balls, which beast you fight with, how many fights each species has
// won (which is what makes it evolve), trophies, and whether the sound is off.

const KEY = "critter-cards";

export interface SaveData {
  /** Card number → how many of it you have. */
  owned: Record<number, number>;
  packs: number;
  balls: number;
  /** The card number of the beast you fight with; 0 before you have one. */
  active: number;
  /** Fights each species has won, by id. */
  wins: Record<string, number>;
  trophies: number;
  muted: boolean;
  /** The starter picked, from before there was a card book. */
  picked?: string;
}

function blank(): SaveData {
  return {
    owned: {},
    packs: 0,
    balls: 0,
    active: 0,
    wins: {},
    trophies: 0,
    muted: false,
  };
}

const record = <T>(v: unknown): Record<string, T> =>
  typeof v === "object" && v !== null ? (v as Record<string, T>) : {};

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function load(): SaveData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return {
        owned: record<number>(d.owned),
        packs: num(d.packs),
        balls: num(d.balls),
        active: num(d.active),
        wins: record<number>(d.wins),
        trophies: num(d.trophies),
        muted: d.muted === true,
        picked: typeof d.picked === "string" ? d.picked : undefined,
      };
    }
  } catch {
    // Private browsing, or storage switched off: start fresh every time.
  }
  return blank();
}

export function save(data: SaveData): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nowhere to keep it; the game plays just the same.
  }
}
