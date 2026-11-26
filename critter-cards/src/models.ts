import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {Critter} from "./critters";

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

/** A wolf of fire: horns, a burning mane and tail, and a mouth full of fangs. */
function blazefang(p: Parts, c: Critter): void {
  const dark = 0x2e1612;
  const flame = 0xff8a1f;
  const yellow = 0xffd23a;
  p.ball(c.colour, [0, 0.74, -0.05], [0.42, 0.42, 0.72]);
  p.ball(c.colour, [0, 0.86, 0.36], [0.42, 0.44, 0.42]);
  p.ball(dark, [0, 0.6, 0.05], [0.32, 0.28, 0.56]);
  for (const s of [-1, 1]) {
    for (const z of [0.38, -0.45]) {
      p.rod(dark, [s * 0.25, 0.3, z], 0.12, 0.56);
      p.ball(dark, [s * 0.25, 0.06, z + 0.04], [0.14, 0.08, 0.18]);
      p.claws([s * 0.25, 0.05, z + 0.21], 0.07);
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
    p.eye([s * 0.15, 1.27, 0.89], 0.07, 0xffe14a, dark, s);
    p.cone(dark, [s * 0.17, 1.52, 0.5], 0.07, 0.44, [-0.7, 0, -s * 0.3]);
    p.cone(c.colour, [s * 0.26, 1.42, 0.58], 0.09, 0.22, [-0.2, 0, -s * 0.5]);
  }
  // A mane of flame running down the back.
  for (let i = 0; i < 5; i++) {
    const z = 0.45 - i * 0.24;
    const y = 1.18 - i * 0.03;
    p.cone(
      i % 2 ? yellow : flame,
      [0, y, z],
      0.13 - i * 0.01,
      0.42,
      [-0.6, 0, 0],
    );
  }
  p.cone(0xff3a12, [0, 0.98, -0.85], 0.19, 0.7, [-1.0, 0, 0]);
  p.cone(flame, [0, 0.96, -0.8], 0.13, 0.55, [-1.0, 0, 0]);
  p.cone(yellow, [0, 0.94, -0.76], 0.07, 0.34, [-1.0, 0, 0]);
}

/** A shark that walks: rows of teeth, a dorsal fin, red eyes. */
function tidejaw(p: Parts, c: Critter): void {
  const belly = 0xdfe9f0;
  const fin = 0x1d4680;
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
  }
  for (const s of [-1, 1]) {
    p.eye([s * 0.25, 1.0, 0.84], 0.065, 0xff3b3b, fin, s);
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
}

/** A great green beast on two legs, covered in thorns, with big claws. */
function thornclaw(p: Parts, c: Critter): void {
  const dark = 0x1b4d22;
  const thorn = 0xd8b67a;
  const leaf = 0x7ed957;
  for (const s of [-1, 1]) {
    p.rod(dark, [s * 0.25, 0.26, 0], 0.15, 0.52);
    p.ball(dark, [s * 0.25, 0.07, 0.08], [0.18, 0.09, 0.25]);
    p.claws([s * 0.25, 0.06, 0.3], 0.08);
  }
  p.ball(c.colour, [0, 0.96, 0], [0.52, 0.56, 0.43]);
  p.ball(0x5e9c48, [0, 0.88, 0.2], [0.37, 0.42, 0.3]);
  for (const s of [-1, 1]) {
    p.rod(dark, [s * 0.56, 0.86, 0.12], 0.13, 0.56, [0.2, 0, s * 0.35]);
    p.ball(dark, [s * 0.66, 0.58, 0.22], 0.16);
    p.claws([s * 0.66, 0.48, 0.34], 0.08, 0.5);
    // Thorns on the shoulders, sticking up and out.
    p.cone(thorn, [s * 0.44, 1.32, -0.05], 0.08, 0.36, [-0.3, 0, -s * 0.8]);
    p.cone(thorn, [s * 0.5, 1.12, -0.12], 0.06, 0.28, [-0.3, 0, -s * 1.1]);
  }
  p.ball(c.colour, [0, 1.56, 0.15], [0.33, 0.29, 0.31]);
  p.ball(c.colour, [0, 1.49, 0.41], [0.19, 0.13, 0.16]);
  p.ball(dark, [0, 1.53, 0.56], 0.045);
  p.ball(MOUTH, [0, 1.41, 0.4], [0.15, 0.06, 0.13]);
  p.ball(dark, [0, 1.37, 0.37], [0.15, 0.05, 0.13]);
  for (const s of [-1, 1]) {
    p.fang([s * 0.08, 1.42, 0.5], 0.03, 0.1);
    p.eye([s * 0.13, 1.61, 0.4], 0.06, 0xff6a1f, dark, s);
    p.ball(leaf, [s * 0.11, 1.88, 0.03], [0.06, 0.24, 0.03], [0, 0, -s * 0.4]);
  }
  // A row of thorns down the spine.
  const spine: Array<V3> = [
    [0, 1.8, -0.02],
    [0, 1.52, -0.3],
    [0, 1.22, -0.43],
    [0, 0.92, -0.43],
    [0, 0.62, -0.34],
  ];
  for (const at of spine) {
    p.cone(thorn, at, 0.08, 0.36, [-1.1, 0, 0]);
  }
}

/** A scorpion that crackles: pincers, six legs, and a lightning stinger. */
function voltsting(p: Parts, c: Critter): void {
  const dark = 0x2a2438;
  const glow = 0x8ff7ff;
  for (const s of [-1, 1]) {
    for (const z of [-0.25, 0, 0.25]) {
      p.rod(dark, [s * 0.44, 0.2, z], 0.035, 0.56, [0, 0, s * 1.0]);
    }
  }
  p.ball(c.colour, [0, 0.5, 0], [0.43, 0.3, 0.56]);
  for (const z of [-0.32, 0, 0.3]) {
    p.ball(dark, [0, 0.55, z], [0.41, 0.26, 0.07]);
  }
  p.ball(dark, [0, 0.5, 0.55], [0.27, 0.2, 0.22]);
  for (const s of [-1, 1]) {
    p.eye([s * 0.1, 0.6, 0.73], 0.055, glow, c.colour, s);
    p.ball(glow, [s * 0.19, 0.55, 0.68], 0.03);
    p.cone(FANG, [s * 0.07, 0.4, 0.76], 0.03, 0.12, [Math.PI * 0.6, 0, 0]);
    // An arm out front, ending in a pincer with two sharp fingers.
    p.rod(dark, [s * 0.38, 0.52, 0.62], 0.05, 0.42, [Math.PI / 2, 0, -s * 0.3]);
    p.ball(c.colour, [s * 0.46, 0.55, 0.92], [0.14, 0.11, 0.19]);
    p.cone(c.colour, [s * 0.39, 0.58, 1.12], 0.05, 0.26, [
      Math.PI / 2,
      0,
      s * 0.35,
    ]);
    p.cone(c.colour, [s * 0.53, 0.58, 1.12], 0.05, 0.26, [
      Math.PI / 2,
      0,
      -s * 0.35,
    ]);
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
  for (const [y, z, r, stripe] of tail) {
    p.ball(stripe ? dark : c.colour, [0, y, z], r);
  }
  p.cone(glow, [0, 1.42, -0.04], 0.08, 0.32, [Math.PI * 0.8, 0, 0]);
}

/** A golem of rock with lava in its cracks and crystals on its back. */
function rockjaw(p: Parts, c: Critter): void {
  const dark = 0x4a443e;
  const lava = 0xff6a1f;
  const crystal = 0xb06bff;
  for (const s of [-1, 1]) {
    p.lump(dark, [s * 0.26, 0.2, 0], [0.22, 0.24, 0.24]);
  }
  p.add(
    new THREE.IcosahedronGeometry(0.6, 1),
    c.colour,
    [0, 0.86, 0],
    [1.05, 0.9, 0.85],
  );
  // Lava glowing through cracks in the chest.
  p.add(
    new THREE.BoxGeometry(0.05, 0.36, 0.04),
    lava,
    [0.1, 0.86, 0.5],
    [1, 1, 1],
    [0, 0, 0.3],
  );
  p.add(
    new THREE.BoxGeometry(0.05, 0.3, 0.04),
    lava,
    [-0.13, 0.74, 0.5],
    [1, 1, 1],
    [0, 0, -0.45],
  );
  p.add(
    new THREE.BoxGeometry(0.05, 0.22, 0.04),
    lava,
    [0, 1.06, 0.48],
    [1, 1, 1],
    [0, 0, 1.2],
  );
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
    p.lump(dark, [s * 0.8, 0.42, 0.18], 0.27);
    p.add(
      new THREE.OctahedronGeometry(0.16),
      crystal,
      [s * 0.52, 1.42, -0.15],
      [0.6, 1.6, 0.6],
      [0, 0, s * 0.5],
    );
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
}

const BUILDERS: Record<string, (p: Parts, c: Critter) => void> = {
  blazefang,
  tidejaw,
  thornclaw,
  voltsting,
  rockjaw,
};

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
  const build = BUILDERS[c.id];
  if (!build) {
    throw new Error(`no model for ${c.id}`);
  }
  build(parts, c);
  const geometry = parts.build();
  const material = toonMaterial();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  group.add(new THREE.Mesh(geometry, outline()));
  return {group, material};
}
