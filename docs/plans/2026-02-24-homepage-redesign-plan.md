# Homepage Redesign + Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat 6-card homepage with a narrative three-track journey layout, add Supabase auth with route protection, and rebrand to "Sevaro Ambulatory."

**Architecture:** New homepage is composed of isolated section components (HeroSection, JourneyTrack, ByTheNumbers, Footer) assembled in `page.tsx`. Auth uses Supabase's existing client/server setup with a new AuthContext provider and middleware-level route protection. PlatformShell nav bar wraps marketing pages only (/, /login, /signup, /about) — feature pages keep their own navigation.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v3, Supabase Auth (@supabase/ssr), Lucide React (icons), Framer Motion (animations)

**Design Doc:** `docs/plans/2026-02-24-homepage-redesign-design.md`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install lucide-react and framer-motion**

Run:
```bash
npm install lucide-react framer-motion
```

Expected: Both packages added to package.json dependencies. No errors.

**Step 2: Verify installation**

Run:
```bash
node -e "require('lucide-react'); require('framer-motion'); console.log('OK')"
```

Expected: "OK" printed without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react and framer-motion dependencies"
```

---

## Task 2: Create Supabase Migration for Auth Tables

**Files:**
- Create: `supabase/migrations/025_user_profiles.sql`

**Step 1: Write the migration**

Create `supabase/migrations/025_user_profiles.sql` with:

```sql
-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role TEXT DEFAULT 'demo' CHECK (role IN ('admin', 'clinician', 'investor', 'partner', 'demo')),
  organization TEXT,
  specialty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'demo');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Activity logging
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON public.user_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can log their own activity
CREATE POLICY "Users can log own activity" ON public.user_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can read their own activity
CREATE POLICY "Users can read own activity" ON public.user_activity_log
  FOR SELECT USING (auth.uid() = user_id);

-- Create index on activity log for user queries
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON public.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON public.user_activity_log(timestamp DESC);
```

**Step 2: Commit**

```bash
git add supabase/migrations/025_user_profiles.sql
git commit -m "feat(auth): add user_profiles and activity_log migration"
```

Note: This migration will be applied to Supabase separately (ask user before running `supabase db push`).

---

## Task 3: Create Auth Context Provider

**Files:**
- Create: `src/contexts/AuthContext.tsx`

**Step 1: Create the AuthContext**

The provider wraps the app and provides auth state. It uses Supabase's `onAuthStateChange` to track login/logout and fetches the user's profile (with role) from `user_profiles`.

```tsx
'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  display_name: string | null
  role: string
  organization: string | null
  specialty: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase
        .from('user_profiles')
        .select('id, display_name, role, organization, specialty')
        .eq('id', userId)
        .single()
      if (data) setUserProfile(data)
    } catch {
      // Profile may not exist yet (trigger hasn't fired)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Get initial session
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      if (mounted) {
        setSession(initialSession)
        setUser(initialSession?.user ?? null)
        if (initialSession?.user) {
          await fetchProfile(initialSession.user.id)
        }
        setLoading(false)
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          if (mounted) {
            setSession(newSession)
            setUser(newSession?.user ?? null)
            if (newSession?.user) {
              await fetchProfile(newSession.user.id)
            } else {
              setUserProfile(null)
            }
          }
        }
      )

      return () => {
        mounted = false
        subscription.unsubscribe()
      }
    }

    init()
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) return { error: error.message, needsConfirmation: false }
    // If user exists but no session, email confirmation is needed
    const needsConfirmation = !!(data.user && !data.session)
    return { error: null, needsConfirmation }
  }

  const signOut = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setUserProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

**Step 2: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): add AuthContext provider with Supabase integration"
```

---

## Task 4: Create Activity Logging Hook

**Files:**
- Create: `src/hooks/useActivityLog.ts`

**Step 1: Write the hook**

```tsx
'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useCallback } from 'react'

export function useActivityLog() {
  const { user } = useAuth()

  const logActivity = useCallback(
    (action: string, target: string, metadata?: Record<string, unknown>) => {
      if (!user) return

      // Fire-and-forget — don't await, don't block UI
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient()
        supabase
          .from('user_activity_log')
          .insert({ user_id: user.id, action, target, metadata: metadata ?? {} })
          .then(() => {})
          .catch(() => {})
      })
    },
    [user]
  )

  return { logActivity }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useActivityLog.ts
