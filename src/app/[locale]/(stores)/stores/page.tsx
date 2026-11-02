import { redirect } from 'next/navigation'

// The store module starts at the overview; staff without reports are sent on
// to their first allowed page by the middleware.
export default function StoresPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/stores/overview`)
}
