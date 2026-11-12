import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCharacter, CharacterInstance } from '../game/character/CharacterBuilder';

interface MenuShowcase3DProps {
  selectedTeam: 'gang' | 'swat';
  selectedMap: 'dust' | 'factory';
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
      }

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false
      });
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
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

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c0e13);
      scene.fog = new THREE.FogExp2(0x0c0e13, 0.065);

      pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.dispose();

      const camera = new THREE.PerspectiveCamera(
        38,
        (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
        0.1,
        80
      );
      // Frame operator slightly right-of-center so the left diagonal rail stays clear
      const baseCamPos = new THREE.Vector3(-0.75, 1.55, 4.15);
      const baseLookAt = new THREE.Vector3(-0.45, 1.15, 0);
      camera.position.copy(baseCamPos);
      camera.lookAt(baseLookAt);

      // Tactical Three-Point Lighting
      const ambient = new THREE.AmbientLight(0xdbeafe, 0.45);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.0);
      keyLight.position.set(2.5, 5.2, 4.0);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
      }
      scene.add(keyLight);

      const rimColor = selectedMap === 'dust' ? 0xe05d2c : 0x3b82f6;
      const rimLight = new THREE.DirectionalLight(rimColor, 2.2);
      rimLight.position.set(-3.2, 3.0, -3.5);
      scene.add(rimLight);

      const fillLight = new THREE.PointLight(0x94a3b8, 1.4, 12);
      fillLight.position.set(2.2, 1.6, 2.5);
      scene.add(fillLight);

      // Matte Concrete Tactical Hangar Floor
      const floorGeo = new THREE.PlaneGeometry(32, 32);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x13161c,
        roughness: 0.88,
        metalness: 0.12
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const grid = new THREE.GridHelper(24, 24, 0x2c323d, 0x1a1e26);
      grid.position.y = 0.004;
      scene.add(grid);

      // Angular Tactical Steel Pedestal
      const pedestalGroup = new THREE.Group();
      const baseGeo = new THREE.CylinderGeometry(1.05, 1.18, 0.14, 8);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1d222b,
        roughness: 0.45,
        metalness: 0.72
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.07;
      baseMesh.receiveShadow = true;
      pedestalGroup.add(baseMesh);

      const trimGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.03, 8);
      const trimMat = new THREE.MeshStandardMaterial({
        color: selectedTeam === 'gang' ? 0xe03c1f : 0x38bdf8,
        roughness: 0.35,
        metalness: 0.4
      });
      const trimMesh = new THREE.Mesh(trimGeo, trimMat);
      trimMesh.position.y = 0.15;
      pedestalGroup.add(trimMesh);
      scene.add(pedestalGroup);

      // Diagonal Steel Girders & Architectural Crates in Background (echoing wireframe slash geometry)
      const beamMat = new THREE.MeshStandardMaterial({
        color: 0x191d25,
        roughness: 0.65,
        metalness: 0.55
      });
      const beamOffsets = [-3.2, -0.4, 2.6];
      beamOffsets.forEach((bx, idx) => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 9.5, 0.18), beamMat);
        beam.position.set(bx, 3.2, -3.5 - idx * 0.9);
        beam.rotation.z = -0.48;
        scene.add(beam);
      });

      // Background tactical cover crates
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x20252f, roughness: 0.75, metalness: 0.25 });
      const crate1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), crateMat);
      crate1.position.set(2.3, 0.55, -2.4);
      crate1.rotation.y = 0.35;
      scene.add(crate1);

      const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.9), crateMat);
      crate2.position.set(3.2, 0.95, -3.1);
      crate2.rotation.y = -0.2;
      scene.add(crate2);

      // Live Rigged 3D Soldier Character
      const character: CharacterInstance = buildCharacter(selectedTeam, 'LobbyOperator');
      character.group.position.set(0.05, 0.16, 0);
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
        character.group.rotation.y = -0.28 + Math.sin(elapsed * 0.45) * 0.08 + mouseX * 0.12;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, baseCamPos.x + mouseX * 0.16, 0.06);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, baseCamPos.y - mouseY * 0.08, 0.06);
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
  }, [selectedTeam, selectedMap]);

  if (contextFailed) {
    return (
      <div className="absolute inset-0 bg-[#0b0d11] pointer-events-none" />
    );
  }

  return <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};
