import { Chess, type Move } from 'chess.js';

// Собственный шахматный движок: alpha-beta minimax + quiescence + MVV-LVA.
// Три уровня сложности — глубина поиска и лёгкая случайность на лёгком уровне.

export type AILevel = 0 | 1 | 2; // лёгкий, средний, сложный

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Простейшие позиционные таблицы (от белых, с точки зрения чёрных — зеркалим)
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  k_end: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

function sqIndex(sq: string): number {
  return (8 - parseInt(sq[1], 10)) * 8 + (sq.charCodeAt(0) - 97);
}

function evaluate(chess: Chess): number {
  // оценка с точки зрения чёрных (AI играет чёрными); положительное — лучше для чёрных
  let score = 0;
  const board = chess.board();
  const endgame = countMaterial(chess) < 2400;
  for (const row of board) {
    for (const pc of row) {
      if (!pc) continue;
      const base = PIECE_VALUES[pc.type];
      const table = pc.type === 'k' && endgame ? PST.k_end : PST[pc.type];
      const idx = pc.color === 'w' ? sqIndex(pc.square) : 63 - sqIndex(pc.square);
      const v = base + table[idx];
      score += pc.color === 'b' ? v : -v;
    }
  }
  return score;
}

function countMaterial(chess: Chess): number {
  let m = 0;
  for (const row of chess.board()) for (const pc of row) {
    if (pc && pc.type !== 'k') m += PIECE_VALUES[pc.type];
  }
  return m;
}

function moveScoreGuess(m: Move): number {
  let s = 0;
  if (m.captured) s += 10 * PIECE_VALUES[m.captured] - PIECE_VALUES[m.piece];
  if (m.promotion) s += PIECE_VALUES[m.promotion] ?? 900;
  return s;
}

function quiescence(chess: Chess, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(chess);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured).sort((a, b) => moveScoreGuess(b) - moveScoreGuess(a));
  for (const m of captures) {
    chess.move(m);
    const score = -quiescence(chess, -beta, -alpha, depth - 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return quiescence(chess, alpha, beta, 4);
  const moves = chess.moves({ verbose: true }).sort((a, b) => moveScoreGuess(b) - moveScoreGuess(a));
  if (moves.length === 0) {
    if (chess.isCheckmate()) return -100000 + ply; // быстрее мат = лучше
    return 0;
  }
  let best = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -search(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

// Возвращает ход {from,to,promotion} для текущей позиции.
// AI всегда играет стороной, чей сейчас ход (в игре — чёрные).
export function findBestMove(chess: Chess, level: AILevel, randomness: number): { from: string; to: string; promotion?: string } | null {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const depth = level === 0 ? 1 : level === 1 ? 2 : 3;
  let bestScore = -Infinity;
  let best: Move[] = [];
  const ordered = [...moves].sort((a, b) => moveScoreGuess(b) - moveScoreGuess(a));
  for (const m of ordered) {
    chess.move(m);
    let score: number;
    if (level === 0) {
      // лёгкий: оценка только позиции после хода + случайность
      score = quiescence(chess, -Infinity, Infinity, 2) + Math.random() * randomness;
    } else {
      score = -search(chess, depth - 1, -Infinity, Infinity, 1) + Math.random() * randomness;
    }
    chess.undo();
    if (score > bestScore + 1e-6) { bestScore = score; best = [m]; }
    else if (Math.abs(score - bestScore) < 1e-6) best.push(m);
  }
  const pick = best[Math.floor(Math.random() * best.length)];
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
