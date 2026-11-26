import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FORM_SCALE} from "./config";
import {EXTRA, type Body, type Critter} from "./critters";

// Every critter is built here out of spheres, cones and cylinders, each painted
// one colour, then merged into one geometry: one draw call per critter, plus
// one for its outline. They all stand with their feet at y = 0 and face +Z.
//
// They are meant to look fearsome: glowing slit eyes under a scowl, fangs,
// claws, horns and spikes. Big and heavy, not round and cuddly.

type V3 = readonly [number, number, number];

const OUTLINE_COLOUR = 0x1a1210;
/** How far the outline shell is pushed out along the normals, in units. */
const OUTLINE_WIDTH = 0.026;

const FANG = 0xfff6e0;
const PUPIL = 0x120c0a;
const MOUTH = 0x4a0f14;

/** Collects painted parts and merges them into one geometry. */
export class Parts {
  private readonly geos: Array<THREE.BufferGeometry> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  add(
    source: THREE.BufferGeometry,
    colour: number,
    at: V3,
    scale: V3 = [1, 1, 1],
    rot: V3 = [0, 0, 0],
  ): void {
    // Merging needs every part to agree on indexing and attributes, so each is
    // made non-indexed and keeps only position, normal and its paint.
    const g = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    g.deleteAttribute("uv");
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(
      new THREE.Vector3(...at),
      this.q,
      new THREE.Vector3(...scale),
    );
    g.applyMatrix4(this.m);
    const c = new THREE.Color(colour);
    const n = g.attributes.position.count;
    const paint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      paint[i * 3] = c.r;
      paint[i * 3 + 1] = c.g;
      paint[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(paint, 3));
    this.geos.push(g);
  }

  ball(colour: number, at: V3, scale: V3 | number = 1, rot?: V3): void {
    const s: V3 = typeof scale === "number" ? [scale, scale, scale] : scale;
    this.add(new THREE.SphereGeometry(1, 20, 14), colour, at, s, rot);
  }

  /** A rough lump: a faceted ball, which reads as rock or armour. */
  lump(colour: number, at: V3, scale: V3 | number = 1, rot?: V3): void {
    const s: V3 = typeof scale === "number" ? [scale, scale, scale] : scale;
    this.add(new THREE.IcosahedronGeometry(1, 0), colour, at, s, rot);
  }

  cone(colour: number, at: V3, r: number, h: number, rot?: V3): void {
    this.add(new THREE.ConeGeometry(r, h, 12), colour, at, [1, 1, 1], rot);
  }

  rod(colour: number, at: V3, r: number, h: number, rot?: V3): void {
    this.add(
      new THREE.CylinderGeometry(r, r * 0.85, h, 10),
      colour,
      at,
      [1, 1, 1],
      rot,
    );
  }

  /**
   * A glowing eye with a slit pupil, and a heavy brow slanting down toward
   * the nose — the scowl is most of what makes a face look fierce. `side` is
   * -1 for the left eye and 1 for the right.
   */
  eye(at: V3, r: number, glow: number, brow: number, side: number): void {
    this.ball(glow, at, [r, r * 0.72, r * 0.6]);
    this.ball(
      PUPIL,
      [at[0], at[1], at[2] + r * 0.4],
      [r * 0.22, r * 0.62, r * 0.3],
    );
    this.add(
      new THREE.BoxGeometry(r * 2.6, r * 0.55, r * 0.9),
      brow,
      [at[0] + side * r * 0.1, at[1] + r * 0.75, at[2] + r * 0.15],
      [1, 1, 1],
      [0, 0, side * 0.45],
    );
  }

  /** A fang, pointing down from the top jaw (or up, with `up`). */
  fang(at: V3, r: number, h: number, up = false): void {
    this.cone(FANG, at, r, h, up ? [0, 0, 0] : [Math.PI, 0, 0]);
  }

  /** Three claws poking forward out of a foot or a fist. */
  claws(at: V3, size: number, tilt = 0): void {
    for (const dx of [-1, 0, 1]) {
      this.cone(
        FANG,
        [at[0] + dx * size * 0.7, at[1], at[2]],
        size * 0.35,
        size * 1.1,
        [Math.PI / 2 + tilt, 0, 0],
      );
    }
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos);
    if (!merged) {
      throw new Error("critter parts did not merge");
    }
    for (const g of this.geos) {
      g.dispose();
    }
    merged.computeBoundingSphere();
    return merged;
  }
}

