'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = [
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#a855f7', // purple-500
  '#22c55e', // green-500
  '#fde047', // yellow-300
];

interface Piece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  shape: 'circle' | 'square' | 'star';
  rotate: number;
}

export function Confetti({ run }: { run: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (run === 0) return;
    const count = 80;
    const next: Piece[] = Array.from({ length: count }).map((_, i) => ({
      id: run * 1000 + i,
      x: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 8 + Math.random() * 12,
      shape: (['circle', 'square', 'star'] as const)[Math.floor(Math.random() * 3)],
      rotate: Math.random() * 360,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(t);
  }, [run]);

  const _stars = useMemo(() => '★★★★★★', []);
  void _stars;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {pieces.map((p) => (
          <motion.div
            key={p.id}
            initial={{ y: -60, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
            animate={{
              y: '110vh',
              opacity: [1, 1, 0.9, 0],
              rotate: p.rotate,
              x: `${p.x + (Math.random() - 0.5) * 12}vw`,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: 'easeIn',
            }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              fontSize: p.size,
              color: p.color,
              backgroundColor:
                p.shape === 'circle' ? p.color : p.shape === 'square' ? p.color : 'transparent',
              borderRadius: p.shape === 'circle' ? '9999px' : p.shape === 'square' ? 4 : 0,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
            }}
          >
            {p.shape === 'star' ? '★' : ''}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
