/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

// The Windows desktop app (desktop/) builds this same code with BUILD_TARGET=desktop.
// Only then does Next produce a self-contained server for Electron to run, in its own
// folder so it never overwrites the web build in .next. The web build is unchanged.
const isDesktop = process.env.BUILD_TARGET === 'desktop'

const nextConfig = isDesktop ? { output: 'standalone', distDir: '.next-desktop' } : {}

export default withNextIntl(nextConfig)
