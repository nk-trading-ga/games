import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Clock, Ease, lerp} from "./anim";
import type {Sounds} from "./audio";
import {EFFECTS} from "./config";
import type {EffectKind} from "./critters";
import {toonMaterial} from "./models";
import type {Stage} from "./stage";

// What every special move looks like. Each one throws something from one
// critter at the other and calls back as each piece lands, so the battle can
// flash the target and knock it back in time with the picture.

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
  frame?: (piece: THREE.Object3D, t: number, dt: number) => void;
  /** The splash where it lands. */
  land: (at: THREE.Vector3, i: number) => void;
}

const FIRE = [0xff4a1c, 0xff9a1f, 0xffe14a];
const WATER = [0x7fd0ff, 0xbfe9ff, 0xffffff];
const LEAF = [0x2f7d32, 0x7ed957, 0x1b4d22];
const THORN = [0xd8b67a, 0x8a6a3a, 0xfff0c0];
const SPARK = [0xfff27a, 0xffffff, 0xffcc1f];
const DUST = [0x8c857a, 0x6d665e, 0xff6a1f];
const DRAGON = [0x9a5bff, 0x3fb0ff, 0xffffff];
const PSYCHIC = [0xff5ecf, 0xffb3e6, 0xc8a0ff];
const PUNCH = [0xffb03a, 0xffffff, 0xff5a1f];
const SHADOW = [0x9a5bff, 0x2a1040, 0xff3b5c];

const up = new THREE.Vector3(0, 1, 0);

// Shared geometry and materials, made once and kept: effects come and go every
// turn and there's no reason to rebuild these each time.
const sphere = new THREE.SphereGeometry(1, 16, 12);
const fireCore = new THREE.MeshBasicMaterial({color: 0xfff1a0});
const fireShell = new THREE.MeshBasicMaterial({
  color: 0xe8320c,
  transparent: true,
  opacity: 0.75,
});
const waterMat = new THREE.MeshBasicMaterial({
  color: 0x3a8cff,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});