git commit -m "feat(auth): add useActivityLog hook for fire-and-forget tracking"
```

---

## Task 5: Update Layout with AuthProvider

**Files:**
- Modify: `src/app/layout.tsx`

**Step 1: Wrap children in AuthProvider**

Update the layout to wrap all children in the AuthProvider. Also update the metadata title to "Sevaro Ambulatory."

The key changes:
- Import and wrap with `AuthProvider`
- Update metadata title/description to "Sevaro Ambulatory"
- Keep the existing font-size init script and viewport meta

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "Sevaro Ambulatory - AI-Powered Outpatient Neurology",
  description: "Reimagining every step of outpatient neurology with AI — from referral triage to continuous monitoring.",
};

// (keep existing fontSizeInitScript unchanged)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <script dangerouslySetInnerHTML={{ __html: fontSizeInitScript }} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(auth): wrap app in AuthProvider, update branding to Sevaro Ambulatory"
```

---

## Task 6: Update Middleware for Auth Route Protection

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Rewrite middleware**

The new middleware checks for a Supabase session on protected routes. If no session exists, redirect to `/login?redirect={path}`. Public routes (/, /login, /signup, /about, /auth) pass through. Keep existing view preference logic for `/`.

```tsx
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/about', '/auth/callback']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create a response we can modify
  let response = NextResponse.next({ request: { headers: request.headers } })

  // Create Supabase client for middleware (reads session from cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session (important for keeping auth alive)
  const { data: { session } } = await supabase.auth.getSession()

  // --- Existing view preference logic for root path ---
  if (pathname === '/') {
    const switchApp = request.nextUrl.searchParams.get('switch_app')
    if (switchApp === 'true') {
      response.cookies.delete('preferred_view')
      return response
    }

    const viewOverride = request.nextUrl.searchParams.get('view')
    if (viewOverride === 'desktop' || viewOverride === 'mobile') {
      const redirectResponse = NextResponse.redirect(
        new URL(viewOverride === 'mobile' ? '/mobile' : '/dashboard', request.url)
      )
      redirectResponse.cookies.set('preferred_view', viewOverride, { maxAge: 60 * 60 * 24 * 30, path: '/' })
      return redirectResponse
    }

    // Show homepage (no redirect based on saved preference anymore — homepage is the new landing)
    return response
  }

  // --- Auth protection for non-public routes ---
  const isPublic = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
  // API routes and static assets should not be auth-gated
  const isApi = pathname.startsWith('/api/')
  const isStatic = pathname.startsWith('/_next/') || pathname.includes('.')

  if (!isPublic && !isApi && !isStatic && !session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): add session-based route protection in middleware"
```

---

## Task 7: Create PlatformShell Nav Bar

**Files:**
- Create: `src/components/layout/PlatformShell.tsx`

**Step 1: Build the nav bar component**

This is used on marketing pages only (homepage, login, signup, about). It shows "Sevaro Ambulatory" branding and auth-aware user menu.

```tsx
'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PlatformShell({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
          <Link href="/about" className="text-slate-300 hover:text-white transition-colors">About</Link>
        </div>

        {/* Right: Auth */}
        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold">
                  {initials}
                </div>
                <span className="hidden md:block text-sm text-slate-300">{displayName}</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900">{displayName}</p>
                    <p className="text-xs text-slate-500">{userProfile?.role ?? 'demo'}</p>
                  </div>
                  <button
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
```

**Step 2: Commit**

```bash
git add src/components/layout/PlatformShell.tsx
git commit -m "feat(shell): add PlatformShell nav bar with auth-aware user menu"
```

---

## Task 8: Build Homepage Section Components

**Files:**
- Create: `src/components/homepage/HeroSection.tsx`
- Create: `src/components/homepage/JourneyCard.tsx`
- Create: `src/components/homepage/JourneyTrack.tsx`
- Create: `src/components/homepage/ByTheNumbers.tsx`
- Create: `src/components/homepage/BuiltWith.tsx`
- Create: `src/components/homepage/Footer.tsx`
- Create: `src/components/homepage/journeyData.ts`

This is the largest task. Build all 7 files.

**Step 1: Create journey data file**

