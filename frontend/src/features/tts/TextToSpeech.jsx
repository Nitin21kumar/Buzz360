import { useState, useEffect } from 'react'
import { Sparkles, Download, CheckCircle2, XCircle, History, CheckSquare, Square, Trash2, FolderPlus, Folder, SlidersHorizontal, Pencil, X } from 'lucide-react'
import { LANGUAGES, SOURCE_LANGUAGES } from '../../shared/lib/languages'
import * as api from '../../shared/lib/api'
import PermissionNotice from '../../shared/components/PermissionNotice.jsx'
import { SecureAudio, SecureDownloadButton } from '../../shared/components/SecureAudio.jsx'
import { useAdvancedVoiceSettings } from '../../shared/lib/uiSettings.js'
import VoiceModulationSliders from './VoiceModulationSliders.jsx'
import { PageLoaderOverlay } from '../../shared/components/Loader.jsx'


const VOICE_STYLES = [
  { id: 'flat', label: 'Flat & Consistent', temperature: 0.3, hint: 'IVR menus, compliance scripts' },
  { id: 'natural', label: 'Natural (recommended)', temperature: 0.78, hint: 'Warm, conversational OBD calls' },
  { id: 'expressive', label: 'Expressive & Lively', temperature: 0.9, hint: 'Marketing, storytelling' },
]

