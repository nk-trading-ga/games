import "./style.css";
import {Clock} from "./anim";
import {Sounds} from "./audio";
import {Battle, type Trainer} from "./battle";
import {drawAllCards, type CardArt} from "./cards";
import {BATTLE} from "./config";
import {CRITTERS, type Critter} from "./critters";
import {load, save, type SaveData} from "./save";
import {Stage} from "./stage";
import {UI} from "./ui";

// Critter Cards: pick one of five cards, then battle the other four trainers
// one after another. Your critter jumps out of its card for every battle and
// goes back into it at the end.

class Game {
  readonly stage: Stage;
  readonly clock = new Clock();
  readonly sounds = new Sounds();
  readonly ui: UI;
  readonly art: CardArt;
  readonly data: SaveData;
  battle?: Battle;
  /** The real-time loop; tests stop it and call `step` themselves. */
  running = true;
  private last = performance.now();

  constructor(mount: HTMLElement) {
    this.data = load();
    this.sounds.setMuted(this.data.muted);
    this.stage = new Stage(mount);
    this.art = drawAllCards();
    this.stage.onThunder = () => this.sounds.play("thunder");
    this.ui = new UI(mount, this.art, this.sounds, this.data.muted, muted => {
      this.sounds.setMuted(muted);
      this.data.muted = muted;
      save(this.data);
    });
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

  async play(): Promise<void> {
    for (;;) {
      const mine = await this.ui.choose(this.data.picked, this.data.trophies);
      this.data.picked = mine.id;
      save(this.data);
      await this.ladder(mine);
    }
  }

  /** One battle against each of the other four critters, in a random order. */
  private async ladder(mine: Critter): Promise<void> {
    const others = shuffle(CRITTERS.filter(c => c.id !== mine.id));
    const rounds = others.length;
    let round = 0;
    while (round < rounds) {
      const foe = others[round];
      const trainer: Trainer = BATTLE.trainers[round];
      this.ui.showBattle(mine, foe, trainer.name, round, rounds);
      const battle = new Battle(
        this.stage,
        this.clock,
        this.ui,
        this.sounds,
        this.art,
        mine,
        foe,
        trainer,
      );
      this.battle = battle;
      const outcome = await battle.run();

      if (outcome === "won") {
        this.sounds.play("win");
        await battle.celebrate();
        round++;
        if (round === rounds) {
          this.data.trophies++;
          save(this.data);
          const choice = await this.ui.showResult(
            "🏆 Champion! 🏆",
            `${mine.name} crushed every trainer! Nobody can beat you!`,
            mine.id,
            [
              {id: "again", label: "Play again", main: true},
              {id: "pick", label: "Pick a new beast"},
            ],
          );
          battle.dispose();
          if (choice === "again") {
            await this.ladder(mine);
          }
          return;
        }
        const choice = await this.ui.showResult(
          "You won! 💥",
          `${mine.name} beat ${trainer.name}! Next up: ${BATTLE.trainers[round].name}.`,
          mine.id,
          [
            {id: "next", label: "Next fight!", main: true},
            {id: "pick", label: "Pick a new beast"},
          ],
        );
        battle.dispose();
        if (choice === "pick") {
          return;
        }
      } else {
        this.sounds.play("lose");
        const choice = await this.ui.showResult(
          "Knocked out!",
          `${mine.name} got knocked out! Shake it off and fight again!`,
          mine.id,
          [
            {id: "retry", label: "Fight again!", main: true},
            {id: "pick", label: "Pick a new beast"},
          ],
        );
        battle.dispose();
        if (choice === "pick") {
          return;
        }
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
  (window as unknown as {game: Game}).game = game;
}
void game.play();
