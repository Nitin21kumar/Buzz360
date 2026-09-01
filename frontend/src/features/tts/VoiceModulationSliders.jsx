function Slider({ title, leftLabel, rightLabel, min, max, step, value, onChange, disabled, badge, badgeDark, formatBadge }) {
  const pct = ((value - min) / (max - min)) * 100
  const badgeText = formatBadge ? formatBadge(value) : `${Math.round(value)}%`
  return (
    <div className="voice-slider-block">
      <div className="voice-slider-title-row">
        <h4>{title}</h4>
      </div>
      <div className="voice-slider-labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="voice-slider-track-wrap">
        {badge && (
          <span
            className={`voice-slider-badge${badgeDark ? ' voice-slider-badge--dark' : ''}`}
            style={{ left: `${pct}%` }}
          >
            {badgeText}
          </span>
        )}
        <input
          type="range"
          className="voice-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: `linear-gradient(to right, var(--accent-purple) ${pct}%, var(--track-bg) ${pct}%)` }}
        />
      </div>
    </div>
  )
}


export default function VoiceModulationSliders({
  disabled,
  speed, onSpeedChange,
  stability, onStabilityChange,
}) {
  return (
    <div className="voice-slider-group">
      <Slider
        title="Speed" leftLabel="Slower" rightLabel="Faster"
        min={0.5} max={2} step={0.05}
        value={speed} onChange={onSpeedChange} disabled={disabled}
        badge

        formatBadge={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        title="Stability" leftLabel="More variable" rightLabel="More stable"
        min={0} max={100} step={1}
        value={stability} onChange={onStabilityChange} disabled={disabled}
        badge
      />
    </div>
  )
}