export default function TextToSpeech() {
  const [folders, setFolders] = useState([])
  const [folderId, setFolderId] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)

  const [text, setText] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('hi-IN')
  const [gender, setGender] = useState('female')
  const [voiceStyle, setVoiceStyle] = useState('natural')
  const [advancedVoice] = useAdvancedVoiceSettings()

  const [speed, setSpeed] = useState(1.0)
  const [stability, setStability] = useState(50)
  const [selectedLanguages, setSelectedLanguages] = useState(['hi-IN'])
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState([])
  const [history, setHistory] = useState([])
  const [noViewAccess, setNoViewAccess] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const loadFolders = async () => {
    try {
      const res = await api.listVoiceFolders()
      setFolders(res.data)
      return res.data
    } catch (error) {
      if (error?.response?.status === 403) { setNoViewAccess(true); return [] }
      throw error
    }
  }

  const loadHistory = async (forFolderId) => {
    if (!forFolderId) return setHistory([])
    try {
      const res = await api.getTtsHistory(forFolderId)
      setHistory(res.data)
      return res.data
    } catch (error) {
      if (error?.response?.status === 403) { setNoViewAccess(true); return [] }
      throw error
    }
  }

  useEffect(() => { loadFolders() }, [])
  useEffect(() => { loadHistory(folderId); setEditingItem(null) }, [folderId])

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return alert('A folder name is required')
    setCreatingFolder(true)
    try {
      const res = await api.createVoiceFolder(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolderForm(false)
      await loadFolders()
      setFolderId(res.data.id)
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not create the folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const toggleLanguage = (code) => {
    setSelectedLanguages((current) => current.includes(code) ? current.filter((c) => c !== code) : [...current, code])
  }

  const allSelected = selectedLanguages.length === LANGUAGES.length
  const toggleSelectAll = () => {
    setSelectedLanguages(allSelected ? [] : LANGUAGES.map((l) => l.code))
  }

  const handleGenerate = async () => {
    if (!folderId) return alert('Create or select a voice folder first')
    if (!text.trim()) return alert('Please enter text to convert')
    if (selectedLanguages.length === 0) return alert('Select at least one language')
    setGenerating(true)
    setResults([])
    try {

      const temperature = advancedVoice ? 0.9 - (stability / 100) * 0.6 : (VOICE_STYLES.find((s) => s.id === voiceStyle) || VOICE_STYLES[1]).temperature
      const pace = advancedVoice ? speed : 1.0
      const res = await api.generateSpeech(text.trim(), folderId, selectedLanguages, sourceLanguage, gender, temperature, pace)
      setResults(res.data.results)

      const generatedCodes = res.data.results.filter((r) => r.status === 'success').map((r) => r.code)
      const freshHistory = await loadHistory(folderId)
      const otherVoices = (freshHistory || []).filter((item) => !generatedCodes.includes(item.language_code))
      if (otherVoices.length > 0) {
        const namesList = otherVoices.map((v) => v.language_name).join(', ')
        const keep = generatedCodes.length
        if (confirm(`This folder also has voices in: ${namesList}. Delete these and keep only the ${keep} voice${keep === 1 ? '' : 's'} you just generated?`)) {
          for (const voice of otherVoices) {
            await api.deleteVoice(folderId, voice.language_code)
          }
          await loadHistory(folderId)
        }
      }
      loadFolders()
    } catch (error) {
      alert(error.response?.data?.detail || 'Speech generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleEditVoice = (item) => {
    setText(item.text)
    setSourceLanguage(item.language_code)
    setSelectedLanguages([item.language_code])
    setEditingItem(item)
    setResults([])
  }

  const handleClearEdit = () => {
    setText('')
    setEditingItem(null)
    setResults([])
  }

  const handleDelete = async (languageCode, languageName) => {
    if (!confirm(`Delete the ${languageName} voice from this folder?`)) return
    try {
      await api.deleteVoice(folderId, languageCode)
      if (editingItem?.language_code === languageCode) setEditingItem(null)
      loadHistory(folderId)
      loadFolders()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not delete this voice')
    }
  }

  const activeFolder = folders.find((f) => f.id === folderId)

  return (
    <div style={{ position: 'relative' }}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Text to Speech</h1>
          <p style={styles.sub}>Convert your text into natural speech across 11 Indian languages, powered by Sarvam AI.</p>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <label style={styles.label}>VOICE FOLDER (required)</label>
          <p style={styles.hint}>Every generation is saved into a folder. Create a new one, or pick an existing folder to add more languages to it.</p>

          {!showNewFolderForm ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <select disabled={generating} value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ ...styles.select, flex: 1 }}>
                <option value="" disabled>Select a folder…</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.voice_count} voice{f.voice_count === 1 ? '' : 's'})</option>)}
              </select>
              <button disabled={generating} onClick={() => setShowNewFolderForm(true)} style={styles.newFolderBtn}><FolderPlus size={14} /> New Folder</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                disabled={generating}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="e.g. Diwali_Offer_Voices"
                style={{ ...styles.select, flex: 1 }}
                autoFocus
              />
              <button onClick={handleCreateFolder} disabled={creatingFolder || generating} style={styles.primaryBtnSmall}>{creatingFolder ? 'Creating…' : 'Create'}</button>
              <button disabled={generating} onClick={() => setShowNewFolderForm(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          )}
          {folders.length === 0 && !showNewFolderForm && <p style={styles.hint}>No folders yet — click "New Folder" to create your first one.</p>}

          <label style={{ ...styles.label, marginTop: 20, display: 'block' }}>THIS TEXT IS WRITTEN IN</label>
          <select disabled={generating} value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} style={{ ...styles.select, marginTop: 8 }}>
            {SOURCE_LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
          </select>

          <label style={{ ...styles.label, marginTop: 16, display: 'block' }}>TEXT TO CONVERT</label>
          {editingItem && (
            <div style={styles.editingBanner}>
              <Pencil size={13} />
              <span>Editing the {editingItem.language_name} voice text from this folder — regenerating will overwrite it.</span>
              <button type="button" onClick={handleClearEdit} style={styles.editingBannerClearBtn}><X size={13} /></button>
            </div>
          )}
          <textarea
            disabled={generating}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Type or paste the message you want to convert to speech…"
            style={styles.textarea}
          />

          <label style={{ ...styles.label, marginTop: 20, display: 'block' }}>VOICE</label>
          <p style={styles.hint}>The best-performing voice for each selected language is picked automatically for you.</p>
          <div style={styles.genderRow}>
            <button
              type="button"
              disabled={generating}
              onClick={() => setGender('male')}
              style={{ ...styles.genderBtn, ...(gender === 'male' ? styles.genderBtnActive : {}) }}
            >
              Male Voice
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => setGender('female')}
              style={{ ...styles.genderBtn, ...(gender === 'female' ? styles.genderBtnActive : {}) }}
            >
              Female Voice
            </button>
          </div>

          {!advancedVoice && (
            <>
              <label style={{ ...styles.label, marginTop: 20, display: 'block' }}>VOICE STYLE</label>
              <p style={styles.hint}>Controls how natural vs. flat the voice sounds — the biggest lever for avoiding a robotic tone.</p>
              <div style={styles.genderRow}>
                {VOICE_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    disabled={generating}
                    onClick={() => setVoiceStyle(style.id)}
                    title={style.hint}
                    style={{ ...styles.genderBtn, ...(voiceStyle === style.id ? styles.genderBtnActive : {}) }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 20 }}>
            <div style={styles.langHeaderRow}>
              <label style={styles.label}>WHICH LANGUAGES SHOULD THIS BE CONVERTED INTO?</label>
              <button disabled={generating} onClick={toggleSelectAll} style={styles.selectAllBtn}>
                {allSelected ? <Square size={13} /> : <CheckSquare size={13} />}
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 0 }}>
              Any language other than "{SOURCE_LANGUAGES.find(l => l.code === sourceLanguage)?.name}" above is automatically translated first, then spoken in that language.
            </p>
            <div style={styles.langGrid}>
              {LANGUAGES.map((lang) => (
                <label
                  key={lang.code}
                  style={{ ...styles.langChip, ...(selectedLanguages.includes(lang.code) ? styles.langChipActive : {}), ...(generating ? styles.langChipDisabled : {}) }}
                >
                  <input
                    type="checkbox"
                    disabled={generating}
                    checked={selectedLanguages.includes(lang.code)}
                    onChange={() => toggleLanguage(lang.code)}
                    style={{ accentColor: 'var(--accent-purple)' }}
                  />
                  {lang.name}
                </label>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generating} style={styles.generateBtn}>
            <Sparkles size={17} />
            {generating ? 'Generating…' : `Generate speech in ${selectedLanguages.length || 0} language${selectedLanguages.length === 1 ? '' : 's'}`}
          </button>

          {results.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <label style={styles.label}>RESULTS</label>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {results.map((result) => (
                  <div key={result.code} style={{ ...styles.resultRow, borderColor: result.status === 'failed' ? '#FCD7D3' : 'var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {result.status === 'success' ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{result.language} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({result.code})</span></div>
                        {result.status === 'failed' && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{result.error}</div>}
                        {result.status === 'success' && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saved as {result.filename} · Voice: {result.speaker}</div>}
                      </div>
                    </div>
                    {result.status === 'success' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SecureAudio loadUrl={() => api.getTtsAudioBlobUrl(folderId, result.filename)} style={{ height: 32, width: 200 }} />
                        <SecureDownloadButton loadUrl={() => api.getTtsAudioBlobUrl(folderId, result.filename)} filename={result.filename}>
                          <button style={styles.downloadBtn}><Download size={14} /></button>
                        </SecureDownloadButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={styles.card}>
          {advancedVoice ? (
            <>
              <div style={styles.cardHeaderRow}>
                <h3 style={styles.cardTitle}><SlidersHorizontal size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Voice Modulation</h3>
              </div>
              <p style={styles.librarySub}>Fine-tune the voice yourself. Turn this off in Settings to see your folder's voice library here again.</p>
              <div style={{ marginTop: 16 }}>
                <VoiceModulationSliders
                  disabled={generating}
                  speed={speed} onSpeedChange={setSpeed}
                  stability={stability} onStabilityChange={setStability}
                />
              </div>
            </>
          ) : (
            <>
              <div style={styles.cardHeaderRow}>
                <h3 style={styles.cardTitle}><Folder size={16} style={{ marginRight: 6, verticalAlign: -2 }} />{activeFolder ? activeFolder.name : 'No folder selected'}</h3>
              </div>
              <p style={styles.librarySub}>Only this folder's voices are shown here. Click a voice to load and edit its text; regenerating overwrites its saved file.</p>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
                {noViewAccess && <PermissionNotice label="voice history" />}
                {!noViewAccess && history.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>{folderId ? 'No audio generated yet in this folder.' : 'Select a folder to see its voices.'}</p>}
                {history.map((item) => (
                  <div
                    key={item._id}
                    onClick={() => handleEditVoice(item)}
                    style={{ ...styles.historyRow, ...(editingItem?._id === item._id ? styles.historyRowActive : {}), cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.language_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{item.filename} · {new Date(item.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <SecureDownloadButton loadUrl={() => api.getTtsAudioBlobUrl(folderId, item.filename)} filename={item.filename}>
                        <button style={styles.downloadBtn}><Download size={13} /></button>
                      </SecureDownloadButton>
                      <button style={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(item.language_code, item.language_name) }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {generating && <PageLoaderOverlay label="Generating" />}
    </div>
  )
}

const styles = {
  headerRow: { marginBottom: 22 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
  sub: { fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 },
  grid: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: 700, margin: 0 },
  librarySub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  label: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' },
  hint: { fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6 },
  select: { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, background: '#fff' },
  newFolderBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  primaryBtnSmall: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  cancelBtn: { padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  textarea: {
    width: '100%', marginTop: 8, padding: 14, borderRadius: 12, border: '1px solid var(--border)',
    fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none',
  },
  genderRow: { display: 'flex', gap: 8, marginTop: 10 },
  genderBtn: {
    flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
    background: '#fff', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
  },
  genderBtnActive: {
    border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)',
    color: 'var(--accent-purple)', fontWeight: 700,
  },
  langHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  selectAllBtn: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-purple)' },
  langGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 10 },
  langChip: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10,
    border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)',
  },
  langChipActive: { border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)', fontWeight: 700 },
  langChipDisabled: { opacity: 0.55, cursor: 'not-allowed' },
  generateBtn: {
    width: '100%', marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '13px 16px', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, color: '#fff',
    background: 'linear-gradient(135deg, var(--accent-purple), var(--warning))',
  },
  spinIcon: { animation: 'spin 1s linear infinite' },
  resultRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px',
    borderRadius: 12, border: '1px solid var(--border)', background: '#FAFAFD', flexWrap: 'wrap', gap: 8,
  },
  downloadBtn: { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' },
  deleteBtn: { padding: '7px 9px', borderRadius: 8, border: '1px solid #FCD7D3', background: '#fff', color: 'var(--danger)' },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px',
    borderRadius: 10, border: '1px solid var(--border)',
  },
  historyRowActive: {
    border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)',
  },
  editingBanner: {
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px',
    borderRadius: 10, border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)',
    color: 'var(--accent-purple)', fontSize: 12, fontWeight: 600,
  },
  editingBannerClearBtn: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--accent-purple)',
  },
}
