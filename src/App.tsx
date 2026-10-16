import { useEffect, useRef, useState, useCallback } from 'react';
import { BoardScene } from './game/scene';
import { Game, type HudInfo } from './game/game';
import { SoundFX } from './game/audio';
import type { AILevel } from './game/engine';
import './App.css';

type MenuView = 'main' | 'newgame' | 'settings';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const gameRef = useRef<Game | null>(null);
  const soundsRef = useRef<SoundFX | null>(null);
  const [view, setView] = useState<MenuView>('main');
  const [inGame, setInGame] = useState(false);
  const [hud, setHud] = useState<HudInfo | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [aiLevel, setAiLevel] = useState<AILevel>(1);
  const [side, setSide] = useState<'w' | 'b'>('w');

  const refreshSave = useCallback(() => {
    setHasSave(!!localStorage.getItem('kotochess_save_v2') || !!localStorage.getItem('kotochess_save_v1'));
  }, []);

  useEffect(() => {
    refreshSave();
    const container = containerRef.current!;
    const sounds = new SoundFX();
    soundsRef.current = sounds;
    sounds.setVolume(0.6);

    const game = new Game(
      {
        onHud: (h) => {
          setHud(h);
          setInGame(game.ui !== 'menu');
        },
        onPromotion: (p) => setPromo(p),
      },
      sounds
    );
    gameRef.current = game;

    const scene = new BoardScene(container, {
      onSquareClick: (sq) => {
        if (!sq) {
          scene.setSelected(null);
          scene.clearHighlights();
          game.select('');
          return;
        }
        const res = game.handleSquare(sq, scene);
        if (res === 'selected') {
          const sel = game.getSelected();
          if (sel) {
            sounds.select();
            scene.setSelected(sel);
            scene.showMoves(game.legalFrom(sel));
          }
        } else if (res === 'moved') {
          // ход сделан — подсветки сбросит commitMove
        }
      },
    });
    sceneRef.current = scene;
    game.bindScene(scene);
    scene.syncPieces(game.board());

    // отладочные хуки для автотестов
    (window as unknown as { __game: unknown; __scene: unknown }).__game = game;
    (window as unknown as { __game: unknown; __scene: unknown }).__scene = scene;

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') scene.resetCamera();
      if (e.key === 'Escape') {
        scene.setSelected(null);
        scene.clearHighlights();
      }
    };
    window.addEventListener('keydown', keyHandler);

    // если есть сохранение — автоматически синхронизируем фигуры
    refreshSave();

    // тестовый автостарт: index.html#autostart-ai-N / #autostart-ai-N-b / #autostart-pvp
    if (location.hash.startsWith('#autostart')) {
      const m = location.hash.match(/^#autostart-(ai|pvp)-?(\d)?(-b)?/);
      if (m) {
        setTimeout(() => {
          const mode = m[1] as 'ai' | 'pvp';
          const level = parseInt(m[2] ?? '1', 10) as AILevel;
          const color = m[3] ? 'b' : 'w';
          game.newGame(mode, level, color);
          scene.syncPieces(game.board());
          scene.setPlayerSide(color);
          setInGame(true);
          setTimeout(() => game.kickoffAi(scene), 400);
        }, 300);
      }
    }

    return () => {
      window.removeEventListener('keydown', keyHandler);
      scene.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // синхронизация фигур при старте/новой игре/продолжении
  const syncBoard = useCallback(() => {
    const g = gameRef.current;
    const s = sceneRef.current;
    if (g && s) s.syncPieces(g.board());
  }, []);

  const startNew = (mode: 'pvp' | 'ai', level: AILevel, color: 'w' | 'b' = 'w') => {
    const g = gameRef.current!;
    g.newGame(mode, level, color);
    setAiLevel(level);
    syncBoard();
    sceneRef.current?.setPlayerSide(color);
    setInGame(true);
    setView('main');
    refreshSave();
    // если игрок за чёрных — AI делает первый ход
    setTimeout(() => g.kickoffAi(sceneRef.current!), 400);
  };

  const continueGame = () => {
    const g = gameRef.current!;
    if (g.continueGame()) {
      setAiLevel(g.aiLevel);
      syncBoard();
      sceneRef.current?.setPlayerSide(g.playerColor);
      setInGame(true);
      setView('main');
      setTimeout(() => g.kickoffAi(sceneRef.current!), 400);
    }
  };

  const toMenu = () => {
    gameRef.current?.exitToMenu();
    setInGame(false);
    setView('main');
    refreshSave();
  };

  const restart = () => {
    const g = gameRef.current!;
    g.newGame(g.mode, g.aiLevel);
    syncBoard();
    refreshSave();
  };

  const choosePromo = (piece: 'q' | 'r' | 'b' | 'n') => {
    setPromo(null);
    gameRef.current?.choosePromotion(piece, sceneRef.current!);
    setTimeout(syncBoard, 100);
  };

  const turnName = hud?.turn === 'w' ? 'Белые' : 'Чёрные';

  return (
    <div className="game-root">
      <div ref={containerRef} className="canvas-host" />

      {inGame && hud && (
        <>
          <div className="hud-top">
            <div className="hud-status">
              {hud.result ? (
                <span className="hud-result">{hud.result}</span>
              ) : (
                <>
                  <span className={hud.turn === 'w' ? 'turn white' : 'turn black'} />
                  Ходят: {turnName}
                  {hud.check && <span className="check-badge">ШАХ!</span>}
                  {hud.thinking && <span className="thinking">кот думает…</span>}
                </>
              )}
            </div>
            <div className="hud-buttons">
              <button onClick={() => sceneRef.current?.resetCamera()} title="Сбросить камеру (R)">Камера</button>
              <button onClick={restart}>Заново</button>
              <button onClick={toMenu}>Меню</button>
            </div>
          </div>

          <div className="move-history">
            <div className="mh-title">История ходов</div>
            <div className="mh-list">
              {hud.history.length === 0 && <div className="mh-empty">—</div>}
              {Array.from({ length: Math.ceil(hud.history.length / 2) }).map((_, i) => (
                <div key={i} className="mh-row">
                  <span className="mh-num">{i + 1}.</span>
                  <span>{hud.history[i * 2]}</span>
                  <span>{hud.history[i * 2 + 1] ?? ''}</span>
                </div>
              ))}
            </div>
          </div>

          {hud.result && (
            <div className="modal-overlay">
              <div className="modal">
                <h2>{hud.result}</h2>
                <div className="modal-buttons">
                  <button className="primary" onClick={restart}>Новая партия</button>
                  <button onClick={toMenu}>В меню</button>
                </div>
              </div>
            </div>
          )}

          {promo && (
            <div className="modal-overlay">
              <div className="modal">
                <h2>Превращение пешки</h2>
                <div className="promo-row">
                  <button onClick={() => choosePromo('q')}>Ферзь</button>
                  <button onClick={() => choosePromo('r')}>Ладья</button>
                  <button onClick={() => choosePromo('b')}>Слон</button>
                  <button onClick={() => choosePromo('n')}>Конь</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!inGame && (
        <div className="menu-overlay">
          <div className="menu-card">
            <h1 className="game-title">КОТОШАХМАТЫ</h1>
            <p className="game-sub">3D-шахматы с котами</p>

            {view === 'main' && (
              <div className="menu-buttons">
                <button className="primary" onClick={() => setView('newgame')}>Новая игра</button>
                {hasSave && <button onClick={continueGame}>Продолжить</button>}
                <button onClick={() => setView('settings')}>Настройки</button>
                <button onClick={() => { setInGame(false); window.close(); }}>Выход</button>
              </div>
            )}

            {view === 'newgame' && (
              <div className="menu-buttons">
                <div className="menu-section">Против компьютера</div>
                <div className="level-row">
                  <button className={aiLevel === 0 ? 'primary' : ''} onClick={() => setAiLevel(0)}>Лёгкий</button>
                  <button className={aiLevel === 1 ? 'primary' : ''} onClick={() => setAiLevel(1)}>Средний</button>
                  <button className={aiLevel === 2 ? 'primary' : ''} onClick={() => setAiLevel(2)}>Сложный</button>
                </div>
                <div className="level-row">
                  <button className={side === 'w' ? 'primary' : ''} onClick={() => setSide('w')}>♔ Белые</button>
                  <button className={side === 'b' ? 'primary' : ''} onClick={() => setSide('b')}>♚ Чёрные</button>
                </div>
                <button className="primary" onClick={() => startNew('ai', aiLevel, side)}>
                  {side === 'b' ? 'Играть чёрными (AI начнёт)' : 'Играть белыми'}
                </button>
                <div className="menu-section">Два игрока</div>
                <button onClick={() => startNew('pvp', aiLevel)}>На одном компьютере</button>
                <button onClick={() => setView('main')}>Назад</button>
              </div>
            )}

            {view === 'settings' && (
              <div className="menu-buttons">
                <div className="menu-section">Громкость звука: {Math.round(volume * 100)}%</div>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    soundsRef.current?.setVolume(v);
                  }}
                />
                <button onClick={() => setView('main')}>Назад</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
