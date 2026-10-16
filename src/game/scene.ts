import * as THREE from 'three';
import { buildCat, type PieceType, type PieceColor } from './cats';

export const SQ = 1; // размер клетки
const BOARD_Y = 0;   // верхняя грань плиток

// координаты: a1 = (-3.5, +3.5) — белые ближе к камере при старте
export function squareToWorld(sq: string): THREE.Vector3 {
  const file = sq.charCodeAt(0) - 97; // a=0
  const rank = parseInt(sq[1], 10) - 1; // 1=0
  return new THREE.Vector3((file - 3.5) * SQ, BOARD_Y, (3.5 - rank) * SQ);
}

interface PieceView {
  id: string;
  group: THREE.Group;
  type: PieceType;
  color: PieceColor;
  square: string;
  alive: boolean;
  baseY: number;
  phase: number;
  anim: Animation | null;
  deadAnim: Animation | null;
}

type Animation =
  | { kind: 'move'; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; captured?: PieceView }
  | { kind: 'fall'; t: number; dur: number }
  | { kind: 'jump'; t: number; dur: number; big: boolean };

export interface SceneEvents {
  onSquareClick: (sq: string) => void;
}

export class BoardScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private container: HTMLElement;
  private events: SceneEvents;

  private tiles: THREE.Mesh[] = [];
  private pieces = new Map<string, PieceView>();
  private dying: PieceView[] = [];
  private highlights: THREE.Mesh[] = [];
  private selectedRing: THREE.Mesh | null = null;
  private lastMoveMarks: THREE.Mesh[] = [];

  // камера
  private defaultAzimuth = Math.PI; // белые у нижнего края экрана; для чёрных — 0
  private azimuth = Math.PI;
  private polar = 0.85;
  private distance = 11;
  private target = new THREE.Vector3(0, 0, 0);
  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  private shake = 0;

  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  constructor(container: HTMLElement, events: SceneEvents) {
    this.container = container;
    this.events = events;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !location.hash.includes("noshadow");
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101018);
    this.scene.fog = new THREE.Fog(0x101018, 18, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    this.buildEnvironment();
    this.buildBoard();
    this.buildHighlighters();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  // ---------- окружение ----------
  private buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a3226, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.9);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.15;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6a8cff, 0.5);
    rim.position.set(-6, 6, -6);
    this.scene.add(rim);

    // пол
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0x181822, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.46;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // подиум под доской (ниже клеток, без совпадающих граней — иначе z-fighting)
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 6.8, 0.25, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.6, metalness: 0.2 })
    );
    podium.position.y = -0.325;
    podium.receiveShadow = true;
    podium.castShadow = true;
    this.scene.add(podium);

    // светящиеся «глаза-коты» вдалеке
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const ob = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.2, 0),
        new THREE.MeshStandardMaterial({ color: 0x232333, roughness: 0.9 })
      );
      ob.position.set(Math.cos(a) * (13 + (i % 4) * 3), 0.2, Math.sin(a) * (13 + (i % 4) * 3));
      ob.castShadow = true;
      this.scene.add(ob);
    }
  }

  // ---------- доска ----------
  private buildBoard() {
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x4c5a72, roughness: 0.55 });
    const geo = new THREE.BoxGeometry(SQ, 0.18, SQ);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const m = new THREE.Mesh(geo, (r + f) % 2 === 0 ? lightMat : darkMat);
        const pos = squareToWorld(String.fromCharCode(97 + f) + (r + 1));
        m.position.set(pos.x, -0.09, pos.z);
        m.receiveShadow = true;
        m.userData.square = String.fromCharCode(97 + f) + (r + 1);
        this.tiles.push(m);
        this.scene.add(m);
      }
    }
    // рамка
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 0.22, 8.8),
      new THREE.MeshStandardMaterial({ color: 0x241f33, roughness: 0.5, metalness: 0.3 })
    );
    frame.position.y = -0.13;
    frame.receiveShadow = true;
    this.scene.add(frame);
  }

  private buildHighlighters() {
    // кольцо выбранной фигуры
    const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 8, 32);
    this.selectedRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.95 }));
    this.selectedRing.rotation.x = Math.PI / 2;
    this.selectedRing.position.y = 0.02;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);
  }

  // ---------- фигуры ----------
  syncPieces(board: { square: string; type: PieceType; color: PieceColor }[]) {
    const seen = new Set<string>();
    for (const p of board) {
      seen.add(p.square);
      let pv = this.pieces.get(p.square);
      if (pv && (pv.type !== p.type || pv.color !== p.color)) {
        // тип фигуры изменился (превращение) — пересоздаём
        this.scene.remove(pv.group);
        this.pieces.delete(p.square);
        pv = undefined as unknown as PieceView;
      }
      if (!pv) {
        const group = buildCat(p.type, p.color);
        const pos = squareToWorld(p.square);
        group.position.copy(pos);
        group.traverse((o) => { o.castShadow = true; });
        // белые смотрят вперёд (к чёрным)
        if (p.color === 'w') group.rotation.y = Math.PI;
        pv = { id: p.square, group, type: p.type, color: p.color, square: p.square, alive: true, baseY: 0, phase: Math.random() * Math.PI * 2, anim: null, deadAnim: null };
        this.scene.add(group);
        this.pieces.set(p.square, pv);
      }
    }
    // убрать отсутствующие (без анимации — для полной синхронизации/загрузки)
    for (const [sq, pv] of [...this.pieces]) {
      if (!seen.has(sq)) {
        this.scene.remove(pv.group);
        this.pieces.delete(sq);
      }
    }
  }

  animateMove(from: string, to: string, opts: { captured?: string; isCastle?: boolean; onDone?: () => void } = {}) {
    const mover = this.pieces.get(from);
    if (!mover) { opts.onDone?.(); return; }
    mover.square = to;
    // если рокировка: ладья тоже летит
    if (opts.isCastle) {
      const rank = from[1];
      const rookFrom = to[0] === 'g' ? 'h' + rank : 'a' + rank;
      const rookTo = to[0] === 'g' ? 'f' + rank : 'd' + rank;
      const rook = this.pieces.get(rookFrom);
      if (rook) {
        this.pieces.delete(rookFrom);
        this.pieces.set(rookTo, rook);
        rook.square = rookTo;
        rook.anim = { kind: 'move', from: rook.group.position.clone(), to: squareToWorld(rookTo), t: 0, dur: 0.45 };
      }
    }
    const captured = opts.captured ? this.pieces.get(opts.captured) : undefined;
    if (captured) {
      // сначала убираем жертву из карты — иначе удалим клетку-приёмник.
      // Анимация падения идёт через отдельный список dying: из карты она уже удалена.
      this.pieces.delete(opts.captured!);
      captured.deadAnim = { kind: 'fall', t: 0, dur: 0.6 };
      this.dying.push(captured);
    }
    this.pieces.delete(from);
    this.pieces.set(to, mover);
    mover.anim = { kind: 'move', from: squareToWorld(from), to: squareToWorld(to), t: 0, dur: 0.5, captured };
    const dur = (mover.anim.dur + 0.25) * 1000;
    setTimeout(() => opts.onDone?.(), opts.captured ? dur + 250 : dur + 100);
  }

  celebrate(color: PieceColor) {
    for (const pv of this.pieces.values()) {
      if (pv.color === color) pv.anim = { kind: 'jump', t: 0, dur: 0.9, big: pv.type === 'k' };
    }
    this.shake = 0.35;
  }

  kingInCheck(color: PieceColor) {
    for (const pv of this.pieces.values()) {
      if (pv.color === color && pv.type === 'k') {
        pv.anim = { kind: 'jump', t: 0, dur: 0.5, big: false };
      }
    }
    this.shake = 0.2;
  }

  setSelected(sq: string | null) {
    if (this.selectedRing) {
      this.selectedRing.visible = !!sq;
      if (sq) {
        const p = squareToWorld(sq);
        this.selectedRing.position.set(p.x, 0.03, p.z);
      }
    }
  }

  showMoves(moves: { square: string; capture: boolean }[]) {
    this.clearHighlights();
    for (const m of moves) {
      const p = squareToWorld(m.square);
      let h: THREE.Mesh;
      if (m.capture) {
        h = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.045, 8, 28),
          new THREE.MeshBasicMaterial({ color: 0xe05545, transparent: true, opacity: 0.9 })
        );
        h.rotation.x = Math.PI / 2;
        h.position.set(p.x, 0.03, p.z);
      } else {
        h = new THREE.Mesh(
          new THREE.CircleGeometry(0.13, 20),
          new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.85 })
        );
        h.rotation.x = -Math.PI / 2;
        h.position.set(p.x, 0.015, p.z);
      }
      this.highlights.push(h);
      this.scene.add(h);
    }
  }

  clearHighlights() {
    for (const h of this.highlights) this.scene.remove(h);
    this.highlights = [];
  }

  markLastMove(from: string, to: string) {
    for (const m of this.lastMoveMarks) this.scene.remove(m);
    this.lastMoveMarks = [];
    const geo = new THREE.PlaneGeometry(SQ * 0.96, SQ * 0.96);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22 });
    for (const sq of [from, to]) {
      const p = squareToWorld(sq);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.012, p.z);
      this.lastMoveMarks.push(m);
      this.scene.add(m);
    }
  }

  // ---------- ввод ----------
  private bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(e.clientX - this.lastX) + Math.abs(e.clientY - this.lastY) > 4) this.dragMoved = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.azimuth -= dx * 0.008;
      this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.006, 0.18, 1.35);
    });
    el.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (!this.dragMoved) this.handleClick(e);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, 6, 18);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resetCamera() {
    this.azimuth = this.defaultAzimuth;
    this.polar = 0.85;
    this.distance = 11;
  }

  // развернуть доску стороной игрока
  setPlayerSide(color: 'w' | 'b') {
    this.defaultAzimuth = color === 'w' ? Math.PI : 0;
    this.resetCamera();
  }

  private handleClick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.tiles, ...[...this.pieces.values()].map((p) => p.group)], true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.square) {
          this.events.onSquareClick(obj.userData.square as string);
          return;
        }
        obj = obj.parent;
      }
    }
    // клик мимо — снять выделение
    this.events.onSquareClick('');
  }

  // ---------- цикл ----------
  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // камера
    const sp = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * sp * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * sp * Math.cos(this.azimuth)
    );
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.camera.lookAt(this.target);

    // анимации фигур
    for (const pv of [...this.pieces.values(), ...this.dying]) {
      const g = pv.group;
      // idle: лёгкое покачивание и дыхание
      let idleY = Math.sin(t * 2 + pv.phase) * 0.02;
      let squash = 1 + Math.sin(t * 2.4 + pv.phase) * 0.015;

      if (pv.anim) {
        const a = pv.anim;
        a.t += dt;
        const k = Math.min(a.t / a.dur, 1);
        if (a.kind === 'move') {
          g.position.lerpVectors(a.from, a.to, k);
          g.position.y = a.from.y + Math.sin(k * Math.PI) * 0.55; // прыжок-парабола
          g.rotation.y = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
          idleY = 0;
          if (k >= 1) {
            g.position.copy(a.to);
            pv.anim = null;
          }
        } else if (a.kind === 'jump') {
          g.position.y = pv.baseY + Math.abs(Math.sin(k * Math.PI * (a.big ? 3 : 2))) * (a.big ? 0.5 : 0.3);
          if (k >= 1) { g.position.y = pv.baseY; pv.anim = null; }
          idleY = 0;
        }
      }
      if (pv.deadAnim) {
        const a = pv.deadAnim;
        a.t += dt;
        const k = Math.min(a.t / a.dur, 1);
        // побеждённый кот драматично вздымает лапы и уменьшается/падает
        g.position.y = pv.baseY + Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.4 - k * k * 1.2;
        g.rotation.x = -k * 1.1;
        g.scale.setScalar(Math.max(0.01, 1 - k * 0.85));
        if (k >= 1) {
          this.scene.remove(g);
          this.dying = this.dying.filter((d) => d !== pv);
        }
      } else {
        g.position.y = pv.baseY + idleY;
        g.scale.y = squash;
      }
    }

    if (this.selectedRing?.visible) {
      this.selectedRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
