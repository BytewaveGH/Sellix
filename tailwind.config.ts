import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'
import { PluginAPI } from 'tailwindcss/types/config'
import { themeColors } from './src/lib/theme/palette'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mulish: ['var(--font-mulish)'],
      },
      fontWeight: {
        'mulish-extra-light': '200',
        'mulish-light': '300',
        'mulish-regular': '400',
        'mulish-semi-bold': '600',
        'mulish-bold': '700',
        'mulish-extra-bold': '800',
        'mulish-black': '900',
      },
      // Every palette colour reads a CSS variable that flips in dark mode
      // (src/lib/theme/palette.ts) — text/borders one way, backgrounds another.
      colors: {
        ...themeColors.text,
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      backgroundColor: themeColors.background,
      gradientColorStops: themeColors.background,
      ringOffsetColor: { white: themeColors.background.white },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        scanline: {
          '0%, 100%': { top: '8%' },
          '50%': { top: '92%' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        scanline: 'scanline 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    function ({ addBase }: PluginAPI) {
      addBase({ ':root': themeColors.vars.light, '.dark': themeColors.vars.dark })
    },
    function ({ addUtilities }: PluginAPI) {
      const newUtilities = {
        '.bytewave-heading': {
          fontSize: '1.125rem',
          color: '#0865AC',
        },

        '.bytewave-paragraph': {
          fontSize: '0.875rem',
          // color: '#212120',
        },
        '.bytewave-sub-heading': {
          fontSize: '1rem',
          // color: '#000000',
        },
        '.bytewave-link': {
          fontSize: '0.75rem',
          // color: '#212120',
        },
      }

      addUtilities(newUtilities)
    },
    require('tailwindcss-animate'),
  ],
}
export default config
