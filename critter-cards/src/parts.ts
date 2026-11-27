import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The kit every beast is built from: painted spheres, cones and rods merged
// into one geometry, plus the eyes, fangs and claws they all share.

export type V3 = readonly [number, number, number];

export const OUTLINE_COLOUR = 0x1a1210;
/** How far the outline shell is pushed out along the normals, in units. */
export const OUTLINE_WIDTH = 0.026;

export const FANG = 0xfff6e0;
export const PUPIL = 0x120c0a;
export const MOUTH = 0x4a0f14;

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

  /**
   * A limb from one point to another: a tapering rod, for legs, arms, necks
   * and tails that don't run straight up and down.
   */
  limb(colour: number, from: V3, to: V3, r: number): void {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r * 0.8, r, d.length(), 10);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.clone().normalize(),
      ),
    );
    const mid = a.add(b).multiplyScalar(0.5);
    this.add(g, colour, [mid.x, mid.y, mid.z]);
    // A joint at the far end, so a bent leg doesn't show a gap at its knee.
    this.ball(colour, to, r * 0.85);
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
