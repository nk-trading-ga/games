import * as THREE from "three";
import {CARD} from "./config";
import {CRITTERS, KIND_ICON, KIND_NAME, type Critter} from "./critters";
import {buildCritter} from "./models";

// The cards: their art, drawn once on a canvas per critter and used twice —
// as the picture on the pick screen and as the face of the 3D card the critter
// jumps out of.

const FONT = `"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
const PORTRAIT = 256;

function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/**
 * A picture of every critter, taken by a little renderer of its own with a
 * clear background so the card's colour shows through behind it. It is thrown
 * away afterwards; the game's own renderer is never involved.
 */
function renderPortraits(): Map<string, HTMLCanvasElement> {
  const out = new Map<string, HTMLCanvasElement>();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PORTRAIT, PORTRAIT, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  // Three-quarters on, the way a critter is drawn on a card.
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  // Back far enough for the tallest of them — the scorpion's tail, the
  // thorn beast's crest — to stay inside the picture.
  camera.position.set(1.9, 2.0, 4.4);
  camera.lookAt(0, 1.0, 0.1);

  for (const critter of CRITTERS) {
    const model = buildCritter(critter);
    scene.add(model.group);
    renderer.render(scene, camera);
    const canvas = document.createElement("canvas");
    canvas.width = PORTRAIT;
    canvas.height = PORTRAIT;
    canvas.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
    out.set(critter.id, canvas);
    scene.remove(model.group);
    model.group.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    model.material.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Words wrapped to a width, one line per array entry. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: Array<string> = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

function drawFace(critter: Critter, portrait: HTMLCanvasElement) {
  const W = CARD.artWidth;
  const H = CARD.artHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) {
    return canvas;
  }
  // White edge, then a frame in the critter's own colour.
  g.fillStyle = "#ffffff";
  roundRect(g, 0, 0, W, H, 22);
  g.fill();
  g.fillStyle = css(critter.colour);
  roundRect(g, 10, 10, W - 20, H - 20, 16);
  g.fill();

  // Name along the top, and its kind in a circle at the right.
  g.fillStyle = "#ffffff";
  g.font = `bold 34px ${FONT}`;
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowOffsetY = 2;
  g.fillText(critter.name, 26, 42);
  g.shadowColor = "transparent";
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(W - 46, 42, 22, 0, Math.PI * 2);
  g.fill();
  g.font = `26px ${FONT}`;
  g.textAlign = "center";
  g.fillText(KIND_ICON[critter.kind], W - 46, 44);
  g.textAlign = "left";

  // The picture window: a sunny glow in the critter's light colour.
  const wx = 24;
  const wy = 70;
  const ww = W - 48;
  const wh = 196;
  const glow = g.createRadialGradient(
    W / 2,
    wy + wh * 0.55,
    10,
    W / 2,
    wy + wh * 0.55,
    ww * 0.7,
  );
  glow.addColorStop(0, css(critter.light));
  glow.addColorStop(1, "#2a2030");
  g.fillStyle = glow;
  roundRect(g, wx, wy, ww, wh, 12);
  g.fill();
  g.save();
  roundRect(g, wx, wy, ww, wh, 12);
  g.clip();
  const size = wh * 1.08;
  g.drawImage(portrait, W / 2 - size / 2, wy - wh * 0.04, size, size);
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 4;
  roundRect(g, wx, wy, ww, wh, 12);
  g.stroke();

  // Its kind and a line about it, then its three moves.
  g.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(g, wx, 276, ww, H - 276 - 22, 12);
  g.fill();
  g.fillStyle = "#3b3346";
  g.font = `bold 17px ${FONT}`;
  g.fillText(`${KIND_NAME[critter.kind]} beast`, wx + 12, 293);
  g.font = `15px ${FONT}`;
  wrap(g, critter.blurb, ww - 24).forEach((line, i) => {
    g.fillText(line, wx + 12, 314 + i * 18);
  });
  g.font = `bold 16px ${FONT}`;
  critter.moves.forEach((move, i) => {
    g.fillText(`${move.icon} ${move.name}`, wx + 12, 362 + i * 22);
  });
  return canvas;
}

function drawBack(): HTMLCanvasElement {
  const W = CARD.artWidth;
  const H = CARD.artHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) {
    return canvas;
  }
  g.fillStyle = "#ffffff";
  roundRect(g, 0, 0, W, H, 22);
  g.fill();
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#3a1020");
  bg.addColorStop(1, "#7a1a1a");
  g.fillStyle = bg;
  roundRect(g, 10, 10, W - 20, H - 20, 16);
  g.fill();
  // Rings and a star in the middle.
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.lineWidth = 10;
  for (const r of [60, 95, 130]) {
    g.beginPath();
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "#ff8a1f";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 48 : 21;
    g.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return canvas;
}

export interface CardArt {
  face: Map<string, HTMLCanvasElement>;
  back: HTMLCanvasElement;
}

export function drawAllCards(): CardArt {
  const portraits = renderPortraits();
  const face = new Map<string, HTMLCanvasElement>();
  for (const critter of CRITTERS) {
    const portrait = portraits.get(critter.id);
    if (portrait) {
      face.set(critter.id, drawFace(critter, portrait));
    }
  }
  return {face, back: drawBack()};
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let glowTexture: THREE.CanvasTexture | undefined;

function glowMap(): THREE.CanvasTexture {
  if (!glowTexture) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.35, "rgba(255,250,200,0.7)");
      r.addColorStop(1, "rgba(255,240,160,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    }
    glowTexture = texture(c);
  }
  return glowTexture;
}

/** A card in the world, with a glow behind it for when it opens. */
export class Card3D {
  readonly root = new THREE.Group();
  private readonly glow: THREE.Sprite;

  constructor(face: HTMLCanvasElement, back: HTMLCanvasElement) {
    const edge = new THREE.MeshBasicMaterial({color: 0xffffff});
    // Unlit, so the card's colours are exactly the ones drawn on it.
    const front = new THREE.MeshBasicMaterial({map: texture(face)});
    const rear = new THREE.MeshBasicMaterial({map: texture(back)});
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CARD.width, CARD.height, CARD.thickness),
      [edge, edge, edge, edge, front, rear],
    );
    this.root.add(mesh);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.renderOrder = 2;
    // Just behind the card, so it shines out round the edges rather than
    // cutting through the middle of the picture.
    this.glow.position.z = -0.12;
    this.setGlow(0);
    this.root.add(this.glow);
  }

  /** 0 is no glow; 1 is a blaze about three cards across. */
  setGlow(amount: number): void {
    this.glow.visible = amount > 0.001;
    this.glow.scale.setScalar(0.5 + amount * 3);
    this.glow.material.opacity = Math.min(1, amount * 1.2);
  }
}
