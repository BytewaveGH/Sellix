import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sellix',
    short_name: 'Sellix',
    description: 'Point of sale and business management for retail, eateries, amusement parks and real estate.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0865AC',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
