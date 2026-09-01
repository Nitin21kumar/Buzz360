import { useState, useEffect } from 'react'
import { MessageSquareText, RefreshCw, ArrowLeft, Trash2, Plus, Send } from 'lucide-react'
import * as api from '../../shared/lib/api'
import PermissionNotice from '../../shared/components/PermissionNotice.jsx'

export default function SMSCampaigns() {
  const [tab, setTab] = useState('campaigns')

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}><MessageSquareText size={22} style={{ verticalAlign: -3, marginRight: 8, color: '#2E86FF' }} />SMS Broadcast</h1>
          <p style={styles.sub}>Send DLT-approved SMS templates via ValueFirst — one-off or as a bulk campaign.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...styles.refreshBtn, ...(tab === 'campaigns' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('campaigns')}>Campaigns</button>
          <button style={{ ...styles.refreshBtn, ...(tab === 'quick' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('quick')}><Send size={13} /> Quick Send</button>
        </div>
      </div>

      {tab === 'quick' ? <QuickSend /> : <SMSCampaignsList />}
    </div>
  )
}

function useTemplates() {
  const [templates, setTemplates] = useState([])
  const [senderId, setSenderId] = useState('')
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const res = await api.getSmsReadiness()
      setTemplates(res.data.templates || [])
      setSenderId(res.data.sender_id || '')
      setConfigured(!!res.data.configured)
      if (!res.data.configured) setError(res.data.detail || 'ValueFirst SMS is not configured yet')
    } catch (err) {
      if (err?.response?.status === 403) setError('permission')
      else setError(err.response?.data?.detail || 'Could not load SMS templates')
    }
  }

  useEffect(() => { load() }, [])
  return { templates, senderId, configured, error, reload: load }
}

