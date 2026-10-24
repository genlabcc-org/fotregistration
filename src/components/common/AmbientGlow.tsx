import React, { useEffect, useState } from 'react';

export const AmbientGlow: React.FC = () => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only activate on pointer devices (not touch screens)
    if (typeof window === 'undefined' || window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[120px] transition-transform duration-100 ease-out"
        style={{
          transform: `translate3d(${position.x - 250}px, ${position.y - 250}px, 0)`,
          background:
            'radial-gradient(circle, rgba(194, 230, 0, 0.08) 0%, rgba(212, 175, 55, 0.04) 40%, transparent 70%)',
        }}
      />
    </div>
  );
};
