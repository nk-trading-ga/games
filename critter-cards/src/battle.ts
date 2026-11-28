import * as THREE from "three";
import {Clock, Ease, lerp} from "./anim";
import type {Sounds} from "./audio";
import {Card3D, type CardArt} from "./cards";
import {
  ARENA,
  BATTLE,
  CARD,
  EVOLVE,
  BOSS,
  HUNT,
  LIVELY,
  FORM_SCALE,
  MOTION,
  TIMING,
} from "./config";
import {
  STRONG_AGAINST,
  atForm,
  rarityOf,
  type Critter,
  type Move,
} from "./critters";
import {statsOf} from "./dex";
import {isHeavy, reactionOf, styleOf, type Melee, type Reaction} from "./moves";
import {Effects} from "./effects";
import {buildCritter, type CritterModel} from "./models";
import type {Stage} from "./stage";
import type {Side, UI} from "./ui";

// One battle: two cards on the grass, two critters out of them, turns back and
// forth until one of them is out of puff and goes back into its card.

export interface Trainer {
  name: string;
  /** The form their beast is in: 0, 1 evolved, or 2 Mega. */
  form: number;
  puff: number;
  hitScale: number;
}

interface Fighter {
  side: Side;
  critter: Critter;
  /** Placed by the battle: where it stands, which way it faces. */
  root: THREE.Group;
  /** The model inside, animated every frame. Never moved by the battle. */
  model: CritterModel;
  card: Card3D;
  spot: THREE.Vector3;
  /** Where its card lies once the critter is out. */
  cardSpot: THREE.Vector3;
  yaw: number;
  puff: number;
  maxPuff: number;
  /** Turns taken since its last super move. */
  charge: number;
  /** Seconds of white flash left after being hit. */
  flash: number;
  /** How bright it is glowing as it evolves, 0 to 1. */
  glow: number;
  /** A squash from landing or being hit, decaying back to 0. */
  squash: number;
  out: boolean;
  /** How much bigger than a normal beast: a boss is huge. */
  bigness: number;
  /** Its body's pose now, and the pose it is moving toward. */
  pose: Pose;
  poseTo: Pose;
  /** How it is reacting to being hit, if it is. */
  react: {type: Reaction; t: number; time: number; sign: number} | null;
  /** Showing off between turns: a jab, a roar, a hop. */
  taunt: {type: "jab" | "roar" | "hop"; t: number} | null;
  nextTaunt: number;
  /** Taking its turn: no showing off in the middle of an attack. */
  busy: boolean;
  /** A boss below half its puff: glowing red, hitting harder. */
  enraged: boolean;
}

/** How a beast holds itself: leaning, twisting, crouched or stretched up. */
interface Pose {
  lean: number;
  twist: number;
  crouch: number;
  stretch: number;
}

const STILL: Pose = {lean: 0, twist: 0, crouch: 0, stretch: 0};

export type Outcome = "won" | "lost" | "caught" | "fled";

/** A boss fight: a huge beast, a title, and a temper. */
export interface BossFight {
  title: string;
}

/** For a fight with a wild beast: the player's Critter Balls. */
export interface Wild {
  balls: () => number;
  useBall: () => void;
}

const roll = ([lo, hi]: readonly [number, number]) =>
  lo + Math.random() * (hi - lo);

export class Battle {
  private readonly player: Fighter;
  private readonly foe: Fighter;
  private readonly effects: Effects;
  private readonly fighters: Array<Fighter>;
  private alive = true;

  constructor(
    private readonly stage: Stage,
    private readonly clock: Clock,
    private readonly ui: UI,
    private readonly sounds: Sounds,
    private readonly art: CardArt,
    playerCritter: Critter,
    foeCritter: Critter,
    private readonly trainer: Trainer,
    private readonly wild?: Wild,
    private readonly boss?: BossFight,
    /** Two players on one iPad: both sides are tapped, neither is the game. */
    private readonly versus = false,
  ) {
    this.effects = new Effects(stage, clock, sounds);
    this.player = this.makeFighter(
      "player",
      playerCritter,
      statsOf(playerCritter).puff,
      art,
    );
    this.foe = this.makeFighter("foe", foeCritter, trainer.puff, art);
    this.fighters = [this.player, this.foe];
    this.clock.every(dt => {
      if (!this.alive) {
        return true;
      }
      for (const f of this.fighters) {
        this.animate(f, dt);
      }
      return false;
    });
  }

  private makeFighter(
    side: Side,
    critter: Critter,
    puff: number,
    art: CardArt,
  ): Fighter {
    const s = side === "player" ? ARENA.playerSpot : ARENA.foeSpot;
    const spot = new THREE.Vector3(s.x, 0, s.z);
    const isBoss = side === "foe" && this.boss !== undefined;
    if (isBoss) {
      // Further back, along the line from you to it, so all of it shows.
      const away = new THREE.Vector3(
        ARENA.foeSpot.x - ARENA.playerSpot.x,
        0,
        ARENA.foeSpot.z - ARENA.playerSpot.z,
      ).normalize();
      spot.addScaledVector(away, BOSS.pushBack);
    }
    const other = side === "player" ? ARENA.foeSpot : ARENA.playerSpot;
    // Face the other critter, turned partway toward the camera so you see a
    // face and not just the back of a head. More so for your own, which
    // otherwise would have its back to you.
    const toOther = Math.atan2(other.x - s.x, other.z - s.z);
    const cam = this.stage.camera.position;
    const toCamera = Math.atan2(cam.x - s.x, cam.z - s.z);
    const yaw = lerpAngle(toOther, toCamera, side === "player" ? 0.45 : 0.2);

    // Your card lies to the left of your critter on screen, theirs to the
    // right: outside the gap between them, where the moves fly.
    const away = side === "player" ? -1 : 1;
    const cardSpot = spot
      .clone()
      .addScaledVector(this.stage.screenRight, away * ARENA.cardBeside);

    const model = buildCritter(critter);
    let bigness = 1;
    if (isBoss) {
      const tall = new THREE.Box3().setFromObject(model.group).max.y;
      bigness = Math.max(1, Math.min(BOSS.scale, BOSS.maxHeight / tall));
    }
    const root = new THREE.Group();
    root.add(model.group);
    root.position.copy(spot);
    root.rotation.y = yaw;
    root.scale.setScalar(0.0001);
    root.visible = false;
    this.stage.scene.add(root);

    const face = art.face(critter);
    const card = new Card3D(face, art.back);
    card.root.rotation.order = "YXZ";
    card.root.rotation.y = toCamera;
    card.root.rotation.x = -Math.PI / 2;
    // A hair above the lawn, so the two never z-fight.
    card.root.position.set(spot.x, 0.04, spot.z);
    this.stage.scene.add(card.root);

    return {
      side,
      critter,
      root,
      model,
      card,
      spot,
      cardSpot,
      yaw,
      puff,
      maxPuff: puff,
      charge: 0,
      flash: 0,
      glow: 0,
      squash: 0,
      out: false,
      bigness,
      enraged: false,
      pose: {...STILL},
      poseTo: {...STILL},
      react: null,
      taunt: null,
      nextTaunt: 2 + Math.random() * 3,
      busy: false,
    };
  }

