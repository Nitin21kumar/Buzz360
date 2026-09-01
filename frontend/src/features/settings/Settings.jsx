import { Moon, SlidersHorizontal } from 'lucide-react'
import { useDarkTheme, useAdvancedVoiceSettings } from '../../shared/lib/uiSettings.js'

function Switch({ on, onToggle, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`settings-switch${on ? ' settings-switch--on' : ''}`}
    />
  )
}

export default function Settings() {
  const [dark, setDark] = useDarkTheme()
  const [advancedVoice, setAdvancedVoice] = useAdvancedVoiceSettings()

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Settings</h1>
        <p style={styles.sub}>Personalize how Buzz Connect looks and which voice controls you see.</p>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title"><Moon size={15} style={{ marginRight: 7, verticalAlign: -2 }} />Appearance</h3>
        <p className="settings-section-sub">Applies to this device only.</p>

        <div className="settings-row">
          <div className="settings-row-text">
            <strong>Dark theme</strong>
            <span>Switch the whole app to a darker color scheme.</span>
          </div>
          <Switch on={dark} onToggle={() => setDark(!dark)} label="Toggle dark theme" />
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title"><SlidersHorizontal size={15} style={{ marginRight: 7, verticalAlign: -2 }} />Voice</h3>
        <p className="settings-section-sub">Controls what you see on the Text to Speech page.</p>

        <div className="settings-row">
          <div className="settings-row-text">
            <strong>More voice settings</strong>
            <span>
              Turn this on to fine-tune Speed, Stability, Similarity and Style Exaggeration with sliders on the
              Text to Speech page. Turn it off to go back to the 3 quick voice-style boxes (Flat, Natural, Expressive).
            </span>
          </div>
          <Switch on={advancedVoice} onToggle={() => setAdvancedVoice(!advancedVoice)} label="Toggle more voice settings" />
        </div>
      </div>
    </div>
  )
}

const styles = {
  headerRow: { marginBottom: 22 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
  sub: { fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 },
}
