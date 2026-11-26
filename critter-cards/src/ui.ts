import {ProgressBar} from "../../shared/progressBar";
import {SoundButton} from "../../shared/soundButton";
import type {Sounds} from "./audio";
import {cardKey, type CardArt} from "./cards";
import {CRITTERS, KIND_ICON, atForm, type Critter, type Move} from "./critters";

// Everything on screen that isn't the 3D world: the pick screen, the puff
// panels, the moves, the message banner, the numbers that pop off a hit, and
// the "you won" card.

export type Side = "player" | "foe";

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

function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

interface Panel {
  root: HTMLDivElement;
  name: HTMLDivElement;
  owner: HTMLDivElement;
  fill: HTMLDivElement;
  num: HTMLDivElement;
}

export interface ResultChoice {
  id: string;
  label: string;
  /** The big, obvious one. */
  main?: boolean;
}

export class UI {
  readonly root: HTMLDivElement;
  private readonly pick: HTMLDivElement;
  private readonly pickCards: HTMLDivElement;
  private readonly pickGo: HTMLButtonElement;
  private readonly pickNote: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly panels: Record<Side, Panel>;
  private readonly round: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly moves: HTMLDivElement;
  private readonly moveButtons: Array<HTMLButtonElement> = [];
  private readonly charge: ProgressBar;
  private readonly result: HTMLDivElement;
  private readonly popups: HTMLDivElement;
  private readonly images = new Map<string, string>();

  constructor(
    mount: HTMLElement,
    art: CardArt,
    private readonly sounds: Sounds,
    muted: boolean,
    onMute: (muted: boolean) => void,
  ) {
    for (const [id, canvas] of art.face) {
      this.images.set(id, canvas.toDataURL("image/png"));
    }
    this.root = el("div", "ui", mount);

    // ---- pick screen
    this.pick = el("div", "pick hidden", this.root);
    el("h1", "pick-title", this.pick, "Pick your beast!");
    this.pickCards = el("div", "pick-cards", this.pick);
    this.pickGo = el("button", "big-button pick-go hidden", this.pick);
    this.pickNote = el("div", "pick-note", this.pick);

    // ---- battle HUD
    this.hud = el("div", "hud hidden", this.root);
    const makePanel = (side: Side): Panel => {
      const root = el("div", `panel panel-${side}`, this.hud);
      const top = el("div", "panel-top", root);
      const name = el("div", "panel-name", top);
      const owner = el("div", "panel-owner", top);
      const track = el("div", "puff-track", root);
      const fill = el("div", "puff-fill", track);
      const num = el("div", "puff-num", root);
      return {root, name, owner, fill, num};
    };
    this.panels = {player: makePanel("player"), foe: makePanel("foe")};
    this.round = el("div", "round", this.hud);
    this.banner = el("div", "banner hidden", this.hud);
    this.moves = el("div", "moves hidden", this.hud);
    for (let i = 0; i < 3; i++) {
      const b = el("button", "move", this.moves);
      this.moveButtons.push(b);
    }
    this.charge = new ProgressBar({
      label: "",
      width: 110,
      fillColour: "#ffd257",
      doneColour: "#ffe14a",
    });
    this.charge.root.classList.add("move-charge");

    // ---- end of a battle
    this.result = el("div", "result hidden", this.root);

    this.popups = el("div", "popups", this.root);

    const sound = new SoundButton({
      muted,
      className: "sound",
      onToggle: m => {
        this.sounds.unlock();
        onMute(m);
      },
    });
    this.root.appendChild(sound.root);
  }

  /** Shows the five cards and waits for one to be picked. */
  choose(
    savedId: string | undefined,
    trophies: number,
    formOf: (id: string) => number,
  ): Promise<Critter> {
    this.hud.classList.add("hidden");
    this.result.classList.add("hidden");
    this.pick.classList.remove("hidden");
    this.pickCards.replaceChildren();
    this.pickGo.classList.add("hidden");
    this.pickNote.textContent =
      trophies > 0
        ? `🏆 × ${trophies}  You've beaten every trainer ${trophies === 1 ? "once" : `${trophies} times`}!`
        : "Tap a card to look at it.";

    return new Promise(resolve => {
      let chosen: Critter | undefined;
      const buttons: Array<HTMLButtonElement> = [];
      const select = (critter: Critter, button: HTMLButtonElement) => {
        chosen = critter;
        for (const b of buttons) {
          b.classList.toggle("chosen", b === button);
          b.classList.toggle("dim", b !== button);
        }
        this.pickGo.textContent = `I pick ${critter.name}!`;
        this.pickGo.style.background = css(critter.colour);
        this.pickGo.classList.remove("hidden");
      };
      // Each card shows its beast in the form it has reached so far.
      for (const base of CRITTERS) {
        const critter = atForm(base, formOf(base.id));
        const b = el("button", "pick-card", this.pickCards);
        b.setAttribute("aria-label", critter.name);
        const img = el("img", "", b);
        img.src = this.images.get(cardKey(critter)) ?? "";
        img.alt = critter.name;
        img.draggable = false;
        if (critter.id === savedId) {
          el("div", "pick-badge", b, "Your beast");
        }
        b.addEventListener("click", () => {
          this.sounds.unlock();
          this.sounds.cry(critter);
          select(critter, b);
        });
        buttons.push(b);
        if (critter.id === savedId) {
          select(critter, b);
        }
      }
      this.pickGo.onclick = () => {
        if (!chosen) {
          return;
        }
        this.sounds.unlock();
        this.sounds.play("pick");
        this.pick.classList.add("hidden");
        resolve(chosen);
      };
    });
  }

