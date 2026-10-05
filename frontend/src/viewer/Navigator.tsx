import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useAppStore } from '../store';
import { SurfaceData } from '../types';
import { sampleBilinear, raycastTerrain, computeSlopeDeg } from '../lib/terrain';
import { createProbePoint } from '../lib/probe';
import { bus } from '../bus';
import { rt } from './runtime';

interface NavigatorProps {
  surface: SurfaceData;
}

export const Navigator: React.FC<NavigatorProps> = ({ surface }) => {
  const { camera, gl, scene } = useThree();

  const dataset = useAppStore(state => state.dataset);
  const flySpeed = useAppStore(state => state.flySpeed);
  const setFlySpeed = useAppStore(state => state.setFlySpeed);
  const navMode = useAppStore(state => state.navMode);
  const setNavMode = useAppStore(state => state.setNavMode);
  const eyeHeight = useAppStore(state => state.eyeHeight);
  const exaggeration = useAppStore(state => state.exaggeration);
  const tourActive = useAppStore(state => state.tourActive);
  const setTourActive = useAppStore(state => state.setTourActive);
  const pointerLocked = useAppStore(state => state.pointerLocked);
  const setPointerLocked = useAppStore(state => state.setPointerLocked);

  const probeA = useAppStore(state => state.probeA);
  const probeB = useAppStore(state => state.probeB);
  const setProbeA = useAppStore(state => state.setProbeA);
  const setProbeB = useAppStore(state => state.setProbeB);

  // Velocity & rotation state
  const velocity = useRef(new THREE.Vector3());
  const keys = useRef<{ [k: string]: boolean }>({});
  const yaw = useRef(0);
  const pitch = useRef(-0.35);
  const isDragging = useRef(false);
  const lastMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tourAngle = useRef(0);
  const frameCount = useRef(0);

  // Sync scene/camera to runtime for screenshots
  useEffect(() => {
    rt.glRenderer = gl;
    rt.glScene = scene;
    rt.glCamera = camera;
  }, [gl, scene, camera]);

  // Initial camera position overview
  const resetCamera = () => {
    const extent = Math.max(surface.width, surface.height) * surface.pixel_size_m;
    camera.position.set(0, extent * 0.45, extent * 0.65);
    yaw.current = 0;
    pitch.current = -0.45;
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    velocity.current.set(0, 0, 0);
  };

  const datasetFilenameRef = useRef<string | null>(null);

  useEffect(() => {
    if (dataset && datasetFilenameRef.current !== dataset.filename) {
      datasetFilenameRef.current = dataset.filename;
      resetCamera();
    }
  }, [dataset]);

  // Event bus bindings
  useEffect(() => {
    const unReset = bus.on('resetCamera', resetCamera);
    const unTeleport = bus.on('teleport', (data: { worldX: number; worldZ: number }) => {
      const gCol = data.worldX / surface.pixel_size_m + (surface.width - 1) / 2;
      const gRow = data.worldZ / surface.pixel_size_m + (surface.height - 1) / 2;
      const gElev = sampleBilinear(surface.field, surface.width, surface.height, gCol, gRow);
      const groundY = (gElev - surface.baseline) * exaggeration;

      camera.position.x = data.worldX;
      camera.position.z = data.worldZ;
      camera.position.y = navMode === 'walk' ? groundY + eyeHeight : groundY + 30;
      velocity.current.set(0, 0, 0);
    });

    const unTour = bus.on('toggleTour', () => {
      setTourActive(!tourActive);
    });

    return () => {
      unReset();
      unTeleport();
      unTour();
    };
  }, [surface, exaggeration, navMode, eyeHeight, tourActive]);

  // Pointer lock handling
  useEffect(() => {
    const handleLockChange = () => {
      const isLocked = document.pointerLockElement === gl.domElement;
      setPointerLocked(isLocked);
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
    };
  }, [gl, setPointerLocked]);

  // Mouse move & keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;

      // Any movement key stops tour
      if (tourActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(e.code)) {
        setTourActive(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) {
        if (tourActive) setTourActive(false);
        const sens = 0.0022;
        yaw.current -= e.movementX * sens;
        pitch.current -= e.movementY * sens;
        pitch.current = Math.max(-1.5, Math.min(1.5, pitch.current));
        camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
      } else if (isDragging.current) {
        if (tourActive) setTourActive(false);
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        const sens = 0.004;
        yaw.current -= dx * sens;
        pitch.current -= dy * sens;
        pitch.current = Math.max(-1.5, Math.min(1.5, pitch.current));
        camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      // ONLY start 3D drag if clicking directly on the WebGL canvas, never when clicking UI sliders/buttons!
      if (e.button === 0 && document.pointerLockElement !== gl.domElement && e.target === gl.domElement) {
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setFlySpeed(Math.max(5, Math.min(350, flySpeed * factor)));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    gl.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    gl.domElement.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      gl.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      gl.domElement.removeEventListener('wheel', onWheel);
    };
  }, [gl, flySpeed, setFlySpeed, tourActive, setTourActive, camera]);

  // Drop probe at crosshair helper
  const dropProbeAtCrosshair = () => {
    if (!dataset) return;
    const rayDir = new THREE.Vector3();
    camera.getWorldDirection(rayDir);

    const hit = raycastTerrain(
      camera.position,
      rayDir,
      surface.field,
      surface.baseline,
      exaggeration,
      surface.width,
      surface.height,
      surface.pixel_size_m
    );

    if (hit) {
      const probe = createProbePoint(
        dataset,
        surface,
        hit.col,
        hit.row,
        hit.worldX,
        hit.worldZ
      );

      if (!probeA || (probeA && probeB)) {
        setProbeA(probe);
        setProbeB(null);
      } else {
        setProbeB(probe);
      }
    }
  };

  // Click terrain picking: ONLY in Capture (F) mode with crosshair to avoid accidental clicks while dragging
  useEffect(() => {
    const handleCanvasClick = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      dropProbeAtCrosshair();
    };

    const unDropPin = bus.on('dropPinAtCrosshair', dropProbeAtCrosshair);
    gl.domElement.addEventListener('click', handleCanvasClick);

    return () => {
      unDropPin();
      gl.domElement.removeEventListener('click', handleCanvasClick);
    };
  }, [gl, camera, surface, exaggeration, dataset, probeA, probeB, setProbeA, setProbeB]);

  // Main 60fps frame loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    frameCount.current++;

    // Safety recovery if camera ever receives NaN
    if (isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z)) {
      resetCamera();
      return;
    }

    const extentX = ((surface.width - 1) * surface.pixel_size_m) / 2;
    const extentZ = ((surface.height - 1) * surface.pixel_size_m) / 2;

    if (tourActive) {
      // Automatic Orbit Tour mode
      const orbitRadius = Math.max(extentX, extentZ) * 1.35;
      tourAngle.current += 0.16 * dt;
      const tx = Math.sin(tourAngle.current) * orbitRadius;
      const tz = Math.cos(tourAngle.current) * orbitRadius;
      const ty = Math.max(extentX, extentZ) * 0.65;

      camera.position.set(tx, ty, tz);
      camera.lookAt(0, (surface.max_elevation - surface.baseline) * exaggeration * 0.3, 0);
    } else {
      // Manual Flight / Walk Movement
      const move = new THREE.Vector3();

      // Robust horizontal directions computed directly from yaw (cannot produce NaN)
      const sinY = Math.sin(yaw.current);
      const cosY = Math.cos(yaw.current);
      const forwardH = new THREE.Vector3(-sinY, 0, -cosY);
      const rightH = new THREE.Vector3(cosY, 0, -sinY);

      const forward3D = new THREE.Vector3();
      camera.getWorldDirection(forward3D);
      if (forward3D.lengthSq() < 1e-4) {
        forward3D.copy(forwardH);
      }

      const up = new THREE.Vector3(0, 1, 0);
      const boost = keys.current['ShiftLeft'] || keys.current['ShiftRight'] ? 3.0 : 1.0;
      const baseSpeed = navMode === 'walk' ? Math.min(25, flySpeed * 0.15) : flySpeed;
      const speed = baseSpeed * boost;

      if (navMode === 'walk') {
        if (keys.current['KeyW']) move.add(forwardH);
        if (keys.current['KeyS']) move.sub(forwardH);
        if (keys.current['KeyD']) move.add(rightH);
        if (keys.current['KeyA']) move.sub(rightH);
      } else {
        if (keys.current['KeyW']) move.add(forward3D);
        if (keys.current['KeyS']) move.sub(forward3D);
        if (keys.current['KeyD']) move.add(rightH);
        if (keys.current['KeyA']) move.sub(rightH);
        if (keys.current['Space'] || keys.current['KeyE']) move.add(up);
        if (keys.current['KeyQ']) move.sub(up);
      }

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
      }

      // Smooth exponential velocity damping
      const damping = Math.exp(-12 * dt);
      velocity.current.lerp(move, 1 - damping);
      camera.position.addScaledVector(velocity.current, dt);

      // Clamp horizontal bounds within 30% margin
      const margin = 1.3;
      camera.position.x = Math.max(-extentX * margin, Math.min(extentX * margin, camera.position.x));
      camera.position.z = Math.max(-extentZ * margin, Math.min(extentZ * margin, camera.position.z));

      // Terrain elevation and ground clamping
      const gCol = camera.position.x / surface.pixel_size_m + (surface.width - 1) / 2;
      const gRow = camera.position.z / surface.pixel_size_m + (surface.height - 1) / 2;
      const gElev = sampleBilinear(surface.field, surface.width, surface.height, gCol, gRow);
      const groundY = (gElev - surface.baseline) * exaggeration;

      if (navMode === 'walk') {
        // If switching from high flight, quickly descend near ground
        if (camera.position.y > groundY + 30) {
          camera.position.y = groundY + eyeHeight + 5;
          velocity.current.set(0, 0, 0);
        }
        const targetY = groundY + eyeHeight;
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 1 - Math.exp(-14 * dt));
      } else {
        // Fly mode ground floor
        if (camera.position.y < groundY + 1.5) {
          camera.position.y = groundY + 1.5;
        }
      }
    }

    // Crosshair ray-marching readout every 3rd frame
    let crosshairHit = rt.crosshair;
    if (frameCount.current % 3 === 0) {
      const rayDir = new THREE.Vector3();
      camera.getWorldDirection(rayDir);
      const hit = raycastTerrain(
        camera.position,
        rayDir,
        surface.field,
        surface.baseline,
        exaggeration,
        surface.width,
        surface.height,
        surface.pixel_size_m
      );

      if (hit) {
        const slope = computeSlopeDeg(surface.field, surface.width, surface.height, hit.col, hit.row, surface.pixel_size_m);
        crosshairHit = {
          active: true,
          height: hit.height,
          slopeDeg: slope,
          distance: hit.distance,
          worldX: hit.worldX,
          worldY: hit.worldY,
          worldZ: hit.worldZ,
        };
      } else {
        crosshairHit = null;
      }
    }

    // Telemetry updates
    const gCol = camera.position.x / surface.pixel_size_m + (surface.width - 1) / 2;
    const gRow = camera.position.z / surface.pixel_size_m + (surface.height - 1) / 2;
    const groundElev = sampleBilinear(surface.field, surface.width, surface.height, gCol, gRow);
    const camElevASL = surface.baseline + camera.position.y / Math.max(0.1, exaggeration);

    rt.updateTelemetry(
      {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        elevationASL: camElevASL,
        groundHeight: groundElev,
        altitudeAGL: Math.max(0, camElevASL - groundElev),
        yawDeg: (yaw.current * 180) / Math.PI,
        pitchDeg: (pitch.current * 180) / Math.PI,
        speed: velocity.current.length(),
      },
      crosshairHit
    );
  });

  return null;
};
