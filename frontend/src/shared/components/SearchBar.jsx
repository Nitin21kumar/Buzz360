import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

export default function SearchBar({ active, query, onQueryChange, onClose }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    if (active) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])

  if (!active) return null

  return (
    <div className="absolute top-0 left-0 right-0 z-[25] pt-[18px] px-[26px] animate-search-slide-down">
      <div className="flex items-center gap-2.5 max-w-[520px] mx-auto py-[11px] px-4 rounded-[13px] bg-card border border-purple shadow-[0_10px_30px_rgba(16,21,42,0.15),0_0_0_3px_rgba(124,92,252,0.12)]">
        <Search size={16} className="text-purple shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search campaigns by name..."
          className="border-none outline-none bg-transparent text-[13.5px] text-text-primary flex-1 min-w-0 placeholder:text-[#9AA0BE]"
        />
        <button
          className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 border-none bg-track-bg text-text-secondary transition-colors hover:bg-row-hover"
          onClick={onClose}
          aria-label="Close search"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