// Each builder makes all three forms of its beast. The evolved form (form 1)
// adds to the first — more horns, more spikes, armour — and the Mega form
// (form 2) adds again and changes its colours: blue fire, glowing stripes,
// crowns and wings. buildCritter then makes each form bigger as well.

/** A wolf of fire: horns, a burning mane and tail, and a mouth full of fangs. */
function blazefang(p: Parts, c: Critter): void {
  const f = c.form;
  const L = c.look;
  const dark = L?.dark ?? (f === 2 ? 0x140a0a : 0x2e1612);
  // The Mega form's fire burns blue.
  const flame = L?.accent ?? (f === 2 ? 0x3fb0ff : 0xff8a1f);
  const yellow = L?.accent2 ?? (f === 2 ? 0xd8f4ff : 0xffd23a);
  const core = L?.accent ?? (f === 2 ? 0x1a6bff : 0xff3a12);
  p.ball(c.colour, [0, 0.74, -0.05], [0.42, 0.42, 0.72]);
  p.ball(c.colour, [0, 0.86, 0.36], [0.42, 0.44, 0.42]);
  p.ball(dark, [0, 0.6, 0.05], [0.32, 0.28, 0.56]);
  for (const s of [-1, 1]) {
    for (const z of [0.38, -0.45]) {
      p.rod(dark, [s * 0.25, 0.3, z], 0.12, 0.56);
      p.ball(dark, [s * 0.25, 0.06, z + 0.04], [0.14, 0.08, 0.18]);
      p.claws([s * 0.25, 0.05, z + 0.21], 0.07);
      if (f >= 1) {
        p.cone(dark, [s * 0.36, 0.42, z], 0.045, 0.22, [0, 0, -s * 1.2]);
      }
    }
  }
  p.ball(c.colour, [0, 1.2, 0.62], [0.34, 0.3, 0.36]);
  p.ball(c.colour, [0, 1.1, 0.95], [0.2, 0.14, 0.25]);
  p.ball(dark, [0, 1.15, 1.18], 0.055);
  // The jaw hangs open under the snout, fangs over it.
  p.ball(MOUTH, [0, 1.0, 0.92], [0.17, 0.08, 0.2]);
  p.ball(dark, [0, 0.95, 0.9], [0.17, 0.05, 0.21]);
  for (const s of [-1, 1]) {
    p.fang([s * 0.1, 1.01, 1.1], 0.035, 0.13);
    p.fang([s * 0.07, 0.98, 1.06], 0.025, 0.08, true);
    p.eye(
      [s * 0.15, 1.27, 0.89],
      0.07,
      L?.eye ?? (f === 2 ? 0x9fdcff : 0xffe14a),
      dark,
      s,
    );
    p.cone(dark, [s * 0.17, 1.52, 0.5], 0.07, 0.44, [-0.7, 0, -s * 0.3]);
    p.cone(c.colour, [s * 0.26, 1.42, 0.58], 0.09, 0.22, [-0.2, 0, -s * 0.5]);
    if (f >= 1) {
      p.cone(dark, [s * 0.22, 1.36, 0.78], 0.05, 0.28, [-0.2, 0, -s * 1.0]);
      p.cone(core, [s * 0.18, 0.95, -0.82], 0.13, 0.55, [-1.0, 0, -s * 0.5]);
    }
    if (f >= 2) {
      // The horns sweep back again, like a dragon's.
      p.cone(dark, [s * 0.22, 1.72, 0.18], 0.06, 0.4, [-1.4, 0, -s * 0.2]);
      p.lump(dark, [s * 0.36, 1.08, 0.4], [0.2, 0.14, 0.22]);
      p.cone(dark, [s * 0.42, 1.24, 0.4], 0.05, 0.24, [0, 0, -s * 0.4]);
      // Wings made of fire, fanning out from the shoulders.
      for (let k = 0; k < 3; k++) {
        p.cone(
          k % 2 ? yellow : flame,
          [s * (0.5 + k * 0.12), 1.28 + k * 0.08, 0.15 - k * 0.18],
          0.11,
          0.7 - k * 0.1,
          [-0.5 - k * 0.25, 0, -s * (1.1 - k * 0.15)],
        );
      }
    }
  }
  // A mane of flame running down the back: longer once it has evolved.
  const mane = f >= 1 ? 7 : 5;
  for (let i = 0; i < mane; i++) {
    const z = 0.5 - i * (1.0 / (mane - 1));
    const y = 1.18 - i * 0.025;
    p.cone(
      i % 2 ? yellow : flame,
      [0, y, z],
      0.13,
      0.42 + f * 0.06,
      [-0.6, 0, 0],
    );
  }
  p.cone(core, [0, 0.98, -0.85], 0.19, 0.7, [-1.0, 0, 0]);
  p.cone(flame, [0, 0.96, -0.8], 0.13, 0.55, [-1.0, 0, 0]);
  p.cone(yellow, [0, 0.94, -0.76], 0.07, 0.34, [-1.0, 0, 0]);
  if (f >= 2) {
    p.add(
      new THREE.OctahedronGeometry(0.08),
      flame,
      [0, 0.95, 0.8],
      [0.8, 1.3, 0.8],
    );
  }
}

