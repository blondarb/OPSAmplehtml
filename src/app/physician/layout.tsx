import { getUser } from '@/lib/cognito/server'
import { redirect } from 'next/navigation'

export default async function PhysicianLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return <>{children}</>
}
