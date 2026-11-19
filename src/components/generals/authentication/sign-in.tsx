import SignInForm from './widgets/forms/sign-in'
import { AuthShell } from './auth-shell'

// Owner sign-in: the business's module picture beside the form.
export default function SignIn({ appType }: { appType?: string | null }) {
  return (
    <AuthShell appType={appType}>
      <SignInForm />
    </AuthShell>
  )
}