/** A shark that walks: rows of teeth, a dorsal fin, red eyes. */
function tidejaw(p: Parts, c: Critter): void {
  const f = c.form;
  const L = c.look;
  const belly = L?.belly ?? (f === 2 ? 0x9fb4c8 : 0xdfe9f0);
  const fin = L?.dark ?? (f === 2 ? 0x0a1830 : 0x1d4680);
  const bone = L?.accent2 ?? 0xc8d4dc;
  const glow = L?.accent ?? 0x6ff0ff;
  p.ball(c.colour, [0, 0.76, -0.05], [0.46, 0.45, 0.85]);
  p.ball(belly, [0, 0.62, 0.1], [0.37, 0.32, 0.7]);
  p.ball(c.colour, [0, 0.86, 0.68], [0.39, 0.34, 0.42]);
  p.ball(c.colour, [0, 0.92, 1.0], [0.27, 0.2, 0.26]);
  // A wide mouth, open, with a row of teeth top and bottom.
  p.ball(MOUTH, [0, 0.72, 0.9], [0.29, 0.1, 0.23]);
  p.ball(belly, [0, 0.62, 0.82], [0.31, 0.1, 0.26]);
  for (let k = -3; k <= 3; k++) {
    p.fang([k * 0.075, 0.78, 1.0 - Math.abs(k) * 0.045], 0.028, 0.1);
  }
  for (let k = -2; k <= 2; k++) {
    p.fang(
      [k * 0.08 + 0.04, 0.67, 0.97 - Math.abs(k) * 0.045],
      0.024,
      0.08,
      true,
    );
    if (f >= 1) {
      // A second row behind the first.
      p.fang([k * 0.07, 0.78, 0.92 - Math.abs(k) * 0.04], 0.022, 0.08);
    }
  }
  for (const s of [-1, 1]) {
    p.eye(
      [s * 0.25, 1.0, 0.84],
      0.065,
      L?.eye ?? (f === 2 ? glow : 0xff3b3b),
      fin,
      s,
    );
    for (let k = 0; k < 3; k++) {
      p.add(new THREE.BoxGeometry(0.02, 0.2, 0.035), fin, [
        s * 0.43,
        0.83,
        0.46 - k * 0.09,
      ]);
    }
    p.ball(fin, [s * 0.52, 0.7, 0.32], [0.34, 0.05, 0.17], [0, 0, s * 0.6]);
    for (const z of [0.45, -0.45]) {
      p.rod(c.colour, [s * 0.3, 0.26, z], 0.11, 0.5);
      p.ball(fin, [s * 0.3, 0.05, z + 0.04], [0.16, 0.07, 0.2]);
      p.claws([s * 0.3, 0.05, z + 0.22], 0.06);
    }
    if (f >= 2) {
      // Glowing stripes down each side, the way deep-sea things glow.
      for (let k = 0; k < 4; k++) {
        const z = 0.25 - k * 0.28;
        const x = 0.46 * Math.sqrt(Math.max(0, 1 - (z / 0.9) ** 2)) + 0.005;
        p.add(new THREE.BoxGeometry(0.02, 0.06, 0.2), glow, [s * x, 0.88, z]);
      }
    }
  }
  p.add(
    new THREE.ConeGeometry(0.26, 0.65, 12),
    fin,
    [0, 1.38, -0.05],
    [0.3, 1, 1],
    [-0.45, 0, 0],
  );
  p.add(
    new THREE.ConeGeometry(0.22, 0.65, 12),
    fin,
    [0, 1.02, -1.02],
    [0.3, 1, 1],
    [-0.9, 0, 0],
  );
  p.add(
    new THREE.ConeGeometry(0.16, 0.45, 12),
    fin,
    [0, 0.58, -0.98],
    [0.3, 1, 1],
    [-2.3, 0, 0],
  );
  if (f >= 1) {
    p.add(
      new THREE.ConeGeometry(0.16, 0.42, 12),
      fin,
      [0, 1.22, -0.55],
      [0.3, 1, 1],
      [-0.6, 0, 0],
    );
    for (const z of [0.42, 0.18]) {
      p.lump(bone, [0, 1.16, z], [0.17, 0.08, 0.13]);
    }
  }
  if (f >= 2) {
    // A lure on a stalk over its head, glowing in the dark.
    p.rod(fin, [0, 1.38, 0.88], 0.02, 0.5, [0.9, 0, 0]);
    p.ball(glow, [0, 1.5, 1.1], 0.08);
    for (let k = 0; k < 3; k++) {
      p.cone(
        bone,
        [0, 1.42 - k * 0.12, -0.22 - k * 0.1],
        0.03,
        0.16,
        [-0.9, 0, 0],
      );
    }
  }
}

