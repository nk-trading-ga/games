// What the game remembers between visits: which critter you picked last, and
// how many times you have beaten every trainer, whether the sound is off, and how many fights each beast has won.

const KEY = "critter-cards";

export interface SaveData {
  picked?: string;
  trophies: number;
  muted: boolean;
  /** Fights each beast has won, by id: what makes it evolve. */
  wins: Record<string, number>;
}

export function load(): SaveData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return {
        picked: typeof d.picked === "string" ? d.picked : undefined,
        trophies: typeof d.trophies === "number" ? d.trophies : 0,
        muted: d.muted === true,
        wins: typeof d.wins === "object" && d.wins ? d.wins : {},
      };
    }
  } catch {
    // Private browsing, or storage switched off: start fresh every time.
  }
  return {trophies: 0, muted: false, wins: {}};
}

export function save(data: SaveData): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nowhere to keep it; the game plays just the same.
  }
}
