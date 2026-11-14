import React, { useEffect, useRef, useState } from 'react';
import { sound } from './game/audio/SoundEffects';
import {
  DamageIndicatorEvent,
  GameEngine,
  GameSettings,
  HitFeedbackEvent,
  KillFeedItem,
  MatchScore,
  RadarSnapshot,
  TeamChatMessage
} from './game/GameEngine';
import { loadSavedSettings, saveSettings } from './game/config/GraphicsConfig';
import { PlayerState } from './game/fps/PlayerController';
import type { MapId } from './game/maps/MapBuilder';
import { MainMenu } from './components/MainMenu';
import { GameHUD } from './components/GameHUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { PauseMenu } from './components/PauseMenu';

type NavigatorWithKeyboardLock = Navigator & {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
};

const GAMEPLAY_LOCKED_KEYS = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyB',
  'KeyC',
  'KeyE',
  'KeyF',
  'KeyP',
  'KeyQ',
  'KeyT',
  'KeyN',
  'KeyL',
  'KeyH',
  'KeyU',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'Tab',
  'Space',
  'Backspace',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
  'BrowserHome',
  'BrowserSearch'
];

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'playing'>('menu');
  const [settings, setSettings] = useState<GameSettings>(() => loadSavedSettings());

  const [selectedTeam, setSelectedTeam] = useState<'gang' | 'swat'>('gang');
  const [selectedMap, setSelectedMap] = useState<MapId>('citadel');
  const [teamSize, setTeamSize] = useState<number>(5);

  const [score, setScore] = useState<MatchScore | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [teamChat, setTeamChat] = useState<TeamChatMessage[]>([]);
  const [hitFeedback, setHitFeedback] = useState<HitFeedbackEvent | null>(null);
  const [damageIndicator, setDamageIndicator] = useState<DamageIndicatorEvent | null>(null);
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [isBuyMenuOpen, setIsBuyMenuOpen] = useState<boolean>(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState<boolean>(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState<boolean>(false);
  const [isRadioMenuOpen, setIsRadioMenuOpen] = useState<boolean>(false);
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const isPauseMenuOpenRef = useRef<boolean>(false);
  const isBuyMenuOpenRef = useRef<boolean>(false);
  const isMatchOverRef = useRef<boolean>(false);
  const isRadioMenuOpenRef = useRef<boolean>(false);

  useEffect(() => {
    isPauseMenuOpenRef.current = isPauseMenuOpen;
    sound.setAmbiencePaused(isPauseMenuOpen);
  }, [isPauseMenuOpen]);

  useEffect(() => {
    isBuyMenuOpenRef.current = isBuyMenuOpen;
  }, [isBuyMenuOpen]);

  useEffect(() => {
    isMatchOverRef.current = Boolean(score?.isMatchOver);
  }, [score?.isMatchOver]);

  // Persist settings & sync audio master volume
  useEffect(() => {
    saveSettings(settings);
    sound.masterVolume = settings.volume;
    sound.syncMasterVolume();
  }, [settings]);

  // Live sync graphics quality, FOV, mouse sensitivity & comfort setting without recreating GameEngine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.applyGraphicsSettings(settings);
    }
  }, [
    settings.mouseSensitivity,
    settings.reducedMotion,
    settings.pixelRatioScale,
    settings.shadows,
    settings.reflections,
    settings.textureQuality,
    settings.fov,
    screen
  ]);

  const handleStartGame = (team: 'gang' | 'swat', mapId: MapId, size: number) => {
    sound.enable();
    sound.stopOutcomeSounds();
    setHitFeedback(null);
    isPauseMenuOpenRef.current = false;
    isBuyMenuOpenRef.current = false;
    isMatchOverRef.current = false;
    isRadioMenuOpenRef.current = false;
    setIsPauseMenuOpen(false);
    setIsBuyMenuOpen(false);
    setIsScoreboardOpen(false);
    setIsRadioMenuOpen(false);
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
    sound.stopOutcomeSounds();
    setHitFeedback(null);
    isPauseMenuOpenRef.current = false;
    setIsPauseMenuOpen(false);
    isBuyMenuOpenRef.current = false;
    setIsBuyMenuOpen(false);
    isMatchOverRef.current = false;
    isRadioMenuOpenRef.current = false;
    setIsRadioMenuOpen(false);
    if (engineRef.current) {
      engineRef.current.player.suppressSlotHotkeys = false;
    }
    engineRef.current?.restartMatch();
    engineRef.current?.renderer.domElement.requestPointerLock();
  };

  const handleExitToMenu = () => {
    sound.stopOutcomeSounds();
    setHitFeedback(null);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    isPauseMenuOpenRef.current = false;
    isBuyMenuOpenRef.current = false;
    isMatchOverRef.current = false;
    isRadioMenuOpenRef.current = false;
    setIsPauseMenuOpen(false);
    setIsBuyMenuOpen(false);
    setIsScoreboardOpen(false);
    setIsRadioMenuOpen(false);
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setScreen('menu');
  };

  // Mount 3D Engine when transitioning to 'playing'
  useEffect(() => {
    if (screen !== 'playing' || !canvasMountRef.current) return;

    const engine = new GameEngine(canvasMountRef.current, selectedMap, selectedTeam, teamSize, settings);
    engineRef.current = engine;

    // Apply initial settings
    engine.applyGraphicsSettings(settings);

    // Initial state
    setScore(engine.matchScore);
    setPlayerState(engine.player.state);
    setKillFeed([]);
    setTeamChat([]);

    engine.onScoreUpdate = (sc) => setScore({ ...sc });
    engine.onPlayerStateUpdate = (st) => {
      setPlayerState({ ...st });
      if (!st.isAlive && isRadioMenuOpenRef.current) {
        isRadioMenuOpenRef.current = false;
        setIsRadioMenuOpen(false);
        engine.player.suppressSlotHotkeys = false;
      }
    };
    engine.onKillFeedUpdate = (kf) => setKillFeed([...kf]);
    engine.onTeamChatUpdate = (tc) => setTeamChat([...tc]);
    engine.onHitFeedback = (ev) => setHitFeedback(ev);
    engine.onDamageTaken = (ev) => setDamageIndicator(ev);
    engine.onRadarUpdate = (rd) => setRadar(rd);

    const navKb = (navigator as NavigatorWithKeyboardLock).keyboard;
    const syncKeyboardLock = (locked: boolean) => {
      try {
        if (locked) {
          navKb?.lock?.(GAMEPLAY_LOCKED_KEYS)?.catch(() => {});
        } else {
          navKb?.unlock?.();
        }
      } catch {
        // Browser may restrict Keyboard.lock outside fullscreen/HTTPS
      }
    };

    // Pointer Lock handlers (auto-open Esc Pause Menu when unlocking via Esc)
    let wasLocked = false;
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === engine.renderer.domElement;
      setIsPointerLocked(locked);
      engine.player.isLocked = locked;
      syncKeyboardLock(locked);
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
    const onFullscreenChange = () => {
      syncKeyboardLock(document.pointerLockElement === engine.renderer.domElement);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // Block browser keyboard, Alt menu focus, mouse side-buttons, swipe navigation, context menu, and zoom shortcuts during gameplay
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';

    const BLOCKED_SOLO_CODES = new Set([
      'Tab',
      'Space',
      'Backspace',
      'AltLeft',
      'AltRight',
      'MetaLeft',
      'MetaRight',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      'Slash',
      'Quote',
      'ContextMenu',
      'BrowserBack',
      'BrowserForward',
      'BrowserRefresh',
      'BrowserHome',
      'BrowserSearch',
      'BrowserFavorites',
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
      'F11',
      'F12'
    ]);

    const handleGlobalKeyDownCapture = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      // Allow Esc to unlock pointer / toggle pause naturally
      if (e.code === 'Escape') return;

      // Cancel browser combos (Ctrl+W/R/S/D/A/F/T/N/P/1-9, Alt+Arrows, Meta combos) without stopping in-game listeners
      if (e.ctrlKey || e.metaKey || e.altKey || BLOCKED_SOLO_CODES.has(e.code)) {
        e.preventDefault();
      }
    };

    const handleGlobalKeyUpCapture = (e: KeyboardEvent) => {
      if (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'Tab' || e.code === 'ContextMenu' || e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
      }
    };

    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const blockBrowserMouseButtons = (e: MouseEvent) => {
      // Prevent browser back/forward side buttons (3/4) and middle-click auto-scroll (1)
      if (e.button === 1 || e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleGlobalWheel = (e: WheelEvent) => {
      // Prevent Ctrl/Cmd zoom and horizontal trackpad back/forward swipe gestures
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
      }
    };

    const handleGlobalDragSelect = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Guard the entire active match (even when pointer lock is released for Buy Menu / Pause)
      if (!isMatchOverRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDownCapture, { capture: true });
    window.addEventListener('keyup', handleGlobalKeyUpCapture, { capture: true });
    window.addEventListener('contextmenu', handleGlobalContextMenu, { capture: true });
    window.addEventListener('mousedown', blockBrowserMouseButtons, { capture: true });
    window.addEventListener('mouseup', blockBrowserMouseButtons, { capture: true });
    window.addEventListener('pointerdown', blockBrowserMouseButtons, { capture: true });
    window.addEventListener('pointerup', blockBrowserMouseButtons, { capture: true });
    window.addEventListener('auxclick', blockBrowserMouseButtons, { capture: true });
    window.addEventListener('wheel', handleGlobalWheel, { capture: true, passive: false });
    window.addEventListener('dragstart', handleGlobalDragSelect, { capture: true });
    window.addEventListener('selectstart', handleGlobalDragSelect, { capture: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

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

    // Keyboard handlers for Buy Menu, Team Radio (P + 1-9 / 0), Scoreboard, and Esc Pause Menu
    const setRadioOpen = (open: boolean) => {
      isRadioMenuOpenRef.current = open;
      setIsRadioMenuOpen(open);
      engine.player.suppressSlotHotkeys = open;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') {
        if (
          !isBuyMenuOpenRef.current &&
          !isPauseMenuOpenRef.current &&
          !isMatchOverRef.current &&
          engine.player.state.isAlive
        ) {
          setRadioOpen(!isRadioMenuOpenRef.current);
        }
        return;
      }

      if (isRadioMenuOpenRef.current) {
        if (e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          setRadioOpen(false);
          return;
        }
        const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (digitMatch) {
          e.preventDefault();
          const num = parseInt(digitMatch[1], 10);
          engine.issuePlayerTacticalCommand(num);
          setRadioOpen(false);
          return;
        }
      }

      if (e.code === 'KeyB') {
        if (engine.matchScore.isBuyPhase && !isPauseMenuOpenRef.current && !isMatchOverRef.current) {
          setRadioOpen(false);
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
        if (isRadioMenuOpenRef.current) {
          setRadioOpen(false);
        }
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
      syncKeyboardLock(false);
      cancelAnimationFrame(animId);
      clearTimeout(animId);
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', handleGlobalKeyDownCapture, { capture: true });
      window.removeEventListener('keyup', handleGlobalKeyUpCapture, { capture: true });
      window.removeEventListener('contextmenu', handleGlobalContextMenu, { capture: true });
      window.removeEventListener('mousedown', blockBrowserMouseButtons, { capture: true });
      window.removeEventListener('mouseup', blockBrowserMouseButtons, { capture: true });
      window.removeEventListener('pointerdown', blockBrowserMouseButtons, { capture: true });
      window.removeEventListener('pointerup', blockBrowserMouseButtons, { capture: true });
      window.removeEventListener('auxclick', blockBrowserMouseButtons, { capture: true });
      window.removeEventListener('wheel', handleGlobalWheel, { capture: true });
      window.removeEventListener('dragstart', handleGlobalDragSelect, { capture: true });
      window.removeEventListener('selectstart', handleGlobalDragSelect, { capture: true });
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
                    ? 'إطلاق نار · كلك يمين ADS · 4 القنابل · P راديو الفريق · E القنبلة'
                    : 'LMB FIRE · RMB ADS · 4 NADES · P RADIO · E C4 · ESC PAUSE'}
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
              teamChat={teamChat}
              isRadioMenuOpen={isRadioMenuOpen}
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
              ownedGrenades={playerState.grenades}
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
