import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {Critter} from "./critters";

// Every critter is built here out of spheres, cones and cylinders, each painted
// one colour, then merged into one geometry: one draw call per critter, plus
// one for its outline. They all stand with their feet at y = 0 and face +Z.

type V3 = readonly [number, number, number];

const OUTLINE_COLOUR = 0x2a1d14;
/** How far the outline shell is pushed out along the normals, in units. */
const OUTLINE_WIDTH = 0.022;

const EYE_WHITE = 0xffffff;
const PUPIL = 0x1d1a2a;

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

  cone(colour: number, at: V3, r: number, h: number, rot?: V3): void {
    this.add(new THREE.ConeGeometry(r, h, 16), colour, at, [1, 1, 1], rot);
  }

  rod(colour: number, at: V3, r: number, h: number, rot?: V3): void {
    this.add(
      new THREE.CylinderGeometry(r, r, h, 10),
      colour,
      at,
      [1, 1, 1],
      rot,
    );
  }

  /** A round eye looking forward: white, pupil, and a glint. */
  eye(at: V3, r: number): void {
    this.ball(EYE_WHITE, at, r);
    this.ball(PUPIL, [at[0], at[1], at[2] + r * 0.45], r * 0.62);
    this.ball(
      EYE_WHITE,
      [at[0] + r * 0.22, at[1] + r * 0.25, at[2] + r * 0.95],
      r * 0.2,
    );
  }

  /** A little smile: half a thin ring, turned so it curves up. */
  smile(at: V3, r: number): void {
    this.add(
      new THREE.TorusGeometry(r, r * 0.22, 6, 12, Math.PI),
      OUTLINE_COLOUR,
      at,
      [1, 1, 1],
      [0, 0, Math.PI],
    );
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

function emberpup(p: Parts, c: Critter): void {
  const cream = 0xffe2b8;
  const dark = 0xe0611f;
  p.ball(c.colour, [0, 0.5, 0], [0.42, 0.36, 0.55]);
  p.ball(cream, [0, 0.43, 0.08], [0.32, 0.26, 0.42]);
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.28, 0.28]) {
      p.rod(dark, [x, 0.17, z], 0.09, 0.32);
      p.ball(cream, [x, 0.04, z + 0.03], [0.1, 0.06, 0.12]);
    }
  }
  p.ball(c.colour, [0, 0.98, 0.32], 0.38);
  p.ball(cream, [0, 0.87, 0.62], [0.2, 0.15, 0.16]);
  p.ball(OUTLINE_COLOUR, [0, 0.93, 0.77], 0.05);
  p.smile([0, 0.84, 0.75], 0.05);
  p.eye([-0.15, 1.06, 0.62], 0.085);
  p.eye([0.15, 1.06, 0.62], 0.085);
  for (const s of [-1, 1]) {
    p.cone(c.colour, [s * 0.22, 1.32, 0.24], 0.13, 0.32, [0, 0, -s * 0.35]);
    p.cone(0xd8402a, [s * 0.21, 1.3, 0.3], 0.08, 0.22, [0, 0, -s * 0.35]);
  }
  // The flame of a tail, three cones inside each other leaning back.
  p.cone(0xff4a1c, [0, 0.82, -0.66], 0.17, 0.55, [-0.6, 0, 0]);
  p.cone(0xffa21f, [0, 0.8, -0.62], 0.12, 0.42, [-0.6, 0, 0]);
  p.cone(0xffe14a, [0, 0.77, -0.58], 0.07, 0.28, [-0.6, 0, 0]);
}

function splashfin(p: Parts, c: Critter): void {
  const white = 0xe8f6ff;
  const dark = 0x2b86d8;
  p.ball(c.colour, [0, 0.48, -0.05], [0.5, 0.48, 0.62]);
  p.ball(white, [0, 0.42, 0.12], [0.4, 0.38, 0.48]);
  p.ball(c.colour, [0, 1.0, 0.25], 0.4);
  p.ball(white, [0, 0.89, 0.58], [0.22, 0.14, 0.15]);
  p.ball(OUTLINE_COLOUR, [0, 0.96, 0.72], 0.05);
  p.eye([-0.16, 1.08, 0.56], 0.09);
  p.eye([0.16, 1.08, 0.56], 0.09);
  for (const s of [-1, 1]) {
    p.ball(dark, [s * 0.5, 0.33, 0.15], [0.32, 0.06, 0.16], [0, 0, s * 0.5]);
    p.ball(dark, [s * 0.15, 0.12, -0.7], [0.22, 0.05, 0.14], [0, s * 0.5, 0]);
  }
  // A curl of water on top of its head.
  p.add(
    new THREE.TorusGeometry(0.12, 0.045, 8, 16, Math.PI * 1.5),
    0x9ad8ff,
    [0, 1.48, 0.2],
  );
  p.ball(0x9ad8ff, [0.12, 1.48, 0.2], 0.05);
}