`src/components/homepage/journeyData.ts` — defines all card data for the three tracks.

```tsx
import {
  Brain, CalendarClock, Activity,
  ClipboardList, Mic, MessageCircle, HeartPulse,
  MessageSquare, Watch, LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface JourneyCardData {
  phase: string
  name: string
  route: string
  icon: LucideIcon
  status: 'live' | 'building' | 'planned'
  description: string
}

export interface JourneyTrackData {
  title: string
  subtitle: string
  cards: JourneyCardData[]
}

export const clinicianTrack: JourneyTrackData = {
  title: 'The Clinician Journey',
  subtitle: 'From referral to exam — AI at every step',
  cards: [
    {
      phase: 'Referral Triage',
      name: 'AI-Powered Triage',
      route: '/triage',
      icon: Brain,
      status: 'live',
      description: 'A referral arrives. AI reads it, scores acuity, and routes to the right subspecialist.',
    },
    {
      phase: 'Physician Workspace',
      name: 'Physician Workspace',
      route: '/physician',
      icon: CalendarClock,
      status: 'live',
      description: 'Your schedule, your charts, your triage recommendations — the physician\'s home base.',
    },
    {
      phase: 'In-Office Exam',
      name: 'Digital Neurological Exam',
      route: '/sdne',
      icon: Activity,
      status: 'live',
      description: 'The exam that remembers everything — quantified, reproducible, trackable over time.',
    },
  ],
}

export const patientTrack: JourneyTrackData = {
  title: 'The Patient Journey',
  subtitle: 'Guided care before, during, and after every visit',
  cards: [
    {
      phase: 'Before the Visit',
      name: 'Patient Intake',
      route: '/patient?tab=intake',
      icon: ClipboardList,
      status: 'live',
      description: 'Complete your intake forms and medical history before your appointment.',
    },
    {
      phase: 'AI History-Taking',
      name: 'AI Health Interview',
      route: '/patient/historian',
      icon: Mic,
      status: 'live',
      description: 'Have a voice conversation with an AI that takes your neurological history.',
    },
    {
      phase: 'Between Visits',
      name: 'Patient Messaging',
      route: '/patient?tab=messages',
      icon: MessageCircle,
      status: 'live',
      description: 'Send questions and updates to your care team between visits.',
    },
    {
      phase: 'After the Visit',
      name: 'Post-Visit Check-In',
      route: '/follow-up/conversation',
      icon: HeartPulse,
      status: 'live',
      description: 'Your AI care coordinator follows up on how you\'re feeling after your visit.',
    },
  ],
}

export const ongoingCareTrack: JourneyTrackData = {
  title: 'Ongoing Care',
  subtitle: 'Continuous intelligence between the 30-minute visits',
  cards: [
    {
      phase: 'Post-Visit',
      name: 'AI Follow-Up Agent',
      route: '/follow-up',
      icon: MessageSquare,
      status: 'live',
      description: 'AI care coordination — track medication tolerance, symptoms, and escalation alerts.',
    },
    {
      phase: 'Between Visits',
      name: 'Wearable Monitoring',
      route: '/wearable',
      icon: Watch,
      status: 'live',
      description: 'Galaxy Watch + AI turn the months between visits into actionable clinical intelligence.',
    },
    {
      phase: 'The Full Picture',
      name: 'Clinician Command Center',
      route: '/dashboard',
      icon: LayoutDashboard,
      status: 'live',
      description: 'Everything in one place — triage queue, alerts, wearable trends, follow-up status.',
    },
  ],
}
```

**Step 2: Create HeroSection**

`src/components/homepage/HeroSection.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'

export default function HeroSection() {
  const scrollToJourney = () => {
    document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center px-6 py-20"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #134e4a 100%)' }}>

      <div className="max-w-3xl mx-auto text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight"
        >
          The Neurology Clinic of Tomorrow — Built Today
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed"
        >
          From the first referral to years of continuous monitoring, this platform
          reimagines every step of outpatient neurology with AI. Intelligent triage
          gets the right patient to the right neurologist faster. A digital neurological
          exam makes the subjective objective. AI agents follow up after every visit.
          And wearable data turns the time between appointments into actionable
          clinical intelligence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8"
        >
          <button
            onClick={scrollToJourney}
            className="px-8 py-3 rounded-lg border border-white text-white font-medium hover:bg-white/10 transition-colors"
          >
            Follow a Patient&apos;s Journey ↓
          </button>
        </motion.div>
      </div>
    </section>
  )
}
```

