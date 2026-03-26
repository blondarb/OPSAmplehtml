'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificationCounts } from '@/hooks/useNotificationCounts'

export default function PlatformShell({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { counts: notifCounts } = useNotificationCounts()

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setDropdownOpen(false)
    router.push('/')
  }

  const initials = userProfile?.display_name
    ? userProfile.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const displayName = userProfile?.display_name ?? user?.email ?? ''

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav Bar */}
      <nav className="sticky top-0 z-50 bg-slate-900 text-white h-16 flex items-center justify-between px-6 shadow-lg">
        {/* Left: Product Name */}
        <Link href="/" className="text-lg font-bold tracking-tight hover:text-teal-400 transition-colors">
          Sevaro Ambulatory
        </Link>

        {/* Center: Nav Links */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-300 hover:text-white transition-colors">Home</Link>
        </div>

        {/* Right: Notifications + Auth */}
        <div className="flex items-center gap-4">
          {/* Notification count badge */}
          {notifCounts.total > 0 && (
            <div className="relative" title={`${notifCounts.total} unread notification${notifCounts.total !== 1 ? 's' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
              >
                {notifCounts.total > 99 ? '99+' : notifCounts.total}
              </span>
            </div>
          )}
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                className="flex items-center gap-2 hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold">
                  {initials}
                </div>
                <span className="hidden md:block text-sm text-slate-300">{displayName}</span>
              </button>
              {dropdownOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900">{displayName}</p>
                    <p className="text-xs text-slate-500">{userProfile?.role ?? 'demo'}</p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-800 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {/* Page Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
