import * as THREE from "three";
import type {Critter, Look} from "./critters";
import {FANG, MOUTH, Parts, type V3} from "./parts";

// Seven more body plans, beyond the five the starters are built on: a dragon,
// a hooded serpent, a raptor, a giant spider, a fortress tortoise, an ape and
// a walking squid. Only generated beasts use them, so each takes its colours
// from the beast's look. Like the first five they stand on y = 0 and face +Z;
// the extra parts and patterns models.ts adds find their places from the
// anchors at the bottom.

export type NewBody =
  "dragon" | "serpent" | "raptor" | "spider" | "turtle" | "ape" | "squid";

/** Where on a body plan the extra parts and patterns go. */
export interface Anchors {
  /** The top of the head, for a crown. */
  head: V3;
  /** Where the right horn sprouts; the left is its mirror. */
  horn: V3;
  /** A line down the back, for spikes. */
  back: Array<V3>;
  /** The right shoulder, for wings and armour. */
  shoulder: V3;
  /** The front of the chest, for a gem. */
  chest: V3;
  /** The middle of the mouth, for tusks. */
  mouth: V3;
  /** The middle of the forehead, for a third eye. */
  brow: V3;
  /** The main body, as an ellipsoid: for stripes, spots and a saddle. */
  torso: {c: V3; r: V3};
}

/** A beast's look, or one made from its body colour if it has none. */
export function lookOf(c: Critter): Look {
  return (
    c.look ?? {
      dark: 0x2a2030,
      accent: 0xff8a1f,
      accent2: 0xffd23a,
      eye: 0xffe14a,
      belly: 0xdddddd,
    }
  );
}

const sides = [-1, 1] as const;

function dragon(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  p.ball(col, [0, 0.85, 0], [0.45, 0.42, 0.7]);
  p.ball(L.belly, [0, 0.74, 0.12], [0.34, 0.3, 0.56]);
  for (const s of sides) {
    for (const z of [0.4, -0.4]) {
      p.limb(L.dark, [s * 0.28, 0.75, z], [s * 0.32, 0.08, z + 0.05], 0.11);
      p.ball(L.dark, [s * 0.32, 0.06, z + 0.1], [0.13, 0.07, 0.17]);
      p.claws([s * 0.32, 0.05, z + 0.27], 0.06);
    }
    // Wings: a dark sail on two long bones, swept up and back.
    p.ball(
      L.dark,
      [s * 0.75, 1.4, -0.1],
      [0.65, 0.03, 0.38],
      [0.25, s * 0.25, -s * 0.45],
    );
    p.limb(L.accent, [s * 0.3, 1.15, 0.1], [s * 1.15, 1.75, -0.1], 0.035);
    p.limb(L.accent, [s * 0.3, 1.15, 0.1], [s * 1.2, 1.3, -0.45], 0.03);
    p.ball(L.dark, [s * 0.06, 1.68, 1.41], 0.025);
    p.fang([s * 0.08, 1.53, 1.33], 0.025, 0.09);
    p.eye([s * 0.13, 1.76, 1.12], 0.055, L.eye, L.dark, s);
    p.cone(L.accent2, [s * 0.12, 1.92, 0.86], 0.05, 0.36, [-1.1, 0, -s * 0.25]);
  }
  // A long neck up to the head, and a jaw hanging open.
  p.limb(col, [0, 1.0, 0.45], [0, 1.55, 0.85], 0.17);
  p.ball(col, [0, 1.68, 0.98], [0.22, 0.19, 0.3]);
  p.ball(col, [0, 1.62, 1.26], [0.15, 0.11, 0.17]);
  p.ball(MOUTH, [0, 1.52, 1.18], [0.13, 0.05, 0.16]);
  p.ball(L.dark, [0, 1.48, 1.15], [0.13, 0.04, 0.17]);
  p.limb(col, [0, 0.8, -0.6], [0, 0.6, -1.1], 0.15);
  p.limb(col, [0, 0.6, -1.1], [0, 0.45, -1.5], 0.09);
  p.cone(L.accent, [0, 0.43, -1.66], 0.1, 0.28, [-Math.PI / 2, 0, 0]);
  const spikes = c.form >= 1 ? 6 : 4;
  for (let i = 0; i < spikes; i++) {
    const z = 0.45 - i * (1.1 / (spikes - 1));
    p.cone(
      L.accent2,
      [0, 1.22 - Math.abs(z) * 0.1, z],
      0.05,
      0.22,
      [-0.5, 0, 0],
    );
  }
}

