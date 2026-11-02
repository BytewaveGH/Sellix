import { redirect } from 'next/navigation'

// Staff management moved to /team, shared by every module.
export default function EmployeesPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/team`)
}
