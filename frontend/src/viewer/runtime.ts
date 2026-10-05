import * as THREE from 'three';
import { SurfaceData } from '../types';

export interface CrosshairInfo {
  active: boolean;
  height: number;
  slopeDeg: number;
  distance: number;
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface Telemetry {
  x: number;
  y: number;
  z: number;
  elevationASL: number;
  groundHeight: number;
  altitudeAGL: number;
  yawDeg: number;
  pitchDeg: number;
  speed: number;
}

class ViewerRuntime {
  cameraPos = new THREE.Vector3(0, 50, 100);
  cameraRot = new THREE.Euler(0, 0, 0, 'YXZ');
  cameraYaw = 0;
  cameraPitch = -0.3;

  currentSurface: SurfaceData | null = null;
  glRenderer: THREE.WebGLRenderer | null = null;
  glScene: THREE.Scene | null = null;
  glCamera: THREE.Camera | null = null;

  telemetry: Telemetry = {
    x: 0,
    y: 50,
    z: 100,
    elevationASL: 50,
    groundHeight: 0,
    altitudeAGL: 50,
    yawDeg: 0,
    pitchDeg: -17,
    speed: 0,
  };

  crosshair: CrosshairInfo | null = null;
  onTelemetryUpdate: ((t: Telemetry, c: CrosshairInfo | null) => void) | null = null;

  updateTelemetry(t: Partial<Telemetry>, c: CrosshairInfo | null = null) {
    Object.assign(this.telemetry, t);
    this.crosshair = c;
    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(this.telemetry, this.crosshair);
    }
  }

  takeScreenshot(): string | null {
    if (!this.glRenderer || !this.glScene || !this.glCamera) return null;
    this.glRenderer.render(this.glScene, this.glCamera);
    return this.glRenderer.domElement.toDataURL('image/png');
  }
}

export const rt = new ViewerRuntime();
