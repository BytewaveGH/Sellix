'use client'

import React, { useMemo } from 'react'

// Bright, cheerful pieces (the amusement palette).
const COLORS = ['#7C3AED', '#F472B6', '#22D3EE', '#FACC15', '#FB923C', '#34D399', '#60A5FA', '#F87171']

// A short burst of confetti, no libraries.
export const Confetti = ({ burst }: { burst: number }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        duration: 1.6 + Math.random() * 1.4,
        rotate: Math.random() * 720,
        drift: (Math.random() - 0.5) * 30,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    // A new set for each win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst]
  )
  if (!burst) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={`${burst}-${i}`}
          className="absolute top-[-20px] rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
            ['--drift' as string]: `${p.drift}vw`,
            ['--spin' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
      <style>{`@keyframes confetti-fall { to { transform: translate(var(--drift), 110vh) rotate(var(--spin)); opacity: .9 } }`}</style>
    </div>
  )
}