/** A great green beast on two legs, covered in thorns, with big claws. */
function thornclaw(p: Parts, c: Critter): void {
  const f = c.form;
  const L = c.look;
  const dark = L?.dark ?? (f === 2 ? 0x0f3514 : 0x1b4d22);
  const thorn = L?.accent2 ?? 0xd8b67a;
  const leaf = L?.accent ?? (f === 2 ? 0xb8ff5a : 0x7ed957);
  const bark = L ? L.dark : 0x6b4a2a;
  const claw = f === 2 ? 0.11 : 0.08;
  for (const s of [-1, 1]) {
    p.rod(dark, [s * 0.25, 0.26, 0], 0.15, 0.52);
    p.ball(dark, [s * 0.25, 0.07, 0.08], [0.18, 0.09, 0.25]);
    p.claws([s * 0.25, 0.06, 0.3], claw);
  }
  p.ball(c.colour, [0, 0.96, 0], [0.52, 0.56, 0.43]);
  p.ball(
    L?.belly ?? (f === 2 ? 0x3c7a30 : 0x5e9c48),
    [0, 0.88, 0.2],
    [0.37, 0.42, 0.3],
  );
  for (const s of [-1, 1]) {
    p.rod(dark, [s * 0.56, 0.86, 0.12], 0.13, 0.56, [0.2, 0, s * 0.35]);
    p.ball(dark, [s * 0.66, 0.58, 0.22], 0.16);
    p.claws([s * 0.66, 0.48, 0.34], claw, 0.5);
    // Thorns on the shoulders, sticking up and out.
    p.cone(thorn, [s * 0.44, 1.32, -0.05], 0.08, 0.36, [-0.3, 0, -s * 0.8]);
    p.cone(thorn, [s * 0.5, 1.12, -0.12], 0.06, 0.28, [-0.3, 0, -s * 1.1]);
    if (f >= 1) {
      p.lump(bark, [s * 0.42, 1.2, 0.08], [0.22, 0.15, 0.22]);
      p.cone(thorn, [s * 0.68, 0.86, 0.04], 0.05, 0.26, [-0.5, 0, -s * 1.3]);
      p.cone(thorn, [s * 0.18, 1.84, 0.16], 0.05, 0.34, [-0.3, 0, -s * 0.5]);
    }
    if (f >= 2) {
      // Vines wound round each arm.
      for (const y of [0.95, 0.75]) {
        p.add(
          new THREE.TorusGeometry(0.15, 0.03, 6, 16),
          0x4a8a2a,
          [s * (0.52 + (0.95 - y) * 0.4), y, 0.12],
          [1, 1, 1],
          [Math.PI / 2, 0, s * 0.35],
        );
      }
    }
  }
  p.ball(c.colour, [0, 1.56, 0.15], [0.33, 0.29, 0.31]);
  p.ball(c.colour, [0, 1.49, 0.41], [0.19, 0.13, 0.16]);
  p.ball(dark, [0, 1.53, 0.56], 0.045);
  p.ball(MOUTH, [0, 1.41, 0.4], [0.15, 0.06, 0.13]);
  p.ball(dark, [0, 1.37, 0.37], [0.15, 0.05, 0.13]);
  for (const s of [-1, 1]) {
    p.fang([s * 0.08, 1.42, 0.5], 0.03, 0.1);
    p.eye(
      [s * 0.13, 1.61, 0.4],
      0.06,
      L?.eye ?? (f === 2 ? leaf : 0xff6a1f),
      dark,
      s,
    );
    p.ball(leaf, [s * 0.11, 1.88, 0.03], [0.06, 0.24, 0.03], [0, 0, -s * 0.4]);
  }
  // A row of thorns down the spine, and more of them once it has evolved.
  const spine: Array<V3> = [
    [0, 1.8, -0.02],
    [0, 1.52, -0.3],
    [0, 1.22, -0.43],
    [0, 0.92, -0.43],
    [0, 0.62, -0.34],
  ];
  if (f >= 1) {
    spine.push([0, 1.37, -0.38], [0, 1.07, -0.45], [0, 0.77, -0.4]);
  }
  for (const at of spine) {
    p.cone(thorn, at, 0.08, 0.36 + f * 0.06, [-1.1, 0, 0]);
  }
  if (f >= 2) {
    // A crown of thorns, and a poison-green crystal in its chest.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.cone(
        thorn,
        [Math.cos(a) * 0.2, 1.84, 0.15 + Math.sin(a) * 0.17],
        0.04,
        0.28,
        [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4],
      );
    }
    p.add(
      new THREE.OctahedronGeometry(0.1),
      leaf,
      [0, 1.06, 0.48],
      [0.8, 1.3, 0.8],
    );
  }
}

