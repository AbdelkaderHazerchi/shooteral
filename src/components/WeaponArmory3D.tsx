import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCw, ZoomIn, Eye, Layers, ArrowLeft, ArrowRight } from 'lucide-react';
import { WEAPONS, WeaponStats } from '../game/weapons/WeaponData';
import { buildInspectWeaponModel, BuiltInspectWeapon } from '../game/weapons/WeaponViewmodelBuilder';
import { WeaponIcon } from './WeaponIcon';
import { sound } from '../game/audio/SoundEffects';

interface WeaponArmory3DProps {
  language: 'ar' | 'en';
  onBack: () => void;
}

type CategoryFilter = 'all' | 'primary' | 'pistol' | 'tactical';
type CameraPreset = 'three_quarter' | 'side' | 'closeup';

const ORDERED_WEAPON_IDS = ['ak47', 'm4a1', 'awp', 'mp5', 'deagle', 'usp', 'glock', 'knife', 'hegrenade', 'smokegrenade', 'c4'];

export const WeaponArmory3D: React.FC<WeaponArmory3DProps> = ({ language, onBack }) => {
  const isAr = language === 'ar';
  const [selectedId, setSelectedId] = useState<string>('ak47');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [detachMag, setDetachMag] = useState<boolean>(false);
  const [preset, setPreset] = useState<CameraPreset>('three_quarter');
  const [presetTrigger, setPresetTrigger] = useState<number>(0);
  const [contextFailed, setContextFailed] = useState<boolean>(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const autoRotateRef = useRef<boolean>(autoRotate);
  const detachMagRef = useRef<boolean>(detachMag);
  const presetReqRef = useRef<{ preset: CameraPreset; seq: number }>({ preset: 'three_quarter', seq: 0 });

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    detachMagRef.current = detachMag;
  }, [detachMag]);

  useEffect(() => {
    presetReqRef.current = { preset, seq: presetTrigger };
  }, [preset, presetTrigger]);

  const weaponsList = useMemo(() => {
    return ORDERED_WEAPON_IDS.map((id) => WEAPONS[id]).filter((w): w is WeaponStats => {
      if (!w) return false;
      if (categoryFilter === 'primary') return w.category === 'rifle' || w.category === 'smg' || w.category === 'sniper';
      if (categoryFilter === 'pistol') return w.category === 'pistol';
      if (categoryFilter === 'tactical') return w.category === 'melee' || w.category === 'explosive' || w.category === 'grenade';
      return true;
    });
  }, [categoryFilter]);

  const selectedWeapon = WEAPONS[selectedId] || WEAPONS.ak47;

  // Reset mag detach preview when switching weapons
  useEffect(() => {
    setDetachMag(false);
  }, [selectedId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    let controls: OrbitControls | null = null;

    try {
      let isSoftwareGl = false;
      const probeCanvas = document.createElement('canvas');
      const probeGl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (probeGl) {
        const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const r = String(probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(r)) isSoftwareGl = true;
        }
        probeGl.getExtension('WEBGL_lose_context')?.loseContext();
      }

      const w = container.clientWidth || 800;
      const h = container.clientHeight || 560;

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextFailed(true);
      };
      const handleContextRestored = () => setContextFailed(false);
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c0f14);
      scene.fog = new THREE.FogExp2(0x0c0f14, 0.14);

      pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.dispose();

      const camera = new THREE.PerspectiveCamera(36, w / h, 0.05, 40);

      // Studio Three-Point Lighting
      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.7);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
      keyLight.position.set(1.8, 2.6, 2.2);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.bias = -0.0005;
      }
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0xe03c1f, 1.85);
      rimLight.position.set(-2.2, 1.4, -2.0);
      scene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.15);
      fillLight.position.set(0.4, -1.2, 2.0);
      scene.add(fillLight);

      // Tactical Inspection Turntable Pedestal
      const pedestalGroup = new THREE.Group();
      const baseDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.76, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.55, metalness: 0.65 })
      );
      baseDisc.position.y = -0.26;
      baseDisc.receiveShadow = true;
      const trimRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.64, 0.64, 0.012, 12),
        new THREE.MeshStandardMaterial({ color: 0xe03c1f, roughness: 0.35, metalness: 0.45 })
      );
      trimRing.position.y = -0.236;
      const grid = new THREE.GridHelper(6, 24, 0x2a313d, 0x171b22);
      grid.position.y = -0.281;
      pedestalGroup.add(baseDisc, trimRing, grid);
      scene.add(pedestalGroup);

      // Build Centered Inspectable 3D Weapon
      const built: BuiltInspectWeapon = buildInspectWeaponModel(selectedWeapon);
      built.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = !isSoftwareGl;
          obj.receiveShadow = !isSoftwareGl;
        }
      });
      scene.add(built.group);

      const dist = built.defaultDistance;
      camera.position.set(dist * 0.52, dist * 0.22, dist * 0.92);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = Math.max(0.26, dist * 0.48);
      controls.maxDistance = dist * 2.2;
      controls.target.set(0, 0, 0);
      controls.update();

      // Smooth scripted camera preset interpolation (stops immediately when user drags!)
      let activeTransition = false;
      let targetCamPos = camera.position.clone();
      let lastSeenSeq = presetReqRef.current.seq;

      const cancelTransition = () => {
        activeTransition = false;
      };
      controls.addEventListener('start', cancelTransition);

      const onResize = () => {
        if (!container || !renderer) return;
        const cw = container.clientWidth || 800;
        const ch = container.clientHeight || 560;
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        renderer.setSize(cw, ch);
      };
      window.addEventListener('resize', onResize);

      let animId = 0;
      let lastT = performance.now();
      let magOffsetY = 0;

      const afterDraw = (cb: () => void) => {
        if (!renderer) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (st === gl.UNSIGNALED) {
            animId = window.setTimeout(poll, 8);
          } else {
            if (sync) gl.deleteSync(sync);
            animId = window.setTimeout(cb, 70);
          }
        };
        animId = window.setTimeout(poll, 8);
      };

      const renderFrame = (now?: number) => {
        if (disposed || !renderer || !controls) return;
        const t = now ?? performance.now();
        const dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;

        // Check camera preset request
        if (presetReqRef.current.seq !== lastSeenSeq) {
          lastSeenSeq = presetReqRef.current.seq;
          activeTransition = true;
          const p = presetReqRef.current.preset;
          if (p === 'side') {
            targetCamPos.set(0, dist * 0.08, dist * 1.02);
          } else if (p === 'closeup') {
            targetCamPos.set(dist * 0.34, dist * 0.14, dist * 0.56);
          } else {
            targetCamPos.set(dist * 0.52, dist * 0.22, dist * 0.92);
          }
        }

        if (activeTransition) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, 7, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, 7, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, 7, dt);
          if (camera.position.distanceTo(targetCamPos) < 0.015) {
            activeTransition = false;
          }
        }

        // Gentle showcase turntable rotation
        if (autoRotateRef.current && !activeTransition) {
          built.group.rotation.y += dt * 0.52;
        }

        // Smooth Magazine Detach Preview
        if (built.magGroup && built.magRestPos) {
          const targetMagOffset = detachMagRef.current ? -0.14 : 0;
          magOffsetY = THREE.MathUtils.damp(magOffsetY, targetMagOffset, 10, dt);
          built.magGroup.position.y = built.magRestPos.y + magOffsetY;
        }

        controls.update();
        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(() => renderFrame());
        } else {
          animId = requestAnimationFrame(renderFrame);
        }
      };

      animId = requestAnimationFrame(renderFrame);

      return () => {
        disposed = true;
        cancelAnimationFrame(animId);
        clearTimeout(animId);
        window.removeEventListener('resize', onResize);
        controls?.removeEventListener('start', cancelTransition);
        controls?.dispose();
        if (renderer) {
          renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
          renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
          scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const m = obj as THREE.Mesh;
              m.geometry.dispose();
              if (Array.isArray(m.material)) {
                m.material.forEach((mt) => mt.dispose());
              } else {
                m.material.dispose();
              }
            }
          });
          envRT?.dispose();
          pmrem?.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement);
          }
        }
      };
    } catch {
      setContextFailed(true);
    }
  }, [selectedWeapon]);

  // Derived Telemetry Bars (0-100%)
  const hsDamage = Math.round(selectedWeapon.damage * selectedWeapon.headshotMultiplier);
  const dmgPct = Math.min(100, Math.round((selectedWeapon.damage / 115) * 100));
  const rpm = selectedWeapon.fireRate > 0 ? Math.round(selectedWeapon.fireRate * 60) : 0;
  const fireRatePct = Math.min(100, Math.round((selectedWeapon.fireRate / 12) * 100));
  const accuracyPct =
    selectedWeapon.category === 'explosive'
      ? 100
      : Math.max(15, Math.min(100, Math.round((1 - selectedWeapon.spread / 0.055) * 100)));
  const recoilControlPct =
    selectedWeapon.recoil === 0
      ? 100
      : Math.max(10, Math.min(100, Math.round((1 - selectedWeapon.recoil / 0.09) * 100)));

  const triggerCameraPreset = (p: CameraPreset) => {
    sound.playUiClick('toggle');
    setPreset(p);
    setPresetTrigger((n) => n + 1);
  };

  return (
    <div
      className="relative w-full h-screen bg-[#0b0d11] text-white flex flex-col overflow-hidden select-none"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Top Bar */}
      <header className="h-16 bg-[#101318] border-b border-white/20 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              sound.playUiClick('back');
              onBack();
            }}
            className="h-10 px-4 bg-[#1a1f28] hover:bg-[#252c38] border border-white/25 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? 'العودة للردهة' : 'BACK TO LOBBY'}</span>
          </button>

          <div>
            <div className="text-[10px] font-mono tracking-[0.22em] text-[#e03c1f] uppercase">
              SHOOTERAL ARMORY
            </div>
            <h1
              className="text-lg sm:text-xl font-bold tracking-wider uppercase leading-none"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {isAr ? 'معرض الأسلحة ثلاثي الأبعاد' : '3D WEAPON INSPECTION'}
            </h1>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="hidden md:flex items-center gap-1 bg-[#141820] border border-white/15 p-1">
          {(
            [
              { id: 'all', ar: 'الكل', en: 'ALL' },
              { id: 'primary', ar: 'أساسية', en: 'PRIMARY' },
              { id: 'pistol', ar: 'مسدسات', en: 'PISTOLS' },
              { id: 'tactical', ar: 'تكتيكية', en: 'GEAR' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                sound.playUiClick('toggle');
                setCategoryFilter(tab.id);
              }}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === tab.id
                  ? 'bg-white text-black'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {isAr ? tab.ar : tab.en}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Split: Left/Bottom Weapon Picker + Center 3D Viewport + Right/Side Full Specifications */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* 1. Weapon Arsenal List (2 cols on lg) */}
        <aside className="lg:col-span-3 bg-[#0f1217] border-b lg:border-b-0 lg:border-e border-white/15 overflow-y-auto p-3 flex lg:flex-col gap-1.5 shrink-0">
          {weaponsList.map((w) => {
            const active = w.id === selectedWeapon.id;
            return (
              <button
                key={w.id}
                onClick={() => {
                  sound.playUiClick('default');
                  setSelectedId(w.id);
                }}
                className={`min-w-[165px] lg:min-w-0 lg:w-full text-start px-3.5 py-2.5 border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  active
                    ? 'bg-[#1d222c] border-white text-white'
                    : 'bg-[#141820] border-white/15 text-neutral-300 hover:bg-[#191e28] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-14 h-8 bg-[#0b0e14] border border-white/10 flex items-center justify-center px-1 shrink-0">
                    <WeaponIcon id={w.id} className="h-6 w-12" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold truncate">
                      {isAr ? w.nameAr : w.name}
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5 flex items-center gap-1.5">
                      <span>{w.category}</span>
                      <span>·</span>
                      <span>
                        {w.team === 'gang' ? (isAr ? 'العصابة' : 'GANG') : w.team === 'swat' ? (isAr ? 'الشرطة' : 'SWAT') : isAr ? 'الكل' : 'ALL'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-white tabular-nums">
                    {w.price > 0 ? `$${w.price}` : isAr ? 'مجاني' : 'FREE'}
                  </div>
                  {active && <div className="w-full h-0.5 bg-[#e03c1f] mt-1" />}
                </div>
              </button>
            );
          })}
        </aside>

        {/* 2. Interactive 3D Weapon Inspection Stage (5 or 6 cols) */}
        <section className="lg:col-span-5 relative bg-[#0c0f14] min-h-[320px] lg:min-h-0 flex flex-col">
          {/* Isolated WebGL Container */}
          {contextFailed ? (
            <div className="flex-1 flex items-center justify-center bg-[#0c0f14] text-neutral-400 text-xs font-mono">
              WEBGL CONTEXT UNAVAILABLE
            </div>
          ) : (
            <div ref={mountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />
          )}

          {/* Top Viewport Info Overlay (Unobtrusive) */}
          <div className="absolute top-3 start-3 pointer-events-none bg-[#101318]/90 border border-white/20 px-3 py-1.5 text-[11px] font-mono text-neutral-300">
            {isAr ? 'اسحب للتدوير 360° · عجلة الفأرة للتقريب' : 'DRAG TO ORBIT 360° · SCROLL TO ZOOM'}
          </div>

          {/* Bottom Interactive Camera & Inspection Bar */}
          <div className="bg-[#101318] border-t border-white/20 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => triggerCameraPreset('three_quarter')}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border cursor-pointer transition-colors ${
                  preset === 'three_quarter' ? 'bg-white text-black border-white' : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                {isAr ? 'زاوية 3/4' : '3/4 VIEW'}
              </button>
              <button
                onClick={() => triggerCameraPreset('side')}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border cursor-pointer transition-colors ${
                  preset === 'side' ? 'bg-white text-black border-white' : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                {isAr ? 'جانبي' : 'SIDE'}
              </button>
              <button
                onClick={() => triggerCameraPreset('closeup')}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border cursor-pointer transition-colors flex items-center gap-1 ${
                  preset === 'closeup' ? 'bg-white text-black border-white' : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                <ZoomIn className="w-3 h-3" />
                <span>{isAr ? 'تقريب' : 'ZOOM'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {selectedWeapon.category !== 'melee' && selectedWeapon.category !== 'explosive' && (
                <button
                  onClick={() => {
                    sound.playUiClick('toggle');
                    setDetachMag((v) => !v);
                  }}
                  className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border cursor-pointer transition-colors flex items-center gap-1.5 ${
                    detachMag ? 'bg-[#e03c1f] text-white border-white/40' : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{isAr ? 'فك المخزن' : 'MAGAZINE'}</span>
                </button>
              )}

              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  setAutoRotate((v) => !v);
                }}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border cursor-pointer transition-colors flex items-center gap-1.5 ${
                  autoRotate ? 'bg-white text-black border-white' : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{isAr ? 'دوران' : 'ROTATE'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3. Full Weapon Specifications & Ballistics Telemetry (4 cols) */}
        <aside className="lg:col-span-4 bg-[#101318] border-t lg:border-t-0 lg:border-s border-white/15 p-5 overflow-y-auto flex flex-col gap-5">
          {/* Header Block */}
          <div className="border-b border-white/15 pb-4">
            <div className="flex items-center justify-between gap-2 text-xs font-mono text-neutral-400 uppercase">
              <span>
                {selectedWeapon.category.toUpperCase()} · {isAr ? `الخانة ${selectedWeapon.slot}` : `SLOT ${selectedWeapon.slot}`}
              </span>
              <span className="text-white font-bold tabular-nums">
                {selectedWeapon.price > 0 ? `$${selectedWeapon.price}` : isAr ? 'تجهيز أساسي' : 'STANDARD ISSUE'}
              </span>
            </div>

            <h2
              className="text-2xl sm:text-3xl font-bold text-white uppercase tracking-wide mt-1"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {isAr ? selectedWeapon.nameAr : selectedWeapon.name}
            </h2>
            <div className="text-xs font-mono text-[#e03c1f] font-bold uppercase mt-0.5">
              {selectedWeapon.name}
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mt-3">
              {selectedWeapon.descriptionAr}
            </p>
          </div>

          {/* Ballistic Performance Bars */}
          <div className="space-y-3.5">
            <div className="text-xs font-mono font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-[#e03c1f]" />
              <span>{isAr ? 'الخصائص الباليستية والأداء' : 'BALLISTIC PERFORMANCE'}</span>
            </div>

            {[
              {
                label: isAr ? 'الضرر الأساسي' : 'Base Damage',
                val: `${selectedWeapon.damage} HP`,
                pct: dmgPct,
                barColor: 'bg-[#e03c1f]'
              },
              {
                label: isAr ? 'معدل الإطلاق' : 'Fire Rate',
                val: rpm > 0 ? `${selectedWeapon.fireRate}/s (${rpm} RPM)` : isAr ? 'يدوي' : 'N/A',
                pct: fireRatePct,
                barColor: 'bg-white'
              },
              {
                label: isAr ? 'الدقة الباليستية' : 'Accuracy',
                val: `${accuracyPct}%`,
                pct: accuracyPct,
                barColor: 'bg-white'
              },
              {
                label: isAr ? 'التحكم بالارتداد' : 'Recoil Control',
                val: `${recoilControlPct}%`,
                pct: recoilControlPct,
                barColor: 'bg-neutral-300'
              }
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-300 font-medium">{row.label}</span>
                  <span className="font-mono font-bold text-white tabular-nums">{row.val}</span>
                </div>
                <div className="w-full h-2 bg-[#1a1f28] border border-white/15">
                  <div className={`h-full ${row.barColor}`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Complete Technical Specs Grid */}
          <div>
            <div className="text-xs font-mono font-bold tracking-wider text-neutral-400 uppercase mb-2.5">
              {isAr ? 'المواصفات التقنية الكاملة' : 'TECHNICAL SPECIFICATIONS'}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'ضرر الرأس' : 'Headshot Damage'}
                </div>
                <div className="text-base font-mono font-bold text-white tabular-nums mt-0.5">
                  {hsDamage} HP <span className="text-xs text-[#e03c1f]">(×{selectedWeapon.headshotMultiplier})</span>
                </div>
              </div>

              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'المخزن / الاحتياطي' : 'Ammo Capacity'}
                </div>
                <div className="text-base font-mono font-bold text-white tabular-nums mt-0.5">
                  {selectedWeapon.magazineSize} / {selectedWeapon.maxReserve}
                </div>
              </div>

              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'زمن التلقيم' : 'Reload Time'}
                </div>
                <div className="text-base font-mono font-bold text-white tabular-nums mt-0.5">
                  {selectedWeapon.reloadTime > 0 ? `${selectedWeapon.reloadTime.toFixed(1)}s` : '—'}
                </div>
              </div>

              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'الفريق المخوّل' : 'Faction Access'}
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {selectedWeapon.team === 'gang'
                    ? isAr
                      ? 'العصابة (Gang)'
                      : 'Gang Only'
                    : selectedWeapon.team === 'swat'
                      ? isAr
                        ? 'الشرطة (SWAT)'
                        : 'SWAT Only'
                      : isAr
                        ? 'كلا الفريقين'
                        : 'Both Factions'}
                </div>
              </div>

              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'انتشار الطلقات' : 'Base Spread'}
                </div>
                <div className="text-sm font-mono font-bold text-neutral-200 tabular-nums mt-0.5">
                  {(selectedWeapon.spread * 1000).toFixed(1)} mrad
                </div>
              </div>

              <div className="bg-[#151922] border border-white/15 p-3">
                <div className="text-[10px] font-mono text-neutral-400 uppercase">
                  {isAr ? 'البصريات والكتم' : 'Optic / Muzzle'}
                </div>
                <div className="text-sm font-bold text-neutral-200 mt-0.5">
                  {selectedWeapon.isScoped
                    ? isAr
                      ? 'منظار قناص'
                      : 'Sniper Scope'
                    : selectedWeapon.id === 'usp' || selectedWeapon.id === 'm4a1' || selectedWeapon.id === 'mp5'
                      ? isAr
                        ? 'كاتم صوت'
                        : 'Suppressed'
                      : isAr
                        ? 'قياسي'
                        : 'Standard'}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