const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
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
});
const shineMat = new THREE.MeshBasicMaterial({color: 0xffffff});
const dragonCore = new THREE.MeshBasicMaterial({color: 0xe8f4ff});
const dragonShell = new THREE.MeshBasicMaterial({
  color: 0x7a4bff,
  transparent: true,
  opacity: 0.7,
});
const psyRing = new THREE.TorusGeometry(1, 0.12, 8, 32);
const psyMat = new THREE.MeshBasicMaterial({
  color: 0xff5ecf,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const fistMat = new THREE.MeshBasicMaterial({color: 0xffb03a});
const fistGlow = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
const spikeGeo = new THREE.ConeGeometry(0.16, 1.2, 7);
const spikeMat = new THREE.MeshBasicMaterial({color: 0x1a0a2a});
const spikeGlow = new THREE.MeshBasicMaterial({
  color: 0x9a5bff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const boltMat = new THREE.MeshBasicMaterial({color: 0xfff27a});
const boltGlow = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});

function painted(geo: THREE.BufferGeometry, colour: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(colour);
  const n = g.attributes.position.count;
  const paint = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    paint.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(paint, 3));
  return g;
}

const leafGeo = painted(new THREE.SphereGeometry(1, 10, 6), 0x4fb35f);
// A thorn, its point turned to face +Z so lookAt aims it like an arrow.
const thornGeo = painted(
  new THREE.ConeGeometry(0.05, 0.32, 8).rotateX(Math.PI / 2),
  0xd8b67a,
);
const rockGeo = [0x9a8f80, 0x857a6c, 0xb0a593].map(c =>
  painted(new THREE.IcosahedronGeometry(1, 0), c),
);
const toon = toonMaterial();

const spread = (k: number) => (Math.random() * 2 - 1) * k;

/**
 * A bolt of lightning from `start` to `end`: a jagged line of thin tubes, a
 * yellow core inside a soft white glow. Used by the zap moves and by the storm
 * over the city.
 */
export function makeBolt(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  jag = 0.45,
): THREE.Group {
  const points: Array<THREE.Vector3> = [];
  const steps = 9;
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
  const core: Array<THREE.BufferGeometry> = [];
  const glow: Array<THREE.BufferGeometry> = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < steps; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    for (const [list, r] of [
      [core, 0.05 * width],
      [glow, 0.14 * width],
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
  group.add(new THREE.Mesh(merge(core), boltMat));
  group.add(new THREE.Mesh(merge(glow), boltGlow));
  return group;
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
        return this.fireball(shot);
      case "bubbles":
        return this.bubbles(shot);
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
        // A tackle is the critter itself running in; the battle moves it.
        shot.onImpact(0);
        return Promise.resolve();
    }
  }

  /** Powering up for a super move: a ring and a fountain of sparks. */
  async aura(at: THREE.Vector3, colours: ReadonlyArray<number>): Promise<void> {
    this.sounds.play("charge");
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.06, 8, 40),
      new THREE.MeshBasicMaterial({
        color: colours[0],
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(at).setY(0.08);
    this.stage.scene.add(ring);
    const p = new THREE.Vector3();
    await this.clock.tween(
      0.8,
      t => {
        ring.scale.setScalar(0.4 + t * 1.2);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - t * t;
        const a = Math.random() * Math.PI * 2;
        p.set(at.x + Math.cos(a) * 0.7, 0.1, at.z + Math.sin(a) * 0.7);
        this.stage.sparks.burst(p, {
          color: colours,
          count: 3,
          speed: 0.3,
          lift: 3.2,
          gravity: 0.5,
          ttl: 0.7,
          size: 1.2,
        });
      },
      Ease.linear,
    );
    this.stage.scene.remove(ring);
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
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
        v.frame?.(piece, t, (t - last) * v.flight);
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

  /** A ring blasting outward along the ground from where a hit lands. */
  shockwave(at: THREE.Vector3, colour: number, size = 1): void {
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        depthWrite: false,
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

  private fireball(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 7 : 2;
    // A super move's fireballs land around the target, not all on one spot.
    const ends = Array.from({length: count}, (_, i) =>
      i === 0
        ? shot.to.clone()
        : shot.to.clone().add(new THREE.Vector3(spread(0.6), 0, spread(0.6))),
    );
    this.sounds.play("fire");
    return this.volley({
      count,
      flight: EFFECTS.flight,
      stagger: EFFECTS.stagger * 2,
      make: () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(sphere, fireCore));
        const shell = new THREE.Mesh(sphere, fireShell);
        shell.scale.setScalar(1.4);
        g.add(shell);
        g.scale.setScalar(0.32 * s);
        return g;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, ends[i], t);
        out.y += Math.sin(Math.PI * t) * (big ? 1.4 : 0.8);
      },
      frame: piece => {
        piece.rotation.y += 0.3;
        this.stage.sparks.burst(piece.position, {
          color: FIRE,
          count: big ? 3 : 2,
          speed: 0.4,
          lift: 0.4,
          gravity: -1.5,
          ttl: 0.35,
          size: s,
        });
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: FIRE,
          count: big ? 60 : 45,
          speed: 3.2 * s,
          lift: 1.5,
          gravity: 2,
          ttl: 0.6,
          size: 1.3 * s,
          spherical: 0.8,
        });
        this.sounds.play(big ? "superHit" : "hit");
        this.shockwave(at, 0xff6a1f, s);
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** A blast of water: fat jets streaking in, bursting into spray. */
  private bubbles(shot: Shot): Promise<void> {
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
        g.add(new THREE.Mesh(sphere, waterMat));
        const core = new THREE.Mesh(sphere, shineMat);
        core.scale.setScalar(0.45);
        g.add(core);
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
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: WATER,
          count: 16,
          speed: 2.6 * s,
          lift: 2.4,
          gravity: 6,
          ttl: 0.6,
          size: 1.2 * s,
          spherical: 0.6,
        });
        if (i % 3 === 0) {
          this.sounds.play("hit");
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

  /** A storm of thorns shot like arrows, with leaves torn up behind. */
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
        const m = new THREE.Mesh(leaf ? leafGeo : thornGeo, toon);
        if (leaf) {
          m.scale.set(0.15 * s, 0.03 * s, 0.08 * s);
        } else {
          m.scale.setScalar(s);
        }
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
      frame: piece => {
        // Point first, like an arrow.
        piece.lookAt(shot.to);
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: big && i % 2 ? THORN : LEAF,
          count: 8,
          speed: 2.2 * s,
          lift: 1.2,
          gravity: 3,
          ttl: 0.5,
          size: s,
        });
        if (i % 4 === 0) {
          this.sounds.play("hit");
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

  /** Lightning out of the sky onto the target, crackling as it goes. */
  private async zap(shot: Shot): Promise<void> {
    const big = shot.big;
    const count = big ? 5 : 1;
    // Sparks gather on the attacker first, so it is clear who did it.
    await this.clock.tween(
      0.4,
      () => {
        this.stage.sparks.burst(shot.from, {
          color: SPARK,
          count: 2,
          speed: 1.4,
          lift: 0.3,
          gravity: 0,
          ttl: 0.25,
          spherical: 1,
        });
      },
      Ease.linear,
    );
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
      this.shockwave(at, 0xfff27a, big ? 1.4 : 1);
      this.stage.scene.add(bolt);
      this.sounds.play("zap");
      this.stage.sparks.burst(at, {
        color: SPARK,
        count: 50,
        speed: 3.5,
        lift: 1.2,
        gravity: 3,
        ttl: 0.55,
        size: 1.3,
        spherical: 0.8,
      });
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
      spread(8),
      spread(8),
      spread(8),
    ]);
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.9,
      stagger: EFFECTS.stagger * 1.6,
      make: i => {
        const m = new THREE.Mesh(rockGeo[i % rockGeo.length], toon);
        m.scale.setScalar((0.3 + Math.random() * 0.12) * s);
        return m;
      },
      path: (t, i, out) => {
        // Falling, so it speeds up as it comes: t² on the way down.
        out.lerpVectors(starts[i], ends[i], t * t);
      },
      frame: (piece, _t, dt) => {
        const i = piece.id % count;
        piece.rotation.x += spin[i][0] * dt;
        piece.rotation.y += spin[i][1] * dt;
        piece.rotation.z += spin[i][2] * dt;
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: DUST,
          count: 34,
          speed: 3 * s,
          lift: 1.4,
          gravity: 4,
          ttl: 0.6,
          size: 1.4 * s,
          spherical: 0.4,
        });
        this.sounds.play("rock");
        this.shockwave(at, 0x8c857a, s);
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** Dragon breath: a roaring stream of purple-and-blue fire. */
  private dragonBreath(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 22 : 10;
    const side = new THREE.Vector3()
      .subVectors(shot.to, shot.from)
      .cross(up)
      .normalize();
    const offset = Array.from({length: count}, () => [
      spread(0.25),
      spread(0.2),
    ]);
    this.sounds.play("fire");
    this.sounds.play("whoosh");
    return this.volley({
      count,
      flight: EFFECTS.flight * 0.7,
      stagger: EFFECTS.stagger * 0.45,
      make: () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(sphere, dragonCore));
        const shell = new THREE.Mesh(sphere, dragonShell);
        shell.scale.setScalar(1.5);
        g.add(shell);
        g.scale.setScalar((0.12 + Math.random() * 0.08) * s);
        return g;
      },
      path: (t, i, out) => {
        // Fanning out a little as it goes, the way breath does.
        out.lerpVectors(shot.from, shot.to, t);
        out.addScaledVector(side, offset[i][0] * t * s);
        out.y += offset[i][1] * t * s;
      },
      frame: piece => {
        piece.scale.multiplyScalar(1.02);
        this.stage.sparks.burst(piece.position, {
          color: DRAGON,
          count: 1,
          speed: 0.3,
          lift: 0.3,
          gravity: -1,
          ttl: 0.3,
          size: s,
        });
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: DRAGON,
          count: 10,
          speed: 2.4 * s,
          lift: 1.2,
          gravity: 2,
          ttl: 0.5,
          size: 1.2 * s,
          spherical: 0.8,
        });
        if (i % 3 === 0) {
          this.sounds.play("hit");
        }
        if (i === count - 1) {
          this.sounds.play(big ? "superHit" : "hit");
          this.shockwave(at, 0x9a5bff, s);
        }
        this.shakeOnHit(shot);
        shot.onImpact(i);
      },
    });
  }

  /** Psychic power: glowing pink rings that pulse out and squeeze the target. */
  private psychic(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 9 : 4;
    this.sounds.play("charge");
    return this.volley({
      count,
      flight: EFFECTS.flight * 1.1,
      stagger: EFFECTS.stagger * 1.6,
      make: () => new THREE.Mesh(psyRing, psyMat),
      path: (t, _i, out) => {
        out.lerpVectors(shot.from, shot.to, t);
      },
      frame: (piece, t) => {
        piece.lookAt(shot.to);
        // Grows as it flies, then shrinks tight round the target.
        const k = t < 0.8 ? 0.15 + t * 0.6 : 0.63 - (t - 0.8) * 2.2;
        piece.scale.setScalar(Math.max(0.05, k) * s);
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: PSYCHIC,
          count: 14,
          speed: 1.6 * s,
          lift: 0.4,
          gravity: -0.5,
          ttl: 0.7,
          size: 1.2 * s,
          spherical: 1,
        });
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
        const glow = new THREE.Mesh(sphere, fistGlow);
        glow.scale.setScalar(1.5);
        g.add(glow);
        g.scale.setScalar(0.2 * s);
        return g;
      },
      path: (t, i, out) => {
        out.lerpVectors(shot.from, ends[i], t);
      },
      frame: piece => {
        piece.lookAt(shot.to);
      },
      land: (at, i) => {
        this.stage.sparks.burst(at, {
          color: PUNCH,
          count: 16,
          speed: 3 * s,
          lift: 0.6,
          gravity: 1,
          ttl: 0.4,
          size: 1.3 * s,
          spherical: 1,
        });
        this.sounds.play(big && i === count - 1 ? "superHit" : "hit");
        if (i === count - 1) {
          this.shockwave(at, 0xffb03a, s);
        }
        this.stage.shake(big ? 0.12 : 0.07, 0.2);
        shot.onImpact(i);
      },
    });
  }

  /** Dark power: black spikes burst up out of the ground under the target. */
  private async shadow(shot: Shot): Promise<void> {
    const big = shot.big;
    const s = (big ? EFFECTS.superScale : 1) * shot.power;
    const count = big ? 12 : 5;
    const ground = new THREE.Vector3(shot.to.x, 0, shot.to.z);
    // A pool of darkness spreads under it first.
    this.stage.sparks.burst(ground, {
      color: SHADOW,
      count: 30,
      speed: 1.5,
      lift: 0.3,
      gravity: 0,
      ttl: 0.6,
      size: 1.2,
    });
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
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spikeGeo, spikeMat));
    const glow = new THREE.Mesh(spikeGeo, spikeGlow);
    glow.scale.set(1.35, 1.05, 1.35);
    g.add(glow);
    g.position.copy(at);
    g.rotation.set(spread(0.3), 0, spread(0.3));
    const h = (1.1 + Math.random() * 0.6) * s;
    this.stage.scene.add(g);
    await this.clock.tween(
      0.16,
      t => {
        g.scale.set(s, h * t + 0.01, s);
        g.position.y = h * 0.6 * t - 0.1;
      },
      Ease.out,
    );
    this.stage.sparks.burst(at, {
      color: SHADOW,
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
        g.scale.y = (h + 0.01) * (1 - t) + 0.01;
        g.position.y = h * 0.6 * (1 - t) - 0.1;
      },
      Ease.in,
    );
    this.stage.scene.remove(g);
  }
}
