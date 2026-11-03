// A landlord's public website: their free rooms and short stays. No sign-in,
// no dashboard shell.

export const metadata = {
  title: 'Rooms and apartments to rent',
  description: 'See what’s free now, with photos and prices, and get in touch on WhatsApp.',
}

export default function RentalsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#F7F7F5] text-stone-900">{children}</div>
}
