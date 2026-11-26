import type {Sounds} from "./audio";
import {RARITY_COLOUR, type CardArt} from "./cards";
import {
  KIND_ICON,
  KIND_NAME,
  RARITY,
  RARITY_STARS,
  cardNumber,
  rarityOf,
  type Critter,
} from "./critters";
import {BOSSES, CARD_COUNT, cardByNumber, statsOf} from "./dex";

// The screens between fights: home, booster packs, the card book, and a
// card's details.

export type HomeChoice = "boss" | "fight" | "hunt" | "packs" | "cards";

/** What the screens need to know, and to change, about the player's things. */
export interface Collection {
  owned: Record<number, number>;
  packs: number;
  balls: number;
  active: number;
  /** How many of the bosses, in order, have been beaten. */
  bosses: number;
}

const PER_PAGE = 20;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) {
    e.textContent = text;
  }
  parent?.appendChild(e);
  return e;
}

export class Menu {
  private readonly root: HTMLDivElement;

  constructor(
    mount: HTMLElement,
    private readonly art: CardArt,
    private readonly sounds: Sounds,
  ) {
    this.root = el("div", "menu-layer", mount);
  }

  private screen(className: string): HTMLDivElement {
    this.root.replaceChildren();
    return el("div", `screen ${className}`, this.root);
  }

  hide(): void {
    this.root.replaceChildren();
  }

  private button(
    parent: HTMLElement,
    className: string,
    text: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const b = el("button", className, parent, text);
    b.addEventListener("click", () => {
      this.sounds.unlock();
      this.sounds.play("tap");
      onClick();
    });
    return b;
  }

  /** Home: your beast, and what to do next. */
  home(c: Collection): Promise<HomeChoice> {
    const s = this.screen("home");
    el("h1", "home-title", s, "Critter Cards");
    const row = el("div", "home-row", s);
    const mine = cardByNumber(c.active);
    const side = el("div", "home-active", row);
    const img = el("img", "home-card", side);
    img.src = this.art.url(mine);
    img.alt = mine.name;
    el("div", "home-caption", side, `Your beast: ${mine.name}`);
    const owned = Object.keys(c.owned).length;
    return new Promise(resolve => {
      const buttons = el("div", "home-buttons", row);
      const go = (choice: HomeChoice) => () => {
        this.hide();
        resolve(choice);
      };
      const big = (cls: string, icon: string, label: string, sub: string) => {
        const b = this.button(
          buttons,
          `home-button ${cls}`,
          "",
          go(cls as HomeChoice),
        );
        el("span", "home-icon", b, icon);
        const words = el("span", "home-words", b);
        el("span", "home-label", words, label);
        el("span", "home-sub", words, sub);
        return b;
      };
      const boss = Math.min(c.bosses, BOSSES.length - 1);
      big(
        "boss",
        "👹",
        "Boss Battles",
        c.bosses >= BOSSES.length
          ? "You beat them all! Fight them again"
          : `Boss ${boss + 1} of ${BOSSES.length}: ${BOSSES[boss].title}`,
      );
      big("fight", "⚔️", "Fight Trainers", "Win packs and Critter Balls");
      big(
        "hunt",
        "🌃",
        "Hunt Wild Beasts",
        `Catch them! 🔮 × ${c.balls} Critter Balls`,
      );
      const packs = big(
        "packs",
        "🎁",
        "Open Packs",
        c.packs > 0 ? `You have ${c.packs}!` : "Win fights to get more",
      );
      if (c.packs > 0) {
        el("span", "badge", packs, String(c.packs));
      }
      big("cards", "📖", "My Cards", `${owned} of ${CARD_COUNT} found`);
      this.button(side, "small-button", "Change beast", go("cards"));
    });
  }

