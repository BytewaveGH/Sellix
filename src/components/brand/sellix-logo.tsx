// The Sellix logo: the mark (the same art as the favicon) and the wordmark,
// set in the mark's own gradient — magenta → violet → blue → cyan.

import React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import mark from '@/assets/images/sellix-mark.png'

// Sampled from the mark, left to right.
export const SELLIX_GRADIENT = 'linear-gradient(100deg, #d42cf2 0%, #7c3aed 30%, #3b3ff5 58%, #1e8cf5 80%, #10d0f0 100%)'

export const SellixMark = ({ size = 40, className }: { size?: number; className?: string }) => (
  <Image src={mark} alt="" width={size} height={size} className={cn('flex-shrink-0 select-none', className)} priority />
)

export const SellixLogo = ({
  size = 40,
  tagline,
  tone = 'gradient',
  className,
}: {
  // Height of the mark in px; the wordmark scales with it.
  size?: number
  // Small line under the wordmark, e.g. "Business suite".
  tagline?: string
  // 'white' for dark backgrounds, where the gradient loses contrast.
  tone?: 'gradient' | 'white'
  className?: string
}) => (
  <span className={cn('inline-flex items-center', className)} style={{ gap: size * 0.22 }} role="img" aria-label="Sellix">
    <SellixMark size={size} />
    <span className="flex flex-col leading-none" aria-hidden>
      <span
        className="font-mulish font-black lowercase"
        style={{
          fontSize: size * 0.78,
          letterSpacing: '-0.045em',
          ...(tone === 'white'
            ? { color: '#ffffff' }
            : { backgroundImage: SELLIX_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
          // Room for the descender-free word inside the clip box.
          paddingBottom: size * 0.04,
        }}
      >
        sellix
      </span>
      {tagline && (
        <span
          className={cn('font-mulish font-bold uppercase', tone === 'white' ? 'text-white/60' : 'text-stone-400')}
          style={{ fontSize: Math.max(9, size * 0.2), letterSpacing: '0.22em', marginTop: size * 0.06 }}
        >
          {tagline}
        </span>
      )}
    </span>
  </span>
)
