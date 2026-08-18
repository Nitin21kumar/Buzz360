import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Loader2, MessageSquareText, Plus, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import * as api from '../api'
import { usePermissions } from '../permissions'

const splitNumbers = (value) => value.split(/[\s,;]+/).map((n) => n.trim()).filter(Boolean)
const statusLabel = (s) => ({ draft: 'Draft', running: 'Sending', completed: 'Completed', completed_with_errors: 'Completed with errors', retrying_duplicates: 'Retrying duplicates' }[s] || s)

export default function SMSCampaigns() {
  const { can } = usePermissions()
  const [readiness, setReadiness] = useState(null), [campaigns, setCampaigns] = useState([])
  const [view, setView] = useState('list'), [active, setActive] = useState(null), [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mayView = can('sms','view')
  const load = async () => { setError(''); try { const [r,c]=await Promise.all([api.getSMSReadiness(),api.listSMSCampaigns()]); setReadiness(r.data); setCampaigns(c.data) } catch(e){ setError(e.response?.data?.detail||'Could not load SMS campaigns') } finally { setLoading(false) } }
  useEffect(()=>{ if(mayView) load(); else setLoading(false) },[mayView])
  const open = async (id) => { setLoading(true); try { const r=await api.getSMSCampaign(id); setActive(r.data); setView('detail') } catch(e){ setError(e.response?.data?.detail||'Could not load campaign') } finally { setLoading(false) } }
  if(loading) return <div className="sms-center"><Loader2 className="auth-spin"/></div>
  if(!mayView) return <div className="sms-card"><h2>SMS access required</h2><p>Ask an administrator to grant SMS permissions.</p></div>
  return <div className="sms-page sms-page--wide">
    <div className="sms-heading"><div><h1><MessageSquareText size={24}/> SMS Campaigns</h1><p>Create, launch, and monitor DLT-compliant ValueFirst broadcasts.</p></div><span className={`sms-status ${readiness?.configured?'ready':'blocked'}`}>{readiness?.configured?'Provider ready':'Setup required'}</span></div>
    {error&&<div className="sms-alert error"><AlertTriangle size={18}/>{error}</div>}
    {!readiness?.configured&&<div className="sms-alert error"><AlertTriangle size={18}/>{readiness?.detail}</div>}
    {view==='list'&&<CampaignList campaigns={campaigns} onOpen={open} onCreate={()=>setView('create')} canCreate={can('sms','create')}/>}
    {view==='create'&&<CampaignCreate readiness={readiness} onCancel={()=>setView('list')} onCreated={(c)=>{setActive(c);setView('detail');load()}}/>}
    {view==='detail'&&active&&<CampaignDetail campaign={active} onBack={()=>{setView('list');load()}} onRefresh={()=>open(active.id)} canEdit={can('sms','edit')} canTrigger={can('sms','trigger')} canDelete={can('sms','delete')}/>}
  </div>
}

function CampaignList({campaigns,onOpen,onCreate,canCreate}){
 return <><div className="sms-toolbar"><div><b>{campaigns.length}</b> campaigns</div><button className="sms-send" onClick={onCreate} disabled={!canCreate}><Plus size={17}/>New campaign</button></div><div className="sms-campaign-grid">{campaigns.length===0?<div className="sms-card sms-empty"><MessageSquareText size={30}/><h3>No SMS campaigns yet</h3><p>Create a campaign, add contacts, and launch it when ready.</p></div>:campaigns.map(c=><button className="sms-campaign-card" key={c.id} onClick={()=>onOpen(c.id)}><div className="sms-card-top"><strong>{c.name}</strong><span className={`sms-chip ${c.status}`}>{statusLabel(c.status)}</span></div><p>{c.message}</p><div className="sms-stats"><span><Users size={14}/>{c.total} recipients</span><span>{c.submitted} submitted</span>{c.failed>0&&<span className="bad">{c.failed} failed</span>}</div><small>{c.template_id}</small></button>)}</div></>
}

function CampaignCreate({readiness,onCancel,onCreated}){
 const [name,setName]=useState(''),[templateId,setTemplateId]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('')
 const submit=async(e)=>{e.preventDefault();setSaving(true);setError('');try{const r=await api.createSMSCampaign(name,templateId,message);onCreated(r.data)}catch(x){setError(x.response?.data?.detail||'Could not create campaign')}finally{setSaving(false)}}
 return <div className="sms-card"><button className="sms-link" onClick={onCancel}><ArrowLeft size={16}/>Back to campaigns</button><h2>Create SMS campaign</h2>{error&&<div className="sms-alert error"><AlertTriangle size={18}/>{error}</div>}<form className="sms-form" onSubmit={submit}><label>Campaign name<input value={name} onChange={e=>setName(e.target.value)} placeholder="August customer awareness" required/></label><label>DLT-approved template<select value={templateId} onChange={e=>{const id=e.target.value;setTemplateId(id);setMessage(readiness?.templates?.find(t=>t.template_id===id)?.content||'')}} required><option value="">Select template</option>{readiness?.templates?.map(t=><option key={t.template_id} value={t.template_id}>{t.label} ? {t.template_id}</option>)}</select></label><label>Exact approved template content <small>Auto-filled from the approved DLT catalog and locked to prevent mismatch</small><textarea rows="7" value={message} readOnly required maxLength="2000" placeholder="Select a DLT template to load its approved content"/></label><div className="sms-count">{message.length} characters</div><button className="sms-send" disabled={saving||!readiness?.configured}>{saving?<Loader2 className="auth-spin" size={17}/>:<Plus size={17}/>}Create draft</button></form></div>
}

function CampaignDetail({campaign,onBack,onRefresh,canEdit,canTrigger,canDelete}){
 const [numbers,setNumbers]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[uploading,setUploading]=useState(false)
 const pending=campaign.status==='draft'; const parsed=useMemo(()=>splitNumbers(numbers),[numbers])
 const act=async(fn)=>{setBusy(true);setNotice(null);try{const r=await fn();setNotice({ok:true,text:r.data.message});await onRefresh();return true}catch(e){setNotice({ok:false,text:e.response?.data?.detail||'Request failed'});return false}finally{setBusy(false)}}
 const addPasted=async()=>{if(await act(()=>api.addSMSRecipients(campaign.id,parsed)))setNumbers('')}
 const uploadFile=async(event)=>{
  const file=event.target.files?.[0]; event.target.value=''
  if(!file)return
  setUploading(true);setNotice(null)
  try{const r=await api.uploadSMSRecipients(campaign.id,file);setNotice({ok:true,text:`${file.name}: ${r.data.message}. Total recipients: ${r.data.total}`});await onRefresh()}
  catch(e){setNotice({ok:false,text:e.response?.data?.detail||'File upload failed'})}
  finally{setUploading(false)}
 }
 const start=()=>{if(window.confirm(`Start ?${campaign.name}? for ${campaign.total} recipients? A campaign can only be started once and may consume SMS balance.`))act(()=>api.startSMSCampaign(campaign.id))}
 const remove=async()=>{if(window.confirm('Delete this draft campaign and all recipients?')){setBusy(true);try{await api.deleteSMSCampaign(campaign.id);onBack()}catch(e){setNotice({ok:false,text:e.response?.data?.detail||'Delete failed'});setBusy(false)}}}
 return <>
  <button className="sms-link" onClick={onBack}><ArrowLeft size={16}/>All campaigns</button>
  <div className="sms-detail-head"><div><h2>{campaign.name}</h2><span className={`sms-chip ${campaign.status}`}>{statusLabel(campaign.status)}</span></div><button className="sms-icon-btn" onClick={onRefresh}><RefreshCw size={16}/></button></div>
  <div className="sms-metric-grid"><div><b>{campaign.total}</b><span>Total</span></div><div><b>{campaign.submitted}</b><span>Submitted</span></div><div><b>{campaign.failed}</b><span>Failed</span></div><div><b>{campaign.sender_id}</b><span>Sender</span></div></div>
  <div className="sms-card sms-summary"><label>Template ID<input value={campaign.template_id} disabled/></label><label>Approved message<textarea rows="5" value={campaign.message} disabled/></label></div>
  {notice&&<div className={`sms-alert ${notice.ok?'success':'error'}`}>{notice.ok?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}<span>{notice.text}</span></div>}
  {pending&&<div className="sms-card"><h3>Add recipients</h3>
   <label>Paste phone numbers <small>Comma, space, or new-line separated; duplicates are ignored</small><textarea rows="4" value={numbers} onChange={e=>setNumbers(e.target.value)} placeholder="8271567408"/></label>
   <div className="sms-action-row">
    <button className="sms-secondary" disabled={!parsed.length||busy||uploading||!canEdit} onClick={addPasted}><Users size={16}/>Add {parsed.length||''} recipients</button>
    <label className={`sms-upload ${(uploading||!canEdit)?'disabled':''}`}><FileUp size={16}/><span>{uploading?'Uploading and validating?':'Select & upload CSV/XLSX'}</span><input type="file" accept=".csv,.xlsx,.xls" disabled={uploading||busy||!canEdit} onChange={uploadFile}/></label>
   </div>
   <p className="sms-help">Supported columns: phone no, phone number, phone_number, mobile, number, or contact. Valid numbers are deduplicated automatically.</p>
  </div>}
  <div className="sms-action-row sms-footer-actions">
   {pending&&<button className="sms-send" disabled={campaign.total<1||busy||uploading||!canTrigger} onClick={start}><Send size={17}/>{campaign.total<1?'Add recipients to start':`Start campaign (${campaign.total})`}</button>}
   {pending&&<button className="sms-danger" disabled={busy||uploading||!canDelete} onClick={remove}><Trash2 size={16}/>Delete draft</button>}
  </div>
  {campaign.contacts?.length>0&&<div className="sms-card"><h3>Recipients ({campaign.contacts.length})</h3><div className="sms-contact-list">{campaign.contacts.map(c=><div key={c.id}><span>{c.phone_number}</span><span className={`sms-chip ${c.status}`}>{c.status}</span>{c.error&&<small>{c.error}</small>}</div>)}</div></div>}
 </>
}