  /**
   * Opening booster packs. `open` uses up a pack and says which cards were in
   * it, and which of them are new.
   */
  packs(
    c: Collection,
    open: () => Array<{n: number; isNew: boolean}>,
  ): Promise<void> {
    return new Promise(resolve => {
      const show = () => {
        const s = this.screen("packs");
        this.button(s, "close-button", "✕", () => {
          this.hide();
          resolve();
        });
        el("h2", "screen-title", s, "Booster Packs");
        if (c.packs <= 0) {
          el("p", "screen-note", s, "No packs left. Win fights to get more!");
          this.button(s, "big-button", "Back", () => {
            this.hide();
            resolve();
          });
          return;
        }
        el(
          "p",
          "screen-note",
          s,
          `You have ${c.packs} pack${c.packs === 1 ? "" : "s"}. Tap one to tear it open!`,
        );
        const pack = el("button", "pack", s);
        el("span", "pack-star", pack, "★");
        el("span", "pack-name", pack, "CRITTER CARDS");
        el("span", "pack-sub", pack, "5 cards inside");
        pack.addEventListener("click", () => {
          this.sounds.unlock();
          this.sounds.play("whoosh");
          pack.classList.add("tearing");
          window.setTimeout(() => reveal(s, open()), 450);
        });
      };
      const reveal = (
        s: HTMLDivElement,
        cards: Array<{n: number; isNew: boolean}>,
      ) => {
        s.querySelector(".pack")?.remove();
        s.querySelector(".screen-note")!.textContent =
          "Tap each card to flip it!";
        const row = el("div", "pack-cards", s);
        let flipped = 0;
        const done = el("div", "pack-done hidden", s);
        cards.forEach(({n, isNew}, i) => {
          const critter = cardByNumber(n);
          const rarity = rarityOf(critter);
          const card = el("button", `flip rarity-${rarity}`, row);
          card.style.animationDelay = `${i * 90}ms`;
          const inner = el("div", "flip-inner", card);
          const back = el("img", "flip-back", inner);
          back.src = this.art.back.toDataURL();
          const front = el("img", "flip-front", inner);
          front.src = this.art.url(critter);
          if (isNew) {
            el("span", "new-badge", card, "NEW!");
          }
          card.addEventListener("click", () => {
            if (card.classList.contains("flipped")) {
              this.details(critter, c);
              return;
            }
            card.classList.add("flipped");
            this.sounds.unlock();
            this.sounds.play(rarity >= 2 ? "win" : "pick");
            flipped++;
            if (flipped === cards.length) {
              done.classList.remove("hidden");
            }
          });
        });
        if (c.packs > 0) {
          this.button(done, "big-button", `Open another (${c.packs})`, show);
        }
        this.button(done, "small-button", "Back", () => {
          this.hide();
          resolve();
        });
      };
      show();
    });
  }

  /**
   * The bosses, in a row: the ones beaten, the next one to fight, and the
   * rest locked. Resolves with the one picked, or -1 to go back.
   */
  bosses(c: Collection): Promise<number> {
    return new Promise(resolve => {
      const s = this.screen("bosses");
      this.button(s, "close-button", "✕", () => {
        this.hide();
        resolve(-1);
      });
      el("h2", "screen-title", s, "👹 Boss Battles 👹");
      el(
        "p",
        "screen-note",
        s,
        c.bosses >= BOSSES.length
          ? "You beat every boss! Fight any of them again."
          : "Beat a boss to win its card, 3 packs and 5 Critter Balls!",
      );
      const row = el("div", "boss-row", s);
      BOSSES.forEach((boss, i) => {
        const beaten = i < c.bosses;
        const open = i <= c.bosses;
        const slot = el(
          "div",
          `boss-slot${open ? "" : " locked"}${i === BOSSES.length - 1 ? " final" : ""}`,
          row,
        );
        if (open) {
          const critter = cardByNumber(boss.n);
          const img = el("img", "boss-card", slot);
          img.src = this.art.url(critter);
          img.alt = critter.name;
          el("div", "boss-title", slot, boss.title);
          this.button(
            slot,
            beaten ? "small-button" : "big-button",
            beaten ? "Fight again" : "FIGHT!",
            () => {
              this.hide();
              resolve(i);
            },
          );
          if (beaten) {
            el("span", "boss-beaten", slot, "✔");
          }
        } else {
          el("div", "boss-lock", slot, "🔒");
          el(
            "div",
            "boss-title",
            slot,
            i === BOSSES.length - 1 ? "???" : boss.title,
          );
        }
      });
    });
  }