function thornbun(p: Parts, c: Critter): void {
  const cream = 0xf2ffe0;
  const dark = 0x3f9a44;
  p.ball(c.colour, [0, 0.46, 0], [0.4, 0.42, 0.42]);
  p.ball(cream, [0, 0.42, 0.14], [0.3, 0.32, 0.3]);
  for (const s of [-1, 1]) {
    p.ball(dark, [s * 0.18, 0.06, 0.15], [0.14, 0.08, 0.24]);
    // Leaf ears: long, flat, and leaning out.
    p.ball(dark, [s * 0.17, 1.55, 0.05], [0.12, 0.42, 0.05], [0, 0, -s * 0.25]);
    p.ball(
      0x8fe07f,
      [s * 0.168, 1.53, 0.08],
      [0.05, 0.32, 0.02],
      [0, 0, -s * 0.25],
    );
  }
  p.ball(c.colour, [0, 0.98, 0.12], 0.36);
  p.eye([-0.14, 1.04, 0.42], 0.085);
  p.eye([0.14, 1.04, 0.42], 0.085);
  p.ball(0xff8fb0, [0, 0.95, 0.47], 0.04);
  p.smile([0, 0.89, 0.45], 0.045);
  // A flower on top, its petals round a yellow middle.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.ball(
      0xff7fb8,
      [Math.cos(a) * 0.1, 1.33, 0.24 + Math.sin(a) * 0.1],
      [0.08, 0.04, 0.08],
    );
  }
  p.ball(0xffd84a, [0, 1.36, 0.24], 0.065);
  p.ball(0xffffff, [0, 0.45, -0.42], 0.12);
}

function sparkbug(p: Parts, c: Critter): void {
  const navy = 0x3a3350;
  for (const s of [-1, 1]) {
    for (const z of [-0.22, 0.02, 0.26]) {
      p.rod(navy, [s * 0.36, 0.13, z], 0.025, 0.36, [0, 0, s * 0.9]);
    }
  }
  p.ball(c.colour, [0, 0.5, -0.05], [0.5, 0.42, 0.6]);
  // Spots on the shell, each a ball sunk most of the way into it.
  const spots: Array<V3> = [
    [0.55, 0.6, 0.2],
    [-0.55, 0.6, 0.2],
    [0.35, 0.75, -0.55],
    [-0.35, 0.75, -0.55],
    [0, 0.9, -0.4],
  ];
  for (const [nx, ny, nz] of spots) {
    const l = Math.hypot(nx, ny, nz);
    p.ball(
      navy,
      [(0.5 * nx) / l, 0.5 + (0.42 * ny) / l, -0.05 + (0.6 * nz) / l],
      0.1,
    );
  }
  p.ball(navy, [0, 0.62, 0.5], 0.32);
  p.eye([-0.13, 0.7, 0.75], 0.1);
  p.eye([0.13, 0.7, 0.75], 0.1);
  p.add(
    new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI),
    c.colour,
    [0, 0.55, 0.8],
    [1, 1, 1],
    [0, 0, Math.PI],
  );
  for (const s of [-1, 1]) {
    p.rod(navy, [s * 0.15, 1.0, 0.56], 0.022, 0.45, [0, 0, -s * 0.35]);
    p.ball(0xfff27a, [s * 0.23, 1.22, 0.56], 0.07);
  }
}

function pebblet(p: Parts, c: Critter): void {
  const dark = 0x857a6c;
  // A faceted ball reads as a rock; its flat normals are what does it.
  p.add(
    new THREE.IcosahedronGeometry(0.55, 1),
    c.colour,
    [0, 0.5, 0],
    [1, 0.85, 1],
  );
  p.ball(0x6bab4a, [0, 0.9, -0.02], [0.38, 0.13, 0.36]);
  p.cone(0x6bab4a, [0.05, 1.06, 0], 0.04, 0.18, [0, 0, -0.3]);
  p.ball(0x8fd06a, [0.1, 1.14, 0], [0.07, 0.03, 0.05]);
  for (const s of [-1, 1]) {
    p.eye([s * 0.17, 0.64, 0.46], 0.09);
    // Heavy lids, half down: it is a sleepy rock.
    p.ball(c.colour, [s * 0.17, 0.685, 0.465], [0.1, 0.055, 0.1]);
    p.ball(dark, [s * 0.57, 0.4, 0.1], [0.14, 0.18, 0.14]);
    p.ball(dark, [s * 0.24, 0.06, 0.1], [0.18, 0.1, 0.22]);
  }
  p.smile([0, 0.5, 0.52], 0.05);
  p.add(
    new THREE.OctahedronGeometry(0.18),
    0x5fe0ff,
    [0, 0.82, -0.42],
    [0.8, 1.4, 0.8],
    [-0.5, 0, 0],
  );
}

const BUILDERS: Record<string, (p: Parts, c: Critter) => void> = {
  emberpup,
  splashfin,
  thornbun,
  sparkbug,
  pebblet,
};

let gradient: THREE.DataTexture | undefined;

/** Three bands of light, which is what makes it look like a cartoon. */
function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(
      new Uint8Array([110, 190, 255]),
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