  /** Breathing, the hit flash and the squash: the model only, never the root. */
  /**
   * Everything the model does on its own, every frame: breathing, a boxer's
   * bounce and sway, showing off, leaning into its attacks, and reacting to
   * being hit. It all writes to the model only, never to the root the battle
   * moves about, so none of it fights a tackle or a knock-back.
   */
  private animate(f: Fighter, dt: number): void {
    const t = this.clock.time;
    const phase = f.side === "foe" ? 1.7 : 0;
    const breathe = Math.sin(t * MOTION.breatheRate + phase);
    f.squash *= Math.exp(-dt * 9);
    const sq = MOTION.breathe * breathe - f.squash;

    // Ready to fight: bouncing on its feet, swaying, rocking.
    const alive = f.out ? 1 : 0;
    let y =
      Math.abs(Math.sin(t * LIVELY.bounceRate + phase)) * LIVELY.bounce * alive;
    let rx = Math.sin(t * 0.9 + phase) * LIVELY.rock * alive;
    let ry = 0;
    let rz = Math.sin(t * 1.3 + phase) * LIVELY.sway * alive;
    let x = 0;
    let z = 0;
    let sx = 1 - sq * 0.6;
    let sy = 1 + sq;
    let sz = 1 - sq * 0.6;

    // The pose it is moving into, for an attack: smoothly, not snapping.
    const ease = Math.min(1, dt * 14);
    for (const key of Object.keys(f.pose) as Array<keyof Pose>) {
      f.pose[key] += (f.poseTo[key] - f.pose[key]) * ease;
    }
    rx += f.pose.lean;
    ry += f.pose.twist;
    sy *= 1 - f.pose.crouch + f.pose.stretch;
    sx *= 1 + f.pose.crouch * 0.5;
    sz *= 1 + f.pose.crouch * 0.5;

    // Now and then, between turns, it shows off.
    if (f.out && !f.busy && !f.react) {
      f.nextTaunt -= dt;
      if (f.nextTaunt <= 0 && !f.taunt) {
        const kinds = ["jab", "roar", "hop"] as const;
        f.taunt = {type: kinds[Math.floor(Math.random() * 3)], t: 0};
        const [lo, hi] = LIVELY.tauntGap;
        f.nextTaunt = lo + Math.random() * (hi - lo);
      }
    }
    if (f.taunt) {
      f.taunt.t += dt;
      const u = f.taunt.t;
      if (f.taunt.type === "jab") {
        // Two quick jabs at the air.
        const j = Math.max(0, Math.sin(u * Math.PI * 4)) * (u < 0.5 ? 1 : 0);
        rx += j * 0.35;
        z += j * 0.18;
      } else if (f.taunt.type === "roar") {
        const r = Math.sin(Math.min(1, u / 0.8) * Math.PI);
        rx -= r * 0.35;
        sy *= 1 + r * 0.12;
        if (u > 0.2 && u - dt <= 0.2) {
          this.sounds.cry(f.critter);
        }
      } else {
        y += Math.max(0, Math.sin(u * Math.PI * 3)) * 0.35 * (u < 1 ? 1 : 0);
      }
      if (u > 1) {
        f.taunt = null;
      }
    }

    // Reacting to a hit: a different reaction for every kind of hit.
    let tint: [number, number, number] | null = null;
    if (f.react) {
      const r = f.react;
      r.t += dt;
      const u = Math.min(1, r.t / r.time);
      // Snaps over at once, then springs back with a wobble.
      const spring =
        u < 0.12
          ? u / 0.12
          : Math.exp(-5 * (u - 0.12)) * Math.cos(11 * (u - 0.12));
      switch (r.type) {
        case "head":
          // Rocked back on its heels, head thrown back.
          rx -= 0.75 * spring;
          y += 0.15 * Math.max(0, spring);
          break;
        case "side":
          rz += 0.55 * spring * r.sign;
          ry += 0.3 * spring * r.sign;
          break;
        case "spin":
          ry += (1 - (1 - u) ** 3) * Math.PI * 2;
          rz += Math.sin(u * 20) * 0.2 * (1 - u);
          break;
        case "flatten":
          sy *= 1 - 0.5 * Math.max(0, spring);
          sx *= 1 + 0.35 * Math.max(0, spring);
          sz *= 1 + 0.35 * Math.max(0, spring);
          break;
        case "burn":
          // Hopping from foot to foot, too hot to stand still.
          y += Math.abs(Math.sin(u * 18)) * 0.28 * (1 - u);
          rz += Math.sin(u * 30) * 0.1 * (1 - u);
          tint = [
            0.9 * (1 - u) * (0.6 + Math.random() * 0.4),
            0.3 * (1 - u),
            0,
          ];
          break;
        case "shock":
          // Jolting and flickering with the current going through it.
          if (u < 0.85) {
            x += (Math.random() - 0.5) * 0.12;
            z += (Math.random() - 0.5) * 0.12;
            rx += (Math.random() - 0.5) * 0.3;
            rz += (Math.random() - 0.5) * 0.3;
            const on = Math.random() < 0.5 ? 0.8 : 0.1;
            tint = [on * 0.7, on * 0.8, on];
          }
          break;
        case "wet":
          // Shaking itself off, like a dog out of the sea.
          ry += Math.sin(u * 45) * 0.4 * (1 - u);
          rx -= 0.2 * Math.max(0, spring);
          break;
        case "float": {
          // Lifted off the ground by a mind, turning helplessly, then dropped.
          const lift =
            u < 0.7 ? Math.sin((u / 0.7) * (Math.PI / 2)) : 1 - (u - 0.7) / 0.3;
          y += lift * 0.7;
          rz += Math.sin(u * 12) * 0.25 * lift;
          rx += Math.sin(u * 9) * 0.2 * lift;
          tint = [0.5 * lift, 0.1 * lift, 0.4 * lift];
          break;
        }
        case "shadow":
          // Shrinking and shuddering as the dark wraps round it.
          sx *= 1 - 0.15 * (1 - u);
          sy *= 1 - 0.15 * (1 - u);
          sz *= 1 - 0.15 * (1 - u);
          rz += (Math.random() - 0.5) * 0.12 * (1 - u);
          tint = [0.25 * (1 - u), 0, 0.4 * (1 - u)];
          break;
        case "squeeze": {
          const p = Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u);
          sx *= 1 - 0.3 * p;
          sz *= 1 - 0.3 * p;
          sy *= 1 + 0.22 * p;
          break;
        }
      }
      if (u >= 1) {
        f.react = null;
      }
    }