  /** The book of all the cards, a page at a time. */
  book(c: Collection): Promise<void> {
    return new Promise(resolve => {
      let page = 0;
      let onlyMine = false;
      const show = () => {
        const s = this.screen("book");
        this.button(s, "close-button", "✕", () => {
          this.hide();
          resolve();
        });
        const found = Object.keys(c.owned).length;
        el("h2", "screen-title", s, `My Cards  ${found} / ${CARD_COUNT}`);
        const numbers = onlyMine
          ? Object.keys(c.owned)
              .map(Number)
              .sort((a, b) => a - b)
          : Array.from({length: CARD_COUNT}, (_, i) => i + 1);
        const pages = Math.max(1, Math.ceil(numbers.length / PER_PAGE));
        page = Math.min(page, pages - 1);
        const bar = el("div", "book-bar", s);
        this.button(
          bar,
          "small-button",
          onlyMine ? "Show all 1000" : "Only mine",
          () => {
            onlyMine = !onlyMine;
            page = 0;
            show();
          },
        );
        const grid = el("div", "book-grid", s);
        const slots = numbers.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
        // Owned cards are drawn one a frame, so a page appears at once and
        // fills in, rather than freezing while twenty cards are drawn.
        const todo: Array<() => void> = [];
        for (const n of slots) {
          const count = c.owned[n] ?? 0;
          if (count === 0) {
            const slot = el("div", "slot slot-empty", grid);
            el("span", "slot-number", slot, `#${n}`);
            el("span", "slot-mystery", slot, "?");
            continue;
          }
          const slot = el("button", "slot", grid);
          const img = el("img", "slot-card", slot);
          img.alt = "";
          if (n === c.active) {
            el("span", "slot-active", slot, "⚔️");
          }
          if (count > 1) {
            el("span", "slot-count", slot, `×${count}`);
          }
          const critter = cardByNumber(n);
          todo.push(() => {
            img.src = this.art.url(critter);
          });
          slot.addEventListener("click", () => {
            this.sounds.unlock();
            this.sounds.play("tap");
            void this.details(critter, c).then(show);
          });
        }
        const drawNext = () => {
          const job = todo.shift();
          if (job && grid.isConnected) {
            job();
            requestAnimationFrame(drawNext);
          }
        };
        requestAnimationFrame(drawNext);
        const nav = el("div", "book-nav", s);
        const prev = this.button(nav, "nav-button", "◀", () => {
          page = Math.max(0, page - 1);
          show();
        });
        prev.disabled = page === 0;
        el("span", "book-page", nav, `Page ${page + 1} of ${pages}`);
        const next = this.button(nav, "nav-button", "▶", () => {
          page = Math.min(pages - 1, page + 1);
          show();
        });
        next.disabled = page >= pages - 1;
      };
      show();
    });
  }

  /** One card, big, with everything about it. */
  details(critter: Critter, c: Collection): Promise<void> {
    return new Promise(resolve => {
      const layer = el("div", "detail", this.root);
      const box = el("div", "detail-box", layer);
      const close = () => {
        layer.remove();
        resolve();
      };
      this.button(box, "close-button", "✕", close);
      const img = el("img", "detail-card", box);
      img.src = this.art.url(critter);
      img.alt = critter.name;
      const info = el("div", "detail-info", box);
      const n = cardNumber(critter);
      const rarity = rarityOf(critter);
      el("h2", "detail-name", info, critter.name);
      const stars = el(
        "div",
        "detail-rarity",
        info,
        `#${n} · ${RARITY_STARS[rarity]} ${RARITY[rarity]}`,
      );
      stars.style.color = RARITY_COLOUR[rarity];
      const stats = statsOf(critter);
      const rows: Array<[string, string]> = [
        ["Kind", `${KIND_ICON[critter.kind]} ${KIND_NAME[critter.kind]}`],
        ["Height", `${critter.height} m`],
        ["Weight", `${critter.weight} kg`],
        ["Lives in", critter.home],
        ["Puff", `❤️ ${stats.puff}`],
        ["Power", `💪 ${stats.power}`],
        ["You have", `${c.owned[n] ?? 0}`],
      ];
      const table = el("div", "detail-table", info);
      for (const [k, v] of rows) {
        el("span", "detail-key", table, k);
        el("span", "detail-value", table, v);
      }
      el("p", "detail-blurb", info, critter.blurb);
      const moves = el("div", "detail-moves", info);
      for (const m of critter.moves) {
        el("div", "detail-move", moves, `${m.icon} ${m.name}`);
      }
      if ((c.owned[n] ?? 0) > 0 && c.active !== n) {
        this.button(info, "big-button", "⚔️ Fight with this one", () => {
          c.active = n;
          this.sounds.cry(critter);
          close();
        });
      } else if (c.active === n) {
        el("div", "detail-active", info, "⚔️ This is your fighter");
      }
    });
  }
}
