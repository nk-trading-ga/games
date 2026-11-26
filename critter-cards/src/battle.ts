import * as THREE from "three";
import {Clock, Ease, lerp} from "./anim";
import type {Sounds} from "./audio";
import {Card3D, type CardArt} from "./cards";
import {
  ARENA,
  BATTLE,
  CARD,
  EVOLVE,
  HUNT,
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
}

export type Outcome = "won" | "lost" | "caught" | "fled";

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
    };
  }

  /** Breathing, the hit flash and the squash: the model only, never the root. */
  private animate(f: Fighter, dt: number): void {
    const t = this.clock.time;
    const breathe = Math.sin(
      t * MOTION.breatheRate + (f.side === "foe" ? 1.7 : 0),
    );
    f.squash *= Math.exp(-dt * 9);
    const sq = MOTION.breathe * breathe - f.squash;
    f.model.group.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
    f.flash = Math.max(0, f.flash - dt);
    const hit = f.flash > 0 ? Math.min(1, f.flash / TIMING.hitFlash) : 0;
    const w = Math.max(hit, f.glow);
    f.model.material.emissive.setRGB(w, w, w);
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
    return f.side === "player"
      ? f.critter.name
      : `${this.trainer.name}'s ${f.critter.name}`;
  }

  /** The whole battle, start to finish. */
  async run(): Promise<Outcome> {
    this.ui.setPuff("player", this.player.puff, this.player.maxPuff);
    this.ui.setPuff("foe", this.foe.puff, this.foe.maxPuff);
    if (this.wild) {
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
    if (this.foe.charge >= BATTLE.superCharge + 1) {
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
    return FORM_SCALE[f.critter.form] ?? 1;
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
    let landed = false;
    const onImpact = () => {
      if (!landed) {
        landed = true;
        this.land(attacker, target, move);
      }
      this.knock(target, attacker);
    };

    if (move.effect === "tackle") {
      await this.tackle(attacker, target, onImpact);
    } else {
      // A little rear back and spring forward as it lets go.
      await this.hop(attacker, 0.25, 0.25);
      await this.effects.play(move.effect, {
        from: this.mouth(attacker),
        to: this.middle(target),
        big,
        power: this.size(attacker),
        onImpact,
      });
    }

    attacker.charge = big ? 0 : attacker.charge + 1;
    await this.clock.wait(0.35);
  }

  private async tackle(a: Fighter, target: Fighter, onImpact: () => void) {
    this.sounds.play("whoosh");
    const from = a.spot.clone();
    const to = a.spot.clone().lerp(target.spot, MOTION.tackleReach);
    await this.clock.tween(
      MOTION.tackleOut,
      t => {
        a.root.position.lerpVectors(from, to, t);
        a.root.position.y = Math.sin(Math.PI * t) * 0.45;
      },
      Ease.in,
    );
    this.stage.sparks.burst(this.middle(target), {
      color: [0xffffff, 0xffe14a, a.critter.colour],
      count: 24,
      speed: 2.6,
      lift: 1,
      gravity: 3,
      ttl: 0.5,
      size: 1.2,
      spherical: 0.7,
    });
    this.sounds.play("superHit");
    void this.effects.slash(this.middle(target));
    this.effects.shockwave(target.spot, 0xffffff);
    this.stage.shake(0.1, 0.3);
    onImpact();
    await this.clock.tween(
      MOTION.tackleBack,
      t => {
        a.root.position.lerpVectors(to, from, t);
        a.root.position.y = Math.sin(Math.PI * t) * 0.3;
      },
      Ease.out,
    );
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
  private knock(target: Fighter, from: Fighter): void {
    target.flash = TIMING.hitFlash;
    target.squash = 0.18;
    const away = target.spot.clone().sub(from.spot).setY(0).normalize();
    let t = 0;
    this.clock.every(dt => {
      t += dt;
      const k = Math.sin(Math.min(1, t / 0.4) * Math.PI);
      target.root.position.set(
        target.spot.x + away.x * MOTION.knockback * k,
        target.root.position.y,
        target.spot.z + away.z * MOTION.knockback * k,
      );
      return t >= 0.4;
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
  async celebrate(): Promise<void> {
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
      this.sounds.cry(this.player.critter);
      await this.hop(this.player, 0.6, 0.45);
    }
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
    await this.clock.tween(0.5, t => hole.scale.setScalar(t * 1.2), Ease.out);
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
      hole.scale.setScalar(1.2 * (1 - t));
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
