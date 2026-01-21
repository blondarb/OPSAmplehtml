import { redirect } from 'next/navigation'

export default function Home() {
  // Simple redirect to login page
  redirect('/login')
}
