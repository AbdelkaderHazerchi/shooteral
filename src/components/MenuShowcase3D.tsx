import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCharacter, CharacterInstance } from '../game/character/CharacterBuilder';
import { buildLobbyBackdrop } from '../game/menu/LobbyBackdropBuilder';
import type { MapId } from '../game/maps/MapBuilder';

interface MenuShowcase3DProps {
  selectedTeam: 'gang' | 'swat';
  selectedMap: MapId;
}

function createSoftParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.65)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSmokeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const puffs = [
    { x: 128, y: 128, r: 95, a: 0.35 },
    { x: 88, y: 138, r: 70, a: 0.28 },
    { x: 168, y: 136, r: 72, a: 0.28 },
    { x: 112, y: 98, r: 62, a: 0.22 },
    { x: 148, y: 102, r: 60, a: 0.22 }
  ];

  for (const p of puffs) {
    const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
    grad.addColorStop(0, `rgba(220, 226, 235, ${p.a})`);
    grad.addColorStop(0.55, `rgba(170, 180, 195, ${p.a * 0.45})`);
    grad.addColorStop(1, 'rgba(130, 140, 155, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVolumetricBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.16)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPedestalDeckTexture(accentCss: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181c24';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle brushed metal diamond tread grid
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 2;
  for (let i = -512; i < 1024; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 512, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
  }

  // Concentric tactical calibration rings
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = accentCss;
  ctx.lineWidth = 4;
  ctx.setLineDash([28, 16]);
  ctx.beginPath();
  ctx.arc(256, 256, 175, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Radial sector ticks
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(ang) * 190, 256 + Math.sin(ang) * 190);
    ctx.lineTo(256 + Math.cos(ang) * 234, 256 + Math.sin(ang) * 234);
    ctx.stroke();
  }

  // Inner dark carbon core
  const innerGrad = ctx.createRadialGradient(256, 256, 20, 256, 256, 160);
  innerGrad.addColorStop(0, 'rgba(30, 36, 46, 0.35)');
  innerGrad.addColorStop(1, 'rgba(14, 17, 23, 0.65)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(256, 256, 160, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGlowDiscTexture(hexColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
  grad.addColorStop(0, hexColor);
  grad.addColorStop(0.45, `${hexColor}66`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const MenuShowcase3D: React.FC<MenuShowcase3DProps> = ({ selectedTeam, selectedMap }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextFailed, setContextFailed] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    const texturesToDispose: THREE.Texture[] = [];

    try {
      // Probe software GL to apply crisp pacing without altering geometry/lighting
      let isSoftwareGl = false;
      const probeCanvas = document.createElement('canvas');
      const probeGl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (probeGl) {
        const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const r = String(probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          if (/SwiftShader|llvmpipe|Software/i.test(r)) isSoftwareGl = true;
        }
        probeGl.getExtension('WEBGL_lose_context')?.loseContext();
      }

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.24;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextFailed(true);
      };
      const handleContextRestored = () => {
        setContextFailed(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      // Team-Colored Theme Palette
      const isGang = selectedTeam === 'gang';
      const teamPrimaryHex = isGang ? 0xff3b1f : 0x0ea5e9;
      const teamSecondaryHex = isGang ? 0xffa038 : 0x38bdf8;
      const teamCss = isGang ? '#ff3b1f' : '#0ea5e9';
      const fogBgColor = isGang ? 0x201712 : 0x111b28;
      const mapAccentHex =
        selectedMap === 'casbah'
          ? 0x22c55e
          : selectedMap === 'citadel'
            ? 0xf59e0b
            : selectedMap === 'foundry'
              ? 0x94a3b8
              : 0x38bdf8;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(fogBgColor);
      // Light atmospheric fog so background crates, weapons table & squad lockers stay crisp & legible
      scene.fog = new THREE.FogExp2(fogBgColor, 0.022);

      pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.85;
      roomEnv.dispose();

      const camera = new THREE.PerspectiveCamera(
        39,
        (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
        0.1,
        90
      );
      const baseCamPos = new THREE.Vector3(-0.78, 1.62, 4.35);
      const baseLookAt = new THREE.Vector3(-0.35, 1.18, -0.4);
      camera.position.copy(baseCamPos);
      camera.lookAt(baseLookAt);

      // ============================================================
      // 1. WELL-LIT STUDIO & ENVIRONMENT LIGHTING RIG (<= 2 Shadow Casters)
      // ============================================================
      const hemiLight = new THREE.HemisphereLight(
        isGang ? 0xffe4c4 : 0xdbeafe,
        isGang ? 0x4d3322 : 0x1e2c40,
        1.15
      );
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(isGang ? 0xfff0db : 0xf4f9ff, 2.35);
      keyLight.position.set(2.4, 5.5, 4.2);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
        keyLight.shadow.camera.left = -4.2;
        keyLight.shadow.camera.right = 4.2;
        keyLight.shadow.camera.top = 4.2;
        keyLight.shadow.camera.bottom = -4.2;
      }
      scene.add(keyLight);

      // Hero Overhead SpotLight tinted in selected team tone
      const heroSpot = new THREE.SpotLight(teamSecondaryHex, 6.5, 14, Math.PI / 5, 0.55, 1.1);
      heroSpot.position.set(0.05, 5.1, 0.3);
      heroSpot.target.position.set(0.05, 0.35, 0);
      scene.add(heroSpot, heroSpot.target);

      // Strong Team-Colored Rim / Backlight sculpting armor & shoulders
      const teamRimLight = new THREE.DirectionalLight(teamPrimaryHex, 2.6);
      teamRimLight.position.set(-2.8, 2.8, -3.4);
      scene.add(teamRimLight);

      // Pedestal Team Underglow / Uplight
      const pedestalGlowLight = new THREE.PointLight(teamPrimaryHex, 2.8, 6.5, 1.4);
      pedestalGlowLight.position.set(0.05, 0.45, 0.7);
      scene.add(pedestalGlowLight);

      // Secondary Atmospheric Fill reflecting selected map environment
      const backdropFillLight = new THREE.PointLight(mapAccentHex, 3.2, 18, 1.0);
      backdropFillLight.position.set(2.8, 2.8, -4.6);
      scene.add(backdropFillLight);

      // Subtle Volumetric Spotlight Cone framing operator
      const beamTex = createVolumetricBeamTexture();
      texturesToDispose.push(beamTex);
      const beamCone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 1.85, 5.4, 32, 1, true),
        new THREE.MeshBasicMaterial({
          map: beamTex,
          color: teamSecondaryHex,
          transparent: true,
          opacity: 0.11,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      beamCone.position.set(0.05, 2.95, 0.05);
      scene.add(beamCone);

      // ============================================================
      // 2. THEMED 3D BACKDROP (Gang Abandoned Warehouse OR SWAT Depot)
      // ============================================================
      const backdrop = buildLobbyBackdrop(selectedTeam, maxAniso);
      scene.add(backdrop.group);
      texturesToDispose.push(...backdrop.textures);

      // Subtle contact glow halo underneath pedestal
      const glowTex = createGlowDiscTexture(teamCss);
      texturesToDispose.push(glowTex);
      const floorGlowDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 4.8),
        new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          opacity: 0.36,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      floorGlowDisc.rotation.x = -Math.PI / 2;
      floorGlowDisc.position.set(0.05, 0.008, 0);
      scene.add(floorGlowDisc);

      // ============================================================
      // 3. MULTI-TIER HERO TACTICAL PEDESTAL (10+ Composite Parts)
      //    Exact top surface height = 0.34m
      // ============================================================
      const pedestalGroup = new THREE.Group();
      pedestalGroup.position.set(0.05, 0, 0);

      const darkArmorMetal = new THREE.MeshStandardMaterial({
        color: 0x151922,
        roughness: 0.4,
        metalness: 0.82
      });
      const brushedSteel = new THREE.MeshStandardMaterial({
        color: 0x353e4d,
        roughness: 0.3,
        metalness: 0.88
      });
      const emissiveTeamMat = new THREE.MeshStandardMaterial({
        color: teamPrimaryHex,
        emissive: teamPrimaryHex,
        emissiveIntensity: 2.2,
        roughness: 0.25,
        metalness: 0.2
      });

      // Tier 1: Wide Forged Plinth Base (y: 0 -> 0.12)
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.68, 0.12, 12), darkArmorMetal);
      plinth.position.y = 0.06;
      plinth.receiveShadow = true;
      plinth.castShadow = true;
      pedestalGroup.add(plinth);

      // Tier 2: Recessed Collar + Glowing Team Energy Ring (y: 0.12 -> 0.22)
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.24, 1.38, 0.1, 12), brushedSteel);
      collar.position.y = 0.17;
      collar.receiveShadow = true;
      pedestalGroup.add(collar);

      const outerGlowRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.028, 10, 48), emissiveTeamMat);
      outerGlowRing.rotation.x = Math.PI / 2;
      outerGlowRing.position.y = 0.215;
      pedestalGroup.add(outerGlowRing);

      // 8 Radial Heavy Steel Stabilizer Ribs around pedestal perimeter
      const ribGeo = new THREE.BoxGeometry(0.14, 0.2, 0.32);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rib = new THREE.Mesh(ribGeo, brushedSteel);
        rib.position.set(Math.sin(ang) * 1.36, 0.14, Math.cos(ang) * 1.36);
        rib.rotation.y = ang;
        rib.rotation.x = 0.22;
        rib.castShadow = true;
        rib.receiveShadow = true;
        pedestalGroup.add(rib);
      }

      // Tier 3: Main Showcase Turntable Deck (y: 0.22 -> 0.34)
      const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.12, 12), darkArmorMetal);
      upperDeck.position.y = 0.28;
      upperDeck.receiveShadow = true;
      upperDeck.castShadow = true;
      pedestalGroup.add(upperDeck);

      // Procedural High-Resolution Carbon Deck Plate (top flush at y = 0.341)
      const deckTex = createPedestalDeckTexture(teamCss);
      deckTex.anisotropy = maxAniso;
      texturesToDispose.push(deckTex);

      const deckPlate = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 24),
        new THREE.MeshStandardMaterial({
          map: deckTex,
          roughness: 0.42,
          metalness: 0.55,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        })
      );
      deckPlate.rotation.x = -Math.PI / 2;
      deckPlate.position.y = 0.341;
      deckPlate.receiveShadow = true;
      pedestalGroup.add(deckPlate);

      // Inner flush glowing perimeter ring
      const innerLedRing = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1.01, 48),
        new THREE.MeshBasicMaterial({
          color: teamPrimaryHex,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      innerLedRing.rotation.x = -Math.PI / 2;
      innerLedRing.position.y = 0.342;
      pedestalGroup.add(innerLedRing);

      // 12 Instanced Hex Anchor Bolts around Upper Rim
      const boltGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 6);
      const boltsMesh = new THREE.InstancedMesh(boltGeo, brushedSteel, 12);
      const dummyObj = new THREE.Object3D();
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        dummyObj.position.set(Math.cos(ang) * 1.05, 0.345, Math.sin(ang) * 1.05);
        dummyObj.rotation.set(0, -ang, 0);
        dummyObj.updateMatrix();
        boltsMesh.setMatrixAt(i, dummyObj.matrix);
      }
      boltsMesh.instanceMatrix.needsUpdate = true;
      boltsMesh.computeBoundingSphere();
      pedestalGroup.add(boltsMesh);

      scene.add(pedestalGroup);

      // ============================================================
      // 4. BATTLEFIELD WAR-DUST, ASH MOTES, EMBERS & LOW SMOKE
      // ============================================================
      const particleTex = createSoftParticleTexture();
      texturesToDispose.push(particleTex);

      // Layer A: Floating War Dust & Ash Motes
      const dustCount = 460;
      const dustPos = new Float32Array(dustCount * 3);
      const dustSpeeds = new Float32Array(dustCount * 3); // vx, vy, phase
      for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = (Math.random() - 0.5) * 15;
        dustPos[i * 3 + 1] = 0.15 + Math.random() * 5.2;
        dustPos[i * 3 + 2] = -10.5 + Math.random() * 13.0;
        dustSpeeds[i * 3] = 0.22 + Math.random() * 0.42;
        dustSpeeds[i * 3 + 1] = 0.05 + Math.random() * 0.14;
        dustSpeeds[i * 3 + 2] = Math.random() * Math.PI * 2;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      const dustMat = new THREE.PointsMaterial({
        map: particleTex,
        color: isGang ? 0xd9c2ad : 0xbdd8f1,
        size: 0.095,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true
      });
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      scene.add(dustPoints);

      // Layer B: Glowing Battlefield Embers rising in the background
      const emberCount = 140;
      const emberPos = new Float32Array(emberCount * 3);
      const emberSpeeds = new Float32Array(emberCount * 3);
      for (let i = 0; i < emberCount; i++) {
        emberPos[i * 3] = (Math.random() - 0.5) * 12;
        emberPos[i * 3 + 1] = Math.random() * 4.8;
        emberPos[i * 3 + 2] = -9.5 + Math.random() * 9.0;
        emberSpeeds[i * 3] = 0.18 + Math.random() * 0.35;
        emberSpeeds[i * 3 + 1] = 0.28 + Math.random() * 0.45;
        emberSpeeds[i * 3 + 2] = Math.random() * Math.PI * 2;
      }
      const emberGeo = new THREE.BufferGeometry();
      emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
      const emberMat = new THREE.PointsMaterial({
        map: particleTex,
        color: isGang ? 0xff7029 : 0x38bdf8,
        size: 0.075,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      });
      const emberPoints = new THREE.Points(emberGeo, emberMat);
      scene.add(emberPoints);

      // Layer C: Drifting Low Battleground Smoke Haze Planes
      const smokeTex = createSmokeCloudTexture();
      texturesToDispose.push(smokeTex);
      const smokeSprites: { mesh: THREE.Mesh; baseX: number; speed: number; phase: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const smokeMat = new THREE.MeshBasicMaterial({
          map: smokeTex,
          color: isGang ? 0x6b473a : 0x3b5978,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const smokePlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.5), smokeMat);
        const bx = -4.2 + i * 1.45;
        smokePlane.position.set(bx, 0.95 + (i % 3) * 0.35, -3.2 - (i % 4) * 1.65);
        scene.add(smokePlane);
        smokeSprites.push({
          mesh: smokePlane,
          baseX: bx,
          speed: 0.18 + (i % 3) * 0.08,
          phase: i * 1.3
        });
      }

      // ============================================================
      // 5. LIVE RIGGED 3D OPERATOR CHARACTER ON PEDESTAL
      // ============================================================
      const character: CharacterInstance = buildCharacter(selectedTeam, 'LobbyOperator');
      character.group.position.set(0.05, 0.34, 0);
      character.group.rotation.y = -0.28;
      scene.add(character.group);

      let mouseX = 0;
      let mouseY = 0;
      const onMouseMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('mousemove', onMouseMove);

      const onResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      let animId = 0;
      let lastT = performance.now();
      let elapsed = 0;

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
        if (disposed || !renderer) return;
        const t = now ?? performance.now();
        const dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;
        elapsed += dt;

        character.mixer.update(dt);
        character.group.rotation.y = -0.28 + Math.sin(elapsed * 0.45) * 0.08 + mouseX * 0.14;

        // Subtle pulse on team underglow light
        pedestalGlowLight.intensity = 3.0 + Math.sin(elapsed * 2.1) * 0.35;

        // Animate war dust motes (zero GC)
        const dArr = dustGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < dustCount; i++) {
          const idx = i * 3;
          const vx = dustSpeeds[idx];
          const vy = dustSpeeds[idx + 1];
          const ph = dustSpeeds[idx + 2];
          dArr[idx] += vx * dt;
          dArr[idx + 1] += (vy + Math.sin(elapsed * 1.1 + ph) * 0.08) * dt;
          if (dArr[idx] > 7.5) dArr[idx] = -7.5;
          if (dArr[idx + 1] > 5.4) dArr[idx + 1] = 0.15;
        }
        dustGeo.attributes.position.needsUpdate = true;

        // Animate rising glowing embers
        const eArr = emberGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < emberCount; i++) {
          const idx = i * 3;
          const vx = emberSpeeds[idx];
          const vy = emberSpeeds[idx + 1];
          const ph = emberSpeeds[idx + 2];
          eArr[idx] += (vx + Math.sin(elapsed * 2.2 + ph) * 0.16) * dt;
          eArr[idx + 1] += vy * dt;
          if (eArr[idx] > 6.0) eArr[idx] = -6.0;
          if (eArr[idx + 1] > 4.9) {
            eArr[idx + 1] = 0.05;
            eArr[idx] = (Math.random() - 0.5) * 11;
          }
        }
        emberGeo.attributes.position.needsUpdate = true;

        // Drift ground war-smoke haze gently
        for (const s of smokeSprites) {
          s.mesh.position.x = s.baseX + Math.sin(elapsed * s.speed + s.phase) * 1.15;
        }

        // Smooth camera parallax
        camera.position.x = THREE.MathUtils.damp(camera.position.x, baseCamPos.x + mouseX * 0.16, 4.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, baseCamPos.y - mouseY * 0.08, 4.5, dt);
        camera.lookAt(baseLookAt);

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
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        backdrop.disposeExtras();
        texturesToDispose.forEach((tex) => tex.dispose());
        if (renderer) {
          renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
          renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
          const disposedGeos = new Set<THREE.BufferGeometry>();
          const disposedMats = new Set<THREE.Material>();
          scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh | THREE.Points;
            if ((mesh as THREE.Mesh).isMesh || (mesh as THREE.Points).isPoints) {
              if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
                mesh.geometry.dispose();
                disposedGeos.add(mesh.geometry);
              }
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mt of mats) {
                if (mt && !disposedMats.has(mt)) {
                  mt.dispose();
                  disposedMats.add(mt);
                }
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
  }, [selectedTeam, selectedMap]);

  if (contextFailed) {
    return <div className="absolute inset-0 bg-[#0b0d11] pointer-events-none" />;
  }

  return <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};
