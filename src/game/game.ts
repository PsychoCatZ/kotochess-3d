import { Chess, type Move, type Square } from 'chess.js';
import { findBestMove, type AILevel } from './engine';

const SAVE_KEY = 'kotochess_save_v2';

export type GameMode = 'pvp' | 'ai';
export type PlayerColor = 'w' | 'b';
export type UIState = 'menu' | 'playing' | 'over';

export interface HudInfo {
  turn: 'w' | 'b';
  check: boolean;
  result: string | null;
  mode: GameMode;
  playerColor: PlayerColor;
  history: string[];
  thinking: boolean;
}

export interface GameCallbacks {
  onHud: (h: HudInfo) => void;
  onPromotion: (squares: { from: string; to: string } | null) => void;
}

export class Game {
  chess = new Chess();
  mode: GameMode = 'ai';
  aiLevel: AILevel = 1;
  playerColor: PlayerColor = 'w';
  ui: UIState = 'menu';
  private cb: GameCallbacks;
  private selected: string | null = null;
  private pendingPromotion: { from: string; to: string } | null = null;
  private sounds: import('./audio').SoundFX;

  constructor(cb: GameCallbacks, sounds: import('./audio').SoundFX) {
    this.cb = cb;
    this.sounds = sounds;
  }

  hasSave(): boolean {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  newGame(mode: GameMode, aiLevel: AILevel = 1, playerColor: PlayerColor = 'w') {
    this.chess = new Chess();
    this.mode = mode;
    this.aiLevel = aiLevel;
    this.playerColor = playerColor;
    this.ui = 'playing';
    this.selected = null;
    this.save();
    this.pushHud();
  }

  continueGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      let fen = raw;
      let mode: GameMode = 'pvp';
      let level: AILevel = 1;
      let playerColor: PlayerColor = 'w';
      try {
        const data = JSON.parse(raw);
        fen = data.fen ?? raw;
        mode = data.mode === 'ai' ? 'ai' : 'pvp';
        level = ([0, 1, 2] as AILevel[]).includes(data.level) ? data.level : 1;
        playerColor = data.playerColor === 'b' ? 'b' : 'w';
      } catch { /* старый формат — просто FEN */ }
      this.chess = new Chess(fen);
      this.mode = mode;
      this.aiLevel = level;
      this.playerColor = playerColor;
      this.ui = 'playing';
      this.selected = null;
      this.pushHud();
      return true;
    } catch { return false; }
  }

  exitToMenu() {
    this.ui = 'menu';
    this.selected = null;
    this.pushHud();
  }

  private save() {
    try {
      if (this.chess.isGameOver()) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify({ fen: this.chess.fen(), mode: this.mode, level: this.aiLevel, playerColor: this.playerColor }));
    } catch { /* без сохранения */ }
  }

  getSelected(): string | null { return this.selected; }

  board() {
    return this.chess.board().flat().filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({
      square: p.square as string,
      type: p.type as 'p' | 'n' | 'b' | 'r' | 'q' | 'k',
      color: p.color as 'w' | 'b',
    }));
  }

  legalFrom(sq: string) {
    return this.chess.moves({ square: sq as Square, verbose: true })
      .map((m) => ({ square: m.to as string, capture: !!m.captured || !!m.promotion }));
  }

  select(sq: string): { moves: { square: string; capture: boolean }[] } | null {
    if (this.ui !== 'playing') return null;
    const piece = this.chess.get(sq as Square);
    if (piece && piece.color === this.chess.turn()) {
      this.selected = sq;
      const moves = this.legalFrom(sq);
      return { moves };
    }
    this.selected = null;
    return null;
  }

  // обработка клика по клетке; сцена дергает это
  handleSquare(sq: string, scene: import('./scene').BoardScene): 'moved' | 'selected' | 'nothing' {
    if (this.ui !== 'playing' || this.pendingPromotion) return 'nothing';
    if (this.isAiTurn()) return 'nothing';

    if (this.selected && sq !== this.selected) {
      const moves = this.legalFrom(this.selected);
      const legal = moves.find((m) => m.square === sq);
      if (legal) {
        // превращение?
        const piece = this.chess.get(this.selected as Square);
        if (piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) {
          this.pendingPromotion = { from: this.selected, to: sq };
          this.cb.onPromotion({ from: this.selected, to: sq });
          return 'nothing';
        }
        this.commitMove({ from: this.selected, to: sq }, scene);
        return 'moved';
      }
    }
    const sel = this.select(sq);
    if (sel) return 'selected';
    this.selected = null;
    scene.setSelected(null);
    scene.clearHighlights();
    return 'nothing';
  }

  choosePromotion(piece: 'q' | 'r' | 'b' | 'n', scene: import('./scene').BoardScene) {
    if (!this.pendingPromotion) return;
    const mv = { ...this.pendingPromotion, promotion: piece };
    this.pendingPromotion = null;
    this.cb.onPromotion(null);
    this.commitMove(mv, scene);
  }

  private commitMove(mv: { from: string; to: string; promotion?: string }, scene: import('./scene').BoardScene) {
    const before = this.chess.fen();
    let move: Move;
    try {
      move = this.chess.move(mv as Parameters<Chess['move']>[0]);
    } catch {
      return; // нелегальный ход — игнорируем
    }

    this.sounds.select();
    scene.setSelected(null);
    scene.clearHighlights();
    scene.markLastMove(move.from, move.to);
    const capturedSq = move.captured
      ? (move.flags.includes('e') ? move.to[0] + move.from[1] : move.to)
      : undefined;
    scene.animateMove(move.from, move.to, {
      captured: capturedSq,
      isCastle: move.flags.includes('k') || move.flags.includes('q'),
    });

    if (move.captured) this.sounds.capture();
    else if (move.flags.includes('k') || move.flags.includes('q')) this.sounds.castle();
    else if (move.promotion) this.sounds.promote();
    else this.sounds.move();

    setTimeout(() => {
      if (this.chess.isCheck()) {
        this.sounds.check();
        this.kingInCheck(this.chess.turn());
      }
      this.updateGameOver();
      this.save();
      this.pushHud();
      // ход AI
      if (this.ui === 'playing' && this.isAiTurn()) {
        this.pushHud();
        setTimeout(() => this.aiMove(scene), 650);
      }
    }, move.captured ? 850 : 550);

    void before;
  }

  private updateGameOver() {
    if (!this.chess.isGameOver()) return;
    this.ui = 'over';
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      setTimeout(() => {
        this.sounds.win();
        this.celebrate(winner);
      }, 400);
    } else {
      setTimeout(() => this.sounds.draw(), 300);
    }
    this.save();
  }

  // --- сцена вызывается коллбэком; чтобы избежать циклического импорта, используем динамические хуки ---
  private sceneRef: import('./scene').BoardScene | null = null;
  bindScene(s: import('./scene').BoardScene) { this.sceneRef = s; }
  kingInCheck(color: 'w' | 'b') { this.sceneRef?.kingInCheck(color); }
  celebrate(color: 'w' | 'b') { this.sceneRef?.celebrate(color); }

  private isAiTurn() {
    return this.mode === 'ai' && this.chess.turn() !== this.playerColor && !this.chess.isGameOver();
  }

  // публичный вход для UI: если сейчас ход AI — запустить его (в т.ч. первый ход партии)
  kickoffAi(scene: import('./scene').BoardScene) {
    if (this.ui === 'playing' && this.isAiTurn()) {
      this.pushHud();
      setTimeout(() => this.aiMove(scene), 700);
    }
  }

  // AI на основе собственного движка (engine.ts).
  private aiMove(scene: import('./scene').BoardScene) {
    if (!this.isAiTurn()) return;
    const randomness = this.aiLevel === 0 ? 140 : this.aiLevel === 1 ? 12 : 0;
    const mv = findBestMove(this.chess, this.aiLevel, randomness);
    if (mv) this.commitMove(mv, scene);
  }

  private pushHud() {
    const over = this.chess.isGameOver();
    let result: string | null = null;
    if (over) {
      if (this.chess.isCheckmate()) {
        const winner = this.chess.turn() === 'w' ? 'Чёрные' : 'Белые';
        result = `Мат! Победа: ${winner}`;
      } else if (this.chess.isStalemate()) result = 'Пат — ничья';
      else if (this.chess.isThreefoldRepetition()) result = 'Ничья (троекратное повторение)';
      else if (this.chess.isInsufficientMaterial()) result = 'Ничья (недостаточно материала)';
      else result = 'Ничья (правило 50 ходов)';
    }
    this.cb.onHud({
      turn: this.chess.turn(),
      check: this.chess.isCheck(),
      result,
      mode: this.mode,
      playerColor: this.playerColor,
      history: this.chess.history(),
      thinking: this.isAiTurn(),
    });
  }
}
