import SignIn from '@/components/generals/authentication/sign-in'
import { appTypeForThisSite } from './_logics/app-type'

export default async function Page() {
  return <SignIn appType={await appTypeForThisSite()} />
}
