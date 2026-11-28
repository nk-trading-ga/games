import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Clock, Ease, lerp} from "./anim";
import type {Sounds} from "./audio";
import {EFFECTS} from "./config";
import type {EffectKind, Kind} from "./critters";
import type {Ranged} from "./moves";
import {leafMaterial, rockGeometry, rockMaterial, type HeldLight} from "./fx";
import type {Stage} from "./stage";

// What every special move looks like. Each one throws something from one
// beast at the other and calls back as each piece lands, so the battle can
// flash the target and knock it back in time with the picture.
//
// They are meant to look real: fire is hundreds of glowing flames that burn
// white in the middle, trail smoke, and carry a light that shines on the
// floor and the beasts; rocks are lumpy, cracked stone; water is glossy and
// catches reflections; lightning lights up the whole roof.

export interface Shot {
  /** Where the move comes from: the attacker's face. */
  from: THREE.Vector3;
  /** Where it lands: the middle of the target. */
  to: THREE.Vector3;
  /** A super move: more of everything, bigger, and the screen shakes. */
  big: boolean;
  /** How big the attacker is: an evolved or Mega beast throws bigger. */
  power: number;
  /** Called as each piece lands, numbered from 0. */
  onImpact: (index: number) => void;
}

interface Volley {
  count: number;
  flight: number;
  stagger: number;
  make: (i: number) => THREE.Object3D;
  /** Where piece `i` is at time t along its flight, written into `out`. */
  path: (t: number, i: number, out: THREE.Vector3) => void;
  /** Anything else a piece does each frame: spin, leave a trail. */
  frame?: (piece: THREE.Object3D, t: number, dt: number, i: number) => void;
  /** The splash where it lands. */
  land: (at: THREE.Vector3, i: number) => void;
}

/** The colours a kind of flame burns: white-hot to its edge. */
interface Flame {
  hot: number;
  edge: number;
  light: number;
}

const FIRE: Flame = {hot: 0xffb84a, edge: 0xc82400, light: 0xff7a20};
const DRAGON: Flame = {hot: 0x6aa0ff, edge: 0x3a08b0, light: 0x8a6aff};
const PSYCHIC: Flame = {hot: 0xffa8e6, edge: 0xc0108a, light: 0xff5ecf};
const PUNCH: Flame = {hot: 0xffc870, edge: 0xd04a00, light: 0xffa040};
const SHADOW: Flame = {hot: 0xb070ff, edge: 0x2a0060, light: 0x9a5bff};
const ZAP: Flame = {hot: 0xffffff, edge: 0x5aa8ff, light: 0xbfe0ff};
const WATERY: Flame = {hot: 0xbfe8ff, edge: 0x1a6aff, light: 0x6ab8ff};
const LEAFY: Flame = {hot: 0xd8ff9a, edge: 0x2a8a2a, light: 0x9be36a};
const EARTHY: Flame = {hot: 0xffd8a0, edge: 0x8a5a2a, light: 0xffb070};

/**
 * Each kind's look, for the moves every kind can do — a meteor, a wave, a
 * beam: the colours its energy burns, what its solid pieces are made of, and
 * the colour of its smoke.
 */
const THEME: Record<
  Kind,
  {
    flame: Flame;
    solid: "rock" | "water" | "leaf" | "glow" | "glass";
    smoke: number;
  }
> = {
  fire: {flame: FIRE, solid: "rock", smoke: 0x2a2622},
  water: {flame: WATERY, solid: "water", smoke: 0xd8eeff},
  leaf: {flame: LEAFY, solid: "leaf", smoke: 0x4a5a2a},
  spark: {flame: ZAP, solid: "glow", smoke: 0x6a7090},
  rock: {flame: EARTHY, solid: "rock", smoke: 0x8a8378},
  dragon: {flame: DRAGON, solid: "glow", smoke: 0x2a2048},
  psychic: {flame: PSYCHIC, solid: "glow", smoke: 0x5a3a6a},
  fighting: {flame: PUNCH, solid: "glow", smoke: 0x4a3a2a},
  dark: {flame: SHADOW, solid: "glass", smoke: 0x0a0410},
};

const up = new THREE.Vector3(0, 1, 0);
const spread = (k: number) => (Math.random() * 2 - 1) * k;

