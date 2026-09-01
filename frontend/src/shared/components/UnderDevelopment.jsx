import { Rocket, Sparkle } from 'lucide-react'

const BADGE_GRADIENT = {
  purple: 'bg-gradient-to-br from-purple to-warning',
  blue: 'bg-gradient-to-br from-blue to-purple',
}


export default function UnderDevelopment({ label, description, accent = 'purple' }) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center min-h-[60vh] py-10 px-6 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(124, 92, 252, 0.12), transparent 45%), radial-gradient(circle at 60% 70%, rgba(245, 158, 11, 0.1), transparent 40%)',
        }}
      />
      <div className={`relative w-[84px] h-[84px] rounded-[26px] grid place-items-center shadow-[0_18px_40px_rgba(124,92,252,0.3)] animate-under-dev-float ${BADGE_GRADIENT[accent] || BADGE_GRADIENT.purple}`}>
        <Rocket size={30} color="#fff" />
        <Sparkle className="absolute -top-1.5 -right-2 text-warning animate-under-dev-twinkle [animation-delay:0.2s]" size={14} />
        <Sparkle className="absolute -bottom-0.5 -left-2.5 text-purple animate-under-dev-twinkle [animation-delay:0.9s]" size={10} />
      </div>
      <span className="mt-[22px] inline-block py-[5px] px-4 rounded-full text-[11.5px] font-extrabold tracking-[0.06em] uppercase bg-purple-soft text-purple">
        Coming Soon
      </span>
      <h1 className="mt-3.5 text-2xl font-extrabold tracking-tight text-text-primary">{label}</h1>
      <p className="mt-2 max-w-[440px] text-sm leading-relaxed text-text-secondary">{description}</p>
      <p className="mt-5 text-[12.5px] font-semibold text-text-secondary">We're building this out — check back soon.</p>
    </div>
  )
}
