// Проверка шахматных правил (chess.js) и собственного движка.
import { Chess } from 'chess.js';
import { findBestMove } from '../src/game/engine.ts';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function legal(c, mv) {
  try { c.move(mv); return true; } catch { return false; }
}

// --- обычные ходы каждой фигуры ---
{
  const c = new Chess();
  ok(c.move({ from: 'e2', to: 'e4' }) !== null, 'ход пешки');
  ok(c.move({ from: 'g8', to: 'f6' }) !== null, 'ход коня');
  ok(c.move({ from: 'f1', to: 'c4' }) !== null, 'ход слона');
  ok(c.move({ from: 'h7', to: 'h5' }) !== null, 'ход пешки чёрных');
  ok(c.move({ from: 'd1', to: 'h5' }) !== null, 'ход ферзя');
  ok(c.move({ from: 'a7', to: 'a5' }) !== null, 'ход ладьи-пешки');
  ok(c.move({ from: 'b1', to: 'c3' }) !== null, 'ход коня b1');
  ok(c.move({ from: 'd7', to: 'd5' }) !== null, 'двойной ход пешки');
}

// --- невозможные ходы ---
{
  const c = new Chess();
  ok(!legal(c, { from: 'e2', to: 'e5' }), 'пешка не ходит на 3 клетки');
  ok(!legal(c, { from: 'b1', to: 'e4' }), 'конь не ходит как слон');
  ok(c.move({ from: 'e2', to: 'e3', promotion: 'q' }) !== null, 'ход пешки для смены очереди');
  ok(c.move({ from: 'e7', to: 'e6' }) !== null, 'чёрная пешка');
  ok(!legal(c, { from: 'd1', to: 'd4' }), 'ферзь заблокирован');
}

// --- шах и выход из шаха, запрат оставить короля под шахом ---
{
  const c = new Chess();
  c.move('f3'); c.move('e5'); c.move('g4');
  ok(c.move({ from: 'd8', to: 'h4' }) !== null && c.isCheckmate(), 'дурацкий мат');
}
{
  // шах; нельзя сделать ход, оставляющий короля под шахом
  const c = new Chess('rnb1kbnr/pppp1ppp/8/4p3/7q/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  ok(c.isCheck(), 'шах объявлен');
  const illegal = c.moves({ square: 'e2' }).length; // e2 пешка не может двинуться, открывая короля... проверим короля
  ok(c.moves({ square: 'e1' }).length === 0, 'король не может уйти в клетки под боем / заблокирован');
  // ход f3 блокирует? нет — после f3 король e1 всё ещё под боем ферзя g4? g4-e2 диагональ... проверим, что chess.js запрещает
  const c2 = new Chess('rnb1kbnr/pppp1ppp/8/4p3/7q/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  ok(!legal(c2, { from: 'e2', to: 'e4' }), 'нельзя открыть короля под шах');
}

// --- пат ---
{
  const c = new Chess('k7/8/1Q6/8/8/8/8/K7 b - - 0 1');
  ok(c.isStalemate() && c.isDraw(), 'пат — ничья');
}

// --- обе рокировки ---
{
  const c = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  ok(c.move({ from: 'e1', to: 'g1' }) !== null, 'короткая рокировка белых');
  ok(c.move({ from: 'e8', to: 'c8' }) !== null, 'длинная рокировка чёрных');
}
{
  // рокировка через битое поле запрещена
  const c = new Chess('r3k2r/8/8/8/8/8/5q2/R3K2R w KQkq - 0 1');
  ok(!legal(c, { from: 'e1', to: 'g1' }), 'рокировка через шах запрещена');
  ok(!legal(c, { from: 'e1', to: 'c1' }), 'длинная рокировка через боевое поле запрещена');
}
{
  // король под шахом не может рокироваться
  const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2r w KQkq - 0 1');
  ok(c.isCheck(), 'король под шахом');
  ok(!legal(c, { from: 'e1', to: 'g1' }), 'рокировка из-под шаха запрещена');
}

// --- взятие на проходе ---
{
  const c = new Chess();
  c.move('e4'); c.move('a6'); c.move('e5'); c.move('d5');
  const ep = c.move({ from: 'e5', to: 'd6' });
  ok(ep !== null && ep.flags.includes('e'), 'взятие на проходе');
  ok(c.get('d5') === undefined, 'взятая пешка удалена');
}

// --- превращение ---
{
  const c = new Chess('8/P7/8/8/8/8/k6K/8 w - - 0 1');
  const m = c.move({ from: 'a7', to: 'a8', promotion: 'q' });
  ok(m !== null && m.promotion === 'q' && c.get('a8').type === 'q', 'превращение в ферзя');
}

// --- сохранение/восстановление (FEN roundtrip) ---
{
  const c = new Chess();
  c.move('e4'); c.move('e5'); c.move('Nf3'); c.move('Nc6');
  const fen = c.fen();
  const c2 = new Chess(fen);
  ok(c2.fen() === fen && c2.history().length === 0, 'FEN восстанавливает позицию');
  ok(c2.move('Bb5') !== null, 'после загрузки ходы работают');
}

// --- движок: всегда возвращает легальный ход ---
{
  const c = new Chess();
  for (let i = 0; i < 12; i++) {
    const mv = findBestMove(c, 1, 0);
    ok(mv !== null, `движок вернул ход №${i + 1}`);
    const legal = c.moves({ verbose: true }).some((m) => m.from === mv.from && m.to === mv.to);
    ok(legal, `ход ${mv.from}-${mv.to} легален`);
    c.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (c.isGameOver()) break;
  }
}

// --- движок: находит мат в один ход ---
{
  // после 1.f3 e5 2.g4 — чёрные ставят мат в один ход: Фh4#
  const c = new Chess('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
  const saved = new Chess(c.fen());
  const mv = findBestMove(c, 2, 0);
  ok(mv !== null, 'движок вернул ход в позиции мата в 1');
  if (mv) {
    saved.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    ok(saved.isCheckmate(), 'движок нашёл мат в 1 ход (Qh4#)');
  }
}

// --- движок: не отдаёт ферзя напролом (глубина 2+ видит взятие) ---
{
  // белые: ферзь d1 может взять d5 без защиты? поставим ферзя под боем ладьи
  const c = new Chess('4k3/8/8/4q3/8/8/3Q4/4K3 w - - 0 1');
  const mv = findBestMove(c, 2, 0);
  ok(!(mv.from === 'd2' && mv.to === 'd5'), 'движок не отдаёт ферзя');
}

console.log(`\nИтого: ${passed} пройдено, ${failed} провалено`);
process.exit(failed ? 1 : 0);
