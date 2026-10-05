import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { useAppStore } from '../store';
import { SurfaceData } from '../types';
import { createTerrainGeometry, computeNormal, computeSlopeDeg } from '../lib/terrain';
import { viridis, slopeColormap, errorColormap } from '../lib/colormaps';

interface TerrainMeshProps {
  surface: SurfaceData;
}

export const TerrainMesh: React.FC<TerrainMeshProps> = ({ surface }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry | null>(null);

  const dataset = useAppStore(state => state.dataset);
  const activeLayer = useAppStore(state => state.activeLayer);
  const exaggeration = useAppStore(state => state.exaggeration);
  const wallShading = useAppStore(state => state.wallShading);
  const meshDetail = useAppStore(state => state.meshDetail);
  const grayscaleInvert = useAppStore(state => state.grayscaleInvert);
  const validationReference = useAppStore(state => state.validationReference);

  const stride = meshDetail === 'half' ? 2 : 1;

  // Load RGB texture
  const texture = useLoader(
    THREE.TextureLoader,
    dataset?.rgb_texture_url || ''
  );

  useEffect(() => {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
    }
  }, [texture]);

  // Build base geometry when dimensions or stride change
  const geometry = useMemo(() => {
    const geom = createTerrainGeometry(surface.width, surface.height, surface.pixel_size_m, stride);
    geomRef.current = geom;
    return geom;
  }, [surface.width, surface.height, surface.pixel_size_m, stride]);

  // Update heights (Y) and normals when exaggeration, smoothing, or surface field changes
  useEffect(() => {
    if (!geometry) return;

    const { width, height, field, baseline, pixel_size_m } = surface;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;

    const pos = posAttr.array as Float32Array;
    const norms = normAttr.array as Float32Array;

    const cols = Math.floor((width - 1) / stride) + 1;
    const rows = Math.floor((height - 1) / stride) + 1;

    let vIdx = 0;
    for (let r = 0; r < rows; r++) {
      const origR = Math.min(r * stride, height - 1);
      for (let c = 0; c < cols; c++) {
        const origC = Math.min(c * stride, width - 1);

        const elev = field[origR * width + origC];
        pos[vIdx * 3 + 1] = (elev - baseline) * exaggeration;

        const [nx, ny, nz] = computeNormal(
          field,
          width,
          height,
          origC,
          origR,
          pixel_size_m,
          exaggeration
        );
        norms[vIdx * 3] = nx;
        norms[vIdx * 3 + 1] = ny;
        norms[vIdx * 3 + 2] = nz;

        vIdx++;
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }, [geometry, surface, exaggeration, stride]);

  // Update vertex colors depending on active layer (RGB wall shading / Height / Slope / Error)
  useEffect(() => {
    if (!geometry) return;

    const { width, height, field, min_elevation, max_elevation, pixel_size_m } = surface;
    const vertexCount = geometry.getAttribute('position').count;

    let colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr || colorAttr.count !== vertexCount) {
      colorAttr = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
      geometry.setAttribute('color', colorAttr);
    }

    const colors = colorAttr.array as Float32Array;
    const cols = Math.floor((width - 1) / stride) + 1;
    const rows = Math.floor((height - 1) / stride) + 1;
    const range = Math.max(1, max_elevation - min_elevation);

    let vIdx = 0;
    for (let r = 0; r < rows; r++) {
      const origR = Math.min(r * stride, height - 1);
      for (let c = 0; c < cols; c++) {
        const origC = Math.min(c * stride, width - 1);
        const idx = origR * width + origC;
        const elev = field[idx];

        let cr = 1;
        let cg = 1;
        let cb = 1;

        if (activeLayer === 'rgb') {
          // Wall shading: steep faces darkened to counter top-down stretch
          if (wallShading) {
            const slope = computeSlopeDeg(field, width, height, origC, origR, pixel_size_m);
            if (slope > 40) {
              const darkenFactor = Math.max(0.35, 1.0 - ((slope - 40) / 50) * 0.65);
              cr = darkenFactor;
              cg = darkenFactor;
              cb = darkenFactor;
            }
          }
        } else if (activeLayer === 'height') {
          const t = (elev - min_elevation) / range;
          [cr, cg, cb] = viridis(t);
        } else if (activeLayer === 'slope') {
          const slope = computeSlopeDeg(field, width, height, origC, origR, pixel_size_m);
          [cr, cg, cb] = slopeColormap(slope, 60);
        } else if (activeLayer === 'grayscale') {
          let t = (elev - min_elevation) / range;
          t = Math.max(0, Math.min(1, t));
          if (grayscaleInvert) {
            t = 1 - t;
          }
          cr = t;
          cg = t;
          cb = t;
        } else if (activeLayer === 'error' && validationReference) {
          const err = validationReference.metrics.errorMap[idx] || 0;
          [cr, cg, cb] = errorColormap(err, validationReference.metrics.p95Error);
        }

        colors[vIdx * 3] = cr;
        colors[vIdx * 3 + 1] = cg;
        colors[vIdx * 3 + 2] = cb;
        vIdx++;
      }
    }

    colorAttr.needsUpdate = true;
  }, [geometry, surface, activeLayer, wallShading, grayscaleInvert, validationReference, stride]);

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        map={activeLayer === 'rgb' ? texture : null}
        vertexColors={true}
        roughness={0.7}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
