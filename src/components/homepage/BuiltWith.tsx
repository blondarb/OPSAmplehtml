export default function BuiltWith() {
  const partners = ['Anthropic Claude', 'Samsung', 'AWS', 'Vercel']

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
