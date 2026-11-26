import * as THREE from "three";
import {CARD} from "./config";
import {
  FORM_NAME,
  KIND_ICON,
  KIND_NAME,
  RARITY,
  RARITY_STARS,
  cardNumber,
  rarityOf,
  type Critter,
} from "./critters";
import {buildCritter} from "./models";

// The cards: their art, drawn on a canvas and used twice — as the picture on
// the screens, and as the face of the 3D card a beast jumps out of. There are a
// thousand of them, far too many to draw up front, so each is drawn the first
// time it is wanted and kept for a while.

const FONT = `"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
const PORTRAIT = 256;

/** Card art kept, newest last; the oldest are dropped past this many. */
const KEEP = 90;

export const RARITY_COLOUR = [
  "#9aa0a8",
  "#3fa0ff",
  "#b06bff",
  "#ffc21a",
  "#ff5ecf",
] as const;

function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

let portraitRig:
  | {
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
    }
  | undefined;

/**
 * A picture of one beast, taken by a little renderer of its own with a clear
 * background so the card's colour shows through behind it. The renderer is
 * kept, since cards are drawn all the time now: in packs, in the book.
 */
function portrait(critter: Critter): HTMLCanvasElement {
  if (!portraitRig) {
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
    // Three-quarters on, the way a beast is drawn on a card; back far enough
    // for the tallest of them — a scorpion's tail, a crown — to stay in.
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(1.9, 2.0, 4.4);
    camera.lookAt(0, 1.0, 0.1);
    portraitRig = {renderer, scene, camera};
  }
  const {renderer, scene, camera} = portraitRig;
  const model = buildCritter(critter);
  // Shrunk back to the size of a plain first form, so a bigger beast still
  // fits its picture; the card's banner and its details say how big it is.
  const box = new THREE.Box3().setFromObject(model.group);
  const tall = Math.max(box.max.y / 1.9, (box.max.x - box.min.x) / 2.2, 1);
  model.group.scale.setScalar(1 / tall);
  scene.add(model.group);
  renderer.render(scene, camera);
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT;
  canvas.height = PORTRAIT;
  canvas.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
  scene.remove(model.group);
  model.group.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
    }
  });
  model.material.dispose();
  return canvas;
}

/** Which card art goes with a beast in a form. */
export function cardKey(critter: Critter): string {
  return `${critter.id}:${critter.form}`;
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

function drawFace(critter: Critter, picture: HTMLCanvasElement) {
  const W = CARD.artWidth;
  const H = CARD.artHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) {
    return canvas;
  }
  const rarity = rarityOf(critter);
  const mega = critter.form === 2;
  // The edge says how rare it is at a glance: white, then gold for a Mega or
  // a Legendary, and a shimmer for the one Mythic card.
  if (rarity >= 4) {
    const edge = g.createLinearGradient(0, 0, W, H);
    edge.addColorStop(0, "#ff5ecf");
    edge.addColorStop(0.5, "#9a5bff");
    edge.addColorStop(1, "#3fd0ff");
    g.fillStyle = edge;
  } else {
    g.fillStyle = mega || rarity >= 3 ? "#ffd23a" : "#ffffff";
  }
  roundRect(g, 0, 0, W, H, 22);
  g.fill();
  g.fillStyle = css(critter.colour);
  roundRect(g, 10, 10, W - 20, H - 20, 16);
  g.fill();

  // Name along the top, and its kind in a circle at the right. Long names
  // shrink until they fit beside the badge.
  g.fillStyle = "#ffffff";
  let px = 32;
  g.font = `bold ${px}px ${FONT}`;
  while (g.measureText(critter.name).width > W - 100 && px > 17) {
    px -= 1;
    g.font = `bold ${px}px ${FONT}`;
  }
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowOffsetY = 2;
  g.fillText(critter.name, 24, 36);
  g.shadowColor = "transparent";
  g.beginPath();
  g.arc(W - 44, 40, 22, 0, Math.PI * 2);
  g.fill();
  g.font = `26px ${FONT}`;
  g.textAlign = "center";
  g.fillText(KIND_ICON[critter.kind], W - 44, 42);
  g.textAlign = "left";

  // Its number in the thousand, and its rarity.
  g.font = `bold 14px ${FONT}`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  const number = `#${cardNumber(critter)}`;
  g.fillText(number, 24, 63);
  const nw = g.measureText(number).width;
  g.fillStyle = RARITY_COLOUR[rarity];
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 3;
  const stars = `${RARITY_STARS[rarity]} ${RARITY[rarity]}`;
  g.strokeText(stars, 34 + nw, 63);
  g.fillText(stars, 34 + nw, 63);

  // The picture window: a glow in the beast's light colour.
  const wx = 22;
  const wy = 76;
  const ww = W - 44;
  const wh = 180;
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
  const size = wh * 1.1;
  g.drawImage(picture, W / 2 - size / 2, wy - wh * 0.06, size, size);
  g.restore();
  g.strokeStyle = mega ? "#ffd23a" : "rgba(255,255,255,0.9)";
  g.lineWidth = 4;
  roundRect(g, wx, wy, ww, wh, 12);
  g.stroke();

  // A banner across the bottom of the picture for an evolved or Mega form.
  if (critter.form > 0 && rarity < 4) {
    const label = FORM_NAME[critter.form].toUpperCase();
    g.fillStyle = mega ? "#ffd23a" : "#ffffff";
    roundRect(g, W / 2 - 62, wy + wh - 28, 124, 24, 12);
    g.fill();
    g.fillStyle = mega ? "#5a0a0a" : css(critter.colour);
    g.font = `bold 16px ${FONT}`;
    g.textAlign = "center";
    g.fillText(label, W / 2, wy + wh - 15);
    g.textAlign = "left";
  }

  // The details: kind and size, where it lives, a line about it, its moves.
  g.fillStyle = "rgba(255,255,255,0.93)";
  roundRect(g, wx, 264, ww, H - 264 - 20, 12);
  g.fill();
  const ink = "#3b3346";
  const left = wx + 10;
  g.fillStyle = ink;
  g.font = `bold 14px ${FONT}`;
  g.fillText(
    `${KIND_NAME[critter.kind]} beast · ${critter.height} m · ${critter.weight} kg`,
    left,
    279,
  );
  g.font = `12px ${FONT}`;
  g.fillStyle = "#6a6278";
  g.fillText(`Lives in ${critter.home}`, left, 296);
  g.fillStyle = ink;
  g.font = `13px ${FONT}`;
  wrap(g, critter.blurb, ww - 20)
    .slice(0, 2)
    .forEach((line, i) => {
      g.fillText(line, left, 315 + i * 16);
    });
  g.font = `bold 14px ${FONT}`;
  critter.moves.forEach((move, i) => {
    g.fillText(`${move.icon} ${move.name}`, left, 359 + i * 20);
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

/** Card art, drawn when first wanted. */
export class CardArt {
  readonly back = drawBack();
  private readonly faces = new Map<string, HTMLCanvasElement>();
  private readonly urls = new Map<string, string>();

  /** The face of a beast's card, as a canvas. */
  face(critter: Critter): HTMLCanvasElement {
    const key = cardKey(critter);
    let face = this.faces.get(key);
    if (face) {
      // Seen again: to the back of the queue, so it's the last to be dropped.
      this.faces.delete(key);
    } else {
      face = drawFace(critter, portrait(critter));
    }
    this.faces.set(key, face);
    trim(this.faces);
    return face;
  }

  /** The same, as a picture an <img> can show. */
  url(critter: Critter): string {
    const key = cardKey(critter);
    let url = this.urls.get(key);
    if (url) {
      this.urls.delete(key);
    } else {
      url = this.face(critter).toDataURL("image/png");
    }
    this.urls.set(key, url);
    trim(this.urls);
    return url;
  }
}

function trim<T>(map: Map<string, T>): void {
  while (map.size > KEEP) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    map.delete(oldest);
  }
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

  /** A new picture on the front, when the beast on it evolves. */
  setFace(face: HTMLCanvasElement): void {
    const mesh = this.root.children[0] as THREE.Mesh;
    const front = (mesh.material as Array<THREE.MeshBasicMaterial>)[4];
    front.map?.dispose();
    front.map = texture(face);
    front.needsUpdate = true;
  }

  /** 0 is no glow; 1 is a blaze about three cards across. */
  setGlow(amount: number): void {
    this.glow.visible = amount > 0.001;
    this.glow.scale.setScalar(0.5 + amount * 3);
    this.glow.material.opacity = Math.min(1, amount * 1.2);
  }
}