    const k = f.bigness;
    f.model.group.scale.set(sx * k, sy * k, sz * k);
    f.model.group.rotation.set(rx, ry, rz);
    f.model.group.position.set(x, y, z);
    if (tint && f.flash <= 0) {
      f.model.material.emissive.setRGB(...tint);
      return;
    }
    f.flash = Math.max(0, f.flash - dt);
    const hit = f.flash > 0 ? Math.min(1, f.flash / TIMING.hitFlash) : 0;
    const w = Math.max(hit, f.glow);
    if (f.enraged && w < 0.05) {
      // Enraged: a red glow, throbbing.
      const r = 0.25 + 0.2 * Math.sin(this.clock.time * 8);
      f.model.material.emissive.setRGB(r, 0, 0);
    } else {
      f.model.material.emissive.setRGB(w, w, w);
    }
    // A Mega beast smoulders: dark sparks rising round it all the time.
    if (f.out && f.critter.form === 2 && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 * (FORM_SCALE[2] ?? 1);
      this.stage.sparks.burst(
        new THREE.Vector3(
          f.root.position.x + Math.cos(a) * r,
          0.1 + Math.random() * 0.4,
          f.root.position.z + Math.sin(a) * r,
        ),
        {
          color: [f.critter.light, 0x9a5bff, 0xff3b5c],
          count: 1,
          speed: 0.2,
          lift: 2.2,
          gravity: -0.5,
          ttl: 0.9,
          size: 1.1,
        },
      );
    }
  }

  private name(f: Fighter): string {
    if (f.side === "player") {
      return this.versus ? `Player 1's ${f.critter.name}` : f.critter.name;
    }
    return `${this.trainer.name}'s ${f.critter.name}`;
  }

  /**
   * Two players, taking turns on the same screen. Who goes first is a coin
   * toss; each taps their own moves, and the moves row says whose turn it is.
   */
  private async twoPlayers(): Promise<Outcome> {
    let turn = Math.random() < 0.5 ? 0 : 1;
    const label = (i: number) => (i === 0 ? "Player 1" : "Player 2");
    this.ui.say(`${label(turn)} goes first!`);
    await this.clock.wait(TIMING.announce * 1.6);
    for (;;) {
      const attacker = turn === 0 ? this.player : this.foe;
      const target = turn === 0 ? this.foe : this.player;
      this.ui.setTurn(label(turn), turn === 0 ? "p1" : "p2");
      const move = await this.ui.chooseMove(
        attacker.critter,
        attacker.charge,
        BATTLE.superCharge,
      );
      this.ui.setTurn(null);
      if (move !== "ball") {
        await this.use(attacker, target, move);
      }
      if (target.puff <= 0) {
        await this.faint(target);
        return turn === 0 ? "won" : "lost";
      }
      await this.clock.wait(TIMING.betweenTurns * 0.6);
      turn = 1 - turn;
    }
  }

  /** The whole battle, start to finish. */
  async run(): Promise<Outcome> {
    this.ui.setPuff("player", this.player.puff, this.player.maxPuff);
    this.ui.setPuff("foe", this.foe.puff, this.foe.maxPuff);
    if (this.boss) {
      await this.bossIntro(this.boss);
    } else if (this.wild) {
      this.ui.say(`A wild ${this.foe.critter.name} appeared!`);
      await this.emerge(this.foe);
    } else {
      this.ui.say(`${this.trainer.name} wants to fight!`);
      await this.clock.wait(TIMING.announce * 1.4);
      this.ui.say(`${this.trainer.name} sends out ${this.foe.critter.name}!`);
      await this.summon(this.foe);
    }
    this.ui.showPanel("foe");
    this.ui.say(`Go, ${this.player.critter.name}!`);
    await this.summon(this.player);
    this.ui.showPanel("player");
    if (this.versus) {
      return this.twoPlayers();
    }

    for (;;) {
      const move = await this.ui.chooseMove(
        this.player.critter,
        this.player.charge,
        BATTLE.superCharge,
        this.wild ? this.wild.balls() : undefined,
      );
      if (move === "ball") {
        if (await this.throwBall(false)) {
          return "caught";
        }
      } else {
        await this.use(this.player, this.foe, move);
      }
      if (this.foe.puff <= 0) {
        if (this.wild) {
          return this.worn();
        }
        await this.faint(this.foe);
        return "won";
      }
      await this.clock.wait(TIMING.betweenTurns);

      if (this.boss && !this.foe.enraged) {
        if (this.foe.puff <= this.foe.maxPuff * BOSS.rageAt) {
          await this.enrage(this.foe);
        }
      }
      await this.use(this.foe, this.player, this.foeMove());
      if (this.player.puff <= 0) {
        await this.faint(this.player);
        return "lost";
      }
      await this.clock.wait(TIMING.betweenTurns * 0.5);
    }
  }

  /**
   * The other trainer's choice: a mix of their two plain moves, and their
   * super move now and then. They charge a turn slower than you do, so your
   * super move always comes first.
   */
  private foeMove(): Move {
    const moves = this.foe.critter.moves;
    // An enraged boss doesn't wait as long for its super move.
    const wait = this.foe.enraged ? BATTLE.superCharge : BATTLE.superCharge + 1;
    if (this.foe.charge >= wait) {
      return moves[2];
    }
    return Math.random() < 0.4 ? moves[0] : moves[1];
  }

  /** The card floats up, glows, and the critter pops out of it. */
  private async summon(f: Fighter): Promise<void> {
    const card = f.card.root;
    const start = card.position.clone();
    this.sounds.play("rise");
    await this.clock.tween(
      TIMING.cardRise,
      t => {
        card.position.y = lerp(start.y, CARD.riseHeight, t);
        card.rotation.x = lerp(-Math.PI / 2, 0, t);
      },
      Ease.back,
    );
    // Shaking with the critter wanting out, glowing brighter and brighter.
    await this.clock.tween(
      TIMING.cardGlow,
      t => {
        card.rotation.z = Math.sin(t * 40) * 0.12 * t;
        f.card.setGlow(t * 0.8);
      },
      Ease.in,
    );
    card.rotation.z = 0;

    const pop = new THREE.Vector3(f.spot.x, CARD.riseHeight, f.spot.z);
    this.stage.sparks.burst(pop, {
      color: [f.critter.colour, f.critter.light, 0xffffff],
      count: 50,
      speed: 3,
      lift: 1,
      gravity: 3,
      ttl: 0.8,
      size: 1.4,
      spherical: 1,
    });
    this.sounds.play("pop");
    f.root.visible = true;
    const popY = CARD.riseHeight - 0.6;
    await this.clock.tween(
      TIMING.popOut,
      t => {
        f.root.scale.setScalar(Math.max(0.0001, t));
        f.root.position.set(f.spot.x, popY, f.spot.z);
        // The card goes off to lie beside it, small, as the critter grows.
        card.position.lerpVectors(
          pop,
          new THREE.Vector3(f.cardSpot.x, 0.04, f.cardSpot.z),
          t,
        );
        card.rotation.x = lerp(0, -Math.PI / 2, t);
        card.scale.setScalar(lerp(1, CARD.restScale, t));
        f.card.setGlow(0.8 * (1 - t));
      },
      Ease.back,
    );
    await this.clock.tween(
      TIMING.drop,
      t => {
        f.root.position.y = lerp(popY, 0, t);
      },
      Ease.in,
    );
    f.squash = 0.25;
    f.out = true;
    this.sounds.cry(f.critter);
    await this.hop(f, 0.35, 0.3);
  }

  private hop(f: Fighter, height: number, time: number): Promise<void> {
    return this.clock.tween(
      time,
      t => {
        f.root.position.y = Math.sin(Math.PI * t) * height;
        if (t >= 1) {
          f.squash = 0.15;
        }
      },
      Ease.linear,
    );
  }

  /** How much bigger than the first form this fighter's form is. */
  private size(f: Fighter): number {
    return (FORM_SCALE[f.critter.form] ?? 1) * f.bigness;
  }

  /** Where moves come out of: a little in front of the face. */
  private mouth(f: Fighter): THREE.Vector3 {
    const k = this.size(f);
    return new THREE.Vector3(
      f.spot.x + Math.sin(f.yaw) * 0.75 * k,
      1.1 * k,
      f.spot.z + Math.cos(f.yaw) * 0.75 * k,
    );
  }

  private middle(f: Fighter): THREE.Vector3 {
    return new THREE.Vector3(f.spot.x, 0.85 * this.size(f), f.spot.z);
  }

  private async use(attacker: Fighter, target: Fighter, move: Move) {
    const big = move.power === "superMove";
    this.ui.say(`${this.name(attacker)} used ${move.name}!`);
    this.sounds.cry(attacker.critter);
    await this.clock.wait(TIMING.announce * 0.6);

    if (big) {
      this.ui.say(`Super move! ${move.name}!`);
      await this.effects.aura(attacker.spot, [
        attacker.critter.colour,
        attacker.critter.light,
        0xffe14a,
      ]);
    }

    // The damage lands with the first piece to hit; every piece after it just
    // knocks the target about.
    // What it does is read from what it's called: see moves.ts; and how the
    // target reacts depends on what hit it.
    const style = styleOf(move);
    const reaction = reactionOf(style, attacker.critter.kind);
    let landed = false;
    const onImpact = () => {
      let heavy = false;
      if (!landed) {
        landed = true;
        this.land(attacker, target, move);
        // Slow motion for the big hits, every super move, and a knockout.
        heavy = isHeavy(style) || big || target.puff <= 0;
      }
      this.knock(target, attacker, reaction, heavy);
    };
    attacker.busy = true;
    attacker.taunt = null;
    if ("melee" in style) {
      await this.melee(style.melee, attacker, target, onImpact, big);
    } else {
      // Rears back, winding up, then throws itself forward as it lets go.
      attacker.poseTo = {lean: -0.4, twist: 0, crouch: 0.12, stretch: 0};
      await this.clock.wait(0.22);
      attacker.poseTo = {lean: 0.35, twist: 0, crouch: 0, stretch: 0.1};
      void this.hop(attacker, 0.2, 0.25);
      const shot = {
        from: this.mouth(attacker),
        to: this.middle(target),
        big,
        power: this.size(attacker),
        onImpact,
      };
      if (style.ranged === "volley") {
        await this.effects.play(move.effect, shot);
      } else {
        await this.effects.styled(style.ranged, attacker.critter.kind, shot);
      }
    }

    attacker.poseTo = {...STILL};
    attacker.busy = false;
    attacker.charge = big ? 0 : attacker.charge + 1;
    await this.clock.wait(0.35);
  }

  /**
   * A hit up close: it runs in and does what the move is called — bites,
   * punches, kicks, swings its tail, jumps and slams down — then goes back.
   */
  private async melee(
    style: Melee,
    a: Fighter,
    target: Fighter,
    onImpact: () => void,
    big: boolean,
  ) {
    const k = this.size(a);
    const from = a.spot.clone();
    const reach = {
      punch: 0.6,
      sting: 0.75,
      squeeze: 0.6,
      ram: 0.8,
      pounce: 0.8,
      slam: 0.72,
      tail: 0.55,
      spit: 0.25,
    } as Partial<Record<Melee, number>>;
    const to = a.spot
      .clone()
      .lerp(target.spot, reach[style] ?? MOTION.tackleReach);
    const hitAt = this.middle(target);
    // How it gets there: a hop, a high leap, a flat-out charge, a spin.
    const height =
      style === "slam"
        ? 2.2 * k
        : style === "pounce"
          ? 1.4
          : style === "ram" || style === "sting"
            ? 0
            : 0.45;
    const time =
      style === "slam"
        ? 0.6
        : style === "pounce"
          ? 0.45
          : style === "sting"
            ? 0.14
            : style === "ram"
              ? 0.24
              : MOTION.tackleOut;
    // Winding up first: crouched, leaning back, twisting for a punch.
    const windTwist = style === "punch" ? -0.6 : style === "tail" ? 0.5 : 0;
    a.poseTo = {lean: -0.45, twist: windTwist, crouch: 0.2, stretch: 0};
    await this.clock.wait(style === "slam" ? 0.3 : 0.2);
    // Then throwing its whole body into it.
    a.poseTo = {
      lean: style === "slam" ? -0.2 : 0.5,
      twist: style === "punch" ? 0.45 : 0,
      crouch: 0,
      stretch: style === "pounce" || style === "slam" ? 0.15 : 0.08,
    };
    this.sounds.play("whoosh");
    await this.clock.tween(
      time,
      t => {
        if (style === "slam" && t > 0.5) {
          a.poseTo.lean = 0.6;
        }
        a.root.position.lerpVectors(from, to, t);
        a.root.position.y = Math.sin(Math.PI * t) * height;
        if (style === "kick") {
          a.root.rotation.y = a.yaw + t * Math.PI * 2;
        }
      },
      style === "slam" ? Ease.linear : Ease.in,
    );
    a.root.rotation.y = a.yaw;
    const mouth = this.mouth(a);

    switch (style) {
      case "bite":
        this.sounds.play("superHit");
        onImpact();
        await this.effects.jaws(hitAt, 1.1 * k);
        break;
      case "punch":
        await this.effects.punch(mouth, hitAt, k * (big ? 1.5 : 1));
        this.sounds.play("superHit");
        this.stage.shake(0.14, 0.3);
        onImpact();
        break;
      case "kick":
        this.effects.shockwave(target.spot, 0xffb03a, 1.2);
        this.sounds.play("superHit");
        this.stage.shake(0.14, 0.3);
        onImpact();
        await this.effects.punch(mouth, hitAt, k * 0.8);
        break;
      case "tail":
        // A full turn on the spot, the tail sweeping through the target.
        await this.clock.tween(
          0.45,
          t => {
            a.root.rotation.y = a.yaw + t * Math.PI * 2;
            this.effects.swoosh(a.root.position, 0.9 * k, a.critter.light, t);
            if (t >= 0.5 && t - 0.05 < 0.5) {
              this.sounds.play("superHit");
              onImpact();
            }
          },
          Ease.inOut,
        );
        a.root.rotation.y = a.yaw;
        break;
      case "slam":
        // Down it comes: the roof shakes and dust rolls out.
        this.sounds.play("rock");
        this.sounds.play("superHit");
        this.effects.shockwave(to, 0xffffff, 2);
        this.stage.shake(0.3, 0.6);
        for (let i = 0; i < 12; i++) {
          this.stage.smoke.emit({
            at: new THREE.Vector3(to.x, 0.2, to.z),
            vel: new THREE.Vector3(Math.cos(i) * 3, 0.3, Math.sin(i) * 3),
            life: [0.7, 1.1],
            size: [0.4, 1.4],
            color: [0x8a8378, 0x6a6258],
            alpha: [0.5, 0],
            drag: 2.5,
          });
        }
        onImpact();
        break;
      case "sting":
        await this.effects.sting(mouth, hitAt);
        this.sounds.play("superHit");
        onImpact();
        break;
      case "squeeze": {
        let first = true;
        await this.effects.coil(
          target.spot,
          a.critter.colour,
          this.size(target),
          () => {
            if (first) {
              first = false;
              onImpact();
            } else {
              this.knock(target, a);
            }
          },
        );
        break;
      }
      case "ram":
        this.sounds.play("superHit");
        this.effects.shockwave(target.spot, 0xffffff, 1.4);
        this.stage.shake(0.2, 0.4);
        onImpact();
        this.effects.dizzy(
          new THREE.Vector3(
            target.spot.x,
            1.8 * this.size(target),
            target.spot.z,
          ),
        );
        break;
      case "spit":
        await this.effects.spit(
          mouth,
          hitAt,
          a.critter.kind === "dark" || /ink/i.test(a.critter.moves[0].name)
            ? 0x120a18
            : 0x5ac83a,
        );
        this.sounds.play("hit");
        onImpact();
        break;
      case "pounce":
      case "slash":
        this.sounds.play("superHit");
        void this.effects.slash(hitAt, style === "pounce" ? 1.3 : 1);
        this.effects.shockwave(target.spot, 0xffffff);
        this.stage.shake(0.1, 0.3);
        onImpact();
        break;
    }
    this.stage.sparks.burst(hitAt, {
      color: [0xffffff, 0xffe14a, a.critter.colour],
      count: 20,
      speed: 2.6,
      lift: 1,
      gravity: 3,
      ttl: 0.5,
      size: 1.1,
      spherical: 0.7,
    });

    a.poseTo = {...STILL};
    const back = a.root.position.clone();
    await this.clock.tween(
      MOTION.tackleBack,
      t => {
        a.root.position.lerpVectors(back, from, t);
        a.root.position.y = Math.sin(Math.PI * t) * 0.3;
      },
      Ease.out,
    );
    a.root.position.copy(from);
  }

  /** Works out the damage, takes it off, and shows how much. */
  private land(attacker: Fighter, target: Fighter, move: Move): void {
    const strong = STRONG_AGAINST[attacker.critter.kind].includes(
      target.critter.kind,
    );
    // Only a special or super move carries its kind; a tackle is just a bump.
    const superHit = strong && move.power !== "tackle";
    let damage = roll(BATTLE.damage[move.power]);
    damage *= statsOf(attacker.critter).power / 100;
    if (superHit) {
      damage *= BATTLE.superHitScale;
    }
    if (attacker.side === "foe") {
      damage *= this.trainer.hitScale;
      if (attacker.enraged) {
        damage *= BOSS.rageHit;
      }
    }
    damage = Math.round(damage);
    target.puff = Math.max(0, target.puff - damage);
    this.ui.setPuff(target.side, target.puff, target.maxPuff);

    const head = this.stage.toScreen(
      new THREE.Vector3(target.spot.x, 2.1 * this.size(target), target.spot.z),
    );
    this.ui.popup(`-${damage}`, head.x, head.y, "hit");
    if (superHit) {
      this.ui.popup("Super hit!", head.x, head.y - 50, "super");
    }
  }

  /** Flash white and rock back from the hit, then settle. */
  /** Flash white, rock back from the hit, and react to what hit it. */
  private knock(
    target: Fighter,
    from: Fighter,
    reaction: Reaction = "side",
    heavy = false,
  ): void {
    target.flash = TIMING.hitFlash;
    target.squash = 0.18;
    target.taunt = null;
    const times: Record<Reaction, number> = {
      head: 0.9,
      side: 0.7,
      spin: 1.0,
      flatten: 0.8,
      burn: 1.4,
      shock: 0.8,
      wet: 1.0,
      float: 1.5,
      shadow: 1.1,
      squeeze: 0.9,
    };
    target.react = {
      type: reaction,
      t: 0,
      time: times[reaction],
      sign: Math.random() < 0.5 ? -1 : 1,
    };
    if (heavy) {
      this.clock.slow(LIVELY.slowScale, LIVELY.slowTime);
      this.stage.shake(0.18, 0.5);
    }
    // Some reactions leave something behind: flames, sparks, drips, smoke.
    this.trail(target, reaction);
    const away = target.spot.clone().sub(from.spot).setY(0).normalize();
    const push = reaction === "head" ? 1.5 : reaction === "flatten" ? 0.4 : 1;
    let t = 0;
    this.clock.every(dt => {
      t += dt;
      const k = Math.sin(Math.min(1, t / 0.4) * Math.PI) * push;
      target.root.position.set(
        target.spot.x + away.x * MOTION.knockback * k,
        target.root.position.y,
        target.spot.z + away.z * MOTION.knockback * k,
      );
      return t >= 0.4;
    });
  }

  /** What clings to a beast for a moment after a hit. */
  private trail(f: Fighter, reaction: Reaction): void {
    const top = 1.4 * this.size(f);
    let t = 0;
    this.clock.every(dt => {
      t += dt;
      const at = new THREE.Vector3(
        f.root.position.x + (Math.random() - 0.5) * 0.7 * this.size(f),
        Math.random() * top,
        f.root.position.z + (Math.random() - 0.5) * 0.7 * this.size(f),
      );
      if (reaction === "burn") {
        this.stage.glow.emit({
          at,
          count: 2,
          spread: 0.3,
          life: [0.3, 0.5],
          size: [0.35, 0.05],
          color: [0xffb84a, 0xc82400],
          alpha: [0.6, 0],
          gravity: -2,
        });
      } else if (reaction === "shock") {
        this.stage.glow.emit({
          at,
          spread: 1.5,
          life: [0.08, 0.15],
          size: [0.25, 0.02],
          color: [0xffffff, 0x5aa8ff],
        });
      } else if (reaction === "wet") {
        this.stage.sparks.burst(at, {
          color: [0x9cd4ff, 0xffffff],
          count: 1,
          speed: 2.5,
          lift: 1,
          gravity: 7,
          ttl: 0.5,
          size: 0.6,
          spherical: 0.3,
        });
      } else if (reaction === "shadow") {
        this.stage.smoke.emit({
          at,
          spread: 0.3,
          life: [0.5, 0.8],
          size: [0.2, 0.6],
          color: [0x0a0410, 0x1a0a2a],
          alpha: [0.5, 0],
          gravity: -0.6,
        });
      } else if (reaction === "float" && Math.random() < 0.5) {
        this.stage.glow.emit({
          at,
          spread: 0.3,
          life: [0.3, 0.5],
          size: [0.2, 0.02],
          color: [0xffa8e6, 0xc0108a],
        });
      }
      const long = reaction === "burn" ? 1.3 : reaction === "float" ? 1.4 : 0.8;
      return (
        t > long ||
        !["burn", "shock", "wet", "shadow", "float"].includes(reaction)
      );
    });
  }

  /** Out of puff: it spins down into its card, and the card turns over. */
  private async faint(f: Fighter): Promise<void> {
    this.sounds.play("faint");
    this.ui.say(
      f.side === "player"
        ? `${f.critter.name} is knocked out!`
        : `${this.name(f)} is knocked out!`,
    );
    await this.clock.wait(0.4);
    const from = f.root.position.clone();
    const card = f.card.root;
    const cardFrom = card.position.clone();
    const cardUp = new THREE.Vector3(cardFrom.x, 0.7, cardFrom.z);
    await this.clock.tween(
      0.35,
      t => {
        card.position.lerpVectors(cardFrom, cardUp, t);
        card.rotation.x = lerp(-Math.PI / 2, 0, t);
        f.card.setGlow(t * 0.6);
      },
      Ease.out,
    );
    await this.clock.tween(
      TIMING.faint,
      t => {
        f.root.position.lerpVectors(from, cardUp, t);
        f.root.position.y = lerp(from.y, cardUp.y, t) + Math.sin(Math.PI * t);
        f.root.rotation.y = f.yaw + t * Math.PI * 4;
        f.root.scale.setScalar(Math.max(0.0001, 1 - t));
      },
      Ease.in,
    );
    f.root.visible = false;
    f.out = false;
    this.stage.sparks.burst(cardUp, {
      color: [f.critter.colour, f.critter.light, 0xffffff],
      count: 26,
      speed: 1.6,
      lift: 1,
      gravity: 2,
      ttl: 0.6,
      spherical: 1,
    });
    // Face down on the grass: having a rest.
    await this.clock.tween(
      0.5,
      t => {
        card.position.lerpVectors(cardUp, cardFrom, t);
        card.rotation.x = lerp(0, Math.PI / 2, t);
        f.card.setGlow(0.6 * (1 - t));
      },
      Ease.inOut,
    );
  }

  /**
   * Your beast evolves, there on the roof: it glows brighter and spins faster
   * until it bursts into its new form, bigger, with a new name and a new card.
   */
  async evolve(form: number): Promise<void> {
    const f = this.player;
    const before = f.critter;
    const next = atForm(before, form);
    const mega = form === 2;
    this.ui.say(
      mega
        ? `${before.name} is MEGA EVOLVING!`
        : `What? ${before.name} is evolving!`,
    );
    this.sounds.play("charge");
    const colours = [next.light, 0xffffff, mega ? 0x9a5bff : next.colour];
    await this.clock.tween(
      EVOLVE.glow,
      t => {
        f.glow = t;
        f.root.rotation.y = f.yaw + t * t * Math.PI * 10;
        f.root.position.y = t * 0.6;
        f.root.scale.setScalar(1 + Math.sin(t * 40) * 0.06 * t);
        const a = Math.random() * Math.PI * 2;
        this.stage.sparks.burst(
          new THREE.Vector3(
            f.spot.x + Math.cos(a) * 0.9,
            0.1,
            f.spot.z + Math.sin(a) * 0.9,
          ),
          {
            color: colours,
            count: 3,
            speed: 0.4,
            lift: 3.5,
            ttl: 0.8,
            size: 1.3,
          },
        );
        if (Math.random() < 0.05) {
          this.sounds.play("zap");
        }
      },
      Ease.in,
    );

    // The burst: out goes the old shape, in comes the new one.
    f.root.remove(f.model.group);
    f.model.group.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    f.model.material.dispose();
    f.model = buildCritter(next);
    f.root.add(f.model.group);
    f.critter = next;
    f.card.setFace(this.art.face(next));
    const at = new THREE.Vector3(f.spot.x, 1.2, f.spot.z);
    this.stage.sparks.burst(at, {
      color: colours,
      count: 120,
      speed: 6,
      lift: 1,
      gravity: 2,
      ttl: 1.1,
      size: 1.8,
      spherical: 1,
    });
    this.effects.shockwave(f.spot, mega ? 0x9a5bff : 0xffffff, 2);
    this.stage.shake(0.3, 0.7);
    this.sounds.play("superHit");
    this.ui.renamePanel("player", next);
    f.maxPuff = statsOf(next).puff;
    f.puff = f.maxPuff;
    this.ui.setPuff("player", f.puff, f.maxPuff);
    await this.clock.tween(
      EVOLVE.burst,
      t => {
        f.root.scale.setScalar(lerp(0.5, 1, t));
        f.root.rotation.y = f.yaw;
        f.root.position.y = lerp(0.6, 0, t);
        f.glow = 1 - t;
      },
      Ease.back,
    );
    f.glow = 0;
    f.squash = 0.3;
    this.sounds.cry(next);
    this.ui.say(
      mega
        ? `${before.name} Mega Evolved into ${next.name}!`
        : `${before.name} evolved into ${next.name}!`,
    );
    await this.hop(f, 0.5, 0.4);
    await this.clock.wait(1.4);
  }

  /** Throws confetti over your critter and has it hop about. */
  async celebrate(side: Side = "player"): Promise<void> {
    const winner = side === "player" ? this.player : this.foe;
    // Over the middle of the field and well up: burst near the camera, every
    // scrap of paper is the size of a hand.
    const at = new THREE.Vector3(0, 3.5, -0.5);
    for (let i = 0; i < 3; i++) {
      this.stage.confetti.burst(at, {
        color: [0xff3366, 0xffc300, 0x00b8ff, 0x8a4bff, 0x2fd96b],
        count: 70,
        speed: 4,
        lift: 3,
        gravity: 3,
        ttl: 2.2,
        size: 0.7,
        spherical: 0.6,
      });
      this.sounds.cry(winner.critter);
      await this.hop(winner, 0.6, 0.45);
    }
  }

  /**
   * A boss arrives: the storm goes wild, a warning flashes up, the ground
   * shakes, and it climbs out of a huge hole.
   */
  private async bossIntro(boss: BossFight): Promise<void> {
    const name = this.foe.critter.name;
    this.foe.card.root.visible = false;
    this.stage.setStorm(true);
    this.stage.strike();
    this.sounds.play("thunder");
    this.ui.bossWarning(name, boss.title);
    this.stage.shake(0.15, 2);
    await this.clock.wait(1.2);
    this.stage.strike();
    await this.clock.wait(1.4);
    this.ui.say(`${name}, ${boss.title}, is here!`);
    await this.emerge(this.foe);
    this.stage.shake(0.3, 0.8);
    this.sounds.cry(this.foe.critter);
    await this.clock.wait(0.6);
  }

  /** Half its puff gone, a boss loses its temper. */
  private async enrage(f: Fighter): Promise<void> {
    f.enraged = true;
    this.ui.say(`${f.critter.name} is ENRAGED! 😡`);
    this.stage.strike();
    this.stage.shake(0.25, 0.8);
    this.sounds.cry(f.critter);
    this.sounds.play("superHit");
    this.effects.shockwave(f.spot, 0xff3b5c, 3);
    this.stage.sparks.burst(this.middle(f), {
      color: [0xff3b5c, 0x9a5bff, 0x1a0a20],
      count: 80,
      speed: 4,
      lift: 2,
      ttl: 1,
      size: 1.6,
      spherical: 1,
    });
    await this.clock.wait(1.4);
  }

  /** A wild beast climbs up out of a dark hole in the floor. */
  private async emerge(f: Fighter): Promise<void> {
    f.card.root.visible = false;
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({color: 0x0a0612, transparent: true}),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(f.spot.x, 0.02, f.spot.z);
    this.stage.scene.add(hole);
    this.sounds.play("rise");
    const holeSize = 1.2 * f.bigness;
    await this.clock.tween(
      0.5,
      t => hole.scale.setScalar(t * holeSize),
      Ease.out,
    );
    f.root.visible = true;
    f.root.scale.setScalar(1);
    const depth = -2.2 * this.size(f);
    await this.clock.tween(
      1.0,
      t => {
        f.root.position.set(f.spot.x, lerp(depth, 0, t), f.spot.z);
        this.stage.sparks.burst(new THREE.Vector3(f.spot.x, 0.1, f.spot.z), {
          color: [0x9a5bff, 0x1a0a2a, f.critter.light],
          count: 2,
          speed: 1.4,
          lift: 1.5,
          ttl: 0.6,
          size: 1.2,
        });
      },
      Ease.out,
    );
    f.out = true;
    f.squash = 0.25;
    this.sounds.cry(f.critter);
    this.stage.shake(0.12, 0.4);
    await this.clock.tween(0.4, t => {
      hole.scale.setScalar(holeSize * (1 - t));
    });
    this.stage.scene.remove(hole);
    hole.geometry.dispose();
    (hole.material as THREE.Material).dispose();
  }

  /**
   * A wild beast out of puff can't get away: one Critter Ball and it's yours.
   * Without one, it slinks off.
   */
  private async worn(): Promise<Outcome> {
    const name = this.foe.critter.name;
    if (!this.wild || this.wild.balls() <= 0) {
      this.ui.say(`No Critter Balls left! ${name} ran away.`);
      await this.faint(this.foe);
      return "fled";
    }
    this.ui.say(`${name} is worn out! Throw a Critter Ball!`);
    await this.ui.chooseBall(this.wild.balls());
    await this.throwBall(true);
    return "caught";
  }

  /** The ball: dark metal with a glowing ring round it. */
  private makeBall(): THREE.Group {
    const ball = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 14),
      new THREE.MeshToonMaterial({color: 0x2a2838}),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.172, 0.028, 8, 32),
      new THREE.MeshBasicMaterial({color: 0x9a5bff}),
    );
    ring.rotation.x = Math.PI / 2;
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8),
      new THREE.MeshBasicMaterial({color: 0xff3b5c}),
    );
    eye.position.z = 0.16;
    ball.add(shell, ring, eye);
    return ball;
  }

  private disposeBall(ball: THREE.Group): void {
    this.stage.scene.remove(ball);
    ball.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /**
   * Throws a Critter Ball at the wild beast. It is sucked inside, the ball
   * shakes, and either it holds — caught! — or the beast bursts back out.
   * `sure` is for a beast that is worn out and can't escape.
   */
  private async throwBall(sure: boolean): Promise<boolean> {
    if (!this.wild) {
      return false;
    }
    this.wild.useBall();
    const f = this.foe;
    const name = f.critter.name;
    this.ui.say("You threw a Critter Ball!");
    this.sounds.play("whoosh");
    const ball = this.makeBall();
    this.stage.scene.add(ball);
    const from = this.mouth(this.player).add(new THREE.Vector3(0, 0.6, 0));
    const to = this.middle(f);
    await this.clock.tween(
      0.6,
      t => {
        ball.position.lerpVectors(from, to, t);
        ball.position.y += Math.sin(Math.PI * t) * 1.6;
        ball.rotation.x = t * 12;
      },
      Ease.linear,
    );
    this.sounds.play("pop");
    this.stage.sparks.burst(to, {
      color: [0x9a5bff, 0xffffff, 0xff3b5c],
      count: 30,
      speed: 2.5,
      ttl: 0.5,
      spherical: 1,
    });
    // Sucked in: the beast glows white and shrinks into the ball.
    const at = f.root.position.clone();
    await this.clock.tween(
      0.45,
      t => {
        f.glow = t;
        f.root.scale.setScalar(Math.max(0.0001, 1 - t));
        f.root.position.lerpVectors(at, to, t);
        ball.rotation.x = 0;
      },
      Ease.in,
    );
    f.root.visible = false;
    const floor = new THREE.Vector3(to.x, 0.17, to.z);
    await this.clock.tween(
      0.4,
      t => ball.position.lerpVectors(to, floor, t),
      Ease.bounce,
    );

    const weak = 1 - f.puff / f.maxPuff;
    const chance = sure
      ? 1
      : Math.min(
          0.95,
          (HUNT.catchChance[rarityOf(f.critter)] ?? 0.1) +
            weak * HUNT.weakBonus,
        );
    const caught = Math.random() < chance;
    const shakes = caught ? 3 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < shakes; i++) {
      await this.clock.wait(0.45);
      this.sounds.play("tap");
      await this.clock.tween(
        0.32,
        t => {
          ball.rotation.z = Math.sin(t * Math.PI * 2) * 0.45;
        },
        Ease.linear,
      );
    }
    await this.clock.wait(0.35);

    if (caught) {
      this.stage.sparks.burst(floor, {
        color: [0xffd23a, 0xffffff, 0x9a5bff],
        count: 60,
        speed: 3,
        lift: 2.5,
        ttl: 1,
        size: 1.4,
        spherical: 0.7,
      });
      this.sounds.play("win");
      this.ui.say(`Gotcha! ${name} was caught!`);
      await this.clock.wait(1.6);
      this.disposeBall(ball);
      return true;
    }
    // It breaks free.
    this.stage.sparks.burst(floor, {
      color: [0x9a5bff, f.critter.light, 0xffffff],
      count: 40,
      speed: 3,
      ttl: 0.6,
      spherical: 1,
    });
    this.sounds.play("pop");
    this.disposeBall(ball);
    f.root.visible = true;
    await this.clock.tween(
      0.4,
      t => {
        f.root.scale.setScalar(Math.max(0.0001, t));
        f.root.position.lerpVectors(floor, f.spot, t);
        f.glow = 1 - t;
      },
      Ease.back,
    );
    f.root.position.copy(f.spot);
    f.glow = 0;
    this.sounds.cry(f.critter);
    this.ui.say(`Oh no! ${name} broke free!`);
    await this.clock.wait(0.9);
    return false;
  }

  /** Takes everything this battle put in the scene back out. */
  dispose(): void {
    this.alive = false;
    this.stage.setStorm(false);
    for (const f of this.fighters) {
      this.stage.scene.remove(f.root, f.card.root);
      f.root.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
      f.model.material.dispose();
      // The card's own faces go; the glow's texture is shared by every card
      // and stays.
      f.card.root.traverse(o => {
        if (o instanceof THREE.Mesh) {
          const mats = o.material as Array<THREE.MeshBasicMaterial>;
          for (const m of mats) {
            m.map?.dispose();
            m.dispose();
          }
          o.geometry.dispose();
        }
      });
    }
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) {
    d -= Math.PI * 2;
  }
  while (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return a + d * t;
}
