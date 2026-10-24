'use client';

import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

export type MascotMood = 'idle' | 'listening' | 'happy' | 'thinking' | 'oops';

const MOOD_LABEL: Record<MascotMood, string> = {
  idle: 'Hi Kiyan! Tap the mic and ask me a math question!',
  listening: 'I am listening...',
  happy: 'YES! You did it!',
  thinking: 'Hmm, let me think...',
  oops: 'Oops! Try again, buddy!',
};

interface MascotProps {
  mood: MascotMood;
}

/**
 * Friendly animated robot mascot for Kiyan.
 * - idle: gentle bobbing
 * - listening: pulsing glow + faster bob
 * - happy: bouncing + spinning antenna
 * - thinking: subtle tilt
 * - oops: shake side to side
 */
export function Mascot({ mood }: MascotProps) {
  const moodColor =
    mood === 'listening'
      ? '#ef4444'
      : mood === 'happy'
      ? '#22c55e'
      : mood === 'oops'
      ? '#f97316'
      : mood === 'thinking'
      ? '#a855f7'
      : '#10b981';

  const bobAnimation = {
    idle: { y: [0, -8, 0] },
    listening: { y: [0, -12, 0] },
    happy: { y: [0, -30, 0], rotate: [0, -8, 8, 0] },
    thinking: { y: [0, -4, 0], rotate: [0, -3, 3, 0] },
    oops: { x: [0, -10, 10, -10, 10, 0] },
  };

  const transition = {
    idle: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const },
    listening: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' as const },
    happy: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' as const },
    thinking: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' as const },
    oops: { duration: 0.5, repeat: 0 },
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="relative">
        {/* Glow ring behind the robot when listening/happy */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full blur-2xl"
          animate={{
            opacity: mood === 'listening' ? [0.4, 0.8, 0.4] : mood === 'happy' ? [0.6, 1, 0.6] : 0.3,
            scale: mood === 'listening' ? [1, 1.15, 1] : mood === 'happy' ? [1, 1.3, 1] : 1,
          }}
          transition={{
            duration: mood === 'listening' ? 0.8 : mood === 'happy' ? 0.5 : 1.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ backgroundColor: moodColor }}
        />
        <motion.div
          animate={bobAnimation[mood]}
          transition={transition[mood]}
          className="relative"
        >
          {/* Antenna */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 -top-5 w-1.5 h-5 rounded-full"
            style={{ backgroundColor: moodColor }}
            animate={{
              rotate: mood === 'happy' ? [0, 25, -25, 0] : mood === 'listening' ? [0, 8, -8, 0] : 0,
            }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.div
              className="absolute -top-1.5 -left-1 w-4 h-4 rounded-full"
              style={{ backgroundColor: moodColor }}
              animate={{ scale: mood === 'listening' ? [1, 1.4, 1] : 1 }}
              transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          <Bot
            className="relative drop-shadow-lg"
            size={140}
            color={moodColor}
            strokeWidth={2.2}
          />
        </motion.div>
      </div>

      <motion.div
        key={mood}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur px-5 py-2.5 rounded-full text-base md:text-lg font-extrabold text-purple-700 shadow-md border-2 border-purple-200 max-w-xs text-center"
      >
        {MOOD_LABEL[mood]}
      </motion.div>
    </div>
  );
}
