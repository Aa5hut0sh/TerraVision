import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { SurfaceData } from '../types';
import { bus } from '../bus';
import { rt } from './runtime';

interface MinimapProps {
  surface: SurfaceData;
}

export const Minimap: React.FC<MinimapProps> = ({ surface }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataset = useAppStore(state => state.dataset);
  const probeA = useAppStore(state => state.probeA);
  const probeB = useAppStore(state => state.probeB);
  const minimapVisible = useAppStore(state => state.minimapVisible);

  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (dataset?.rgb_texture_url) {
      const img = new Image();
      img.src = dataset.rgb_texture_url;
      img.onload = () => {
        imgRef.current = img;
      };
    }
  }, [dataset?.rgb_texture_url]);

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      ctx.clearRect(0, 0, size, size);

      // 1. Draw RGB image or terrain base
      if (imgRef.current && imgRef.current.complete) {
        ctx.drawImage(imgRef.current, 0, 0, size, size);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, size, size);
      }

      // Border and grid
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();

      const halfW = ((surface.width - 1) * surface.pixel_size_m) / 2;
      const halfH = ((surface.height - 1) * surface.pixel_size_m) / 2;

      const toCanvasX = (wx: number) => ((wx + halfW) / (2 * halfW)) * size;
      const toCanvasY = (wz: number) => ((wz + halfH) / (2 * halfH)) * size;

      // 2. Draw Probe markers
      if (probeA) {
        const ax = toCanvasX(probeA.worldX);
        const ay = toCanvasY(probeA.worldZ);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (probeB) {
        const bx = toCanvasX(probeB.worldX);
        const by = toCanvasY(probeB.worldZ);
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 3. Draw Camera position & View Frustum Cone
      const cx = toCanvasX(rt.telemetry.x);
      const cy = toCanvasY(rt.telemetry.z);
      const yawRad = (rt.telemetry.yawDeg * Math.PI) / 180;

      // Draw camera vision cone
      const coneLen = 18;
      const coneFov = 0.5; // ~30 deg half-angle
      const leftAngle = yawRad - Math.PI / 2 - coneFov;
      const rightAngle = yawRad - Math.PI / 2 + coneFov;

      ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - Math.sin(leftAngle) * coneLen, cy - Math.cos(leftAngle) * coneLen);
      ctx.lineTo(cx - Math.sin(rightAngle) * coneLen, cy - Math.cos(rightAngle) * coneLen);
      ctx.closePath();
      ctx.fill();

      // Camera dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [surface, probeA, probeB]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const size = canvas.width;
    const halfW = ((surface.width - 1) * surface.pixel_size_m) / 2;
    const halfH = ((surface.height - 1) * surface.pixel_size_m) / 2;

    const wx = (clickX / size) * (2 * halfW) - halfW;
    const wz = (clickY / size) * (2 * halfH) - halfH;

    bus.emit('teleport', { worldX: wx, worldZ: wz });
  };

  if (!minimapVisible) return null;

  return (
    <div className="absolute bottom-16 right-5 bg-white brutal-border brutal-shadow-sm p-1.5 z-20">
      <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase mb-1 px-0.5">
        <span className="text-zinc-700">Minimap</span>
        <span className="text-zinc-400">Click to warp</span>
      </div>
      <canvas
        ref={canvasRef}
        width={140}
        height={140}
        onClick={handleClick}
        className="brutal-border-sm cursor-crosshair block"
      />
    </div>
  );
};
