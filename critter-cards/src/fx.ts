import * as THREE from "three";

// The pieces that make attacks look real rather than cartoon: soft glowing
// particles for fire, sparks and mist; smoke; lights that move with a fireball
// and flash where it lands, so the beasts and the floor light up; and rocks
// and leaves with proper texture on them.

/** A soft round blob, white, fading to nothing: tinted per particle. */
function blobTexture(hard: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(hard, "rgba(255,255,255,0.75)");
    r.addColorStop(0.65, "rgba(255,255,255,0.18)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** A cloudy puff: several soft blobs overlapping, for smoke and dust. */
function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const blobs: Array<[number, number, number]> = [
      [32, 32, 26],
      [22, 26, 16],
      [42, 24, 15],
      [40, 42, 16],
      [22, 42, 14],
    ];
    for (const [x, y, rad] of blobs) {
      const r = g.createRadialGradient(x, y, 0, x, y, rad);
      r.addColorStop(0, "rgba(255,255,255,0.55)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }
  }
  return new THREE.CanvasTexture(c);
}

const VERTEX = `
attribute float size;
attribute vec4 tint;
uniform float scale;
varying vec4 vTint;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
uniform sampler2D map;
varying vec4 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(t.rgb * vTint.rgb, t.a * vTint.a);
  #include <colorspace_fragment>
}`;

export interface Emit {
  at: THREE.Vector3;
  count?: number;
  /** How far from `at` each one may start. */
  jitter?: number;
  /** A starting velocity for all of them… */
  vel?: THREE.Vector3;
  /** …plus a random one this fast, in any direction. */
  spread?: number;
  /** Seconds each lives, as [least, most]. */
  life: [number, number];
  /** Size in world units, at birth and at death. */
  size: [number, number];
  /** Colour at birth and at death. */
  color: [number, number];
  /** How see-through: at birth and at death. */
  alpha?: [number, number];
  /** Downward pull; negative rises, like flame and smoke. */
  gravity?: number;
  /** How quickly they slow down. */
  drag?: number;
}

/**
 * A pool of soft glowing particles, drawn as one batch. Glowing ones add their
 * light to what is behind them, so overlapping flames burn white-hot in the
 * middle the way real fire does; smoke is drawn the ordinary way.
 */
export class Emitter {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly tint: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly ttl: Float32Array;
  private readonly from: Float32Array;
  private readonly to: Float32Array;
  private readonly sizes: Float32Array;
  private readonly fall: Float32Array;
  private readonly slow: Float32Array;
  private cursor = 0;
  private readonly c0 = new THREE.Color();
  private readonly c1 = new THREE.Color();

  constructor(
    private readonly max: number,
    glow: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.tint = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max).fill(1);
    // Colour and alpha at birth and death, size at birth and death.
    this.from = new Float32Array(max * 4);
    this.to = new Float32Array(max * 4);
    this.sizes = new Float32Array(max * 2);
    this.fall = new Float32Array(max);
    this.slow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("tint", new THREE.BufferAttribute(this.tint, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: {value: glow ? blobTexture(0.2) : puffTexture()},
        scale: {value: 400},
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    // Drawn after the solid things, so they glow over them, not under.
    this.points.renderOrder = glow ? 4 : 3;
  }

  emit(o: Emit): void {
    const n = o.count ?? 1;
    const jitter = o.jitter ?? 0;
    const spread = o.spread ?? 0;
    this.c0.setHex(o.color[0]);
    this.c1.setHex(o.color[1]);
    const [a0, a1] = o.alpha ?? [1, 0];
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const rnd = () => Math.random() * 2 - 1;
      this.pos[i * 3] = o.at.x + rnd() * jitter;
      this.pos[i * 3 + 1] = o.at.y + rnd() * jitter;
      this.pos[i * 3 + 2] = o.at.z + rnd() * jitter;
      // A random direction, roughly even over a sphere.
      const dx = rnd();
      const dy = rnd();
      const dz = rnd();
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = spread * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = (o.vel?.x ?? 0) + (dx / len) * sp;
      this.vel[i * 3 + 1] = (o.vel?.y ?? 0) + (dy / len) * sp;
      this.vel[i * 3 + 2] = (o.vel?.z ?? 0) + (dz / len) * sp;
      this.ttl[i] = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.life[i] = this.ttl[i];
      this.from.set([this.c0.r, this.c0.g, this.c0.b, a0], i * 4);
      this.to.set([this.c1.r, this.c1.g, this.c1.b, a1], i * 4);
      const grow = 0.75 + Math.random() * 0.5;
      this.sizes[i * 2] = o.size[0] * grow;
      this.sizes[i * 2 + 1] = o.size[1] * grow;
      this.fall[i] = o.gravity ?? 0;
      this.slow[i] = o.drag ?? 0;
    }
  }

  /** `scale` turns world size into pixels: see Stage.update. */
  update(dt: number, scale: number): void {
    this.material.uniforms.scale.value = scale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        this.tint[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i] / this.ttl[i]);
      const damp = Math.max(0, 1 - this.slow[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - this.fall[i] * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      for (let c = 0; c < 4; c++) {
        this.tint[i * 4 + c] =
          this.from[i * 4 + c] +
          (this.to[i * 4 + c] - this.from[i * 4 + c]) * t;
      }
      this.size[i] =
        this.sizes[i * 2] + (this.sizes[i * 2 + 1] - this.sizes[i * 2]) * t;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
  }
}

interface LightState {
  light: THREE.PointLight;
  held: boolean;
  left: number;
  time: number;
  peak: number;
}

/** A light carried along by something, until it is let go. */
export interface HeldLight {
  move: (at: THREE.Vector3) => void;
  release: () => void;
}

/**
 * A few lights for attacks to borrow: carried along with a fireball so it
 * lights up the floor and the beasts as it flies, and flashed bright where
 * something lands. The same lights are always in the scene, just dark when
 * unused: adding and removing lights would make every material rebuild.
 */
export class FxLights {
  private readonly pool: Array<LightState> = [];

  constructor(scene: THREE.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 9, 2);
      scene.add(light);
      this.pool.push({light, held: false, left: 0, time: 1, peak: 0});
    }
  }

  private free(): LightState | undefined {
    return (
      this.pool.find(s => !s.held && s.left <= 0) ??
      this.pool
        .filter(s => !s.held)
        .sort((a, b) => a.left / a.time - b.left / b.time)[0]
    );
  }

  /** A flash of light: bright at once, fading over `time` seconds. */
  flash(at: THREE.Vector3, colour: number, intensity: number, time: number) {
    const s = this.free();
    if (!s) {
      return;
    }
    s.light.position.copy(at);
    s.light.color.setHex(colour);
    s.left = time;
    s.time = time;
    s.peak = intensity;
    s.light.intensity = intensity;
  }

  /** A light to carry; null if they are all in use. */
  hold(colour: number, intensity: number): HeldLight | null {
    const s = this.pool.find(p => !p.held && p.left <= 0);
    if (!s) {
      return null;
    }
    s.held = true;
    s.light.color.setHex(colour);
    s.light.intensity = intensity;
    return {
      move: at => {
        s.light.position.copy(at);
        // A flicker, so it reads as flame and not a lamp.
        s.light.intensity = intensity * (0.8 + Math.random() * 0.4);
      },
      release: () => {
        s.held = false;
        s.light.intensity = 0;
      },
    };
  }

  update(dt: number): void {
    for (const s of this.pool) {
      if (s.held || s.left <= 0) {
        continue;
      }
      s.left -= dt;
      const k = Math.max(0, s.left / s.time);
      s.light.intensity = s.peak * k * k;
    }
  }
}

/** A smooth bumpy value for any point: the sum of a few waves. */
function lumps(x: number, y: number, z: number, seed: number): number {
  return (
    Math.sin(x * 1.7 + seed) * Math.cos(y * 1.3 + seed * 2.1) * 0.5 +
    Math.sin(y * 2.9 + z * 1.1 + seed * 0.7) * 0.3 +
    Math.cos(z * 3.7 + x * 2.3 + seed * 1.3) * 0.2 +
    Math.sin((x + y + z) * 6.1 + seed) * 0.08
  );
}

/** A lumpy, cracked boulder shape: never two alike. */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + lumps(v.x * 1.5, v.y * 1.5, v.z * 1.5, seed) * 0.28;
    // Squashed a little, the way stones are: wider than they are tall.
    v.multiplyScalar(k);
    v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Grey-brown stone: speckles, darker patches and a few cracks. */
function rockTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#8a8378";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = 10 + Math.random() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const shade = Math.random() < 0.5 ? "60,55,50" : "170,160,145";
      grad.addColorStop(0, `rgba(${shade},0.35)`);
      grad.addColorStop(1, `rgba(${shade},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 4000; i++) {
      const v = Math.random() < 0.5 ? 40 : 200;
      g.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.15})`;
      g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
    // Cracks: wandering dark lines.
    g.strokeStyle = "rgba(30,26,22,0.7)";
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.8 + Math.random() * 1.6;
      g.beginPath();
      let x = Math.random() * S;
      let y = Math.random() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

let rockTex: THREE.CanvasTexture | undefined;

/** Rough stone that catches the light on its bumps. */
export function rockMaterial(tint: number): THREE.MeshStandardMaterial {
  rockTex ??= rockTexture();
  return new THREE.MeshStandardMaterial({
    color: tint,
    map: rockTex,
    bumpMap: rockTex,
    bumpScale: 3,
    roughness: 0.92,
    metalness: 0.02,
  });
}

/** A leaf: pointed, with a midrib and veins, see-through round its edge. */
function leafTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "#9be36a");
    grad.addColorStop(1, "#2f7d32");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(4, 32);
    g.quadraticCurveTo(50, -6, 124, 32);
    g.quadraticCurveTo(50, 70, 4, 32);
    g.fill();
    g.strokeStyle = "rgba(230,255,200,0.75)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(6, 32);
    g.lineTo(120, 32);
    g.stroke();
    g.lineWidth = 1;
    for (let k = 1; k < 7; k++) {
      const x = 10 + k * 15;
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 12, 14 + k * 1.2);
      g.moveTo(x, 32);
      g.lineTo(x + 12, 50 - k * 1.2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let leafTex: THREE.CanvasTexture | undefined;

export function leafMaterial(): THREE.MeshStandardMaterial {
  leafTex ??= leafTexture();
  return new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.55,
  });
}
