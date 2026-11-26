import "./style.css";
import {Clock} from "./anim";
import {Sounds} from "./audio";
import {Battle, type Trainer} from "./battle";
import {CardArt} from "./cards";
import {BATTLE, EVOLVE, HUNT, PACKS} from "./config";
import {
  CRITTERS,
  SPECIES,
  atForm,
  cardNumber,
  critterById,
  type Critter,
} from "./critters";
import {cardByNumber, randomCard, statsOf} from "./dex";
import {Menu} from "./menu";
import {load, save, type SaveData} from "./save";
import {Stage} from "./stage";
import {UI} from "./ui";

// Critter Cards. Pick a starter, then: fight the trainers to win booster packs
// and Critter Balls, hunt wild beasts in the darkness city and catch them,
// open packs for new cards, and fill a book of a thousand. A beast evolves,
// and Mega Evolves, as it wins.

class Game {
  readonly stage: Stage;
  readonly clock = new Clock();
  readonly sounds = new Sounds();
  readonly ui: UI;
  readonly menu: Menu;
  readonly art = new CardArt();
  readonly data: SaveData;
  battle?: Battle;
  /** The real-time loop; tests stop it and call `step` themselves. */
  running = true;
  private last = performance.now();

  constructor(mount: HTMLElement) {
    this.data = load();
    this.sounds.setMuted(this.data.muted);
    this.stage = new Stage(mount);
    this.stage.onThunder = () => this.sounds.play("thunder");
    this.ui = new UI(mount, this.art, this.sounds, this.data.muted, muted => {
      this.sounds.setMuted(muted);
      this.data.muted = muted;
      save(this.data);
    });
    this.menu = new Menu(this.ui.root, this.art, this.sounds);
    // The first touch anywhere is the one that lets iPad Safari play sound.
    window.addEventListener("pointerdown", () => this.sounds.unlock(), {
      once: true,
    });
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.running) {
      this.step(dt);
    }
    requestAnimationFrame(this.tick);
  };

  step(dt: number): void {
    this.clock.update(dt);
    this.stage.update(dt);
    this.stage.render();
  }

  /** Puts a card in the book, and says whether it is a new one. */
  own(n: number): boolean {
    const had = this.data.owned[n] ?? 0;
    this.data.owned[n] = had + 1;
    return had === 0;
  }

  async play(): Promise<void> {
    this.adoptOldSave();
    if (!this.data.active) {
      const starter = await this.ui.choose(undefined, 0, () => 0);
      const n = cardNumber(starter);
      this.own(n);
      this.data.active = n;
      this.data.packs += PACKS.start;
      this.data.balls += HUNT.startBalls;
      save(this.data);
    }
    for (;;) {
      this.ui.hideAll();
      const choice = await this.menu.home(this.data);
      if (choice === "fight") {
        await this.ladder();
      } else if (choice === "hunt") {
        await this.hunt();
      } else if (choice === "packs") {
        await this.menu.packs(this.data, () => this.openPack());
      } else {
        await this.menu.book(this.data);
      }
      save(this.data);
    }
  }

  /** A save from before the card book: give its starter back as a card. */
  private adoptOldSave(): void {
    if (this.data.active || !this.data.picked) {
      return;
    }
    const starter = critterById(this.data.picked);
    if (!starter) {
      return;
    }
    const n = cardNumber(atForm(starter, this.formFromWins(starter.id)));
    this.own(n);
    this.data.active = n;
    this.data.packs += PACKS.start;
    this.data.balls += HUNT.startBalls;
    save(this.data);
  }

  private openPack(): Array<{n: number; isNew: boolean}> {
    this.data.packs--;
    const cards = [];
    for (let i = 0; i < PACKS.cards; i++) {
      const lucky = i === PACKS.cards - 1;
      const n = randomCard(lucky ? PACKS.luckyOdds : PACKS.odds);
      cards.push({n, isNew: this.own(n)});
    }
    save(this.data);
    return cards;
  }

  /** The form a species has earned by winning, from 0 to 2. */
  private formFromWins(id: string): number {
    const wins = this.data.wins[id] ?? 0;
    if (wins >= EVOLVE.winsToMega) {
      return 2;
    }
    return wins >= EVOLVE.winsToEvolve ? 1 : 0;
  }

  /**
   * After a win: count it, and if that is enough, evolve your beast there and
   * then. Says what happened, for the result card.
   */
  private async afterWin(battle: Battle, mine: Critter): Promise<string> {
    this.data.wins[mine.id] = (this.data.wins[mine.id] ?? 0) + 1;
    const form = this.formFromWins(mine.id);
    if (form <= mine.form) {
      return "";
    }
    const before = mine.name;
    await battle.evolve(form);
    const evolved = atForm(mine, form);
    const n = cardNumber(evolved);
    this.own(n);
    this.data.active = n;
    save(this.data);
    return form === 2
      ? `${before} Mega Evolved into ${evolved.name}! `
      : `${before} evolved into ${evolved.name}! `;
  }

  private newBattle(foe: Critter, trainer: Trainer, wild: boolean): Battle {
    const mine = cardByNumber(this.data.active);
    this.ui.showBattle(mine, foe, trainer.name, 0, 1);
    return new Battle(
      this.stage,
      this.clock,
      this.ui,
      this.sounds,
      this.art,
      mine,
      foe,
      trainer,
      wild
        ? {
            balls: () => this.data.balls,
            useBall: () => {
              this.data.balls--;
              this.ui.setRound(`🔮 × ${this.data.balls}`);
              save(this.data);
            },
          }
        : undefined,
    );
  }

  /** One fight against each of the other four starters, getting harder. */
  private async ladder(): Promise<void> {
    const mine = () => cardByNumber(this.data.active);
    const others = shuffle(CRITTERS.filter(c => c.id !== mine().id));
    const rounds = BATTLE.trainers.length;
    let round = 0;
    while (round < rounds) {
      const trainer: Trainer = BATTLE.trainers[round];
      const foe = atForm(others[round % others.length], trainer.form);
      const battle = this.newBattle(foe, trainer, false);
      this.ui.setRound(`Fight ${round + 1} of ${rounds}`);
      this.battle = battle;
      const outcome = await battle.run();
      const me = mine();
      if (outcome === "won") {
        this.sounds.play("win");
        await battle.celebrate();
        const evolved = await this.afterWin(battle, me);
        round++;
        this.data.packs += PACKS.perWin;
        this.data.balls += HUNT.ballsPerWin;
        const prize = `You won a booster pack 🎁 and ${HUNT.ballsPerWin} Critter Balls 🔮!`;
        if (round === rounds) {
          this.data.trophies++;
          this.data.packs += PACKS.forChampion;
          save(this.data);
          await this.ui.showResult(
            "🏆 Champion! 🏆",
            `${evolved}${mine().name} crushed every trainer! You win ${PACKS.forChampion + PACKS.perWin} booster packs!`,
            mine(),
            [{id: "home", label: "Home", main: true}],
          );
          battle.dispose();
          return;
        }
        save(this.data);
        const choice = await this.ui.showResult(
          evolved
            ? mine().form === 2
              ? "MEGA EVOLVED! ⭐"
              : "Evolved! ✨"
            : "You won! 💥",
          `${evolved}${prize} Next up: ${BATTLE.trainers[round].name}.`,
          mine(),
          [
            {id: "next", label: "Next fight!", main: true},
            {id: "home", label: "Home"},
          ],
        );
        battle.dispose();
        if (choice === "home") {
          return;
        }
      } else {
        this.sounds.play("lose");
        const choice = await this.ui.showResult(
          "Knocked out!",
          `${me.name} got knocked out! Shake it off and fight again!`,
          me,
          [
            {id: "retry", label: "Fight again!", main: true},
            {id: "home", label: "Home"},
          ],
        );
        battle.dispose();
        if (choice === "home") {
          return;
        }
      }
    }
  }

  /** Out into the city after a wild beast, to catch it. */
  private async hunt(): Promise<void> {
    for (;;) {
      const n = randomCard(HUNT.odds);
      const wild = cardByNumber(n);
      const trainer: Trainer = {
        name: "Wild",
        form: wild.form,
        // Wild beasts are a bit weaker than a trainer's, so they can be won.
        puff: Math.round(statsOf(wild).puff * 0.6),
        hitScale: HUNT.hitScale,
      };
      const battle = this.newBattle(wild, trainer, true);
      this.ui.setRound(`🔮 × ${this.data.balls}`);
      this.battle = battle;
      const outcome = await battle.run();
      let title = "";
      let line = "";
      let card = wild;
      if (outcome === "caught") {
        const isNew = this.own(n);
        title = isNew ? "Gotcha! NEW card! 🎉" : "Gotcha! 🔮";
        line = `You caught ${wild.name}! It's in your card book now.`;
      } else if (outcome === "fled") {
        title = "It got away!";
        line = `${wild.name} ran off into the dark. Win fights to get more Critter Balls.`;
      } else {
        title = "Knocked out!";
        const me = cardByNumber(this.data.active);
        card = me;
        line = `${me.name} got knocked out, and ${wild.name} got away.`;
      }
      if (outcome === "caught") {
        // A catch counts as a win, for evolving.
        const me = cardByNumber(this.data.active);
        const evolved = await this.afterWin(battle, me);
        line = `${evolved}${line}`;
      } else if (outcome === "lost") {
        this.sounds.play("lose");
      }
      save(this.data);
      const choice = await this.ui.showResult(title, line, card, [
        {id: "again", label: "Hunt again!", main: true},
        {id: "home", label: "Home"},
      ]);
      battle.dispose();
      if (choice === "home") {
        return;
      }
    }
  }
}

function shuffle<T>(list: Array<T>): Array<T> {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app element");
}
const game = new Game(app);
if (import.meta.env.DEV) {
  const w = window as unknown as {game: Game; species: typeof SPECIES};
  w.game = game;
  w.species = SPECIES;
}
void game.play();
