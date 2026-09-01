import { useState, useEffect } from 'react'
import { MessageCircle, Loader2, RefreshCw, ArrowLeft, Trash2, Plus, Tags } from 'lucide-react'
import * as api from '../../shared/lib/api'
import PermissionNotice from '../../shared/components/PermissionNotice.jsx'

export default function WhatsAppCampaigns() {
  const [tab, setTab] = useState('campaigns')

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}><MessageCircle size={22} style={{ verticalAlign: -3, marginRight: 8, color: '#25D366' }} />WhatsApp Broadcast</h1>
          <p style={styles.sub}>Send DLT/Meta-approved WhatsApp templates to your contacts via Sarv's WABA API.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...styles.refreshBtn, ...(tab === 'campaigns' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('campaigns')}>Campaigns</button>
          <button style={{ ...styles.refreshBtn, ...(tab === 'templates' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('templates')}><Tags size={13} /> Templates</button>
        </div>
      </div>

      {tab === 'templates' ? <WhatsAppTemplates /> : <WhatsAppCampaignsList />}
    </div>
  )
}

function WhatsAppCampaignsList() {
  const [campaigns, setCampaigns] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('list')
  const [noViewAccess, setNoViewAccess] = useState(false)
  const [permissionDetail, setPermissionDetail] = useState('')
  const [stopping, setStopping] = useState(false)

  const [name, setName] = useState('')
  const [templateWid, setTemplateWid] = useState('')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [templatesError, setTemplatesError] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadingContacts, setUploadingContacts] = useState(false)
  const [deletingContacts, setDeletingContacts] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [starting, setStarting] = useState(false)

  const activeCampaign = campaigns.find((c) => c.id === activeId) || null
  const launched = activeCampaign ? activeCampaign.status !== 'draft' : false
  const selectedTemplate = availableTemplates.find((t) => t.wid === templateWid)

  const loadCampaigns = async () => {
    try {
      const res = await api.listWhatsAppCampaigns()
      setCampaigns(res.data)
      return res.data
    } catch (error) {
      if (error?.response?.status === 403) {
        setNoViewAccess(true)
        setPermissionDetail(error?.response?.data?.detail || '')
        return []
      }
      throw error
    }
  }

  useEffect(() => { loadCampaigns() }, [])

  const loadAvailableTemplates = async () => {
    setTemplatesError('')
    try {
      const res = await api.listWhatsAppTemplates()
      setAvailableTemplates(res.data)
    } catch (error) {
      setTemplatesError(error.response?.data?.detail || 'Failed to load templates')
    }
  }

  useEffect(() => { if (view === 'create') loadAvailableTemplates() }, [view])

  const refreshOne = async () => {
    if (!activeId) return
    try {
      const res = await api.getWhatsAppCampaign(activeId)
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
    if (!templateWid) return alert('Select a template')
    if (selectedTemplate?.type === 'media' && !headerMediaUrl.trim()) return alert('This template needs a media header URL')
    setCreating(true)
    try {
      const res = await api.createWhatsAppCampaign(name.trim(), templateWid, headerMediaUrl.trim() || undefined)
      setName(''); setTemplateWid(''); setHeaderMediaUrl('')
      setCampaigns((prev) => [res.data, ...prev])
      setActiveId(res.data.id)
      setView('detail')
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not create campaign')
    } finally {
      setCreating(false)
    }
  }

  const handleUploadContacts = async (file) => {
    if (!file || !activeId) return
    setUploadingContacts(true)
    try {
      const res = await api.uploadWhatsAppContacts(activeId, file)
      alert(res.data.message)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not upload contacts')
    } finally {
      setUploadingContacts(false)
    }
  }

  const handleDeleteContacts = async () => {
    if (!activeId || !window.confirm('Remove all uploaded recipients from this draft?')) return
    setDeletingContacts(true)
    try {
      await api.deleteWhatsAppContacts(activeId)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not clear recipients')
    } finally {
      setDeletingContacts(false)
    }
  }

  const handleStart = async () => {
    if (!activeId || !window.confirm('Start sending this WhatsApp broadcast now?')) return
    setStarting(true)
    try {
      const res = await api.startWhatsAppCampaign(activeId)
      alert(res.data.message)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not start campaign')
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (!activeId || !window.confirm('Stop this broadcast? Recipients not yet sent will be cancelled.')) return
    setStopping(true)
    try {
      const res = await api.stopWhatsAppCampaign(activeId)
      alert(res.data.message)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not stop campaign')
    } finally {
      setStopping(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign and its recipients?')) return
    setDeletingId(id)
    try {
      await api.deleteWhatsAppCampaign(id)
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) { setActiveId(null); setView('list') }
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not delete campaign')
    } finally {
      setDeletingId(null)
    }
  }

  if (noViewAccess) return <PermissionNotice label="WhatsApp campaigns" detail={permissionDetail} />

  if (view === 'detail' && activeCampaign) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <button style={styles.backBtn} onClick={() => { setView('list'); setActiveId(null) }}><ArrowLeft size={14} /> Back to campaigns</button>

        <div style={styles.card}>
          <div style={styles.stepLabel}>{activeCampaign.name}</div>
          <p style={styles.sub}>Template: <b>{activeCampaign.template_name}</b> &middot; Status: {activeCampaign.status}</p>

          {!launched && (
            <>
              <label style={styles.label}>Upload Recipients (.csv / .xlsx)</label>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleUploadContacts(e.target.files?.[0])} disabled={uploadingContacts} />
              <p style={styles.hint}>Needs a phone-number column (phone, mobile, phone number, or contact).</p>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={styles.primaryBtnSmall} onClick={handleStart} disabled={starting || !activeCampaign.total}>
                  {starting ? 'Starting…' : `Start Broadcast (${activeCampaign.total} recipient${activeCampaign.total === 1 ? '' : 's'})`}
                </button>
                {activeCampaign.total > 0 && (
                  <button style={styles.deleteContactsBtn} onClick={handleDeleteContacts} disabled={deletingContacts}>
                    <Trash2 size={13} /> Clear Recipients
                  </button>
                )}
              </div>
            </>
          )}

          {launched && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Total</div><div style={styles.miniValue}>{activeCampaign.total}</div></div>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Pending</div><div style={styles.miniValue}>{activeCampaign.pending ?? 0}</div></div>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Sent</div><div style={styles.miniValue}>{activeCampaign.sent ?? activeCampaign.submitted}</div></div>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Delivered</div><div style={{ ...styles.miniValue, color: 'var(--success)' }}>{activeCampaign.delivered ?? 0}</div></div>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Read</div><div style={{ ...styles.miniValue, color: 'var(--success)' }}>{activeCampaign.read ?? 0}</div></div>
                <div style={styles.miniStat}><div style={styles.miniLabel}>Failed</div><div style={{ ...styles.miniValue, color: 'var(--danger)' }}>{(activeCampaign.failed ?? 0) + (activeCampaign.errored ?? 0)}</div></div>
              </div>
              <p style={styles.hint}>
                “Sent” = accepted by Sarv. “Delivered” / “Read” come from Sarv's delivery webhook.
                {(activeCampaign.errored ?? 0) > 0 && ` ${activeCampaign.errored} send(s) errored and will be retried automatically.`}
              </p>
              {activeCampaign.status === 'running' && (
                <button style={{ ...styles.deleteContactsBtn, marginTop: 10 }} onClick={handleStop} disabled={stopping}>
                  {stopping ? 'Stopping…' : 'Stop Broadcast'}
                </button>
              )}
            </>
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
          <div style={styles.stepLabel}>New WhatsApp Campaign</div>

          <label style={styles.label}>Campaign Name</label>
          <input style={styles.select} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali Offer Blast" />

          {templatesError && (
            <p style={{ ...styles.hint, color: 'var(--danger)' }}>
              {templatesError} &mdash; <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={loadAvailableTemplates}>Retry</span>
            </p>
          )}

          <label style={styles.label}>Template</label>
          <select style={styles.select} value={templateWid} onChange={(e) => setTemplateWid(e.target.value)}>
            <option value="" disabled>Select a saved template…</option>
            {availableTemplates.map((t) => <option key={t.wid} value={t.wid}>{t.name} ({t.wid}) &mdash; {t.type}</option>)}
          </select>
          {availableTemplates.length === 0 && !templatesError && (
            <p style={styles.hint}>No templates registered yet &mdash; add one under the "Templates" tab first (paste the wid from waba.sarv.com).</p>
          )}

          {selectedTemplate?.type === 'media' && (
            <>
              <label style={styles.label}>Media Header URL</label>
              <input style={styles.select} value={headerMediaUrl} onChange={(e) => setHeaderMediaUrl(e.target.value)} placeholder="https://.../image-or-doc.pdf" />
              <p style={styles.hint}>Same file is used for every recipient in this campaign.</p>
            </>
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
          <MessageCircle size={28} color="var(--text-secondary)" />
          <p style={{ ...styles.sub, marginTop: 10 }}>No WhatsApp campaigns yet.</p>
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
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{c.template_name}</td>
                <td style={styles.td}>{c.status}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <button style={styles.actionBtn} onClick={() => { setActiveId(c.id); setView('detail') }}>Open</button>{' '}
                  <button style={{ ...styles.actionBtn, ...styles.deleteCampaignBtn }} onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                    <Trash2 size={13} /> {deletingId === c.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function WhatsAppTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permDetail, setPermDetail] = useState('')
  const [wid, setWid] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('text')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listWhatsAppTemplates()
      setTemplates(res.data)
    } catch (err) {
      if (err?.response?.status === 403) { setError('permission'); setPermDetail(err.response?.data?.detail || '') }
      else setError(err.response?.data?.detail || 'Could not load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!wid.trim() || !name.trim()) return alert('Enter both the wid and a friendly name')
    setAdding(true)
    try {
      await api.createWhatsAppTemplate(wid.trim(), name.trim(), type)
      setWid(''); setName(''); setType('text')
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not add this template')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this template from the dropdown?')) return
    try {
      await api.deleteWhatsAppTemplate(id)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not remove this template')
    }
  }

  if (error === 'permission') return <PermissionNotice label="WhatsApp templates" detail={permDetail} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={styles.card}>
        <div style={styles.stepLabel}><Tags size={15} /> Register a Template</div>
        <p style={styles.hint}>
          Sarv's API doesn't expose a "list templates" endpoint, so register the templates you've already
          approved on waba.sarv.com here &mdash; this is just the wid plus a friendly name, so they show up
          in the campaign dropdown.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
          <input style={styles.select} value={wid} onChange={(e) => setWid(e.target.value)} placeholder="wid, e.g. 101" />
          <input style={styles.select} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friendly name" />
          <select style={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="text">Text</option>
            <option value="media">Media (image/video/document)</option>
          </select>
        </div>
        <button style={{ ...styles.primaryBtnSmall, marginTop: 10 }} onClick={handleAdd} disabled={adding}>
          <Plus size={13} /> {adding ? 'Adding…' : 'Add Template'}
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.stepLabel}>Saved Templates</div>
        {loading ? (
          <p style={styles.hint}>Loading…</p>
        ) : error ? (
          <p style={{ ...styles.hint, color: 'var(--danger)' }}>{error}</p>
        ) : (
          <table style={{ ...styles.table, marginTop: 10 }}>
            <thead>
              <tr><th style={styles.th}>wid</th><th style={styles.th}>Name</th><th style={styles.th}>Type</th><th style={{ ...styles.th, textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} style={styles.tr}>
                  <td style={styles.td}>{t.wid}</td>
                  <td style={styles.td}>{t.name}</td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{t.type}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button onClick={() => handleDelete(t.id)} style={{ ...styles.actionBtn, ...styles.deleteCampaignBtn }}><Trash2 size={13} /> Delete</button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && <tr><td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No templates registered yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
  sub: { fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 600 },
  newBtn: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#fff', fontSize: 13.5, fontWeight: 700 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20 },
  stepLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' },
  toggleBtnActive: { border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 5 },
  select: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', boxSizing: 'border-box' },
  primaryBtnSmall: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  primaryBtn: { width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#fff', fontSize: 14, fontWeight: 700 },
  hint: { fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 },
  miniStat: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 },
  miniLabel: { fontSize: 11.5, color: 'var(--text-secondary)' },
  miniValue: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  deleteContactsBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #FCD7D3', background: '#fff', color: 'var(--danger)', fontSize: 11.5, fontWeight: 700 },
  emptyCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, borderRadius: 'var(--radius)', border: '1px dashed var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '10px 8px', borderBottom: '1px solid var(--border)' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '13px 8px', fontSize: 13.5 },
  actionBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600 },
  deleteCampaignBtn: { border: '1px solid #FCD7D3', color: 'var(--danger)' },
}