/** A scorpion that crackles: pincers, six legs, and a lightning stinger. */
function voltsting(p: Parts, c: Critter): void {
  const f = c.form;
  const L = c.look;
  const dark = L?.dark ?? (f === 2 ? 0x1a1630 : 0x2a2438);
  const glow = L?.accent ?? 0x8ff7ff;
  // On the Mega form the stripes glow instead of being dark.
  const stripe = f === 2 ? glow : dark;
  const pinch = f >= 1 ? 1.3 : 1;
  for (const s of [-1, 1]) {
    for (const z of [-0.25, 0, 0.25]) {
      p.rod(dark, [s * 0.44, 0.2, z], 0.035, 0.56, [0, 0, s * 1.0]);
    }
  }
  p.ball(c.colour, [0, 0.5, 0], [0.43, 0.3, 0.56]);
  for (const z of [-0.32, 0, 0.3]) {
    p.ball(stripe, [0, 0.55, z], [0.41, 0.26, 0.07]);
    if (f >= 1) {
      for (const s of [-1, 1]) {
        p.cone(dark, [s * 0.26, 0.74, z], 0.04, 0.22, [0, 0, -s * 0.5]);
      }
    }
  }
  p.ball(dark, [0, 0.5, 0.55], [0.27, 0.2, 0.22]);
  for (const s of [-1, 1]) {
    p.eye([s * 0.1, 0.6, 0.73], 0.055, L?.eye ?? glow, c.colour, s);
    p.ball(glow, [s * 0.19, 0.55, 0.68], 0.03);
    p.cone(FANG, [s * 0.07, 0.4, 0.76], 0.03, 0.12, [Math.PI * 0.6, 0, 0]);
    // An arm out front, ending in a pincer with two sharp fingers.
    p.rod(dark, [s * 0.38, 0.52, 0.62], 0.05, 0.42, [Math.PI / 2, 0, -s * 0.3]);
    p.ball(
      c.colour,
      [s * 0.46, 0.55, 0.92],
      [0.14 * pinch, 0.11 * pinch, 0.19 * pinch],
    );
    p.cone(c.colour, [s * 0.39, 0.58, 1.12], 0.05 * pinch, 0.26 * pinch, [
      Math.PI / 2,
      0,
      s * 0.35,
    ]);
    p.cone(c.colour, [s * 0.53, 0.58, 1.12], 0.05 * pinch, 0.26 * pinch, [
      Math.PI / 2,
      0,
      -s * 0.35,
    ]);
    if (f >= 2) {
      // Wings, so it can fly: thin and glowing, two a side.
      p.ball(
        glow,
        [s * 0.5, 0.95, -0.1],
        [0.5, 0.025, 0.2],
        [0.2, s * 0.5, -s * 0.5],
      );
      p.ball(
        glow,
        [s * 0.42, 0.88, -0.35],
        [0.4, 0.025, 0.16],
        [0.2, s * 0.9, -s * 0.4],
      );
      p.cone(c.colour, [s * 0.1, 0.74, 0.5], 0.03, 0.18, [0.3, 0, -s * 0.3]);
    }
  }
  if (f >= 2) {
    p.cone(c.colour, [0, 0.76, 0.5], 0.03, 0.2, [0.3, 0, 0]);
  }
  // The tail, curling up and over, segment by segment.
  const tail: Array<[number, number, number, number]> = [
    [0.58, -0.6, 0.16, 0],
    [0.82, -0.84, 0.15, 1],
    [1.12, -0.9, 0.14, 0],
    [1.4, -0.76, 0.13, 1],
    [1.56, -0.5, 0.12, 0],
    [1.56, -0.22, 0.11, 1],
  ];
  for (const [y, z, r, striped] of tail) {
    p.ball(striped ? stripe : c.colour, [0, y, z], r);
  }
  p.cone(glow, [0, 1.42, -0.04], 0.08, 0.32, [Math.PI * 0.8, 0, 0]);
  if (f >= 1) {
    // More stingers, fanned out to the sides.
    const sides = f >= 2 ? [-1, 1] : [1];
    for (const s of sides) {
      p.cone(glow, [s * 0.13, 1.44, -0.08], 0.06, 0.28, [
        Math.PI * 0.8,
        0,
        s * 0.5,
      ]);
    }
  }
}

