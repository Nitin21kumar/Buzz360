import { useState, useEffect } from 'react'
import { Radio, RefreshCw, ArrowLeft, Trash2, Plus, Tags, X } from 'lucide-react'
import * as api from '../../shared/lib/api'
import PermissionNotice from '../../shared/components/PermissionNotice.jsx'

export default function RCSCampaigns() {
  const [tab, setTab] = useState('campaigns')

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}><Radio size={22} style={{ verticalAlign: -3, marginRight: 8, color: '#7C5CFC' }} />RCS Broadcast</h1>
          <p style={styles.sub}>Send rich, template-based RCS messages to your contacts via Sarv's Bulk RCS API.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...styles.refreshBtn, ...(tab === 'campaigns' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('campaigns')}>Campaigns</button>
          <button style={{ ...styles.refreshBtn, ...(tab === 'templates' ? styles.toggleBtnActive : {}) }} onClick={() => setTab('templates')}><Tags size={13} /> Templates</button>
        </div>
      </div>

      {tab === 'templates' ? <RcsTemplates /> : <RcsCampaignsList />}
    </div>
  )
}

function ParamsEditor({ pairs, setPairs }) {
  const updatePair = (i, field, value) => {
    setPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))
  }
  const addPair = () => setPairs((prev) => [...prev, { key: '', value: '' }])
  const removePair = (i) => setPairs((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginTop: 8 }}>
      {pairs.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input style={styles.select} value={p.key} onChange={(e) => updatePair(i, 'key', e.target.value)} placeholder="param key, e.g. name" />
          <input style={styles.select} value={p.value} onChange={(e) => updatePair(i, 'value', e.target.value)} placeholder="value, e.g. Ashish" />
          <button type="button" onClick={() => removePair(i)} style={styles.iconBtnSmall}><X size={13} /></button>
        </div>
      ))}
      <button type="button" style={{ ...styles.actionBtn, marginTop: 2 }} onClick={addPair}><Plus size={13} /> Add Param</button>
    </div>
  )
}

function RcsCampaignsList() {
  const [campaigns, setCampaigns] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('list')
  const [noViewAccess, setNoViewAccess] = useState(false)
  const [permissionDetail, setPermissionDetail] = useState('')
  const [stopping, setStopping] = useState(false)

  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [paramPairs, setParamPairs] = useState([])
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [templatesError, setTemplatesError] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadingContacts, setUploadingContacts] = useState(false)
  const [deletingContacts, setDeletingContacts] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [starting, setStarting] = useState(false)

  const activeCampaign = campaigns.find((c) => c.id === activeId) || null
  const launched = activeCampaign ? activeCampaign.status !== 'draft' : false

  const loadCampaigns = async () => {
    try {
      const res = await api.listRcsCampaigns()
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
      const res = await api.listRcsTemplates()
      setAvailableTemplates(res.data)
    } catch (error) {
      setTemplatesError(error.response?.data?.detail || 'Failed to load templates')
    }
  }

  useEffect(() => { if (view === 'create') loadAvailableTemplates() }, [view])

  const refreshOne = async () => {
    if (!activeId) return
    try {
      const res = await api.getRcsCampaign(activeId)
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
      const params = {}
      for (const p of paramPairs) {
        if (p.key.trim()) params[p.key.trim()] = p.value
      }
      const res = await api.createRcsCampaign(name.trim(), templateId, params)
      setName(''); setTemplateId(''); setParamPairs([])
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
      const res = await api.uploadRcsContacts(activeId, file)
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
      await api.deleteRcsContacts(activeId)
      await refreshOne()
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not clear recipients')
    } finally {
      setDeletingContacts(false)
    }
  }

  const handleStart = async () => {
    if (!activeId || !window.confirm('Start sending this RCS broadcast now?')) return
    setStarting(true)
    try {
      const res = await api.startRcsCampaign(activeId)
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
      const res = await api.stopRcsCampaign(activeId)
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
      await api.deleteRcsCampaign(id)
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) { setActiveId(null); setView('list') }
    } catch (error) {
      alert(error.response?.data?.detail || 'Could not delete campaign')
    } finally {
      setDeletingId(null)
    }
  }

  if (noViewAccess) return <PermissionNotice label="RCS campaigns" detail={permissionDetail} />

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
          <div style={styles.stepLabel}>New RCS Campaign</div>

          <label style={styles.label}>Campaign Name</label>
          <input style={styles.select} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Year Offer" />

          {templatesError && (
            <p style={{ ...styles.hint, color: 'var(--danger)' }}>
              {templatesError} &mdash; <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={loadAvailableTemplates}>Retry</span>
            </p>
          )}

          <label style={styles.label}>Template</label>
          <select style={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="" disabled>Select a saved template…</option>
            {availableTemplates.map((t) => <option key={t.template_id} value={t.template_id}>{t.name} ({t.template_id})</option>)}
          </select>
          {availableTemplates.length === 0 && !templatesError && (
            <p style={styles.hint}>No templates registered yet &mdash; add one under the "Templates" tab first.</p>
          )}

          <label style={styles.label}>Template Parameters (optional)</label>
          <p style={styles.hint}>Same values apply to every recipient in this campaign &mdash; match the keys your template expects (e.g. name, company, or 1, 2).</p>
          <ParamsEditor pairs={paramPairs} setPairs={setParamPairs} />

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
          <Radio size={28} color="var(--text-secondary)" />
          <p style={{ ...styles.sub, marginTop: 10 }}>No RCS campaigns yet.</p>
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

function RcsTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permDetail, setPermDetail] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [sender, setSender] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listRcsTemplates()
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
    if (!templateId.trim() || !sender.trim() || !name.trim()) return alert('Enter the template id, sender/Bot ID, and a friendly name')
    setAdding(true)
    try {
      await api.createRcsTemplate(templateId.trim(), sender.trim(), name.trim())
      setTemplateId(''); setSender(''); setName('')
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
      await api.deleteRcsTemplate(id)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not remove this template')
    }
  }

  if (error === 'permission') return <PermissionNotice label="RCS templates" detail={permDetail} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={styles.card}>
        <div style={styles.stepLabel}><Tags size={15} /> Register a Template</div>
        <p style={styles.hint}>
          Enter the RCS template name and Sender/Bot ID you've already set up on waba.sarv.com.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
          <input style={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="template_id, e.g. xxxx_trx_signup_c" />
          <input style={styles.select} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender / Bot ID" />
          <input style={styles.select} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friendly name" />
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
              <tr><th style={styles.th}>template_id</th><th style={styles.th}>Sender</th><th style={styles.th}>Name</th><th style={{ ...styles.th, textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} style={styles.tr}>
                  <td style={styles.td}>{t.template_id}</td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{t.sender}</td>
                  <td style={styles.td}>{t.name}</td>
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
  newBtn: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #4C3BCF)', color: '#fff', fontSize: 13.5, fontWeight: 700 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20 },
  stepLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' },
  toggleBtnActive: { border: '1px solid var(--accent-purple)', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 5 },
  select: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', boxSizing: 'border-box' },
  primaryBtnSmall: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  primaryBtn: { width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #4C3BCF)', color: '#fff', fontSize: 14, fontWeight: 700 },
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
  iconBtnSmall: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, borderRadius: 8, border: '1px solid var(--border)', background: '#fff' },
  deleteCampaignBtn: { border: '1px solid #FCD7D3', color: 'var(--danger)' },
}
