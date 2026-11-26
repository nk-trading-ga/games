import * as THREE from "three";
import {ParticleBurst} from "../../shared/particles";
import {ARENA, CAMERA, EFFECTS} from "./config";
import {Parts, outlined} from "./models";

// The renderer, the meadow the battles happen in, the camera, and the particle
// pools every effect draws from.

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Sparks, puffs and splashes: small and quick. */
  readonly sparks = new ParticleBurst(600, 0.07, false);
  /** Paper confetti for winning. */
  readonly confetti = new ParticleBurst(360, 0.08, false, "paper");
  /** Which way is right on screen, along the ground. */
  readonly screenRight = new THREE.Vector3();

  private readonly home = new THREE.Vector3(
    CAMERA.position.x,
    CAMERA.position.y,
    CAMERA.position.z,
  );
  private readonly target = new THREE.Vector3(
    CAMERA.lookAt.x,
    CAMERA.lookAt.y,
    CAMERA.lookAt.z,
  );
  private shakeLeft = 0;
  private shakeSize = 0;
  private shakeTime = 1;
  private drift = 0;

  constructor(mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200);
    this.camera.position.copy(this.home);
    this.camera.lookAt(this.target);

    const forward = this.target.clone().sub(this.home).setY(0).normalize();
    this.screenRight.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    this.scene.background = new THREE.Color(0x9fdcff);
    this.scene.fog = new THREE.Fog(0x9fdcff, 30, 80);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9a5a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-4, 10, 6);
    this.scene.add(sun);

    this.buildMeadow();
    this.scene.add(this.sparks.mesh, this.confetti.mesh);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  private buildMeadow(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(90, 48),
      new THREE.MeshLambertMaterial({color: 0x86c96e}),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.3;
    this.scene.add(ground);

    // The battle platform: a low round lawn, a step up from the meadow, with a
    // pale circle on it under each critter.
    const p = new Parts();
    p.add(
      new THREE.CylinderGeometry(ARENA.radius, ARENA.radius + 0.2, 0.3, 48),
      0x9ad97f,
      [0, -0.15, 0],
    );
    p.add(
      new THREE.CylinderGeometry(
        ARENA.radius + 0.2,
        ARENA.radius + 0.35,
        0.12,
        48,
      ),
      0xd9c08a,
      [0, -0.24, 0],
    );
    for (const spot of [ARENA.playerSpot, ARENA.foeSpot]) {
      // Stood 0.01 proud of the lawn, which would otherwise z-fight it.
      p.add(new THREE.CylinderGeometry(1.05, 1.05, 0.02, 40), 0xd6f5c4, [
        spot.x,
        0.01,
        spot.z,
      ]);
    }
    // A line across the middle, the way a pitch has.
    p.add(
      new THREE.BoxGeometry(0.12, 0.02, 7),
      0xd6f5c4,
      [0, 0.01, 0],
      [1, 1, 1],
      [0, Math.atan2(-ARENA.foeSpot.z, ARENA.foeSpot.x), 0],
    );
    this.scene.add(outlined(p.build()));

    // Trees and bushes in a ring round it, and hills further off.
    const trees = new Parts();
    const rng = mulberry(7);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
      const r = ARENA.radius + 3 + rng() * 6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.8 + rng() * 0.8;
      if (rng() < 0.6) {
        trees.add(
          new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 1.2 * s, 8),
          0x8a5a3a,
          [x, 0.3 * s - 0.3, z],
        );
        trees.add(new THREE.ConeGeometry(1.1 * s, 2.4 * s, 10), 0x3f9a52, [
          x,
          1.8 * s - 0.3,
          z,
        ]);
        trees.add(new THREE.ConeGeometry(0.85 * s, 1.8 * s, 10), 0x4fb35f, [
          x,
          2.7 * s - 0.3,
          z,
        ]);
      } else {
        trees.add(
          new THREE.SphereGeometry(0.9 * s, 12, 8),
          0x5cbf5a,
          [x, 0.2, z],
          [1, 0.75, 1],
        );
        trees.add(
          new THREE.SphereGeometry(0.12, 8, 6),
          [0xff7fb8, 0xffd84a, 0xffffff][i % 3],
          [x + 0.4 * s, 0.75 * s, z + 0.3 * s],
        );
      }
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      trees.add(
        new THREE.SphereGeometry(1, 16, 10),
        i % 2 ? 0x77bf68 : 0x6aad5f,
        [Math.cos(a) * 45, -2, Math.sin(a) * 45],
        [14, 8 + (i % 3) * 3, 14],
      );
    }
    this.scene.add(outlined(trees.build()));

    const clouds = new Parts();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const cx = Math.cos(a) * 38;
      const cz = Math.sin(a) * 38;
      const cy = 14 + (i % 3) * 3;
      for (let j = 0; j < 4; j++) {
        clouds.add(
          new THREE.SphereGeometry(1, 12, 8),
          0xffffff,
          [cx + (j - 1.5) * 2.2, cy + (j % 2) * 0.8, cz],
          [2.4, 1.6, 2],
        );
      }
    }
    const cloudMesh = new THREE.Mesh(
      clouds.build(),
      new THREE.MeshBasicMaterial({vertexColors: true, fog: false}),
    );
    this.scene.add(cloudMesh);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Widen the vertical view on a narrow screen until enough fits across.
    const needH = THREE.MathUtils.degToRad(CAMERA.minHorizontalFov);
    const vForH = 2 * Math.atan(Math.tan(needH / 2) / aspect);
    this.camera.fov = Math.max(CAMERA.fov, THREE.MathUtils.radToDeg(vForH));
    this.camera.updateProjectionMatrix();
  }

  shake(size = EFFECTS.shake, time = EFFECTS.shakeTime): void {
    this.shakeSize = size;
    this.shakeLeft = time;
    this.shakeTime = time;
  }

  /** A point in the world, in CSS pixels from the top left of the screen. */
  toScreen(p: THREE.Vector3): {x: number; y: number} {
    const v = p.clone().project(this.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((1 - v.y) / 2) * window.innerHeight,
    };
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.confetti.update(dt);
    // A slow sway so the scene never looks frozen, even while it waits.
    this.drift += dt;
    this.camera.position.set(
      this.home.x + Math.sin(this.drift * 0.25) * 0.25,
      this.home.y + Math.sin(this.drift * 0.33) * 0.08,
      this.home.z,
    );
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = this.shakeSize * Math.max(0, this.shakeLeft / this.shakeTime);
      this.camera.position.x += (Math.random() * 2 - 1) * k;
      this.camera.position.y += (Math.random() * 2 - 1) * k;
    }
    this.camera.lookAt(this.target);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

/** A small seeded random, so the trees stand in the same places every time. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