// Shared geometry and materials, made once and kept: effects come and go every
// turn and there's no reason to rebuild these each time.
const sphere = new THREE.SphereGeometry(1, 20, 14);
const hotCore = new THREE.MeshBasicMaterial({color: 0xffffff});
const water = new THREE.MeshStandardMaterial({
  color: 0x2a7cff,
  transparent: true,
  opacity: 0.72,
  roughness: 0.04,
  metalness: 0.1,
  envMapIntensity: 2.2,
});
const foam = new THREE.MeshStandardMaterial({
  color: 0xe8f6ff,
  roughness: 0.2,
  transparent: true,
  opacity: 0.85,
});
const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
const slashGeo = new THREE.PlaneGeometry(0.05, 0.9);
const slashCore = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  depthTest: false,
});
const slashGlow = new THREE.MeshBasicMaterial({
  color: 0xff2a2a,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.8,
  depthTest: false,
  blending: THREE.AdditiveBlending,
});
const psyRing = new THREE.TorusGeometry(1, 0.09, 10, 48);
const psyMat = new THREE.MeshBasicMaterial({
  color: 0xff5ecf,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const fistMat = new THREE.MeshStandardMaterial({
  color: 0xffa030,
  emissive: 0xff5a10,
  emissiveIntensity: 0.9,
  roughness: 0.3,
  metalness: 0.2,
});
// Black glass: very smooth, a little metallic, so it shines with reflections.
const spikeGeo = new THREE.ConeGeometry(0.16, 1.2, 7);
const obsidian = new THREE.MeshStandardMaterial({
  color: 0x140a1e,
  emissive: 0x2a0a48,
  emissiveIntensity: 0.6,
  roughness: 0.12,
  metalness: 0.6,
  flatShading: true,
});
const thornMat = new THREE.MeshStandardMaterial({
  color: 0xd8b67a,
  roughness: 0.45,
});
// A thorn, its point turned to face +Z so lookAt aims it like an arrow.
const thornGeo = new THREE.ConeGeometry(0.05, 0.34, 8).rotateX(Math.PI / 2);
const leafGeo = new THREE.PlaneGeometry(0.42, 0.21);
const leafMat = leafMaterial();
const rockGeos = [1, 2, 3, 4, 5].map(rockGeometry);
const rockMats = [0xc8bfb0, 0xb0a593, 0xd8cfc0].map(rockMaterial);
const shardGeo = new THREE.OctahedronGeometry(1);
const fangGeo = new THREE.ConeGeometry(0.07, 0.34, 8);
const toothMat = new THREE.MeshStandardMaterial({
  color: 0xfff6e0,
  roughness: 0.25,
  emissive: 0x302820,
});
const petalGeo = new THREE.SphereGeometry(1, 12, 8);
const petalMat = new THREE.MeshStandardMaterial({
  color: 0xff6fb8,
  roughness: 0.5,
  side: THREE.DoubleSide,
});
const boltCore = new THREE.MeshBasicMaterial({color: 0xffffff});
const boltGlow = new THREE.MeshBasicMaterial({
  color: 0x8fc8ff,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

/**
 * A bolt of lightning from `start` to `end`: a jagged line of thin tubes, a
 * white core inside a glowing blue sheath. Used by the zap moves and by the
 * storm over the city.
 */
export function makeBolt(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  jag = 0.45,
): THREE.Group {
  const points = boltPoints(start, end, jag);
  const core: Array<THREE.BufferGeometry> = [];
  const glow: Array<THREE.BufferGeometry> = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    for (const [list, r] of [
      [core, 0.04 * width],
      [glow, 0.16 * width],
    ] as const) {
      const g = new THREE.CylinderGeometry(r, r, len + r, 6, 1, true);
      g.applyQuaternion(q);
      g.translate(mid.x, mid.y, mid.z);
      list.push(g);
    }
  }
  const group = new THREE.Group();
  const merge = (list: Array<THREE.BufferGeometry>) => {
    const m = mergeGeometries(list);
    list.forEach(g => g.dispose());
    return m ?? new THREE.BufferGeometry();
  };
  group.add(new THREE.Mesh(merge(core), boltCore));
  const glowMesh = new THREE.Mesh(merge(glow), boltGlow);
  glowMesh.renderOrder = 4;
  group.add(glowMesh);
  group.userData.points = points;
  return group;
}

function boltPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  jag: number,
): Array<THREE.Vector3> {
  const points: Array<THREE.Vector3> = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const j = i === 0 || i === steps ? 0 : jag;
    points.push(
      new THREE.Vector3(
        lerp(start.x, end.x, t) + spread(j),
        lerp(start.y, end.y, t),
        lerp(start.z, end.z, t) + spread(j),
      ),
    );
  }
  return points;
}

export class Effects {
  constructor(
    private readonly stage: Stage,
    private readonly clock: Clock,
    private readonly sounds: Sounds,
  ) {}

  play(kind: EffectKind, shot: Shot): Promise<void> {
    switch (kind) {
      case "fireball":
        return this.fireball(shot, FIRE, true);
      case "bubbles":
        return this.waterJets(shot);
      case "leaves":
        return this.leaves(shot);
      case "zap":
        return this.zap(shot);
      case "rocks":
        return this.rocks(shot);
      case "dragon":
        return this.dragonBreath(shot);
      case "psychic":
        return this.psychic(shot);
      case "punch":
        return this.punches(shot);
      case "shadow":
        return this.shadow(shot);
      case "tackle":
        // A tackle is the beast itself running in; the battle moves it.
        shot.onImpact(0);
        return Promise.resolve();
    }
  }

  // ---- the building blocks ------------------------------------------------

  /** A lick of flame at a point: a few glowing puffs, rising and cooling. */
  private flame(at: THREE.Vector3, f: Flame, size: number, count = 6): void {
    this.stage.glow.emit({
      at,
      count,
      jitter: size * 0.25,
      spread: size * 0.8,
      life: [0.25, 0.45],
      size: [size * 1.3, size * 0.2],
      color: [f.hot, f.edge],
      alpha: [0.55, 0],
      gravity: -1.6,
      drag: 3,
    });
  }

  private smokePuff(at: THREE.Vector3, size: number, colour = 0x2a2622) {
    this.stage.smoke.emit({
      at,
      jitter: size * 0.3,
      spread: size * 0.5,
      life: [0.7, 1.2],
      size: [size * 0.8, size * 2.6],
      color: [colour, colour],
      alpha: [0.45, 0],
      gravity: -0.6,
      drag: 1.5,
    });
  }

  /**
   * A blast: a ball of flame thrown outward, smoke rolling up after it,
   * embers, and a flash of light on everything round it.
   */
  private explode(at: THREE.Vector3, f: Flame, s: number, smoky = true) {
    this.stage.glow.emit({
      at,
      count: Math.round(45 * s),
      jitter: 0.1 * s,
      spread: 3.2 * s,
      life: [0.35, 0.7],
      size: [0.7 * s, 0.15 * s],
      color: [f.hot, f.edge],
      alpha: [0.6, 0],
      gravity: -1.2,
      drag: 3.5,
    });
    this.stage.glow.emit({
      at,
      count: 3,
      life: [0.12, 0.2],
      size: [1.6 * s, 2.4 * s],
      color: [f.hot, f.edge],
      alpha: [0.45, 0],
    });
    if (smoky) {
      for (let k = 0; k < 10; k++) {
        this.smokePuff(at, 0.5 * s);
      }
    }
    this.stage.sparks.burst(at, {
      color: [f.hot, f.edge, f.light],
      count: 18,
      speed: 3.5 * s,
      lift: 2,
      gravity: 5,
      ttl: 0.8,
      size: 0.7,
      spherical: 0.9,
    });
    this.stage.lights.flash(at, f.light, 28 * s, 0.45);
  }

  /** Throws `count` pieces one after another and waits for them all. */
  private async volley(v: Volley): Promise<void> {
    const flights: Array<Promise<void>> = [];
    for (let i = 0; i < v.count; i++) {
      flights.push(this.fly(v, i));
      if (i < v.count - 1) {
        await this.clock.wait(v.stagger);
      }
    }
    await Promise.all(flights);
  }

  private async fly(v: Volley, i: number): Promise<void> {
    const piece = v.make(i);
    this.stage.scene.add(piece);
    let last = 0;
    await this.clock.tween(
      v.flight,
      t => {
        v.path(t, i, piece.position);
        v.frame?.(piece, t, (t - last) * v.flight, i);
        last = t;
      },
      Ease.linear,
    );
    this.stage.scene.remove(piece);
    v.land(piece.position.clone(), i);
  }

  /** Every hit shakes the screen a little, and a super move a lot. */
  private shakeOnHit(shot: Shot): void {
    if (shot.big) {
      this.stage.shake();
    } else {
      this.stage.shake(EFFECTS.shake * 0.45, EFFECTS.shakeTime * 0.6);
    }
  }

  /** Lights for the first few pieces of a volley, carried as they fly. */
  private carried(count: number, colour: number, intensity: number) {
    const held: Array<HeldLight | null> = [];
    for (let i = 0; i < count; i++) {
      held.push(i < 2 ? this.stage.lights.hold(colour, intensity) : null);
    }
    return held;
  }

  /** A ring blasting outward along the ground from where a hit lands. */
  shockwave(at: THREE.Vector3, colour: number, size = 1): void {
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.08, at.z);
    this.stage.scene.add(ring);
    void this.clock
      .tween(
        0.45,
        t => {
          ring.scale.setScalar(0.3 + t * 2.2 * size);
          (ring.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        },
        Ease.out,
      )
      .then(() => {
        this.stage.scene.remove(ring);
        (ring.material as THREE.Material).dispose();
      });
  }

  /** Powering up for a super move: flames of its colour pouring upward. */
  async aura(at: THREE.Vector3, colours: ReadonlyArray<number>): Promise<void> {
    this.sounds.play("charge");
    const f: Flame = {hot: 0xffffff, edge: colours[0], light: colours[0]};
    const light = this.stage.lights.hold(colours[0], 10);
    const p = new THREE.Vector3();
    await this.clock.tween(
      0.8,
      t => {
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          p.set(at.x + Math.cos(a) * 0.7, 0.1, at.z + Math.sin(a) * 0.7);
          this.stage.glow.emit({
            at: p,
            vel: new THREE.Vector3(0, 2.6, 0),
            spread: 0.4,
            life: [0.5, 0.8],
            size: [0.45, 0.05],
            color: [f.hot, f.edge],
            alpha: [0.8 * t + 0.2, 0],
          });
        }
        light?.move(new THREE.Vector3(at.x, 0.6, at.z));
      },
      Ease.linear,
    );
    light?.release();
  }

  /** Three claw marks ripped across the target, flashing and gone. */
  slash(at: THREE.Vector3, size = 1, colour = 0xff2a2a): Promise<void> {
    const group = new THREE.Group();
    group.position.copy(at);
    group.lookAt(this.stage.camera.position);
    group.scale.setScalar(size);
    const glowMat = slashGlow.clone();
    glowMat.color.setHex(colour);
    const marks: Array<THREE.Group> = [];
    for (let k = -1; k <= 1; k++) {
      const mark = new THREE.Group();
      const glow = new THREE.Mesh(slashGeo, glowMat);
      glow.scale.set(2.6, 1.05, 1);
      mark.add(glow, new THREE.Mesh(slashGeo, slashCore));
      mark.position.set(k * 0.2, k * 0.05, 0.6);
      mark.rotation.z = 0.7;
      group.add(mark);
      marks.push(mark);
    }
    this.stage.scene.add(group);
    this.stage.lights.flash(at, colour, 10, 0.3);
    return this.clock
      .tween(
        0.4,
        t => {
          const grow = Math.min(1, t * 4);
          const fade = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
          for (const mark of marks) {
            mark.scale.set(fade, grow, 1);
          }
        },
        Ease.linear,
      )
      .then(() => {
        this.stage.scene.remove(group);
        glowMat.dispose();
      });
  }

  // ---- the moves ----------------------------------------------------------

  /**
   * Fireballs: a white-hot core wrapped in flame, trailing smoke, lighting
   * the floor as it flies, bursting where it lands.
   */
  private fireball(shot: Shot, f: Flame, smoky: boolean): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 7 : 2;
    // A super move's fireballs land around the target, not all on one spot.
    const ends = Array.from({length: count}, (_, i) =>
      i === 0
        ? shot.to.clone()
        : shot.to.clone().add(new THREE.Vector3(spread(0.6), 0, spread(0.6))),
    );
    const lights = this.carried(count, f.light, 9 * s);
    this.sounds.play("fire");
    return this.volley({
      count,
      flight: EFFECTS.flight,
      stagger: EFFECTS.stagger * 2,
      make: () => {
        const core = new THREE.Mesh(sphere, hotCore);
        core.scale.setScalar(0.1 * s);
        return core;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, ends[i], t);
        out.y += Math.sin(Math.PI * t) * (big ? 1.4 : 0.8);
      },
      frame: (piece, _t, _dt, i) => {
        this.flame(piece.position, f, 0.3 * s, 6);
        if (smoky && Math.random() < 0.5) {
          this.smokePuff(piece.position, 0.18 * s);
        }
        lights[i]?.move(piece.position);
      },
      land: (at, i) => {
        lights[i]?.release();
        this.explode(at, f, s, smoky);
        this.sounds.play(big ? "superHit" : "hit");
        this.shockwave(at, f.light, s);
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** Dragon breath: a roaring stream of purple-and-blue fire. */
  private dragonBreath(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const light = this.stage.lights.hold(DRAGON.light, 14 * s);
    this.sounds.play("fire");
    this.sounds.play("whoosh");
    const dir = new THREE.Vector3().subVectors(shot.to, shot.from);
    const time = big ? 1.4 : 0.9;
    let hits = 0;
    const p = new THREE.Vector3();
    return this.clock
      .tween(
        time,
        t => {
          // A cone of flame pouring from its mouth, fanning out as it goes.
          for (let k = 0; k < 4; k++) {
            this.stage.glow.emit({
              at: shot.from,
              vel: dir
                .clone()
                .multiplyScalar(1.6 + Math.random() * 0.4)
                .add(new THREE.Vector3(spread(0.5), spread(0.4), spread(0.5))),
              life: [0.45, 0.6],
              size: [0.15 * s, 0.75 * s],
              color: [DRAGON.hot, DRAGON.edge],
              alpha: [0.45, 0],
              drag: 0.6,
              gravity: -0.4,
            });
          }
          p.lerpVectors(shot.from, shot.to, Math.min(1, t * 1.6));
          light?.move(p);
          // Hits land over and over while the breath pours onto it.
          const due = Math.floor(t * (big ? 6 : 3));
          while (hits < due) {
            this.explode(shot.to, DRAGON, 0.5 * s, false);
            this.sounds.play(hits % 2 ? "hit" : "fire");
            this.shakeOnHit(shot);
            shot.onImpact(hits);
            hits++;
          }
        },
        Ease.linear,
      )
      .then(() => {
        light?.release();
        this.sounds.play(big ? "superHit" : "hit");
        this.shockwave(shot.to, DRAGON.light, s);
        if (hits === 0) {
          shot.onImpact(0);
        }
      });
  }

  /** Water: glossy jets streaking in, bursting into spray and mist. */
  private waterJets(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 24 : 10;
    const side = new THREE.Vector3()
      .subVectors(shot.to, shot.from)
      .cross(up)
      .normalize();
    const phase = Array.from({length: count}, () => Math.random() * 6.3);
    this.sounds.play("bubble");
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.8,
      stagger: EFFECTS.stagger * (big ? 0.4 : 0.6),
      make: () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(sphere, water));
        const tip = new THREE.Mesh(sphere, foam);
        tip.scale.setScalar(0.55);
        tip.position.z = 0.55;
        g.add(tip);
        // Stretched along its flight: a jet, not a bubble.
        const r = (0.12 + Math.random() * 0.06) * s;
        g.scale.set(r, r, r * 3);
        return g;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, shot.to, t);
        const wob = Math.sin(t * 6 + phase[i]) * 0.12 * (1 - t) * s;
        out.addScaledVector(side, wob);
        out.y += Math.sin(Math.PI * t) * (big ? 0.5 : 0.15);
      },
      frame: piece => {
        piece.lookAt(shot.to);
        if (Math.random() < 0.6) {
          this.stage.smoke.emit({
            at: piece.position,
            spread: 0.3,
            life: [0.3, 0.5],
            size: [0.1 * s, 0.4 * s],
            color: [0xd8eeff, 0xa8d4ff],
            alpha: [0.35, 0],
          });
        }
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: [0x9cd4ff, 0xffffff, 0x3a8cff],
          count: 18,
          speed: 2.8 * s,
          lift: 2.6,
          gravity: 7,
          ttl: 0.6,
          size: 0.9 * s,
          spherical: 0.6,
        });
        this.stage.smoke.emit({
          at,
          count: 3,
          spread: 1.2 * s,
          life: [0.4, 0.7],
          size: [0.3 * s, 1.0 * s],
          color: [0xffffff, 0xcfe8ff],
          alpha: [0.5, 0],
          drag: 2,
        });
        if (i % 3 === 0) {
          this.sounds.play("hit");
          this.stage.lights.flash(at, 0x8fd0ff, 5 * s, 0.25);
        }
        if (i === count - 1) {
          this.sounds.play(big ? "superHit" : "hit");
          this.shockwave(at, 0x7fd0ff, s);
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** A storm of thorns shot like arrows, with real leaves torn up behind. */
  private leaves(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 26 : 10;
    const dir = new THREE.Vector3().subVectors(shot.to, shot.from).normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
    this.sounds.play("leaf");
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.9,
      stagger: EFFECTS.stagger * (big ? 0.35 : 0.6),
      make: i => {
        const leaf = i % 3 === 2;
        const m = new THREE.Mesh(
          leaf ? leafGeo : thornGeo,
          leaf ? leafMat : thornMat,
        );
        m.scale.setScalar(s);
        return m;
      },
      path: (t, i, out) => {
        // A spiral down the line between them, tightening onto the target.
        const a = t * Math.PI * 3 + i * 1.3;
        const r = 0.3 * (1 - t) * s;
        out.lerpVectors(shot.from, shot.to, t);
        out.addScaledVector(side, Math.cos(a) * r);
        out.addScaledVector(lift, Math.sin(a) * r);
      },
      frame: (piece, _t, dt, i) => {
        if (i % 3 === 2) {
          // Leaves tumble; thorns fly point first, like arrows.
          piece.rotation.x += dt * 9;
          piece.rotation.y += dt * 6;
        } else {
          piece.lookAt(shot.to);
        }
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: [0x2f7d32, 0x9be36a, 0xd8b67a],
          count: 9,
          speed: 2.2 * s,
          lift: 1.2,
          gravity: 3,
          ttl: 0.6,
          size: 0.8 * s,
        });
        if (i % 4 === 0) {
          this.sounds.play("hit");
          this.smokePuff(at, 0.25 * s, 0x5a6a3a);
        }
        if (i === count - 1) {
          this.sounds.play(big ? "superHit" : "hit");
          this.shockwave(at, 0x7ed957, s);
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /**
   * Lightning out of the sky onto the target: it glows, crackles with sparks
   * all down its length, and lights up the whole roof.
   */
  private async zap(shot: Shot): Promise<void> {
    const big = shot.big;
    const count = big ? 5 : 1;
    // Sparks gather on the attacker first, so it is clear who did it.
    const charge = this.stage.lights.hold(ZAP.light, 6);
    await this.clock.tween(
      0.4,
      () => {
        this.stage.glow.emit({
          at: shot.from,
          count: 3,
          jitter: 0.15,
          spread: 1.4,
          life: [0.15, 0.25],
          size: [0.25, 0.02],
          color: [ZAP.hot, ZAP.edge],
          drag: 4,
        });
        charge?.move(shot.from);
      },
      Ease.linear,
    );
    charge?.release();
    for (let i = 0; i < count; i++) {
      const at = shot.to
        .clone()
        .add(
          i === 0
            ? new THREE.Vector3()
            : new THREE.Vector3(spread(0.5), 0, spread(0.5)),
        );
      const bolt = makeBolt(
        new THREE.Vector3(at.x + spread(0.4), 7, at.z + spread(0.4)),
        at,
        (big ? 2.2 : 1.5) * shot.power,
      );
      this.stage.scene.add(bolt);
      for (const p of bolt.userData.points as Array<THREE.Vector3>) {
        this.stage.glow.emit({
          at: p,
          count: 3,
          jitter: 0.12,
          spread: 0.6,
          life: [0.15, 0.3],
          size: [0.7, 0.1],
          color: [ZAP.hot, ZAP.edge],
        });
      }
      this.explode(at, ZAP, 0.8 * shot.power, false);
      this.stage.lights.flash(at, ZAP.light, 45, 0.35);
      this.stage.flash(big ? 0.9 : 0.5);
      this.shockwave(at, 0xbfe0ff, big ? 1.4 : 1);
      this.sounds.play("zap");
      this.sounds.play(big ? "superHit" : "hit");
      this.shakeOnHit(shot);
      shot.onImpact(i);
      // A flicker or two, the way lightning does.
      await this.clock.tween(
        0.32,
        t => {
          bolt.visible = Math.floor(t * 7) % 2 === 0;
        },
        Ease.linear,
      );
      this.stage.scene.remove(bolt);
      bolt.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
      if (i < count - 1) {
        await this.clock.wait(0.12);
      }
    }
  }

  /** Real boulders: lumpy, cracked stone, crashing down in a cloud of dust. */
  private rocks(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 12 : 4;
    const starts = Array.from({length: count}, () =>
      shot.to
        .clone()
        .add(
          new THREE.Vector3(spread(1.2), 5 + Math.random() * 2, spread(1.2)),
        ),
    );
    const ends = Array.from({length: count}, (_, i) =>
      shot.to
        .clone()
        .add(
          new THREE.Vector3(
            i === 0 ? 0 : spread(0.5),
            0.1,
            i === 0 ? 0 : spread(0.5),
          ),
        ),
    );
    const spin = Array.from({length: count}, () => [
      spread(6),
      spread(6),
      spread(6),
    ]);
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.9,
      stagger: EFFECTS.stagger * 1.6,
      make: i => {
        const m = new THREE.Mesh(
          rockGeos[i % rockGeos.length],
          rockMats[i % rockMats.length],
        );
        m.scale.setScalar((0.28 + Math.random() * 0.12) * s);
        m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        return m;
      },
      path: (t, i, out) => {
        // Falling, so it speeds up as it comes: t² on the way down.
        out.lerpVectors(starts[i], ends[i], t * t);
      },
      frame: (piece, _t, dt, i) => {
        piece.rotation.x += spin[i][0] * dt;
        piece.rotation.y += spin[i][1] * dt;
        piece.rotation.z += spin[i][2] * dt;
        if (Math.random() < 0.3) {
          this.smokePuff(piece.position, 0.12 * s, 0x6a6258);
        }
      },
      land: (at, i) => {
        // Chips flying, and dust rolling out along the ground.
        this.stage.sparks.burst(at, {
          color: [0x8a8378, 0x6d665e, 0xb0a593],
          count: 22,
          speed: 3.2 * s,
          lift: 2,
          gravity: 8,
          ttl: 0.8,
          size: 1.1 * s,
          spherical: 0.5,
        });
        for (let k = 0; k < 8; k++) {
          this.stage.smoke.emit({
            at: new THREE.Vector3(at.x, 0.2, at.z),
            vel: new THREE.Vector3(spread(2.2 * s), 0.4, spread(2.2 * s)),
            life: [0.9, 1.5],
            size: [0.5 * s, 1.9 * s],
            color: [0xb0a593, 0x8a8378],
            alpha: [0.55, 0],
            drag: 2.2,
            gravity: -0.15,
          });
        }
        this.sounds.play("rock");
        this.shockwave(at, 0x8c857a, s);
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** Psychic power: glowing rings that pulse out and squeeze the target. */
  private psychic(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 9 : 4;
    const lights = this.carried(count, PSYCHIC.light, 8 * s);
    this.sounds.play("charge");
    return this.volley({
      count,
      flight: EFFECTS.flight * 1.1,
      stagger: EFFECTS.stagger * 1.6,
      make: () => {
        const ring = new THREE.Mesh(psyRing, psyMat);
        ring.renderOrder = 4;
        return ring;
      },
      path: (t, _i, out) => {
        out.lerpVectors(shot.from, shot.to, t);
      },
      frame: (piece, t, _dt, i) => {
        piece.lookAt(shot.to);
        // Grows as it flies, then shrinks tight round the target.
        const k = t < 0.8 ? 0.15 + t * 0.6 : 0.63 - (t - 0.8) * 2.2;
        piece.scale.setScalar(Math.max(0.05, k) * s);
        // A shimmer of light round its rim.
        const a = Math.random() * Math.PI * 2;
        const r = piece.scale.x;
        const rim = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)
          .applyQuaternion(piece.quaternion)
          .add(piece.position);
        this.stage.glow.emit({
          at: rim,
          count: 2,
          spread: 0.2,
          life: [0.3, 0.5],
          size: [0.25 * s, 0.02],
          color: [PSYCHIC.hot, PSYCHIC.edge],
        });
        lights[i]?.move(piece.position);
      },
      land: (at, i) => {
        lights[i]?.release();
        this.stage.glow.emit({
          at,
          count: 30,
          spread: 1.8 * s,
          life: [0.4, 0.8],
          size: [0.4 * s, 0.05],
          color: [PSYCHIC.hot, PSYCHIC.edge],
          drag: 2,
        });
        this.stage.lights.flash(at, PSYCHIC.light, 14 * s, 0.35);
        this.sounds.play(i === count - 1 ? (big ? "superHit" : "hit") : "tap");
        if (i === count - 1) {
          this.shockwave(at, 0xff5ecf, s * 1.2);
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** Fighting: a flurry of glowing fists, each one landing with a bang. */
  private punches(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 14 : 5;
    const ends = Array.from({length: count}, () =>
      shot.to
        .clone()
        .add(new THREE.Vector3(spread(0.3), spread(0.3), spread(0.3))),
    );
    const lights = this.carried(count, PUNCH.light, 7 * s);
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.55,
      stagger: EFFECTS.stagger * (big ? 0.7 : 1.4),
      make: () => {
        const g = new THREE.Group();
        const fist = new THREE.Mesh(sphere, fistMat);
        fist.scale.set(1, 0.85, 1.15);
        g.add(fist);
        // Four knuckles across the front.
        for (let k = 0; k < 4; k++) {
          const knuckle = new THREE.Mesh(sphere, fistMat);
          knuckle.scale.setScalar(0.32);
          knuckle.position.set(-0.45 + k * 0.3, 0.3, 0.95);
          g.add(knuckle);
        }
        g.scale.setScalar(0.2 * s);
        return g;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, ends[i], t);
      },
      frame: (piece, _t, _dt, i) => {
        piece.lookAt(shot.to);
        this.flame(piece.position, PUNCH, 0.14 * s, 3);
        lights[i]?.move(piece.position);
      },
      land: (at, i) => {
        lights[i]?.release();
        this.explode(at, PUNCH, 0.55 * s, false);
        this.sounds.play(big && i === count - 1 ? "superHit" : "hit");
        if (i === count - 1) {
          this.shockwave(at, 0xffb03a, s);
        }
        this.stage.shake(big ? 0.12 : 0.07, 0.2);
        shot.onImpact(i);
      },
    });
  }

  /** Dark power: black glass spikes burst up out of the ground round it. */
  private async shadow(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 12 : 5;
    const ground = new THREE.Vector3(shot.to.x, 0, shot.to.z);
    // A pool of darkness spreads under it first, with a cold purple glow.
    for (let k = 0; k < 10; k++) {
      this.stage.smoke.emit({
        at: ground,
        vel: new THREE.Vector3(spread(1.5), 0.2, spread(1.5)),
        life: [0.8, 1.2],
        size: [0.6 * s, 1.6 * s],
        color: [0x0a0410, 0x1a0a2a],
        alpha: [0.7, 0],
        drag: 2,
      });
    }
    this.stage.lights.flash(
      new THREE.Vector3(ground.x, 0.4, ground.z),
      SHADOW.light,
      14 * s,
      1.4,
    );
    this.sounds.play("rise");
    await this.clock.wait(0.35);
    const spikes: Array<Promise<void>> = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + spread(0.3);
      // In a ring round it, not under it, where its own body would hide them.
      const r = (0.6 + Math.random() * 0.45) * s;
      const at = ground
        .clone()
        .add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      spikes.push(this.spike(at, s, i, shot, count));
      await this.clock.wait(EFFECTS.stagger * (big ? 0.6 : 1.1));
    }
    await Promise.all(spikes);
  }

  private async spike(
    at: THREE.Vector3,
    s: number,
    i: number,
    shot: Shot,
    count: number,
    kind: Kind = "dark",
  ): Promise<void> {
    // Black glass for the dark kind, thorns for leaf, stone for rock.
    const mat =
      kind === "leaf" ? thornMat : kind === "rock" ? rockMats[0] : obsidian;
    const f = THEME[kind].flame;
    const m = new THREE.Mesh(spikeGeo, mat);
    m.position.copy(at);
    m.rotation.set(spread(0.3), Math.random() * 6, spread(0.3));
    const h = (1.1 + Math.random() * 0.6) * s;
    this.stage.scene.add(m);
    await this.clock.tween(
      0.16,
      t => {
        m.scale.set(s, h * t + 0.01, s);
        m.position.y = h * 0.6 * t - 0.1;
      },
      Ease.out,
    );
    this.flame(new THREE.Vector3(at.x, 0.15, at.z), f, 0.3 * s, 10);
    this.stage.sparks.burst(at, {
      color: [f.hot, f.edge, f.light],
      count: 10,
      speed: 2 * s,
      lift: 1.5,
      ttl: 0.5,
      size: s,
    });
    this.sounds.play(i === count - 1 && shot.big ? "superHit" : "hit");
    if (i === count - 1) {
      this.shockwave(at, f.light, s * 1.2);
    }
    this.shakeOnHit(shot);
    shot.onImpact(i);
    await this.clock.wait(0.35);
    await this.clock.tween(
      0.25,
      t => {
        m.scale.y = (h + 0.01) * (1 - t) + 0.01;
        m.position.y = h * 0.6 * (1 - t) - 0.1;
      },
      Ease.in,
    );
    this.stage.scene.remove(m);
  }

  // ---- moves named for what they do --------------------------------------

  /** A move that isn't its kind's plain throw: see moves.ts. */
  styled(style: Ranged, kind: Kind, shot: Shot): Promise<void> {
    const t = THEME[kind];
    switch (style) {
      case "bubbles":
        return this.bubbles(shot);
      case "meteor":
        return this.meteor(shot, kind);
      case "stars":
        return this.stars(shot, t.flame);
      case "erupt":
        return this.erupt(shot, kind);
      case "wave":
        return this.wave(shot, kind);
      case "pulse":
        return this.rings(shot, t.flame, true);
      case "vortex":
        return this.vortex(shot, kind);
      case "blackHole":
        return this.blackHole(shot);
      case "beam":
        return this.beam(shot, t.flame);
      case "jaws":
        return this.bigJaws(shot, kind);
      case "slashes":
        return this.bigSlashes(shot, t.flame);
      case "cloud":
        return this.cloud(shot, kind);
      case "bloom":
        return this.bloom(shot);
      case "crush":
        return this.crush(shot, t.flame);
      case "volley":
        return Promise.resolve();
    }
  }

  /** A solid piece of a kind: a boulder, a ball of water, a leaf, a shard. */
  private solid(kind: Kind, size: number): THREE.Object3D {
    const t = THEME[kind];
    let m: THREE.Mesh;
    if (t.solid === "rock") {
      m = new THREE.Mesh(
        rockGeos[Math.floor(Math.random() * rockGeos.length)],
        rockMats[Math.floor(Math.random() * rockMats.length)],
      );
    } else if (t.solid === "water") {
      m = new THREE.Mesh(sphere, water);
    } else if (t.solid === "leaf") {
      m = new THREE.Mesh(leafGeo, leafMat);
      size *= 2.4;
    } else if (t.solid === "glass") {
      m = new THREE.Mesh(shardGeo, obsidian);
      m.scale.set(1, 1.6, 1);
    } else {
      m = new THREE.Mesh(sphere, hotCore);
      size *= 0.45;
    }
    m.scale.multiplyScalar(size);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    return m;
  }

  /** The hits of a move that lands more than once, spread over its time. */
  private hitter(shot: Shot) {
    let n = 0;
    return () => {
      this.shakeOnHit(shot);
      shot.onImpact(n++);
    };
  }

  /** Something huge falling out of the sky, burning, onto the target. */
  private meteor(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const f = THEME[kind].flame;
    const count = big ? 4 : 1;
    const ends = Array.from({length: count}, (_, i) =>
      i === 0
        ? new THREE.Vector3(shot.to.x, 0.3, shot.to.z)
        : new THREE.Vector3(
            shot.to.x + spread(0.9),
            0.3,
            shot.to.z + spread(0.9),
          ),
    );
    const starts = ends.map(
      e => new THREE.Vector3(e.x - 3, 9 + Math.random() * 2, e.z - 2),
    );
    const lights = this.carried(count, f.light, 12 * s);
    // The sky darkens a moment as it comes.
    this.sounds.play("rise");
    return this.volley({
      count,
      flight: 0.9,
      stagger: 0.3,
      make: () => this.solid(kind, 0.55 * s),
      path: (t, i, out) => {
        out.lerpVectors(starts[i], ends[i], t * t);
      },
      frame: (piece, _t, dt, i) => {
        piece.rotation.x += dt * 4;
        this.flame(piece.position, f, 0.55 * s, 8);
        this.smokePuff(piece.position, 0.35 * s, THEME[kind].smoke);
        lights[i]?.move(piece.position);
      },
      land: (at, i) => {
        lights[i]?.release();
        this.explode(at, f, 1.4 * s);
        this.sounds.play("superHit");
        this.sounds.play("rock");
        this.shockwave(at, f.light, 1.8 * s);
        this.stage.shake(0.3, 0.6);
        shot.onImpact(i);
      },
    });
  }

  /** Glowing stars raining down onto the target. */
  private stars(shot: Shot, f: Flame): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 14 : 6;
    const starts = Array.from(
      {length: count},
      () =>
        new THREE.Vector3(
          shot.to.x + spread(2) - 1.5,
          6 + Math.random() * 2,
          shot.to.z + spread(2) - 1,
        ),
    );
    this.sounds.play("charge");
    return this.volley({
      count,
      flight: 0.6,
      stagger: 0.12,
      make: () => {
        const star = new THREE.Mesh(shardGeo, hotCore);
        star.scale.setScalar(0.12 * s);
        return star;
      },
      path: (t, i, out) => {
        out.lerpVectors(starts[i], shot.to, t);
      },
      frame: piece => {
        piece.rotation.y += 0.4;
        piece.rotation.z += 0.3;
        this.stage.glow.emit({
          at: piece.position,
          count: 3,
          spread: 0.3,
          life: [0.3, 0.6],
          size: [0.5 * s, 0.05],
          color: [0xffffff, f.edge],
          alpha: [0.7, 0],
        });
      },
      land: (at, i) => {
        this.stage.glow.emit({
          at,
          count: 20,
          spread: 2 * s,
          life: [0.3, 0.6],
          size: [0.35 * s, 0.02],
          color: [0xffffff, f.edge],
          drag: 2,
        });
        this.stage.lights.flash(at, f.light, 10 * s, 0.25);
        this.sounds.play(i === count - 1 ? (big ? "superHit" : "hit") : "tap");
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** It bursts up out of the ground under the target. */
  private async erupt(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const t = THEME[kind];
    const f = t.flame;
    const ground = new THREE.Vector3(shot.to.x, 0.05, shot.to.z);
    const hit = this.hitter(shot);
    // The ground trembles and glows first.
    this.sounds.play("rock");
    this.stage.shake(0.12, 0.5);
    for (let k = 0; k < 6; k++) {
      this.smokePuff(ground, 0.4 * s, t.smoke);
    }
    this.shockwave(ground, f.light, s);
    await this.clock.wait(0.4);
    // Spiky kinds burst up in spikes; the rest in a pillar.
    if (t.solid === "leaf" || t.solid === "glass" || kind === "rock") {
      const count = big ? 12 : 6;
      const spikes: Array<Promise<void>> = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + spread(0.3);
        const r = (0.55 + Math.random() * 0.45) * s;
        const at = ground
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        spikes.push(this.spike(at, s, i, shot, count, kind));
        await this.clock.wait(EFFECTS.stagger);
      }
      await Promise.all(spikes);
      return;
    }
    const light = this.stage.lights.hold(f.light, 16 * s);
    light?.move(new THREE.Vector3(ground.x, 1, ground.z));
    this.sounds.play(kind === "water" ? "bubble" : "fire");
    const time = big ? 1.2 : 0.8;
    let hits = 0;
    await this.clock.tween(
      time,
      u => {
        if (t.solid === "water") {
          // Water is spray and mist, not light: a white column, and drops.
          this.stage.smoke.emit({
            at: ground,
            count: 5,
            jitter: 0.2 * s,
            vel: new THREE.Vector3(0, 7 * s, 0),
            spread: 0.8,
            life: [0.4, 0.7],
            size: [0.4 * s, 1.0 * s],
            color: [0xffffff, 0xbfe0ff],
            alpha: [0.75, 0],
            gravity: 5,
          });
          this.stage.sparks.burst(ground, {
            color: [0x9cd4ff, 0xffffff, 0x3a8cff],
            count: 4,
            speed: 1.5,
            lift: 7 * s,
            gravity: 9,
            ttl: 1,
            size: 0.8,
          });
        }
        this.stage.glow.emit({
          at: ground,
          count: t.solid === "water" ? 0 : 7,
          jitter: 0.25 * s,
          vel: new THREE.Vector3(0, 7 * s, 0),
          spread: 0.8,
          life: [0.4, 0.7],
          size: [0.6 * s, 0.25 * s],
          color: [f.hot, f.edge],
          alpha: [0.55, 0],
          gravity: 4,
        });
        if (Math.random() < 0.15) {
          const chunk = this.solid(kind, 0.15 * s);
          chunk.position.copy(ground);
          this.stage.scene.add(chunk);
          const v = new THREE.Vector3(
            spread(2),
            6 + Math.random() * 3,
            spread(2),
          );
          void this.clock
            .tween(
              1.0,
              w => {
                chunk.position.set(
                  ground.x + v.x * w,
                  ground.y + v.y * w - 9 * w * w,
                  ground.z + v.z * w,
                );
              },
              Ease.linear,
            )
            .then(() => this.stage.scene.remove(chunk));
        }
        const due = Math.floor(u * (big ? 4 : 2)) + 1;
        while (hits < due) {
          hits++;
          this.sounds.play("hit");
          hit();
        }
      },
      Ease.linear,
    );
    light?.release();
    this.explode(new THREE.Vector3(ground.x, 1, ground.z), f, s);
    this.sounds.play(big ? "superHit" : "hit");
  }

  /** A wall of it rolling across the roof onto the target. */
  private async wave(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const t = THEME[kind];
    const f = t.flame;
    const from = new THREE.Vector3(shot.from.x, 0, shot.from.z);
    const to = new THREE.Vector3(shot.to.x, 0, shot.to.z);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const width = 1.8 * s;
    const tall = (big ? 2.4 : 1.6) * s;
    // A curling wall the water kind can ride; the rest is particles alone.
    let wall: THREE.Mesh | undefined;
    if (t.solid === "water") {
      wall = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, 0, Math.PI),
        water,
      );
      this.stage.scene.add(wall);
    }
    const light = this.stage.lights.hold(f.light, 10 * s);
    this.sounds.play("whoosh");
    this.sounds.play(kind === "water" ? "bubble" : "fire");
    let landed = false;
    const p = new THREE.Vector3();
    const hit = this.hitter(shot);
    await this.clock.tween(
      1.0,
      u => {
        p.lerpVectors(from, to, u * 1.1);
        const rise = Math.min(1, u * 3) * tall;
        if (wall) {
          wall.position.set(p.x, 0, p.z);
          wall.scale.set(width, rise, rise * 0.5);
          wall.lookAt(p.clone().add(dir));
          wall.rotateY(Math.PI / 2);
        }
        for (let k = 0; k < 8; k++) {
          const along = spread(width / 2);
          const at = p
            .clone()
            .addScaledVector(side, along)
            .setY(Math.random() * rise);
          if (kind === "rock") {
            if (Math.random() < 0.06) {
              const chunk = this.solid(kind, 0.25 * s);
              chunk.position.copy(at);
              this.stage.scene.add(chunk);
              void this.clock
                .wait(0.25)
                .then(() => this.stage.scene.remove(chunk));
            }
            this.smokePuff(at, 0.35 * s, t.smoke);
          } else if (t.solid === "water") {
            this.stage.smoke.emit({
              at,
              spread: 0.6,
              life: [0.3, 0.5],
              size: [0.3 * s, 0.7 * s],
              color: [0xffffff, 0xcfe8ff],
              alpha: [0.5, 0],
            });
          } else {
            this.stage.glow.emit({
              at,
              vel: dir.clone().multiplyScalar(2),
              spread: 0.5,
              life: [0.25, 0.45],
              size: [0.55 * s, 0.1],
              color: [f.hot, f.edge],
              alpha: [0.5, 0],
              gravity: -2,
            });
          }
        }
        light?.move(p.clone().setY(1));
        if (!landed && u > 0.82) {
          landed = true;
          this.sounds.play(big ? "superHit" : "hit");
          this.shockwave(to, f.light, 1.5 * s);
          hit();
          if (big) {
            void this.clock.wait(0.12).then(hit);
          }
        }
      },
      Ease.inOut,
    );
    light?.release();
    if (wall) {
      this.stage.scene.remove(wall);
      wall.geometry.dispose();
      this.stage.sparks.burst(shot.to, {
        color: [0x9cd4ff, 0xffffff, 0x3a8cff],
        count: 40,
        speed: 4 * s,
        lift: 3,
        gravity: 7,
        ttl: 0.8,
        size: s,
        spherical: 0.6,
      });
    }
  }

  /** Rings blasting out of the attacker's mouth onto the target. */
  private rings(shot: Shot, f: Flame, growing: boolean): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 8 : 4;
    const mat = new THREE.MeshBasicMaterial({
      color: f.light,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.8,
      stagger: EFFECTS.stagger * 1.4,
      make: () => {
        const ring = new THREE.Mesh(psyRing, mat);
        ring.renderOrder = 4;
        return ring;
      },
      path: (t, _i, out) => {
        out.lerpVectors(shot.from, shot.to, t);
      },
      frame: (piece, t) => {
        piece.lookAt(shot.to);
        piece.scale.setScalar((growing ? 0.2 + t * 0.9 : 0.5) * s);
        mat.opacity = 1;
      },
      land: (at, i) => {
        this.stage.glow.emit({
          at,
          count: 16,
          spread: 2 * s,
          life: [0.3, 0.5],
          size: [0.35 * s, 0.03],
          color: [f.hot, f.edge],
          drag: 2,
        });
        this.stage.lights.flash(at, f.light, 10 * s, 0.25);
        this.sounds.play(i === count - 1 ? (big ? "superHit" : "hit") : "tap");
        if (i === count - 1) {
          this.shockwave(at, f.light, 1.2 * s);
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** A whirl of it spinning round the target, faster and faster. */
  private async vortex(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const t = THEME[kind];
    const c = new THREE.Vector3(shot.to.x, 0, shot.to.z);
    const hit = this.hitter(shot);
    const light = this.stage.lights.hold(t.flame.light, 10 * s);
    light?.move(new THREE.Vector3(c.x, 1, c.z));
    this.sounds.play("whoosh");
    this.sounds.play(kind === "water" ? "bubble" : "leaf");
    const time = big ? 1.6 : 1.1;
    let spin = 0;
    let hits = 0;
    await this.clock.tween(
      time,
      u => {
        spin += 0.35 + u * 0.4;
        for (let k = 0; k < 6; k++) {
          const h = Math.random() * 2.4 * s;
          const r = (0.9 - h * 0.15) * s;
          const a = spin + Math.random() * Math.PI * 2;
          const at = new THREE.Vector3(
            c.x + Math.cos(a) * r,
            h,
            c.z + Math.sin(a) * r,
          );
          // Each mote is flung round the circle: its speed is sideways.
          const vel = new THREE.Vector3(
            -Math.sin(a),
            0.6,
            Math.cos(a),
          ).multiplyScalar(4 * s);
          if (t.solid === "water") {
            this.stage.smoke.emit({
              at,
              vel,
              life: [0.25, 0.4],
              size: [0.25 * s, 0.6 * s],
              color: [0xffffff, 0x9cd4ff],
              alpha: [0.55, 0],
            });
          } else {
            this.stage.glow.emit({
              at,
              vel,
              life: [0.25, 0.4],
              size: [0.35 * s, 0.05],
              color: [t.flame.hot, t.flame.edge],
              alpha: [0.6, 0],
            });
          }
        }
        const due = Math.floor(u * (big ? 5 : 3)) + 1;
        while (hits < due) {
          hits++;
          this.sounds.play("hit");
          hit();
        }
      },
      Ease.linear,
    );
    light?.release();
    this.shockwave(c, t.flame.light, 1.5 * s);
  }

  /** Everything sucked into a black point on the target, then it bursts. */
  private async blackHole(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const c = shot.to.clone();
    const hole = new THREE.Mesh(
      sphere,
      new THREE.MeshBasicMaterial({color: 0x000000}),
    );
    this.stage.scene.add(hole);
    const light = this.stage.lights.hold(SHADOW.light, 12 * s);
    light?.move(c);
    const hit = this.hitter(shot);
    this.sounds.play("rise");
    let hits = 0;
    await this.clock.tween(
      big ? 1.6 : 1.2,
      u => {
        hole.scale.setScalar((0.1 + u * 0.35) * s);
        hole.position.copy(c);
        for (let k = 0; k < 5; k++) {
          // Motes appear all round and rush inward.
          const d = new THREE.Vector3(spread(1), spread(1), spread(1))
            .normalize()
            .multiplyScalar(2.2 * s);
          this.stage.glow.emit({
            at: c.clone().add(d),
            vel: d.clone().multiplyScalar(-1 / 0.4),
            life: [0.38, 0.4],
            size: [0.05, 0.3 * s],
            color: [SHADOW.edge, SHADOW.hot],
            alpha: [0, 0.8],
          });
        }
        const due = Math.floor(u * (big ? 4 : 2)) + 1;
        while (hits < due) {
          hits++;
          this.sounds.play("tap");
          hit();
        }
      },
      Ease.in,
    );
    this.stage.scene.remove(hole);
    (hole.material as THREE.Material).dispose();
    light?.release();
    this.explode(c, SHADOW, 1.4 * s, false);
    this.stage.flash(0.4);
    this.sounds.play("superHit");
    this.shockwave(c, SHADOW.light, 2 * s);
    hit();
  }

  /** One long blazing beam from the attacker's mouth onto the target. */
  private async beam(shot: Shot, f: Flame): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const d = new THREE.Vector3().subVectors(shot.to, shot.from);
    const len = d.length();
    const mid = new THREE.Vector3()
      .addVectors(shot.from, shot.to)
      .multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      up,
      d.clone().normalize(),
    );
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({color: 0xffffff}),
    );
    const glow = new THREE.Mesh(
      core.geometry,
      new THREE.MeshBasicMaterial({
        color: f.light,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.renderOrder = 4;
    for (const m of [core, glow]) {
      m.quaternion.copy(q);
      this.stage.scene.add(m);
    }
    const light = this.stage.lights.hold(f.light, 18 * s);
    light?.move(shot.to);
    const hit = this.hitter(shot);
    this.sounds.play("charge");
    this.sounds.play("zap");
    let hits = 0;
    const time = big ? 1.3 : 0.8;
    await this.clock.tween(
      time,
      u => {
        // It shoots out, burns, and narrows away at the end.
        const reach = Math.min(1, u * 6);
        const thick =
          (u < 0.8 ? 1 : 1 - (u - 0.8) * 5) * (1 + Math.sin(u * 60) * 0.12);
        const r = 0.07 * s * thick;
        core.scale.set(r, len * reach, r);
        glow.scale.set(r * 3.2, len * reach, r * 3.2);
        const centre = shot.from.clone().lerp(mid, reach);
        core.position.copy(centre);
        glow.position.copy(centre);
        this.stage.glow.emit({
          at: shot.from.clone().lerp(shot.to, Math.random() * reach),
          count: 3,
          spread: 0.8,
          life: [0.15, 0.3],
          size: [0.4 * s, 0.05],
          color: [f.hot, f.edge],
        });
        if (reach >= 1) {
          this.stage.glow.emit({
            at: shot.to,
            count: 4,
            spread: 2.5 * s,
            life: [0.2, 0.35],
            size: [0.5 * s, 0.05],
            color: [f.hot, f.edge],
            drag: 2,
          });
          const due = Math.floor(u * (big ? 6 : 3)) + 1;
          while (hits < due) {
            hits++;
            this.sounds.play("hit");
            hit();
          }
        }
      },
      Ease.linear,
    );
    for (const m of [core, glow]) {
      this.stage.scene.remove(m);
      (m.material as THREE.Material).dispose();
    }
    core.geometry.dispose();
    light?.release();
    this.explode(shot.to, f, s, false);
    this.sounds.play(big ? "superHit" : "hit");
  }

  /** Two rows of fangs, one above and one below, snapping shut. */
  async jaws(at: THREE.Vector3, size: number, dark = false): Promise<void> {
    const group = new THREE.Group();
    group.position.copy(at);
    group.lookAt(this.stage.camera.position);
    const mat = dark ? obsidian : toothMat;
    const top = new THREE.Group();
    const bottom = new THREE.Group();
    for (let k = -3; k <= 3; k++) {
      const x = k * 0.13;
      const curve = Math.abs(k) * 0.03;
      const a = new THREE.Mesh(fangGeo, mat);
      a.rotation.x = Math.PI;
      a.position.set(x, -curve, 0);
      top.add(a);
      const b = new THREE.Mesh(fangGeo, mat);
      b.position.set(x + 0.065, curve, 0);
      bottom.add(b);
    }
    group.add(top, bottom);
    group.scale.setScalar(size);
    group.renderOrder = 5;
    this.stage.scene.add(group);
    await this.clock.tween(
      0.15,
      t => {
        top.position.y = 0.7 - t * 0.55;
        bottom.position.y = -0.7 + t * 0.55;
      },
      Ease.in,
    );
    this.stage.sparks.burst(at, {
      color: dark ? [0x9a5bff, 0x2a1040] : [0xffffff, 0xff3b3b],
      count: 18,
      speed: 2.4,
      ttl: 0.4,
      spherical: 1,
    });
    await this.clock.wait(0.25);
    this.stage.scene.remove(group);
  }

  private async bigJaws(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const f = THEME[kind].flame;
    this.flame(shot.from, f, 0.4 * s, 20);
    await this.clock.wait(0.2);
    const bites = big ? 3 : 1;
    const hit = this.hitter(shot);
    for (let i = 0; i < bites; i++) {
      this.sounds.play("superHit");
      this.stage.lights.flash(shot.to, f.light, 12 * s, 0.3);
      hit();
      await this.jaws(shot.to, 1.6 * s, kind === "dark");
    }
  }

  private async bigSlashes(shot: Shot, f: Flame): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const hit = this.hitter(shot);
    for (let i = 0; i < (big ? 3 : 1); i++) {
      this.stage.lights.flash(shot.to, f.light, 14 * s, 0.3);
      this.sounds.play("superHit");
      hit();
      await this.slash(shot.to, 1.8 * s, f.light);
    }
  }

  /** A cloud of it, rolling over and smothering the target. */
  private async cloud(shot: Shot, kind: Kind): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const t = THEME[kind];
    const hit = this.hitter(shot);
    this.sounds.play("whoosh");
    // Puffs drift over first.
    await this.clock.tween(
      0.5,
      u => {
        this.stage.smoke.emit({
          at: shot.from.clone().lerp(shot.to, u),
          count: 2,
          spread: 0.4,
          life: [0.5, 0.8],
          size: [0.3 * s, 0.9 * s],
          color: [t.smoke, t.smoke],
          alpha: [0.6, 0],
        });
      },
      Ease.linear,
    );
    let hits = 0;
    await this.clock.tween(
      big ? 1.4 : 1.0,
      u => {
        this.stage.smoke.emit({
          at: shot.to,
          count: 3,
          jitter: 0.6 * s,
          spread: 0.6,
          life: [0.8, 1.2],
          size: [0.5 * s, 1.6 * s],
          color: [t.smoke, t.smoke],
          alpha: [0.6, 0],
          gravity: -0.3,
        });
        this.stage.glow.emit({
          at: shot.to,
          count: 2,
          jitter: 0.8 * s,
          spread: 0.6,
          life: [0.2, 0.4],
          size: [0.25 * s, 0.02],
          color: [t.flame.hot, t.flame.edge],
        });
        const due = Math.floor(u * (big ? 4 : 2)) + 1;
        while (hits < due) {
          hits++;
          this.sounds.play(kind === "spark" ? "zap" : "tap");
          hit();
        }
      },
      Ease.linear,
    );
  }

  /** A giant flower grows up round the target, opens, and bursts. */
  private async bloom(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const at = new THREE.Vector3(shot.to.x, 0.05, shot.to.z);
    const flower = new THREE.Group();
    flower.position.copy(at);
    const petals: Array<THREE.Mesh> = [];
    for (let k = 0; k < 8; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.scale.set(0.35, 0.06, 0.9);
      petal.position.z = 0.9;
      pivot.add(petal);
      flower.add(pivot);
      petals.push(petal);
    }
    this.stage.scene.add(flower);
    this.sounds.play("leaf");
    const hit = this.hitter(shot);
    await this.clock.tween(
      0.6,
      u => {
        flower.scale.setScalar(s * (0.2 + u));
        // The petals start closed round it, and open out.
        for (const p of petals) {
          (p.parent as THREE.Group).rotation.x = -1.4 * (1 - u);
        }
      },
      Ease.out,
    );
    hit();
    this.sounds.play(big ? "superHit" : "hit");
    this.stage.sparks.burst(new THREE.Vector3(at.x, 0.6, at.z), {
      color: [0xff6fb8, 0xffb3d6, 0xffd84a, 0x7ed957],
      count: 70,
      speed: 4 * s,
      lift: 3,
      gravity: 4,
      ttl: 1.2,
      size: 1.2 * s,
      spherical: 0.8,
    });
    this.explode(new THREE.Vector3(at.x, 0.6, at.z), LEAFY, s, false);
    this.shockwave(at, 0xff6fb8, 1.6 * s);
    await this.clock.tween(0.3, u =>
      flower.scale.setScalar(s * 1.2 * (1 - u) + 0.001),
    );
    this.stage.scene.remove(flower);
  }

  /** A bubble of power round the target, closing in and squeezing. */
  private async crush(shot: Shot, f: Flame): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const ball = new THREE.Mesh(
      sphere,
      new THREE.MeshBasicMaterial({
        color: f.light,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ball.position.copy(shot.to);
    this.stage.scene.add(ball);
    const light = this.stage.lights.hold(f.light, 12 * s);
    light?.move(shot.to);
    const hit = this.hitter(shot);
    this.sounds.play("charge");
    const squeezes = big ? 4 : 2;
    for (let i = 0; i < squeezes; i++) {
      await this.clock.tween(
        0.35,
        u => {
          ball.scale.setScalar((1.4 - u * 0.6) * s);
        },
        Ease.in,
      );
      this.sounds.play("hit");
      this.stage.glow.emit({
        at: shot.to,
        count: 14,
        spread: 1.5 * s,
        life: [0.2, 0.4],
        size: [0.3 * s, 0.02],
        color: [f.hot, f.edge],
      });
      hit();
    }
    this.stage.scene.remove(ball);
    (ball.material as THREE.Material).dispose();
    light?.release();
    this.explode(shot.to, f, s, false);
    this.sounds.play(big ? "superHit" : "hit");
  }

  /** Round, shiny bubbles floating over and popping. */
  private bubbles(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 16 : 7;
    const phase = Array.from({length: count}, () => Math.random() * 6.3);
    const side = new THREE.Vector3()
      .subVectors(shot.to, shot.from)
      .cross(up)
      .normalize();
    this.sounds.play("bubble");
    return this.volley({
      count,
      flight: EFFECTS.flight * 1.3,
      stagger: EFFECTS.stagger,
      make: () => {
        const b = new THREE.Mesh(sphere, water);
        b.scale.setScalar((0.14 + Math.random() * 0.1) * s);
        return b;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, shot.to, t);
        out.addScaledVector(side, Math.sin(t * 8 + phase[i]) * 0.25 * (1 - t));
        out.y += Math.sin(t * 6 + phase[i]) * 0.2;
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: [0x9cd4ff, 0xffffff],
          count: 10,
          speed: 2 * s,
          lift: 1.5,
          gravity: 6,
          ttl: 0.4,
          size: 0.7 * s,
          spherical: 0.7,
        });
        this.sounds.play("tap");
        if (i === count - 1) {
          this.sounds.play(big ? "superHit" : "hit");
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  // ---- the pieces of a hit up close ---------------------------------------

  /** A big glowing fist punching from the attacker into the target. */
  async punch(from: THREE.Vector3, to: THREE.Vector3, size: number) {
    const g = new THREE.Group();
    const fist = new THREE.Mesh(sphere, fistMat);
    fist.scale.set(1, 0.85, 1.15);
    g.add(fist);
    for (let k = 0; k < 4; k++) {
      const knuckle = new THREE.Mesh(sphere, fistMat);
      knuckle.scale.setScalar(0.32);
      knuckle.position.set(-0.45 + k * 0.3, 0.3, 0.95);
      g.add(knuckle);
    }
    g.scale.setScalar(0.3 * size);
    this.stage.scene.add(g);
    await this.clock.tween(
      0.12,
      t => {
        g.position.lerpVectors(from, to, t);
        g.lookAt(to);
        this.flame(g.position, PUNCH, 0.2 * size, 3);
      },
      Ease.in,
    );
    this.stage.scene.remove(g);
    this.explode(to, PUNCH, 0.7 * size, false);
  }

  /** A glowing trail swept round in a circle: a tail swinging. */
  swoosh(centre: THREE.Vector3, radius: number, colour: number, t: number) {
    const a = t * Math.PI * 2;
    this.stage.glow.emit({
      at: new THREE.Vector3(
        centre.x + Math.cos(a) * radius,
        0.5,
        centre.z + Math.sin(a) * radius,
      ),
      count: 3,
      spread: 0.2,
      life: [0.25, 0.4],
      size: [0.35, 0.05],
      color: [0xffffff, colour],
      alpha: [0.6, 0],
    });
  }

  /** Coils of the attacker's colour wrapping round the target, squeezing. */
  async coil(
    at: THREE.Vector3,
    colour: number,
    size: number,
    onSqueeze: () => void,
  ) {
    const mat = new THREE.MeshStandardMaterial({color: colour, roughness: 0.4});
    const rings: Array<THREE.Mesh> = [];
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 28), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(at.x, 0.3 + k * 0.4 * size, at.z);
      this.stage.scene.add(ring);
      rings.push(ring);
    }
    for (let i = 0; i < 3; i++) {
      await this.clock.tween(
        0.25,
        t => {
          for (const r of rings) {
            r.scale.setScalar(
              (0.9 - t * 0.25 + (i === 0 ? (1 - t) * 0.6 : 0)) * size,
            );
          }
        },
        Ease.in,
      );
      this.sounds.play("hit");
      onSqueeze();
      await this.clock.tween(0.15, t => {
        for (const r of rings) {
          r.scale.setScalar((0.65 + t * 0.25) * size);
        }
      });
    }
    for (const r of rings) {
      this.stage.scene.remove(r);
      r.geometry.dispose();
    }
    mat.dispose();
  }

  /** Stars spinning round a dizzy head. */
  dizzy(at: THREE.Vector3): void {
    let t = 0;
    this.clock.every(dt => {
      t += dt;
      for (let k = 0; k < 3; k++) {
        const a = t * 6 + (k * Math.PI * 2) / 3;
        this.stage.glow.emit({
          at: new THREE.Vector3(
            at.x + Math.cos(a) * 0.45,
            at.y,
            at.z + Math.sin(a) * 0.45,
          ),
          life: [0.15, 0.2],
          size: [0.25, 0.1],
          color: [0xffffff, 0xffd23a],
          alpha: [0.9, 0],
        });
      }
      return t > 1.2;
    });
  }

  /** A gob of ink, or venom, spat onto the target. */
  async spit(from: THREE.Vector3, to: THREE.Vector3, colour: number) {
    for (let k = 0; k < 3; k++) {
      const gob = new THREE.Mesh(
        sphere,
        new THREE.MeshStandardMaterial({color: colour, roughness: 0.15}),
      );
      gob.scale.setScalar(0.12);
      this.stage.scene.add(gob);
      void this.clock
        .tween(
          0.3,
          t => {
            gob.position.lerpVectors(from, to, t);
            gob.position.y += Math.sin(Math.PI * t) * 0.4;
          },
          Ease.linear,
        )
        .then(() => {
          this.stage.scene.remove(gob);
          (gob.material as THREE.Material).dispose();
        });
      await this.clock.wait(0.08);
    }
    await this.clock.wait(0.25);
    for (let k = 0; k < 8; k++) {
      this.smokePuff(to, 0.35, colour);
    }
    this.stage.sparks.burst(to, {
      color: [colour, 0x000000],
      count: 20,
      speed: 2.4,
      ttl: 0.6,
      gravity: 6,
      spherical: 0.6,
    });
  }

  /** A stinger darting in: a glowing needle, and drops of venom. */
  async sting(from: THREE.Vector3, to: THREE.Vector3) {
    const needle = new THREE.Mesh(thornGeo, toothMat);
    needle.scale.setScalar(2.5);
    this.stage.scene.add(needle);
    await this.clock.tween(
      0.1,
      t => {
        needle.position.lerpVectors(from, to, t);
        needle.lookAt(to);
      },
      Ease.in,
    );
    this.stage.scene.remove(needle);
    this.stage.glow.emit({
      at: to,
      count: 20,
      spread: 1.5,
      life: [0.3, 0.6],
      size: [0.25, 0.02],
      color: [0xd8ff9a, 0x8a2aff],
    });
    this.stage.sparks.burst(to, {
      color: [0x9a5bff, 0x7ed957],
      count: 14,
      speed: 1.6,
      gravity: 5,
      ttl: 0.7,
      spherical: 0.5,
    });
  }
}