**Step 3: Create JourneyCard**

`src/components/homepage/JourneyCard.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { JourneyCardData } from './journeyData'

const statusConfig = {
  live: { label: 'Live', color: 'bg-emerald-500' },
  building: { label: 'Building', color: 'bg-amber-500' },
  planned: { label: 'Planned', color: 'bg-slate-400' },
}

export default function JourneyCard({ card, index }: { card: JourneyCardData; index: number }) {
  const Icon = card.icon
  const status = statusConfig[card.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={card.route} className="block group">
        <div className="relative bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm
          transition-all duration-200 hover:-translate-y-1 hover:shadow-md
          w-56 md:w-56 min-h-[200px] flex flex-col">

          {/* Status badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${status.color}`} />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{status.label}</span>
          </div>

          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-teal-600" />
          </div>

          {/* Title */}
          <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-2">
            {card.name}
          </h3>

          {/* Description */}
          <p className="text-xs text-slate-500 leading-relaxed flex-1">
            {card.description}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
```

**Step 4: Create JourneyTrack**

`src/components/homepage/JourneyTrack.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'
import JourneyCard from './JourneyCard'
import type { JourneyTrackData } from './journeyData'

export default function JourneyTrack({ track }: { track: JourneyTrackData }) {
  return (
    <div className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{track.title}</h2>
          <p className="mt-2 text-slate-500">{track.subtitle}</p>
        </div>

        {/* Desktop: horizontal timeline */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Timeline line */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute top-[7px] left-0 right-0 h-[2px] bg-slate-200 origin-left"
              style={{ marginLeft: '28px', marginRight: '28px' }}
            />

            {/* Phase labels + nodes + cards */}
            <div className="flex justify-between items-start">
              {track.cards.map((card, i) => (
                <div key={card.route} className="flex flex-col items-center" style={{ flex: 1 }}>
                  {/* Node dot */}
                  <div className="relative z-10 w-4 h-4 rounded-full bg-teal-500 border-2 border-white shadow-sm mb-2" />

                  {/* Phase label */}
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 mb-3 text-center">
                    {card.phase}
                  </span>

                  {/* Card */}
                  <JourneyCard card={card} index={i} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden space-y-6">
          {track.cards.map((card, i) => (
            <div key={card.route} className="flex gap-4">
              {/* Vertical line + node */}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm flex-shrink-0" />
                {i < track.cards.length - 1 && <div className="w-[2px] flex-1 bg-slate-200 mt-1" />}
              </div>

              {/* Phase + card */}
              <div className="flex-1 pb-4">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-2">
                  {card.phase}
                </span>
                <JourneyCard card={card} index={i} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Create ByTheNumbers**

`src/components/homepage/ByTheNumbers.tsx`:

```tsx
'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'

const metrics = [
  { value: '6', suffix: ' months', label: 'Average wait for new neurology patients' },
  { value: '30', suffix: '%', label: 'Referrals misdirected to wrong subspecialty' },
  { value: '$100', suffix: '+', label: 'Monthly RPM revenue per patient left on the table' },
  { value: '24', suffix: '/7', label: 'AI monitoring between 30-minute visits' },
]

function CountUpMetric({ value, suffix, label }: { value: string; suffix: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [display, setDisplay] = useState(value.startsWith('$') ? '$0' : '0')

  useEffect(() => {
    if (!isInView) return

    const numericPart = value.replace(/[^0-9]/g, '')
    const prefix = value.startsWith('$') ? '$' : ''
    const target = parseInt(numericPart, 10)
    const duration = 1000
    const steps = 30
    const stepTime = duration / steps

    let current = 0
    const increment = target / steps

    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        current = target
        clearInterval(timer)
      }
      setDisplay(`${prefix}${Math.round(current)}`)
    }, stepTime)

    return () => clearInterval(timer)
  }, [isInView, value])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      <div className="text-4xl md:text-5xl font-bold text-teal-400">
        {display}<span>{suffix}</span>
      </div>
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </motion.div>
  )
}

export default function ByTheNumbers() {
  return (
    <section className="bg-slate-900 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">By the Numbers</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {metrics.map((m) => (
            <CountUpMetric key={m.label} {...m} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 6: Create BuiltWith**

`src/components/homepage/BuiltWith.tsx`:

```tsx
export default function BuiltWith() {
  const partners = ['Anthropic Claude', 'Samsung', 'Supabase', 'Vercel']

  return (
    <section className="py-12 px-6 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-slate-400 mb-4">Built With</p>
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {partners.map((name) => (
            <span key={name} className="text-sm text-slate-500 font-medium">{name}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 7: Create Footer**

`src/components/homepage/Footer.tsx`:

```tsx
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left */}
        <div>
          <h3 className="text-white font-bold text-lg">Sevaro Ambulatory</h3>
          <p className="mt-2 text-sm">Reimagining outpatient neurology with AI</p>
        </div>

        {/* Center */}
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
          <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
        </div>

        {/* Right */}
        <div className="text-sm">
          <p>Built by Steve Arbogast</p>
          <p className="mt-1">Powered by Anthropic Claude</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-500">
          This is a demonstration platform. Not intended for clinical use.
        </p>
      </div>
    </footer>
  )
}
```

**Step 8: Commit all homepage components**

```bash
git add src/components/homepage/
git commit -m "feat(homepage): add hero, journey tracks, metrics, footer components"
```

---

## Task 9: Build the New Homepage (page.tsx)

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Replace the homepage**

Replace the current LandingPage import with the new component composition wrapped in PlatformShell.

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import HeroSection from '@/components/homepage/HeroSection'
import JourneyTrack from '@/components/homepage/JourneyTrack'
import { clinicianTrack, patientTrack, ongoingCareTrack } from '@/components/homepage/journeyData'
import ByTheNumbers from '@/components/homepage/ByTheNumbers'
import BuiltWith from '@/components/homepage/BuiltWith'
import Footer from '@/components/homepage/Footer'

export default function Home() {
  return (
    <PlatformShell>
      <HeroSection />

      <div id="journey" className="bg-slate-50">
        <JourneyTrack track={clinicianTrack} />
        <JourneyTrack track={patientTrack} />
        <JourneyTrack track={ongoingCareTrack} />
      </div>

      <ByTheNumbers />
      <BuiltWith />
      <Footer />
    </PlatformShell>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(homepage): replace card grid with three-track journey layout"
```

---

## Task 10: Redesign Login Page with Redirect Support

**Files:**
- Modify: `src/app/login/page.tsx`

**Step 1: Rewrite login page**

Add redirect query param support, privacy messaging, and PlatformShell wrapper. Use AuthContext for login.

```tsx
'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PlatformShell from '@/components/layout/PlatformShell'
import { useAuth } from '@/contexts/AuthContext'

// Card name mapping from routes
const routeNames: Record<string, string> = {
  '/triage': 'AI-Powered Triage',
  '/physician': 'Physician Workspace',
  '/sdne': 'Digital Neurological Exam',
  '/follow-up': 'AI Follow-Up Agent',
  '/wearable': 'Wearable Monitoring',
  '/dashboard': 'Clinician Command Center',
  '/patient': 'Patient Portal',
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn } = useAuth()

  const redirect = searchParams.get('redirect')
  const cardName = redirect ? routeNames[redirect] ?? null : null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError(signInError)
      setLoading(false)
    } else {
      router.push(redirect ?? '/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md">
        {/* Redirect message */}
        {cardName && (
          <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-800 text-center">
            Sign in to explore <strong>{cardName}</strong>
          </div>
        )}

        <div className="bg-white p-8 rounded-xl shadow-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Welcome to Sevaro Ambulatory</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
          </div>

          {/* Privacy message */}
          <div className="mb-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
            Your privacy matters. We use your login only to personalize your experience
            and remember where you left off. No marketing emails. No third-party tracking.
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{' '}
            <Link href="/signup" className="font-medium text-teal-600 hover:text-teal-700">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <PlatformShell>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" /></div>}>
        <LoginForm />
      </Suspense>
    </PlatformShell>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): redesign login page with redirect support and privacy messaging"
```

---

## Task 11: Update PatientPortal to Read Tab Query Param

**Files:**
- Modify: `src/components/PatientPortal.tsx`

**Step 1: Read the `tab` query param on mount**

Add `useSearchParams` to read `?tab=intake|messages|historian` and set the initial tab state. This enables homepage journey cards to link directly to specific tabs.

Find the existing line:
```tsx
const [tab, setTab] = useState<Tab>('intake')
```

Replace with:
```tsx
// Read initial tab from URL query param (enables direct linking from homepage)
const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
const initialTab = (['intake', 'messages', 'historian'] as Tab[]).includes(searchParams?.get('tab') as Tab)
  ? (searchParams!.get('tab') as Tab)
  : 'intake'
const [tab, setTab] = useState<Tab>(initialTab)
```

**Step 2: Commit**

```bash
git add src/components/PatientPortal.tsx
git commit -m "feat(patient): read tab query param for direct linking from homepage"
```

---

## Task 12: Update Signup Page Branding

**Files:**
- Modify: `src/app/signup/page.tsx`

**Step 1: Wrap in PlatformShell and update branding**

Update the signup page to use PlatformShell and "Sevaro Ambulatory" branding. Also add redirect support so after signup the user goes to the right page.

Key changes:
- Wrap in PlatformShell
- Change title from "Create Account" to "Join Sevaro Ambulatory"
- Change subtitle from "Start your free trial of Sevaro Clinical" to "Create your account"
- On success, redirect to `?redirect` path or /
- Add Suspense wrapper for useSearchParams

**Step 2: Commit**

```bash
git add src/app/signup/page.tsx
git commit -m "feat(auth): update signup page with PlatformShell and Sevaro Ambulatory branding"
```

---

## Task 13: Build Verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build completes without errors. Watch for:
- TypeScript errors in new components
- Missing imports
- Framer Motion SSR issues (all animated components should be 'use client')
- Middleware compilation errors

**Step 2: Fix any build errors**

If errors appear, fix them and re-run build until clean.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors in homepage redesign"
```

---

## Task 14: Visual Verification with Dev Server

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Verify each section**

Check the following at http://localhost:3000:

1. **Homepage loads** — hero section visible with gradient, tagline, paragraph, CTA button
2. **Nav bar** — "Sevaro Ambulatory" on left, links in center, "Sign In" on right
3. **CTA scroll** — "Follow a Patient's Journey" scrolls smoothly to journey section
4. **Three journey tracks** — Clinician (3 cards), Patient (4 cards), Ongoing Care (3 cards)
5. **Timeline layout** — horizontal on desktop (>768px), vertical on mobile (<768px)
6. **Card hover** — cards lift on hover with shadow
7. **By the Numbers** — 4 metrics with count-up animation on scroll
8. **Footer** — three columns, disclaimer
9. **Login page** — /login shows privacy message, form, "Sign In" button
10. **Auth gating** — clicking a card when not logged in redirects to /login?redirect=/triage
11. **Redirect message** — login page shows "Sign in to explore AI-Powered Triage"

**Step 3: Test mobile layout**

Resize browser to 375px width. Verify:
- Journey tracks switch to vertical layout
- Nav bar collapses appropriately
- Cards are full-width on mobile

**Step 4: Commit any visual fixes**

```bash
git add -A
git commit -m "fix: visual polish for homepage journey layout"
```

---

## Task 15: Delete Old LandingPage Component

**Files:**
- Delete: `src/components/LandingPage.tsx`

**Step 1: Verify no remaining imports**

Search for any remaining references to LandingPage:

```bash
grep -r "LandingPage" src/
```

Expected: No results (page.tsx no longer imports it).

**Step 2: Delete the file**

```bash
rm src/components/LandingPage.tsx
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated LandingPage component"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Install dependencies | Trivial |
| 2 | Supabase migration | Small |
| 3 | Auth context provider | Medium |
| 4 | Activity logging hook | Small |
| 5 | Update layout with AuthProvider | Small |
| 6 | Middleware auth protection | Medium |
| 7 | PlatformShell nav bar | Medium |
| 8 | Homepage section components (7 files) | Large |
| 9 | Assemble new homepage | Small |
| 10 | Redesign login page | Medium |
| 11 | PatientPortal tab query param | Small |
| 12 | Signup page branding | Small |
| 13 | Build verification | Small |
| 14 | Visual verification | Medium |
| 15 | Delete old LandingPage | Trivial |
