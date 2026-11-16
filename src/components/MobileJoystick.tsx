import React, { useRef, useState } from 'react';

interface MobileJoystickProps {
  onVectorChange: (vec: { dx: number; dy: number }) => void;
}

export const MobileJoystick: React.FC<MobileJoystickProps> = ({ onVectorChange }) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);
  const maxRadius = 34;

  const updateFromClientPos = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnob({ x: dx, y: dy });
    onVectorChange({
      dx: dist > 4 ? dx / maxRadius : 0,
      dy: dist > 4 ? dy / maxRadius : 0,
    });
  };

  const reset = () => {
    activePointerId.current = null;
    setKnob({ x: 0, y: 0 });
    onVectorChange({ dx: 0, dy: 0 });
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        activePointerId.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        updateFromClientPos(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        updateFromClientPos(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerId.current === e.pointerId) reset();
      }}
      onPointerCancel={(e) => {
        if (activePointerId.current === e.pointerId) reset();
      }}
      style={{ touchAction: 'none' }}
      className="relative w-24 h-24 rounded-full bg-white/80 backdrop-blur-md border border-zinc-300/80 shadow-lg flex items-center justify-center select-none"
      aria-label="虚拟方向摇杆"
    >
      <div className="absolute inset-3 rounded-full border border-dashed border-zinc-300 pointer-events-none" />
      <div
        style={{
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
        className="w-10 h-10 rounded-full bg-[#FF5A36] border-2 border-zinc-900 shadow-md pointer-events-none transition-transform duration-75"
      />
    </div>
  );
};
