import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Clock, Ease, lerp} from "./anim";
import type {Sounds} from "./audio";
import {EFFECTS} from "./config";
import type {EffectKind} from "./critters";
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
  slash(at: THREE.Vector3): Promise<void> {
    const group = new THREE.Group();
    group.position.copy(at);
    group.lookAt(this.stage.camera.position);
    const marks: Array<THREE.Group> = [];
    for (let k = -1; k <= 1; k++) {
      const mark = new THREE.Group();
      const glow = new THREE.Mesh(slashGeo, slashGlow);
      glow.scale.set(2.6, 1.05, 1);
      mark.add(glow, new THREE.Mesh(slashGeo, slashCore));
      mark.position.set(k * 0.2, k * 0.05, 0.6);
      mark.rotation.z = 0.7;
      group.add(mark);
      marks.push(mark);
    }
    this.stage.scene.add(group);
    this.stage.lights.flash(at, 0xff4040, 10, 0.3);
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
  ): Promise<void> {
    const m = new THREE.Mesh(spikeGeo, obsidian);
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
    this.flame(new THREE.Vector3(at.x, 0.15, at.z), SHADOW, 0.3 * s, 10);
    this.stage.sparks.burst(at, {
      color: [0x9a5bff, 0x2a1040, 0xff3b5c],
      count: 10,
      speed: 2 * s,
      lift: 1.5,
      ttl: 0.5,
      size: s,
    });
    this.sounds.play(i === count - 1 && shot.big ? "superHit" : "hit");
    if (i === count - 1) {
      this.shockwave(at, 0x9a5bff, s * 1.2);
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
}