/** A golem of rock with lava in its cracks and crystals on its back. */
function rockjaw(p: Parts, c: Critter): void {
  const f = c.form;
  const L = c.look;
  const dark = L?.dark ?? (f === 2 ? 0x16141a : 0x4a443e);
  const lava = L?.accent ?? 0xff6a1f;
  const crystal = L?.accent2 ?? 0xb06bff;
  const fist = f >= 1 ? 0.33 : 0.27;
  for (const s of [-1, 1]) {
    p.lump(dark, [s * 0.26, 0.2, 0], [0.22, 0.24, 0.24]);
  }
  p.add(
    new THREE.IcosahedronGeometry(0.6, 1),
    c.colour,
    [0, 0.86, 0],
    [1.05, 0.9, 0.85],
  );
  // Lava glowing through cracks in the chest: more of it as it evolves.
  const cracks: Array<[number, number, number, number]> = [
    [0.1, 0.86, 0.36, 0.3],
    [-0.13, 0.74, 0.3, -0.45],
    [0, 1.06, 0.22, 1.2],
  ];
  if (f >= 1) {
    cracks.push([0.26, 0.66, 0.26, -0.2], [-0.24, 0.98, 0.24, 0.6]);
  }
  for (const [x, y, len, tilt] of cracks) {
    p.add(
      new THREE.BoxGeometry(0.05, len, 0.04),
      lava,
      [x, y, 0.5],
      [1, 1, 1],
      [0, 0, tilt],
    );
  }
  p.lump(c.colour, [0, 1.48, 0.15], [0.33, 0.27, 0.3]);
  for (const s of [-1, 1]) {
    p.ball(lava, [s * 0.11, 1.5, 0.4], [0.07, 0.035, 0.04]);
  }
  // One heavy brow across both eyes, and a jaw like a slab.
  p.add(
    new THREE.BoxGeometry(0.44, 0.09, 0.13),
    dark,
    [0, 1.57, 0.4],
    [1, 1, 1],
    [0.2, 0, 0],
  );
  p.add(new THREE.BoxGeometry(0.34, 0.1, 0.16), dark, [0, 1.31, 0.36]);
  for (const s of [-1, 1]) {
    p.fang([s * 0.1, 1.39, 0.42], 0.03, 0.09, true);
    p.lump(dark, [s * 0.68, 1.12, 0], 0.22);
    p.lump(c.colour, [s * 0.78, 0.76, 0.1], [0.2, 0.28, 0.2]);
    p.lump(dark, [s * 0.8, 0.42, 0.18], fist);
    p.add(
      new THREE.OctahedronGeometry(0.16),
      crystal,
      [s * 0.52, 1.42, -0.15],
      [0.6, 1.6, 0.6],
      [0, 0, s * 0.5],
    );
    if (f >= 1) {
      p.cone(dark, [s * 0.2, 1.7, 0.15], 0.07, 0.3, [0, 0, -s * 0.5]);
      p.cone(dark, [s * 0.72, 1.32, 0], 0.06, 0.26, [0, 0, -s * 0.4]);
      p.cone(dark, [s * 0.95, 0.5, 0.2], 0.05, 0.2, [0, 0, -s * 1.3]);
    }
    if (f >= 2) {
      p.add(new THREE.BoxGeometry(0.04, 0.3, 0.04), lava, [
        s * 0.84,
        0.78,
        0.26,
      ]);
    }
  }
  p.add(
    new THREE.OctahedronGeometry(0.2),
    crystal,
    [0, 1.42, -0.42],
    [0.6, 1.7, 0.6],
    [-0.6, 0, 0],
  );
  p.add(
    new THREE.OctahedronGeometry(0.12),
    crystal,
    [0.22, 1.18, -0.5],
    [0.6, 1.6, 0.6],
    [-0.8, 0, 0.3],
  );
  if (f >= 1) {
    p.add(
      new THREE.OctahedronGeometry(0.12),
      crystal,
      [-0.24, 1.2, -0.5],
      [0.6, 1.6, 0.6],
      [-0.8, 0, -0.3],
    );
  }
  if (f >= 2) {
    // A volcano on its back, glowing at the top.
    p.cone(dark, [0, 1.32, -0.52], 0.32, 0.5, [-0.5, 0, 0]);
    p.ball(lava, [0, 1.52, -0.64], [0.12, 0.05, 0.12], [-0.5, 0, 0]);
    for (let k = -1; k <= 1; k++) {
      p.add(
        new THREE.OctahedronGeometry(0.07),
        crystal,
        [k * 0.12, 1.76, 0.15],
        [0.6, 1.6, 0.6],
      );
    }
  }
}