  showBattle(
    player: Critter,
    foe: Critter,
    trainer: string,
    round: number,
    rounds: number,
  ): void {
    this.hud.classList.remove("hidden");
    this.result.classList.add("hidden");
    const fill = (side: Side, critter: Critter, owner: string) => {
      const p = this.panels[side];
      p.name.textContent = `${KIND_ICON[critter.kind]} ${critter.name}`;
      p.owner.textContent = owner;
      p.root.style.setProperty("--critter", css(critter.colour));
      p.root.classList.add("hidden");
    };
    fill("player", player, "You");
    fill("foe", foe, trainer);
    this.round.textContent = `Fight ${round + 1} of ${rounds}`;
    this.moves.classList.add("hidden");
  }

  /** A new name on a panel, when the beast in it evolves. */
  renamePanel(side: Side, critter: Critter): void {
    const p = this.panels[side];
    p.name.textContent = `${KIND_ICON[critter.kind]} ${critter.name}`;
    p.root.style.setProperty("--critter", css(critter.colour));
  }

  showPanel(side: Side): void {
    this.panels[side].root.classList.remove("hidden");
  }

  setPuff(side: Side, puff: number, max: number): void {
    const p = this.panels[side];
    const f = Math.max(0, puff / max);
    p.fill.style.width = `${f * 100}%`;
    p.fill.style.background =
      f > 0.5 ? "#5fd35a" : f > 0.25 ? "#ffc53d" : "#ff5a4a";
    p.num.textContent = `${Math.max(0, Math.ceil(puff))} / ${max}`;
    if (f < 1) {
      p.root.classList.remove("bump");
      // Read layout so the animation restarts on every hit, not just the first.
      void p.root.offsetWidth;
      p.root.classList.add("bump");
    }
  }

  say(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove("hidden");
  }

  hush(): void {
    this.banner.classList.add("hidden");
  }

  /**
   * Shows the three moves and waits for one to be tapped. The super move is
   * greyed out until it has charged up, with a bar showing how far it has got.
   */
  chooseMove(critter: Critter, charge: number, needed: number): Promise<Move> {
    this.hush();
    this.moves.classList.remove("hidden");
    const ready = charge >= needed;
    return new Promise(resolve => {
      critter.moves.forEach((move, i) => {
        const b = this.moveButtons[i];
        b.replaceChildren();
        b.className = `move move-${move.power}`;
        el("span", "move-icon", b, move.icon);
        el("span", "move-name", b, move.name);
        b.style.setProperty("--critter", css(critter.colour));
        b.disabled = false;
        if (move.power === "superMove") {
          this.charge.set(charge / needed);
          b.appendChild(this.charge.root);
          b.classList.toggle("ready", ready);
          b.disabled = !ready;
        }
        b.onclick = () => {
          if (b.disabled) {
            return;
          }
          this.sounds.unlock();
          this.sounds.play("tap");
          this.moves.classList.add("hidden");
          resolve(move);
        };
      });
    });
  }

  /** A number or a word that jumps off a critter and floats away. */
  popup(text: string, x: number, y: number, kind: "hit" | "super"): void {
    const p = el("div", `popup popup-${kind}`, this.popups, text);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    window.setTimeout(() => p.remove(), 1400);
  }

  /** The card at the end of a battle. Resolves with the id of the button. */
  showResult(
    title: string,
    line: string,
    critter: Critter,
    choices: ReadonlyArray<ResultChoice>,
  ): Promise<string> {
    this.moves.classList.add("hidden");
    this.hush();
    this.result.replaceChildren();
    this.result.classList.remove("hidden");
    const box = el("div", "result-box", this.result);
    el("h2", "result-title", box, title);
    const img = el("img", "result-card", box);
    img.src = this.images.get(cardKey(critter)) ?? "";
    img.alt = "";
    el("p", "result-line", box, line);
    const row = el("div", "result-buttons", box);
    return new Promise(resolve => {
      for (const choice of choices) {
        const b = el(
          "button",
          choice.main ? "big-button" : "small-button",
          row,
          choice.label,
        );
        b.addEventListener("click", () => {
          this.sounds.unlock();
          this.sounds.play("tap");
          this.result.classList.add("hidden");
          resolve(choice.id);
        });
      }
    });
  }
}