function serpent(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  // Coiled up on the ground, then rearing up into a hood.
  p.add(
    new THREE.TorusGeometry(0.42, 0.17, 10, 28),
    col,
    [0, 0.17, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  p.add(
    new THREE.TorusGeometry(0.3, 0.15, 10, 24),
    col,
    [0, 0.45, -0.03],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  p.limb(col, [0, 0.55, 0.0], [0, 1.05, 0.12], 0.16);
  p.limb(col, [0, 1.05, 0.12], [0, 1.4, 0.3], 0.14);
  p.ball(col, [0, 1.42, 0.22], [0.42, 0.4, 0.07], [0.3, 0, 0]);
  p.ball(L.belly, [0, 1.4, 0.27], [0.3, 0.3, 0.04], [0.3, 0, 0]);
  p.ball(col, [0, 1.55, 0.45], [0.18, 0.13, 0.26]);
  p.ball(MOUTH, [0, 1.46, 0.56], [0.12, 0.05, 0.16]);
  for (const s of sides) {
    // Eye-spots on the hood, staring back at you.
    p.ball(L.accent, [s * 0.16, 1.47, 0.3], 0.055);
    p.fang([s * 0.06, 1.47, 0.68], 0.022, 0.13);
    p.eye([s * 0.11, 1.62, 0.55], 0.045, L.eye, L.dark, s);
    p.cone(0xff3b5c, [s * 0.025, 1.44, 0.9], 0.012, 0.08, [Math.PI / 2, 0, 0]);
  }
  p.limb(0xff3b5c, [0, 1.45, 0.66], [0, 1.44, 0.84], 0.014);
  // A rattle at the end of its tail.
  p.ball(L.accent2, [0.48, 0.2, -0.28], 0.08);
  p.ball(L.accent2, [0.55, 0.26, -0.36], 0.065);
  p.ball(L.accent2, [0.6, 0.31, -0.43], 0.05);
}

function raptor(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  p.ball(col, [0, 1.0, 0], [0.3, 0.33, 0.55], [0.25, 0, 0]);
  p.ball(L.belly, [0, 0.92, 0.08], [0.24, 0.25, 0.45], [0.25, 0, 0]);
  for (const s of sides) {
    p.ball(col, [s * 0.22, 0.85, -0.08], [0.14, 0.22, 0.2]);
    p.limb(L.dark, [s * 0.24, 0.72, -0.1], [s * 0.25, 0.35, -0.25], 0.07);
    p.limb(L.dark, [s * 0.25, 0.35, -0.25], [s * 0.25, 0.07, -0.05], 0.05);
    p.claws([s * 0.25, 0.05, 0.1], 0.07);
    // The big curved claw it is famous for.
    p.cone(FANG, [s * 0.25, 0.16, 0.02], 0.035, 0.18, [-0.8, 0, 0]);
    p.limb(L.dark, [s * 0.2, 1.05, 0.35], [s * 0.24, 0.85, 0.52], 0.04);
    p.cone(FANG, [s * 0.24, 0.8, 0.58], 0.02, 0.08, [Math.PI * 0.8, 0, 0]);
    for (let k = 0; k < 3; k++) {
      p.fang([s * 0.08, 1.44, 0.86 + k * 0.07], 0.02, 0.07);
    }
    p.eye([s * 0.11, 1.58, 0.82], 0.045, L.eye, L.dark, s);
  }
  p.limb(col, [0, 1.15, 0.35], [0, 1.45, 0.6], 0.12);
  p.ball(col, [0, 1.5, 0.75], [0.17, 0.15, 0.3]);
  p.ball(MOUTH, [0, 1.42, 0.86], [0.12, 0.05, 0.2]);
  p.ball(L.dark, [0, 1.38, 0.83], [0.12, 0.04, 0.2]);
  p.limb(col, [0, 1.05, -0.45], [0, 1.0, -1.1], 0.14);
  p.limb(col, [0, 1.0, -1.1], [0, 0.95, -1.55], 0.07);
  // A crest of feathers down the back of the head and neck.
  for (let k = 0; k < 4; k++) {
    p.cone(
      L.accent,
      [0, 1.66 - k * 0.1, 0.62 - k * 0.1],
      0.04,
      0.3,
      [-0.9, 0, 0],
    );
  }
}

function spider(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  p.ball(col, [0, 0.8, -0.45], [0.5, 0.45, 0.55]);
  // A warning mark on its back.
  p.ball(L.accent, [0, 1.17, -0.48], [0.16, 0.1, 0.24]);
  p.ball(L.accent, [0, 1.12, -0.25], [0.1, 0.07, 0.1]);
  p.ball(col, [0, 0.62, 0.2], [0.32, 0.24, 0.32]);
  for (const s of sides) {
    for (let k = 0; k < 4; k++) {
      const base: V3 = [s * 0.25, 0.62, 0.35 - k * 0.18];
      const knee: V3 = [s * (0.7 + 0.05 * k), 1.08, 0.55 - k * 0.35];
      const foot: V3 = [s * (0.95 + 0.05 * k), 0.02, 0.7 - k * 0.48];
      p.limb(L.dark, base, knee, 0.055);
      p.limb(L.dark, knee, foot, 0.04);
    }
    p.ball(L.eye, [s * 0.09, 0.72, 0.48], 0.06);
    p.ball(L.eye, [s * 0.17, 0.75, 0.43], 0.035);
    p.ball(L.eye, [s * 0.05, 0.81, 0.45], 0.03);
    p.ball(L.dark, [s * 0.07, 0.52, 0.48], 0.065);
    p.cone(FANG, [s * 0.07, 0.43, 0.52], 0.04, 0.18, [Math.PI * 0.85, 0, 0]);
  }
  p.cone(L.dark, [0, 0.62, -1.0], 0.06, 0.16, [-Math.PI / 2, 0, 0]);
}

function turtle(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  const skin = L.belly;
  for (const s of sides) {
    for (const z of [0.42, -0.45]) {
      p.limb(skin, [s * 0.42, 0.38, z], [s * 0.48, 0.08, z + 0.05], 0.14);
      p.ball(skin, [s * 0.48, 0.06, z + 0.08], [0.15, 0.07, 0.18]);
      p.claws([s * 0.48, 0.05, z + 0.24], 0.06);
    }
    p.eye([s * 0.11, 0.77, 1.18], 0.045, L.eye, L.dark, s);
  }
  p.ball(skin, [0, 0.4, 0], [0.6, 0.18, 0.7]);
  // The shell: a dome, a dark rim round it, and plates like armour.
  p.ball(col, [0, 0.55, -0.02], [0.68, 0.48, 0.78]);
  p.add(
    new THREE.TorusGeometry(1, 0.06, 6, 40),
    L.dark,
    [0, 0.42, -0.02],
    [0.69, 0.79, 1],
    [Math.PI / 2, 0, 0],
  );
  const plates: Array<V3> = [
    [0, 1.0, 0],
    [0.32, 0.88, 0.2],
    [-0.32, 0.88, 0.2],
    [0.32, 0.86, -0.28],
    [-0.32, 0.86, -0.28],
    [0, 0.92, -0.42],
    [0, 0.92, 0.42],
  ];
  for (const at of plates) {
    p.lump(L.dark, at, [0.17, 0.07, 0.17]);
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    p.cone(
      L.accent2,
      [Math.sin(a) * 0.7, 0.44, Math.cos(a) * 0.8 - 0.02],
      0.05,
      0.18,
      [Math.cos(a) * 1.4, 0, -Math.sin(a) * 1.4],
    );
  }
  p.limb(skin, [0, 0.5, 0.6], [0, 0.66, 0.95], 0.13);
  p.ball(skin, [0, 0.7, 1.05], [0.2, 0.17, 0.24]);
  p.ball(MOUTH, [0, 0.62, 1.2], [0.11, 0.04, 0.08]);
  p.cone(L.dark, [0, 0.67, 1.3], 0.07, 0.14, [Math.PI / 2, 0, 0]);
  p.cone(skin, [0, 0.4, -0.82], 0.06, 0.2, [-Math.PI / 2, 0, 0]);
}

function ape(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  for (const s of sides) {
    p.limb(L.dark, [s * 0.22, 0.62, -0.05], [s * 0.25, 0.1, 0.0], 0.13);
    p.ball(L.dark, [s * 0.25, 0.07, 0.06], [0.15, 0.08, 0.2]);
    p.ball(col, [s * 0.55, 1.35, 0.02], 0.22);
    // Long arms down to knuckles on the ground.
    p.limb(col, [s * 0.6, 1.35, 0.05], [s * 0.75, 0.75, 0.2], 0.15);
    p.limb(col, [s * 0.75, 0.75, 0.2], [s * 0.72, 0.22, 0.35], 0.12);
    p.lump(L.dark, [s * 0.72, 0.16, 0.38], 0.17);
    p.claws([s * 0.72, 0.12, 0.54], 0.06);
    p.eye([s * 0.09, 1.64, 0.44], 0.045, L.eye, L.dark, s);
    p.fang([s * 0.06, 1.5, 0.47], 0.022, 0.08, true);
  }
  p.ball(col, [0, 1.05, 0], [0.55, 0.55, 0.42]);
  p.ball(L.belly, [0, 1.05, 0.2], [0.38, 0.4, 0.28]);
  p.ball(col, [0, 1.62, 0.2], [0.26, 0.24, 0.24]);
  p.ball(L.belly, [0, 1.57, 0.36], [0.2, 0.17, 0.12]);
  p.add(new THREE.BoxGeometry(0.36, 0.07, 0.1), L.dark, [0, 1.7, 0.39]);
  p.ball(MOUTH, [0, 1.5, 0.44], [0.12, 0.05, 0.06]);
  for (let k = -1; k <= 1; k++) {
    p.cone(L.accent, [k * 0.08, 1.86, 0.14 - Math.abs(k) * 0.05], 0.04, 0.2, [
      -0.3,
      0,
      -k * 0.3,
    ]);
  }
}

function squid(p: Parts, c: Critter): void {
  const L = lookOf(c);
  const col = c.colour;
  // The mantle stands up tall, leaning back, with fins at the top.
  p.ball(col, [0, 1.4, -0.1], [0.38, 0.6, 0.38], [-0.25, 0, 0]);
  p.ball(col, [0, 0.85, 0.08], [0.36, 0.3, 0.34]);
  for (const s of sides) {
    p.ball(
      L.dark,
      [s * 0.35, 1.85, -0.25],
      [0.25, 0.18, 0.04],
      [0, s * 0.4, s * 0.4],
    );
    p.eye([s * 0.25, 0.95, 0.3], 0.08, L.eye, L.dark, s);
    // Two long arms reaching forward, clubbed at the end.
    p.limb(col, [s * 0.12, 0.72, 0.3], [s * 0.3, 0.92, 0.78], 0.06);
    p.ball(L.accent, [s * 0.32, 0.95, 0.86], [0.08, 0.06, 0.12]);
  }
  p.cone(L.dark, [0, 0.62, 0.36], 0.05, 0.14, [Math.PI * 0.75, 0, 0]);
  // Eight legs to walk on, curling up at their tips.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a);
    const z = Math.cos(a);
    const base: V3 = [x * 0.25, 0.62, 0.08 + z * 0.22];
    const mid: V3 = [x * 0.6, 0.25, 0.08 + z * 0.55];
    const tip: V3 = [x * 0.85, 0.06, 0.08 + z * 0.8];
    const curl: V3 = [x * 0.95, 0.2, 0.08 + z * 0.9];
    p.limb(col, base, mid, 0.09);
    p.limb(col, mid, tip, 0.065);
    p.limb(L.belly, tip, curl, 0.04);
  }
}

export const NEW_BUILDERS: Record<NewBody, (p: Parts, c: Critter) => void> = {
  dragon,
  serpent,
  raptor,
  spider,
  turtle,
  ape,
  squid,
};

export const NEW_ANCHORS: Record<NewBody, Anchors> = {
  dragon: {
    head: [0, 1.88, 0.98],
    horn: [0.1, 1.86, 1.02],
    back: [
      [0, 1.25, 0.35],
      [0, 1.27, 0.1],
      [0, 1.25, -0.15],
      [0, 1.2, -0.4],
    ],
    shoulder: [0.38, 1.1, 0.3],
    chest: [0, 0.85, 0.68],
    mouth: [0, 1.5, 1.22],
    brow: [0, 1.79, 1.2],
    torso: {c: [0, 0.85, 0], r: [0.45, 0.42, 0.7]},
  },
  serpent: {
    head: [0, 1.68, 0.42],
    horn: [0.1, 1.66, 0.42],
    back: [
      [0, 1.75, 0.12],
      [0, 1.55, 0.1],
      [0, 1.2, 0.0],
      [0, 0.9, -0.05],
    ],
    shoulder: [0.3, 1.3, 0.2],
    chest: [0, 1.15, 0.27],
    mouth: [0, 1.46, 0.64],
    brow: [0, 1.63, 0.66],
    torso: {c: [0, 0.3, 0], r: [0.6, 0.3, 0.6]},
  },
  raptor: {
    head: [0, 1.65, 0.72],
    horn: [0.09, 1.62, 0.75],
    back: [
      [0, 1.3, 0.1],
      [0, 1.3, -0.15],
      [0, 1.25, -0.4],
      [0, 1.15, -0.7],
    ],
    shoulder: [0.22, 1.15, 0.3],
    chest: [0, 1.0, 0.5],
    mouth: [0, 1.42, 0.97],
    brow: [0, 1.6, 0.98],
    torso: {c: [0, 1.0, 0], r: [0.3, 0.33, 0.55]},
  },
  spider: {
    head: [0, 0.86, 0.25],
    horn: [0.12, 0.82, 0.32],
    back: [
      [0, 1.22, -0.25],
      [0, 1.25, -0.45],
      [0, 1.2, -0.65],
      [0, 1.05, -0.85],
    ],
    shoulder: [0.3, 0.85, 0.1],
    chest: [0, 0.6, 0.5],
    mouth: [0, 0.5, 0.52],
    brow: [0, 0.86, 0.43],
    torso: {c: [0, 0.8, -0.45], r: [0.5, 0.45, 0.55]},
  },
  turtle: {
    head: [0, 0.88, 1.05],
    horn: [0.1, 0.85, 1.05],
    back: [
      [0, 1.02, 0.3],
      [0, 1.05, 0],
      [0, 1.02, -0.3],
      [0, 0.95, -0.55],
    ],
    shoulder: [0.5, 0.85, 0.3],
    chest: [0, 0.55, 0.75],
    mouth: [0, 0.62, 1.26],
    brow: [0, 0.8, 1.23],
    torso: {c: [0, 0.55, -0.02], r: [0.68, 0.48, 0.78]},
  },
  ape: {
    head: [0, 1.86, 0.2],
    horn: [0.15, 1.8, 0.22],
    back: [
      [0, 1.55, -0.25],
      [0, 1.3, -0.4],
      [0, 1.05, -0.42],
      [0, 0.8, -0.38],
    ],
    shoulder: [0.55, 1.5, 0],
    chest: [0, 1.15, 0.47],
    mouth: [0, 1.5, 0.46],
    brow: [0, 1.72, 0.43],
    torso: {c: [0, 1.05, 0], r: [0.55, 0.55, 0.42]},
  },
  squid: {
    head: [0, 2.0, -0.22],
    horn: [0.12, 1.05, 0.3],
    back: [
      [0, 1.9, -0.36],
      [0, 1.6, -0.46],
      [0, 1.3, -0.46],
      [0, 1.05, -0.36],
    ],
    shoulder: [0.3, 1.2, 0],
    chest: [0, 1.2, 0.28],
    mouth: [0, 0.62, 0.4],
    brow: [0, 1.08, 0.4],
    torso: {c: [0, 1.4, -0.1], r: [0.38, 0.6, 0.38]},
  },
};
