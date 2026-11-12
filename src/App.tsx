import React, { useEffect, useRef, useState } from 'react';
import { sound } from './game/audio/SoundEffects';
import {
  DamageIndicatorEvent,
  GameEngine,
  GameSettings,
  HitFeedbackEvent,
  KillFeedItem,
  MatchScore,
  RadarSnapshot
} from './game/GameEngine';
import { PlayerState } from './game/fps/PlayerController';
import { MainMenu } from './components/MainMenu';
import { GameHUD } from './components/GameHUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { PauseMenu } from './components/PauseMenu';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'playing'>('menu');
  const [settings, setSettings] = useState<GameSettings>({
    mouseSensitivity: 0.0022,
    volume: 0.75,
    crosshairColor: '#00ff00',
    crosshairSize: 4,
    fov: 75,
    language: 'ar'
  });

  const [selectedTeam, setSelectedTeam] = useState<'gang' | 'swat'>('gang');
  const [selectedMap, setSelectedMap] = useState<'dust' | 'factory'>('dust');
  const [teamSize, setTeamSize] = useState<number>(5);

  const [score, setScore] = useState<MatchScore | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [hitFeedback, setHitFeedback] = useState<HitFeedbackEvent | null>(null);
  const [damageIndicator, setDamageIndicator] = useState<DamageIndicatorEvent | null>(null);
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [isBuyMenuOpen, setIsBuyMenuOpen] = useState<boolean>(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState<boolean>(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState<boolean>(false);
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const isPauseMenuOpenRef = useRef<boolean>(false);
  const isBuyMenuOpenRef = useRef<boolean>(false);
  const isMatchOverRef = useRef<boolean>(false);

  useEffect(() => {
    isPauseMenuOpenRef.current = isPauseMenuOpen;
  }, [isPauseMenuOpen]);

  useEffect(() => {
    isBuyMenuOpenRef.current = isBuyMenuOpen;
  }, [isBuyMenuOpen]);

  useEffect(() => {
    isMatchOverRef.current = Boolean(score?.isMatchOver);
  }, [score?.isMatchOver]);

  // Sync audio master volume
  useEffect(() => {
    sound.masterVolume = settings.volume;
  }, [settings.volume]);

  // Live sync mouse sensitivity without recreating GameEngine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.player.mouseSensitivity = settings.mouseSensitivity;
    }
  }, [settings.mouseSensitivity, screen]);

  const handleStartGame = (team: 'gang' | 'swat', mapId: 'dust' | 'factory', size: number) => {
    sound.enable();
    isPauseMenuOpenRef.current = false;
    isBuyMenuOpenRef.current = false;
    isMatchOverRef.current = false;
    setIsPauseMenuOpen(false);
    setIsBuyMenuOpen(false);
    setIsScoreboardOpen(false);
    setSelectedTeam(team);
    setSelectedMap(mapId);
    setTeamSize(size);
    setScreen('playing');
  };

  const handleResumeGame = () => {
    isPauseMenuOpenRef.current = false;
    setIsPauseMenuOpen(false);
    engineRef.current?.renderer.domElement.requestPointerLock();
  };

  const handleRestartMatch = () => {
    isPauseMenuOpenRef.current = false;
    setIsPauseMenuOpen(false);
    isBuyMenuOpenRef.current = false;
    setIsBuyMenuOpen(false);
    isMatchOverRef.current = false;
    engineRef.current?.restartMatch();
    engineRef.current?.renderer.domElement.requestPointerLock();
  };

  const handleExitToMenu = () => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    isPauseMenuOpenRef.current = false;
    isBuyMenuOpenRef.current = false;
    isMatchOverRef.current = false;
    setIsPauseMenuOpen(false);
    setIsBuyMenuOpen(false);
    setIsScoreboardOpen(false);
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setScreen('menu');
  };

  // Mount 3D Engine when transitioning to 'playing'
  useEffect(() => {
    if (screen !== 'playing' || !canvasMountRef.current) return;

    const engine = new GameEngine(canvasMountRef.current, selectedMap, selectedTeam, teamSize);
    engineRef.current = engine;

    // Apply initial settings
    engine.player.mouseSensitivity = settings.mouseSensitivity;

    // Initial state
    setScore(engine.matchScore);
    setPlayerState(engine.player.state);
    setKillFeed([]);

    engine.onScoreUpdate = (sc) => setScore({ ...sc });
    engine.onPlayerStateUpdate = (st) => setPlayerState({ ...st });
    engine.onKillFeedUpdate = (kf) => setKillFeed([...kf]);
    engine.onHitFeedback = (ev) => setHitFeedback(ev);
    engine.onDamageTaken = (ev) => setDamageIndicator(ev);
    engine.onRadarUpdate = (rd) => setRadar(rd);

    // Pointer Lock handlers (auto-open Esc Pause Menu when unlocking via Esc)
    let wasLocked = false;
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === engine.renderer.domElement;
      setIsPointerLocked(locked);
      engine.player.isLocked = locked;
      if (locked) {
        wasLocked = true;
      } else {
        engine.player.clearInputs();
        if (wasLocked) {
          wasLocked = false;
          if (!isBuyMenuOpenRef.current && !isMatchOverRef.current) {
            isPauseMenuOpenRef.current = true;
            setIsPauseMenuOpen(true);
          }
        }
      }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const handleCanvasClick = () => {
      if (
        !isBuyMenuOpenRef.current &&
        !isPauseMenuOpenRef.current &&
        !isMatchOverRef.current &&
        document.pointerLockElement !== engine.renderer.domElement
      ) {
        engine.renderer.domElement.requestPointerLock();
      }
    };
    engine.renderer.domElement.addEventListener('click', handleCanvasClick);

    // Keyboard handlers for Buy Menu, Scoreboard, and Esc Pause Menu
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyB') {
        if (engine.matchScore.isBuyPhase && !isPauseMenuOpenRef.current && !isMatchOverRef.current) {
          setIsBuyMenuOpen((prev) => {
            const next = !prev;
            isBuyMenuOpenRef.current = next;
            if (next) {
              engine.player.clearInputs();
              document.exitPointerLock();
            }
            return next;
          });
        }
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!isPauseMenuOpenRef.current) {
          setIsScoreboardOpen(true);
        }
      }
      if (e.code === 'Escape') {
        if (isBuyMenuOpenRef.current) {
          isBuyMenuOpenRef.current = false;
          setIsBuyMenuOpen(false);
        } else if (!isMatchOverRef.current) {
          const next = !isPauseMenuOpenRef.current;
          isPauseMenuOpenRef.current = next;
          setIsPauseMenuOpen(next);
          if (next) {
            engine.player.clearInputs();
            if (document.pointerLockElement) {
              document.exitPointerLock();
            }
          } else {
            engine.renderer.domElement.requestPointerLock();
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        setIsScoreboardOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // 60FPS Game Loop (Paced cleanly on Software WebGL via afterDraw)
    let animId = 0;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = engine.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          animId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          animId = window.setTimeout(cb, 80);
        }
      };
      animId = window.setTimeout(poll, 5);
    }

    const loop = (time?: number) => {
      const now = time ?? performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (isPauseMenuOpenRef.current || isMatchOverRef.current) {
        engine.renderOnly();
      } else {
        engine.update(dt);
      }

      if (engine.isSoftwareGl) {
        afterDraw(() => loop());
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(animId);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      engine.renderer.domElement.removeEventListener('click', handleCanvasClick);
      engine.dispose();
      engineRef.current = null;
    };
  }, [screen, selectedMap, selectedTeam, teamSize]);

  const handleBuyItem = (itemId: string): boolean => {
    if (engineRef.current) {
      return engineRef.current.buyItem(itemId);
    }
    return false;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black select-none">
      {screen === 'menu' ? (
        <MainMenu
          onStartGame={handleStartGame}
          settings={settings}
          onUpdateSettings={setSettings}
        />
      ) : (
        <div className="relative w-full h-full">
          {/* Isolated Three.js WebGL Container */}
          <div ref={canvasMountRef} className="absolute inset-0 cursor-crosshair" />

          {/* Click to Lock Pointer overlay if not locked and modals closed */}
          {!isPointerLocked && !isBuyMenuOpen && !isPauseMenuOpen && !score?.isMatchOver && (
            <div
              onClick={() => {
                engineRef.current?.renderer.domElement.requestPointerLock();
              }}
              className="absolute inset-0 z-20 bg-black/60 flex flex-col items-center justify-center cursor-pointer text-white"
            >
              <div className="p-6 bg-[#101318]/95 border border-white/30 shadow-2xl text-center max-w-sm">
                <div className="text-[11px] font-mono tracking-[0.25em] text-[#e03c1f] uppercase mb-2">
                  SHOOTERAL: FLAME OF BATTEL
                </div>
                <h3
                  className="text-xl font-bold mb-2 uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {settings.language === 'ar' ? 'انقر للقفل وبدء القتال' : 'CLICK TO ENGAGE'}
                </h3>
                <p className="text-xs font-mono text-neutral-400">
                  {settings.language === 'ar'
                    ? 'إطلاق نار · كلك يمين ADS · Shift ركض · E القنبلة · Esc إيقاف'
                    : 'LMB FIRE · RMB ADS · HOLD SHIFT SPRINT · E C4 · ESC PAUSE'}
                </p>
              </div>
            </div>
          )}

          {/* In-Game HUD Overlay */}
          {score && playerState && engineRef.current && (
            <GameHUD
              score={score}
              playerState={playerState}
              playerTeam={selectedTeam}
              killFeed={killFeed}
              bots={engineRef.current.bots}
              crosshairColor={settings.crosshairColor}
              language={settings.language}
              hitFeedback={hitFeedback}
              damageIndicator={damageIndicator}
              radar={radar}
              onOpenBuyMenu={() => {
                document.exitPointerLock();
                isBuyMenuOpenRef.current = true;
                setIsBuyMenuOpen(true);
              }}
              onExitToMenu={handleExitToMenu}
            />
          )}

          {/* Buy Menu Modal */}
          {score && playerState && (
            <BuyMenu
              isOpen={isBuyMenuOpen}
              onClose={() => {
                isBuyMenuOpenRef.current = false;
                setIsBuyMenuOpen(false);
                engineRef.current?.renderer.domElement.requestPointerLock();
              }}
              playerMoney={playerState.money}
              playerTeam={selectedTeam}
              onBuyItem={handleBuyItem}
              buyTimeLeft={score.buyTimeLeft}
              language={settings.language}
            />
          )}

          {/* Scoreboard Modal */}
          {score && playerState && engineRef.current && (
            <Scoreboard
              isOpen={isScoreboardOpen}
              score={score}
              player={engineRef.current.player}
              bots={engineRef.current.bots}
              mapName={engineRef.current.currentMap.nameAr}
              language={settings.language}
            />
          )}

          {/* Esc Pause Menu Modal */}
          <PauseMenu
            isOpen={isPauseMenuOpen}
            settings={settings}
            onUpdateSettings={setSettings}
            onResume={handleResumeGame}
            onRestartMatch={handleRestartMatch}
            onExitToMenu={handleExitToMenu}
          />
        </div>
      )}
    </div>
  );
}