const BUILDERS: Record<Body, (p: Parts, c: Critter) => void> = {
  wolf: blazefang,
  shark: tidejaw,
  giant: thornclaw,
  scorpion: voltsting,
  golem: rockjaw,
};

/**
 * Where on each body plan the extra parts go: the top of its head, where
 * horns sprout, a line down its back, and its shoulders.
 */
const ANCHORS: Record<
  Body,
  {head: V3; horn: V3; back: Array<V3>; shoulder: V3; chest: V3}
> = {
  wolf: {
    head: [0, 1.48, 0.6],
    horn: [0.15, 1.42, 0.66],
    back: [
      [0, 1.17, 0.25],
      [0, 1.16, 0.0],
      [0, 1.14, -0.25],
      [0, 1.1, -0.5],
    ],
    shoulder: [0.36, 1.12, 0.3],
    chest: [0, 0.95, 0.78],
  },
  shark: {
    head: [0, 1.2, 0.75],
    horn: [0.17, 1.14, 0.8],
    back: [
      [0, 1.2, 0.4],
      [0, 1.2, 0.15],
      [0, 1.16, -0.35],
      [0, 1.1, -0.6],
    ],
    shoulder: [0.4, 1.02, 0.2],
    chest: [0, 0.7, 0.75],
  },
  giant: {
    head: [0, 1.84, 0.15],
    horn: [0.17, 1.78, 0.18],
    back: [
      [0, 1.65, -0.2],
      [0, 1.4, -0.38],
      [0, 1.1, -0.44],
      [0, 0.8, -0.42],
    ],
    shoulder: [0.44, 1.32, 0],
    chest: [0, 1.08, 0.45],
  },
  scorpion: {
    head: [0, 0.72, 0.55],
    horn: [0.1, 0.7, 0.62],
    back: [
      [0, 0.8, 0.28],
      [0, 0.81, 0.05],
      [0, 0.8, -0.18],
      [0, 0.77, -0.4],
    ],
    shoulder: [0.3, 0.74, 0.12],
    chest: [0, 0.45, 0.7],
  },
  golem: {
    head: [0, 1.74, 0.15],
    horn: [0.2, 1.68, 0.18],
    back: [
      [0, 1.38, -0.3],
      [0, 1.2, -0.48],
      [0, 0.95, -0.52],
      [0, 0.7, -0.48],
    ],
    shoulder: [0.66, 1.3, 0],
    chest: [0, 1.0, 0.52],
  },
};

