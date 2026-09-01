import { useState, useEffect } from 'react'

const PHASE_MS = 2000
const BAR_COUNT = 5

const SIZE = {
  sm: { text: 'text-xs', wave: 'h-3.5 gap-0.5', bar: 'w-0.5' },
  md: { text: 'text-[13.5px]', wave: 'h-5 gap-[3px]', bar: 'w-[3px]' },
  lg: { text: 'text-base', wave: 'h-6.5 gap-1', bar: 'w-1' },
}


export default function Loader({ label = 'Loading', size = 'md', inline = false, invert = false }) {
  const [showWave, setShowWave] = useState(false)
  const s = SIZE[size] || SIZE.md

  useEffect(() => {
    const timer = setInterval(() => setShowWave((w) => !w), PHASE_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      className={`inline-flex items-center justify-center ${inline ? 'min-w-0 min-h-0' : 'min-w-24 min-h-6'}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {showWave ? (
        <span className={`inline-flex items-end ${s.wave}`} aria-hidden="true">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`${s.bar} rounded-sm animate-bar-bounce ${invert ? 'bg-white/90' : 'bg-gradient-to-b from-purple to-warning'}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </span>
      ) : (
        <span className={`inline-flex items-center font-bold tracking-tight ${s.text} ${invert ? 'text-white' : 'text-purple'}`}>
          {label}
          <span className="inline-flex gap-[3px] ml-1">
            {[0, 0.15, 0.3].map((delay) => (
              <i
                key={delay}
                className="w-1 h-1 rounded-full bg-current not-italic animate-dot-blink"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </span>
        </span>
      )}
    </span>
  )
}


export function PageLoaderOverlay({ label }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-card backdrop-blur-[3px] bg-[var(--overlay-bg)]">
      <Loader label={label} size="lg" />
    </div>
  )
}
