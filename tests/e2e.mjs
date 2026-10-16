// E2E: запускает браузер, делает ход e2-e4 через игровой контроллер и проверяет,
// что фигура физически переместилась в 3D-сцене без перезагрузки.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5611;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: 'dist', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage', '--remote-debugging-port=9222', 'about:blank',
], { stdio: 'ignore' });
// ждём, пока DevTools поднимется
let browser = null;
for (let i = 0; i < 30 && !browser; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 800, height: 500 } });
  } catch { /* ещё не готов */ }
}
if (!browser) throw new Error('chromium devtools не поднялся');

let failed = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) failed++; };

try {
  const page = await browser.newPage();
  // headless гоняет rAF только по запросу кадров — качаем скриншотами
  const pump = async (ms) => {
    const n = Math.max(1, Math.round(ms / 150));
    for (let i = 0; i < n; i++) { await page.screenshot({ path: '/tmp/pump.png' }); await new Promise((r) => setTimeout(r, 60)); }
  };
  await page.goto(`http://localhost:${PORT}/#autostart-pvp`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__scene && window.__game, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  const posBefore = await page.evaluate(() => {
    const s = window.__scene;
    const p = s['pieces'].get('e2');
    return p ? { x: p.group.position.x, z: p.group.position.z } : null;
  });
  ok(posBefore && Math.abs(posBefore.x - 0.5) < 0.01 && Math.abs(posBefore.z - 2.5) < 0.01, 'пешка e2 на старте на своей клетке');

  // выбор и ход через тот же путь, что и клик мыши
  await page.evaluate(() => { window.__game.handleSquare('e2', window.__scene); });
  await pump(300);
  const selInfo = await page.evaluate(() => {
    const g = window.__game, s = window.__scene;
    const sq = g.getSelected();
    if (sq) { s.setSelected(sq); s.showMoves(g.legalFrom(sq)); }
    return { sq, ring: s['selectedRing'].visible, marks: s['highlights'].length };
  });
  ok(selInfo.sq === 'e2' && selInfo.ring === true && selInfo.marks > 0, 'выбор + подсветка ходов (e2: ' + JSON.stringify(selInfo) + ')');

  await page.evaluate(() => { window.__game.handleSquare('e4', window.__scene); });
  await pump(900); // дождаться конца анимации (0.5с)

  const posAfter = await page.evaluate(() => {
    const s = window.__scene;
    const p = s['pieces'].get('e4');
    return p ? { x: p.group.position.x, z: p.group.position.z } : null;
  });
  ok(posAfter && Math.abs(posAfter.x - 0.5) < 0.01 && Math.abs(posAfter.z - 0.5) < 0.01, 'пешка физически переместилась на e4 без перезагрузки');

  const hud = await page.evaluate(() => window.__game.chess.fen());
  ok(hud.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b'), 'ядро зафиксировало ход: ' + hud.split(' ')[0]);

  // взятие: 1.e4 e5 2.Nf3 Nc6 3.Nxe5 — конь берёт пешку e5
  const capMoves = [['e7','e5'],['g1','f3'],['b8','c6'],['f3','e5']];
  for (const [f, t] of capMoves) {
    await page.evaluate((f2) => { window.__game.handleSquare(f2, window.__scene); }, f);
    await pump(200);
    await page.evaluate((t2) => { window.__game.handleSquare(t2, window.__scene); }, t);
    await pump(900);
  }
  const captureOk = await page.evaluate(() => {
    const s = window.__scene, g = window.__game;
    const knight = s['pieces'].get('e5');
    return {
      knight: !!knight && knight.color === 'w' && knight.type === 'n',
      e5raw: knight ? { color: knight.color, type: knight.type, square: knight.square } : 'NONE',
      f3exists: s['pieces'].has('f3'),
      dyingLeft: s['dying'].length,
      victimGone: !s['pieces'].has('e7') && s['dying'].length === 0,
      all: [...s['pieces'].entries()].map(([k, v]) => k + ':' + v.color + v.type).join(' '),
      fen: g.chess.fen(),
    };
  });
  ok(captureOk.knight && captureOk.victimGone && captureOk.fen.startsWith('r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b'), 'взятие Nxe5: конь на e5, пешка чёрных исчезла из сцены (' + JSON.stringify(captureOk) + ')');

  await page.screenshot({ path: '/tmp/e2e.png' });

  // --- сценарий: игра за чёрных ---
  const page2 = await browser.newPage();
  await page2.goto(`http://localhost:${PORT}/#autostart-ai-1-b`, { waitUntil: 'load', timeout: 60000 });
  await page2.waitForFunction(() => window.__scene && window.__game, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  const pump2 = async (ms) => {
    const n = Math.max(1, Math.round(ms / 150));
    for (let i = 0; i < n; i++) { await page2.screenshot({ path: '/tmp/pump.png' }); await new Promise((r2) => setTimeout(r2, 60)); }
  };
  await pump2(1500); // ждём первый ход AI

  const afterAi = await page2.evaluate(() => {
    const g = window.__game, s = window.__scene;
    return {
      turn: g.chess.turn(),
      history: g.chess.history().length,
      side: g.playerColor,
      azimuth: s['defaultAzimuth'],
    };
  });
  ok(afterAi.turn === 'b' && afterAi.history === 1 && afterAi.side === 'b', 'AI сделал первый ход, очередь чёрных (' + JSON.stringify(afterAi) + ')');
  ok(afterAi.azimuth === 0, 'камера развёрнута на сторону чёрных');

  // чёрные отвечают d7-d5
  await page2.evaluate(() => { window.__game.handleSquare('d7', window.__scene); });
  await pump2(200);
  await page2.evaluate(() => { window.__game.handleSquare('d5', window.__scene); });
  await pump2(1300);
  const blackReplied = await page2.evaluate(() => {
    const g = window.__game, s = window.__scene;
    const p = s['pieces'].get('d5');
    return { pawn: !!p && p.color === 'b', turn: g.chess.turn(), history: g.chess.history().length };
  });
  ok(blackReplied.pawn && blackReplied.turn === 'b' && blackReplied.history === 3, 'чёрные ответили d5, AI ответил в ответ (' + JSON.stringify(blackReplied) + ')');

  // сохранение помнит сторону
  const savedSide = await page2.evaluate(() => JSON.parse(localStorage.getItem('kotochess_save_v2')).playerColor);
  ok(savedSide === 'b', 'сохранение хранит сторону игрока');

  await page2.screenshot({ path: '/tmp/e2e-black.png' });
  await page2.close();
  await browser.disconnect();
} finally {
  chrome.kill();
  server.kill();
}
console.log(failed ? `\n${failed} провалено` : '\nВсе E2E-проверки пройдены');
process.exit(failed ? 1 : 0);
