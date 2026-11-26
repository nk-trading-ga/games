import * as THREE from "three";
import {ParticleBurst} from "../../shared/particles";
import {ARENA, CAMERA, CITY, EFFECTS, STORM} from "./config";
import {mulberry} from "./anim";
import {makeBolt} from "./effects";
import {Parts, outlined} from "./models";

// The renderer, the darkness city the battles happen in, the storm over it,
// the camera, and the particle pools every effect draws from.
//
// The city is night-black towers with windows lit here and there, round a
// stone arena with neon rings on it; dark clouds hang low, rain comes down, and
// every few seconds lightning strikes somewhere in the city and lights the
// whole place up before the thunder.

/** Things that glow: unlit, so they stay bright in the dark. */
function glowing(geometry: THREE.BufferGeometry): THREE.Mesh {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({vertexColors: true}),
  );
}

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
  /** Called as the thunder arrives after each flash, to play its sound. */
  onThunder: () => void = () => {};

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

  private readonly sky: THREE.HemisphereLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly fogColour = new THREE.Color(0x221a36);
  private readonly flashColour = new THREE.Color(0x8f86c8);
  private readonly rng = mulberry(11);
  private nextStrike = 2;
  private flashLeft = 0;
  private thunderIn = -1;
  private bolt?: THREE.Group;
  private boltLeft = 0;
  /** Where each tower's roof is, for lightning to strike. */
  private readonly roofs: Array<THREE.Vector3> = [];
  private readonly rain: THREE.LineSegments;
  private readonly drops: Float32Array;

  constructor(mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200);
    this.camera.position.copy(this.home);
    this.camera.lookAt(this.target);

    const forward = this.target.clone().sub(this.home).setY(0).normalize();
    this.screenRight.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    this.scene.background = this.fogColour.clone();
    this.scene.fog = new THREE.Fog(this.fogColour.clone(), 22, 70);
    // Dark, but not so dark the beasts are lost: a cold blue moonlight from
    // behind the camera keeps every one of them readable.
    this.sky = new THREE.HemisphereLight(0x9aa0e0, 0x1a1626, 1.2);
    this.scene.add(this.sky);
    this.moon = new THREE.DirectionalLight(0xc8d0ff, 1.9);
    this.moon.position.set(-4, 10, 7);
    this.scene.add(this.moon);

    this.buildSky();
    this.buildArena();
    this.buildCity();
    const {lines, drops} = this.buildRain();
    this.rain = lines;
    this.drops = drops;
    this.scene.add(this.sparks.mesh, this.confetti.mesh);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  /** A dome, darkest overhead and glowing purple at the horizon. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(90, 32, 16);
    const pos = geo.attributes.position;
    const top = new THREE.Color(0x05040a);
    const low = new THREE.Color(0x3a2a5a);
    const paint = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 90);
      c.copy(low).lerp(top, Math.sqrt(h));
      paint.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(paint, 3));
    const dome = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    dome.renderOrder = -1;
    this.scene.add(dome);

    // Low storm clouds, lit by the lightning like everything else.
    const clouds = new Parts();
    for (let i = 0; i < 26; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 26 + this.rng() * 22;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 6 + this.rng() * 3;
      for (let j = 0; j < 5; j++) {
        clouds.add(
          new THREE.SphereGeometry(1, 10, 7),
          j % 2 ? 0x2a2540 : 0x352e4f,
          [cx + (j - 2) * 2.6, cy + (j % 3) * 0.6, cz + (this.rng() - 0.5) * 3],
          [3.2, 1.6, 2.6],
        );
      }
    }
    this.scene.add(
      new THREE.Mesh(
        clouds.build(),
        new THREE.MeshLambertMaterial({vertexColors: true}),
      ),
    );
  }

  private buildArena(): void {
    const street = new THREE.Mesh(
      new THREE.CircleGeometry(90, 48),
      new THREE.MeshLambertMaterial({color: 0x15131c}),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.y = CITY.streetLevel;
    this.scene.add(street);

    // A round floor of dark stone on the roof, and the tower it stands on
    // going all the way down to the street.
    const p = new Parts();
    p.add(
      new THREE.CylinderGeometry(ARENA.radius, ARENA.radius + 0.2, 0.3, 48),
      0x3a3846,
      [0, -0.15, 0],
    );
    p.add(
      new THREE.CylinderGeometry(
        ARENA.radius + 0.2,
        ARENA.radius + 0.35,
        0.12,
        48,
      ),
      0x23212c,
      [0, -0.24, 0],
    );
    const drop = -0.3 - CITY.streetLevel;
    p.add(
      new THREE.CylinderGeometry(
        ARENA.radius + 0.1,
        ARENA.radius + 0.6,
        drop,
        48,
      ),
      0x1e1c26,
      [0, -0.3 - drop / 2, 0],
    );
    // Street lamps round the edge, their posts here and their lamps below —
    // but none on the camera's side, where a post would stand between you and
    // the fight.
    const lamps: Array<THREE.Vector3> = [];
    const cameraSide = Math.atan2(this.home.z, this.home.x);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const off = Math.abs(
        Math.atan2(Math.sin(a - cameraSide), Math.cos(a - cameraSide)),
      );
      if (off < Math.PI / 2.4) {
        continue;
      }
      const x = Math.cos(a) * (ARENA.radius + 0.6);
      const z = Math.sin(a) * (ARENA.radius + 0.6);
      p.add(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), 0x1a1820, [
        x,
        1.3,
        z,
      ]);
      lamps.push(new THREE.Vector3(x, 2.95, z));
    }
    this.scene.add(outlined(p.build()));

    // Neon on the floor: a ring under each beast — blue for yours, red for
    // theirs — and a purple line between them, all stood 0.01 proud of the
    // stone so they never z-fight it.
    const neon = new Parts();
    const rings: Array<[{x: number; z: number}, number]> = [
      [ARENA.playerSpot, 0x3fd0ff],
      [ARENA.foeSpot, 0xff3b5c],
    ];
    for (const [spot, colour] of rings) {
      neon.add(
        new THREE.RingGeometry(0.98, 1.08, 48),
        colour,
        [spot.x, 0.012, spot.z],
        [1, 1, 1],
        [-Math.PI / 2, 0, 0],
      );
    }
    neon.add(
      new THREE.BoxGeometry(0.06, 0.02, 7),
      0x9a5bff,
      [0, 0.01, 0],
      [1, 1, 1],
      [0, Math.atan2(-ARENA.foeSpot.z, ARENA.foeSpot.x), 0],
    );
    neon.add(
      new THREE.TorusGeometry(ARENA.radius + 0.02, 0.04, 6, 96),
      0x9a5bff,
      [0, 0.02, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    for (const at of lamps) {
      neon.add(new THREE.SphereGeometry(0.2, 10, 8), 0xfff2b0, [
        at.x,
        at.y,
        at.z,
      ]);
    }
    this.scene.add(glowing(neon.build()));
  }

  /** Towers in a ring, with windows lit here and there. */
  private buildCity(): void {
    const towers = new Parts();
    const windows = new Parts();
    const rng = mulberry(3);
    const shades = [0x1e1c28, 0x26232f, 0x191722, 0x2c2836];
    const lights = [0xffd27a, 0xffd27a, 0xffe9b0, 0x7fe8ff, 0xff7ab8];
    for (let i = 0; i < CITY.buildings; i++) {
      const a = (i / CITY.buildings) * Math.PI * 2 + rng() * 0.12;
      const r =
        CITY.innerRadius + rng() * (CITY.outerRadius - CITY.innerRadius);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const w = 2.2 + rng() * 2.6;
      const d = 2.2 + rng() * 2.6;
      // Taller further out, so the near ones don't wall off the far ones.
      const far =
        (r - CITY.innerRadius) / (CITY.outerRadius - CITY.innerRadius);
      const h =
        CITY.minHeight +
        (CITY.maxHeight - CITY.minHeight) * (0.3 * rng() + 0.7 * far * rng());
      // Every tower is turned to face the arena, so its windows look in.
      const yaw = Math.atan2(-x, -z);
      const base = CITY.streetLevel;
      towers.add(
        new THREE.BoxGeometry(w, h, d),
        shades[i % shades.length],
        [x, base + h / 2, z],
        [1, 1, 1],
        [0, yaw, 0],
      );
      // An antenna on some of the tall ones, for lightning to find.
      if (h > CITY.maxHeight * 0.6) {
        towers.add(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 6), 0x111018, [
          x,
          base + h + 1.2,
          z,
        ]);
      }
      this.roofs.push(
        new THREE.Vector3(
          x,
          base + h + (h > CITY.maxHeight * 0.6 ? 2.4 : 0),
          z,
        ),
      );

      // Windows on the face toward the arena, a grid of them; the face
      // stands 0.02 proud so the panes never z-fight the wall.
      const cols = Math.max(2, Math.floor(w / 0.7));
      const rows = Math.max(2, Math.floor(h / 0.9));
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (rng() > CITY.litWindows) {
            continue;
          }
          const lx = (col - (cols - 1) / 2) * (w / cols);
          const ly = base + 0.8 + (row * (h - 1.2)) / rows;
          const lz = d / 2 + 0.02;
          windows.add(
            new THREE.PlaneGeometry(0.32, 0.42),
            lights[Math.floor(rng() * lights.length)],
            [x + lx * cos + lz * sin, ly, z - lx * sin + lz * cos],
            [1, 1, 1],
            [0, yaw, 0],
          );
        }
      }
    }
    this.scene.add(outlined(towers.build()));
    this.scene.add(glowing(windows.build()));
  }

  private buildRain(): {lines: THREE.LineSegments; drops: Float32Array} {
    const n = STORM.drops;
    const drops = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (this.rng() - 0.5) * 30;
      const y = this.rng() * 16;
      const z = (this.rng() - 0.5) * 26;
      drops.set([x, y, z, x + 0.06, y + 0.55, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(drops, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x9aa6dd,
        transparent: true,
        opacity: 0.45,
      }),
    );
    lines.frustumCulled = false;
    this.scene.add(lines);
    return {lines, drops};
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

  /** Lightning somewhere over the city you can see, now. */
  strike(): void {
    const seen = this.roofsInView();
    const roof = seen[Math.floor(this.rng() * seen.length)];
    if (this.bolt) {
      this.scene.remove(this.bolt);
      this.disposeBolt(this.bolt);
    }
    this.bolt = makeBolt(
      new THREE.Vector3(roof.x + (this.rng() - 0.5) * 4, 13, roof.z),
      roof,
      3,
      1.2,
    );
    this.scene.add(this.bolt);
    this.boltLeft = 0.3;
    this.flashLeft = STORM.flash;
    this.thunderIn = STORM.thunderDelay;
  }

  /** The roofs on screen: lightning you can't see is wasted. */
  private roofsInView(): Array<THREE.Vector3> {
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    const seen = this.roofs.filter(r => {
      v.copy(r).project(this.camera);
      return v.z < 1 && Math.abs(v.x) < 0.85 && v.y > -0.4 && v.y < 0.8;
    });
    return seen.length > 0 ? seen : this.roofs;
  }

  private disposeBolt(bolt: THREE.Group): void {
    bolt.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
  }

  private storm(dt: number): void {
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) {
      this.strike();
      const [lo, hi] = STORM.gap;
      this.nextStrike = lo + this.rng() * (hi - lo);
    }
    if (this.bolt) {
      this.boltLeft -= dt;
      // It flickers, the way lightning does, then it's gone.
      this.bolt.visible = Math.floor(this.boltLeft * 30) % 3 !== 0;
      if (this.boltLeft <= 0) {
        this.scene.remove(this.bolt);
        this.disposeBolt(this.bolt);
        this.bolt = undefined;
      }
    }
    if (this.thunderIn > 0) {
      this.thunderIn -= dt;
      if (this.thunderIn <= 0) {
        this.onThunder();
      }
    }
    // The flash: the whole sky and every lit thing brighter for a moment.
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const f = (this.flashLeft / STORM.flash) ** 2;
    this.sky.intensity = 1.2 + f * 4;
    this.moon.intensity = 1.9 + f * 2;
    const bg = this.scene.background as THREE.Color;
    bg.copy(this.fogColour).lerp(this.flashColour, f * 0.8);
    (this.scene.fog as THREE.Fog).color.copy(bg);

    // Rain: every drop falls, and starts again at the top when it lands.
    const d = this.drops;
    const fall = STORM.rainSpeed * dt;
    for (let i = 0; i < d.length; i += 6) {
      d[i + 1] -= fall;
      d[i + 4] -= fall;
      d[i] -= fall * 0.1;
      d[i + 3] -= fall * 0.1;
      if (d[i + 1] < -0.3) {
        const x = (this.rng() - 0.5) * 30;
        const z = (this.rng() - 0.5) * 26;
        d.set([x, 16, z, x + 0.06, 16.55, z], i);
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.confetti.update(dt);
    this.storm(dt);
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
