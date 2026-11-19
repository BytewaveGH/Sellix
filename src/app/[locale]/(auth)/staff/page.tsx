import StaffSignInForm from '@/components/generals/authentication/widgets/forms/staff-sign-in'
import { AuthShell } from '@/components/generals/authentication/auth-shell'
import { appTypeForThisSite } from '../_logics/app-type'

export default async function StaffLoginPage() {
  return (
    <AuthShell appType={await appTypeForThisSite()}>
      <StaffSignInForm />
    </AuthShell>
  )
}