/** The extra parts a generated beast has, added onto its body plan. */
function addExtras(p: Parts, c: Critter): void {
  const L = c.look;
  if (!L || !c.extras) {
    return;
  }
  const a = ANCHORS[c.body];
  const x = c.extras;
  if (x & EXTRA.horns) {
    for (const s of [-1, 1]) {
      const [hx, hy, hz] = a.horn;
      p.cone(L.dark, [s * hx, hy + 0.12, hz], 0.06, 0.34, [-0.4, 0, -s * 0.55]);
      p.cone(L.accent2, [s * (hx + 0.1), hy + 0.32, hz - 0.12], 0.035, 0.18, [
        -0.9,
        0,
        -s * 0.3,
      ]);
    }
  }
  if (x & EXTRA.spikes) {
    for (const at of a.back) {
      p.cone(L.accent2, at, 0.06, 0.3, [-0.6, 0, 0]);
    }
  }
  if (x & EXTRA.wings) {
    // Bat wings from the shoulders: a dark sail on three long bones.
    for (const s of [-1, 1]) {
      const [sx, sy, sz] = a.shoulder;
      p.ball(
        L.dark,
        [s * (sx + 0.42), sy + 0.32, sz - 0.2],
        [0.5, 0.03, 0.28],
        [0.3, s * 0.35, -s * 0.55],
      );
      for (let k = 0; k < 3; k++) {
        p.cone(
          L.accent,
          [s * (sx + 0.2 + k * 0.22), sy + 0.25 + k * 0.17, sz - 0.1 - k * 0.1],
          0.025,
          0.6,
          [-0.3, 0, -s * (1.0 - k * 0.15)],
        );
      }
    }
  }
  if (x & EXTRA.crown) {
    for (let k = -2; k <= 2; k++) {
      const [cx, cy, cz] = a.head;
      p.cone(
        L.accent,
        [cx + k * 0.07, cy + 0.06 - Math.abs(k) * 0.02, cz],
        0.03,
        0.2 - Math.abs(k) * 0.03,
        [0, 0, -k * 0.25],
      );
    }
  }
  if (x & EXTRA.armour) {
    for (const s of [-1, 1]) {
      const [sx, sy, sz] = a.shoulder;
      p.lump(L.dark, [s * sx, sy, sz], [0.17, 0.12, 0.18]);
      p.cone(L.accent2, [s * (sx + 0.05), sy + 0.15, sz], 0.04, 0.2, [
        0,
        0,
        -s * 0.5,
      ]);
    }
  }
  if (x & EXTRA.gem) {
    p.add(
      new THREE.OctahedronGeometry(0.08),
      L.accent,
      a.chest,
      [0.8, 1.3, 0.8],
    );
  }
}

let gradient: THREE.DataTexture | undefined;

/** Three bands of light, which is what makes it look like a cartoon. */
function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(
      new Uint8Array([80, 165, 255]),
      3,
      1,
      THREE.RedFormat,
    );
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

let outlineMaterial: THREE.MeshBasicMaterial | undefined;

/**
 * A dark shell drawn round the critter from the inside: the same geometry,
 * every vertex pushed out along its normal, showing only its back faces.
 */
function outline(): THREE.MeshBasicMaterial {
  if (!outlineMaterial) {
    outlineMaterial = new THREE.MeshBasicMaterial({
      color: OUTLINE_COLOUR,
      side: THREE.BackSide,
    });
    outlineMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = position + normal * ${OUTLINE_WIDTH.toFixed(4)};`,
      );
    };
  }
  return outlineMaterial;
}

/** The cartoon material everything in the world is painted with. */
export function toonMaterial(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
  });
}

/** Painted parts as a mesh, with the dark outline round it. */
export function outlined(geometry: THREE.BufferGeometry): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, toonMaterial()));
  group.add(new THREE.Mesh(geometry, outline()));
  return group;
}

export interface CritterModel {
  /** The two meshes, grouped. Animate this, not whatever it is added to. */
  group: THREE.Group;
  /** Its own material, so flashing one critter white leaves the other alone. */
  material: THREE.MeshToonMaterial;
}

export function buildCritter(c: Critter): CritterModel {
  const parts = new Parts();
  BUILDERS[c.body](parts, c);
  addExtras(parts, c);
  const geometry = parts.build();
  // Each form is bigger than the last, still standing on y = 0; and each
  // species is stretched its own way, wider or taller than its body plan.
  const grow = (FORM_SCALE[c.form] ?? 1) * (c.tier >= 4 ? 1.25 : 1);
  geometry.scale(
    grow * c.shape.wide,
    grow * c.shape.tall,
    grow * (0.5 + c.shape.wide / 2),
  );
  geometry.computeBoundingSphere();
  const material = toonMaterial();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  group.add(new THREE.Mesh(geometry, outline()));
  return {group, material};
}
