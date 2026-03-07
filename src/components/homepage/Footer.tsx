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