function QuickSend() {
  const { templates, error, reload } = useTemplates()
  const [recipients, setRecipients] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [sending, setSending] = useState(false)

  const selectedTemplate = templates.find((t) => t.template_id === templateId)

  if (error === 'permission') return <PermissionNotice label="SMS" />

  const handleSend = async () => {
    const list = recipients.split(/[\n,]/).map((r) => r.trim()).filter(Boolean)
    if (!list.length) return alert('Enter at least one phone number')
    if (!templateId) return alert('Select a template')
    setSending(true)
    try {
      const res = await api.sendSingleSms(list, selectedTemplate.content, templateId)
      alert(`${res.data.message} (${res.data.recipient_count} recipient(s))`)
      setRecipients('')
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not send SMS')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={styles.card}>
        {error && error !== 'permission' && (
          <p style={{ ...styles.hint, color: 'var(--danger)' }}>
            {error} &mdash; <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={reload}>Retry</span>
          </p>
        )}

        <label style={styles.label}>Recipients (one per line, or comma-separated)</label>
        <textarea style={{ ...styles.select, minHeight: 90, resize: 'vertical' }} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={'9876543210\n9123456789'} />

        <label style={styles.label}>Template</label>
        <select style={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="" disabled>Select an approved DLT template…</option>
          {templates.map((t) => <option key={t.template_id} value={t.template_id}>{t.label || t.template_id}</option>)}
        </select>
        {templates.length === 0 && !error && <p style={styles.hint}>No templates configured yet — set VALUE_FIRST_SMS_TEMPLATE_IDS on the backend.</p>}

        {selectedTemplate && (
          <div style={{ ...styles.select, background: 'var(--bg-soft, #F7F8FC)', marginTop: 8, minHeight: 60 }}>
            {selectedTemplate.content}
          </div>
        )}

        <button style={styles.primaryBtn} onClick={handleSend} disabled={sending || !templateId}>{sending ? 'Sending…' : 'Send Now'}</button>
      </div>
    </div>
  )
}

function SMSCampaignsList() {
  const { templates, error: templatesError, reload } = useTemplates()
  const [campaigns, setCampaigns] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('list')
  const [noViewAccess, setNoViewAccess] = useState(false)

  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [creating, setCreating] = useState(false)
  const [manualRecipients, setManualRecipients] = useState('')
  const [addingRecipients, setAddingRecipients] = useState(false)
  const [uploadingContacts, setUploadingContacts] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [starting, setStarting] = useState(false)

  const selectedTemplate = templates.find((t) => t.template_id === templateId)
  const activeCampaign = campaigns.find((c) => c.id === activeId) || null
  const launched = activeCampaign ? activeCampaign.status !== 'draft' : false

  const loadCampaigns = async () => {
    try {
      const res = await api.listSmsCampaigns()
      setCampaigns(res.data)
      return res.data
    } catch (error) {
      if (error?.response?.status === 403) { setNoViewAccess(true); return [] }
      throw error
    }
  }

  useEffect(() => { loadCampaigns() }, [])

  const refreshOne = async () => {
    if (!activeId) return
    try {
      const res = await api.getSmsCampaign(activeId)
      setCampaigns((prev) => prev.map((c) => (c.id === activeId ? res.data : c)))
    } catch {
    }
  }

  useEffect(() => {
    if (view !== 'detail' || !launched) return undefined
    const interval = setInterval(refreshOne, 4000)
    return () => clearInterval(interval)
  }, [view, launched, activeId])

  const handleCreate = async () => {
    if (!name.trim()) return alert('Enter a campaign name')
    if (!templateId) return alert('Select a template')
    setCreating(true)
    try {
      const res = await api.createSmsCampaign(name.trim(), templateId, selectedTemplate.content)
      setName(''); setTemplateId('')
      setCampaigns((prev) => [res.data, ...prev])
      setActiveId(res.data.id)
      setView('detail')
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not create campaign')
    } finally {
      setCreating(false)
    }
  }

  const handleAddRecipients = async () => {
    const list = manualRecipients.split(/[\n,]/).map((r) => r.trim()).filter(Boolean)
    if (!list.length || !activeId) return
    setAddingRecipients(true)
    try {
      const res = await api.addSmsRecipients(activeId, list)
      alert(res.data.message)
      setManualRecipients('')
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not add recipients')
    } finally {
      setAddingRecipients(false)
    }
  }

  const handleUploadContacts = async (file) => {
    if (!file || !activeId) return
    setUploadingContacts(true)
    try {
      const res = await api.uploadSmsRecipients(activeId, file)
      alert(res.data.message)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not upload contacts')
    } finally {
      setUploadingContacts(false)
    }
  }

  const handleStart = async () => {
    if (!activeId || !window.confirm('Start sending this SMS campaign now?')) return
    setStarting(true)
    try {
      const res = await api.startSmsCampaign(activeId)
      alert(res.data.message)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not start campaign')
    } finally {
      setStarting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign?')) return
    setDeletingId(id)
    try {
      await api.deleteSmsCampaign(id)
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) { setActiveId(null); setView('list') }
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not delete campaign')
    } finally {
      setDeletingId(null)
    }
  }

  if (noViewAccess) return <PermissionNotice label="SMS campaigns" />

  if (view === 'detail' && activeCampaign) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <button style={styles.backBtn} onClick={() => { setView('list'); setActiveId(null) }}><ArrowLeft size={14} /> Back to campaigns</button>

        <div style={styles.card}>
          <div style={styles.stepLabel}>{activeCampaign.name}</div>
          <p style={styles.sub}>Template: <b>{activeCampaign.template_id}</b> &middot; Status: {activeCampaign.status}</p>

          {!launched && (
            <>
              <label style={styles.label}>Add Recipients (one per line, or comma-separated)</label>
              <textarea style={{ ...styles.select, minHeight: 70, resize: 'vertical' }} value={manualRecipients} onChange={(e) => setManualRecipients(e.target.value)} placeholder={'9876543210\n9123456789'} />
              <button style={{ ...styles.actionBtn, marginTop: 6 }} onClick={handleAddRecipients} disabled={addingRecipients}><Plus size={13} /> {addingRecipients ? 'Adding…' : 'Add'}</button>

              <label style={{ ...styles.label, marginTop: 14 }}>Or Upload a File (.csv / .xlsx)</label>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleUploadContacts(e.target.files?.[0])} disabled={uploadingContacts} />

              <div style={{ marginTop: 14 }}>
                <button style={styles.primaryBtnSmall} onClick={handleStart} disabled={starting || !activeCampaign.total}>
                  {starting ? 'Starting…' : `Start Campaign (${activeCampaign.total} recipient${activeCampaign.total === 1 ? '' : 's'})`}
                </button>
              </div>
            </>
          )}

          {launched && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
              <div style={styles.miniStat}><div style={styles.miniLabel}>Total</div><div style={styles.miniValue}>{activeCampaign.total}</div></div>
              <div style={styles.miniStat}><div style={styles.miniLabel}>Submitted</div><div style={{ ...styles.miniValue, color: 'var(--success)' }}>{activeCampaign.submitted}</div></div>
              <div style={styles.miniStat}><div style={styles.miniLabel}>Failed</div><div style={{ ...styles.miniValue, color: 'var(--danger)' }}>{activeCampaign.failed}</div></div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520 }}>
        <button style={styles.backBtn} onClick={() => setView('list')}><ArrowLeft size={14} /> Back to campaigns</button>
        <div style={styles.card}>
          <div style={styles.stepLabel}>New SMS Campaign</div>

          <label style={styles.label}>Campaign Name</label>
          <input style={styles.select} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Payment Reminder Blast" />

          {templatesError && templatesError !== 'permission' && (
            <p style={{ ...styles.hint, color: 'var(--danger)' }}>
              {templatesError} &mdash; <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={reload}>Retry</span>
            </p>
          )}

          <label style={styles.label}>Template</label>
          <select style={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="" disabled>Select an approved DLT template…</option>
            {templates.map((t) => <option key={t.template_id} value={t.template_id}>{t.label || t.template_id}</option>)}
          </select>
          {templates.length === 0 && !templatesError && <p style={styles.hint}>No templates configured yet — set VALUE_FIRST_SMS_TEMPLATE_IDS on the backend.</p>}

          {selectedTemplate && (
            <div style={{ ...styles.select, background: 'var(--bg-soft, #F7F8FC)', marginTop: 8, minHeight: 60 }}>
              {selectedTemplate.content}
            </div>
          )}

          <button style={styles.primaryBtn} onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Campaign'}</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button style={styles.refreshBtn} onClick={loadCampaigns}><RefreshCw size={13} /> Refresh</button>
        <button style={styles.newBtn} onClick={() => setView('create')}><Plus size={14} /> New Campaign</button>
      </div>

      {campaigns.length === 0 ? (
        <div style={styles.emptyCard}>
          <MessageSquareText size={28} color="var(--text-secondary)" />
          <p style={{ ...styles.sub, marginTop: 10 }}>No SMS campaigns yet.</p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr><th style={styles.th}>Campaign</th><th style={styles.th}>Template</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Actions</th></tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} style={styles.tr}>
                <td style={styles.td}>{c.name}</td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{c.template_id}</td>
                <td style={styles.td}>{c.status}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <button style={styles.actionBtn} onClick={() => { setActiveId(c.id); setView('detail') }}>Open</button>{' '}
                  {c.status === 'draft' && (
                    <button style={{ ...styles.actionBtn, ...styles.deleteCampaignBtn }} onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                      <Trash2 size={13} /> {deletingId === c.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
  sub: { fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 600 },
  newBtn: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #2E86FF, #1B4FCF)', color: '#fff', fontSize: 13.5, fontWeight: 700 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20 },
  stepLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' },
  toggleBtnActive: { border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 5 },
  select: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', boxSizing: 'border-box' },
  primaryBtnSmall: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  primaryBtn: { width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #2E86FF, #1B4FCF)', color: '#fff', fontSize: 14, fontWeight: 700 },
  hint: { fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 },
  miniStat: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 },
  miniLabel: { fontSize: 11.5, color: 'var(--text-secondary)' },
  miniValue: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  emptyCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, borderRadius: 'var(--radius)', border: '1px dashed var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '10px 8px', borderBottom: '1px solid var(--border)' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '13px 8px', fontSize: 13.5 },
  actionBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600 },
  deleteCampaignBtn: { border: '1px solid #FCD7D3', color: 'var(--danger)' },
}
