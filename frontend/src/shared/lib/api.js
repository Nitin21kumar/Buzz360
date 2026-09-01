import axios from 'axios'
import { firebaseAuth } from './firebase.js'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export const api = axios.create({ baseURL: API_BASE })


api.interceptors.request.use(async (config) => {
  const user = firebaseAuth.currentUser
  if (user) {
    const token = await user.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})


export const getMyProfile = () => api.get('/api/users/me')
export const listUsers = () => api.get('/api/users')
export const createUser = (payload) => api.post('/api/users', payload)
export const updateUser = (uid, payload) => api.patch(`/api/users/${uid}`, payload)
export const deleteUser = (uid) => api.delete(`/api/users/${uid}`)


export const createVoiceFolder = (name) => api.post('/api/tts/folders', { name })
export const listVoiceFolders = () => api.get('/api/tts/folders')
export const deleteVoiceFolder = (folderId) => api.delete(`/api/tts/folders/${folderId}`)


export const generateSpeech = (text, folderId, languages, sourceLanguageCode = 'hi-IN', gender = 'female', temperature = 0.78, pace = 1.0) =>
  api.post('/api/tts/generate', { text, folder_id: folderId, languages, source_language_code: sourceLanguageCode, gender, temperature, pace })
export const getTtsHistory = (folderId) => api.get('/api/tts/history', { params: folderId ? { folder_id: folderId } : {} })
export const getTtsAudioBlobUrl = async (folderId, filename) => {
  const response = await api.get(`/api/tts/download/${folderId}/${filename}`, { responseType: 'blob' })
  return window.URL.createObjectURL(new Blob([response.data]))
}
export const deleteVoice = (folderId, languageCode) => api.delete(`/api/tts/${folderId}/${languageCode}`)


export const transcribeAudio = (file, languageCode = 'unknown', translateToEnglish = false) => {
  const form = new FormData()
  form.append('file', file)
  form.append('language_code', languageCode)
  form.append('translate_to_english', translateToEnglish)
  return api.post('/api/stt/transcribe', form)
}
export const getSttHistory = () => api.get('/api/stt/history')


export const createCampaign = (name) => api.post('/api/campaigns', { name })
export const listCampaigns = () => api.get('/api/campaigns')
export const deleteCampaign = (id) => api.delete(`/api/campaigns/${id}`)
export const setCampaignVoiceSource = (id, voiceSourceFolderId) =>
  api.patch(`/api/campaigns/${id}/voice-source`, { voice_source_folder_id: voiceSourceFolderId })
export const uploadCampaignAudio = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/campaigns/${id}/upload-audio`, form)
}

async function downloadAuthenticatedFile(url, filename) {
  const response = await api.get(url, { responseType: 'blob' })
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

export const getCampaignAudioUrl = (id) => `${API_BASE}/api/campaigns/${id}/audio`

export const getCampaignAudioBlobUrl = async (id) => {
  const response = await api.get(`/api/campaigns/${id}/audio`, { responseType: 'blob' })
  return window.URL.createObjectURL(new Blob([response.data]))
}
export const uploadCampaignContacts = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/campaigns/${id}/upload-contacts`, form)
}
export const deleteCampaignContacts = (id) => api.delete(`/api/campaigns/${id}/contacts`)
export const startCampaign = (id) => api.post(`/api/campaigns/${id}/start`)
export const getCampaignStatus = (id) => api.get(`/api/campaigns/${id}/status`)
export const getCampaignReportUrl = (id) => `${API_BASE}/api/campaigns/${id}/report`
export const downloadCampaignReport = (id) => downloadAuthenticatedFile(`/api/campaigns/${id}/report`, `campaign_${id}_report.xlsx`)
export const getObdOverview = () => api.get('/api/obd/overview')
export const getDailyStats = () => api.get('/api/obd/daily-stats')
export const getCampaignPerformance = () => api.get('/api/obd/campaign-performance')


export const getWhatsAppReadiness = () => api.get('/api/whatsapp/readiness')

export const listWhatsAppTemplates = () => api.get('/api/whatsapp/templates')
export const createWhatsAppTemplate = (wid, name, type) => api.post('/api/whatsapp/templates', { wid, name, type })
export const deleteWhatsAppTemplate = (id) => api.delete(`/api/whatsapp/templates/${id}`)

export const createWhatsAppCampaign = (name, templateWid, headerMediaUrl, bodyValues) =>
  api.post('/api/whatsapp/campaigns', {
    name, template_wid: templateWid,
    ...(headerMediaUrl ? { header_media_url: headerMediaUrl } : {}),
    ...(bodyValues && Object.keys(bodyValues).length ? { body_values: bodyValues } : {}),
  })
export const listWhatsAppCampaigns = () => api.get('/api/whatsapp/campaigns')
export const getWhatsAppCampaign = (id) => api.get(`/api/whatsapp/campaigns/${id}`)
export const deleteWhatsAppCampaign = (id) => api.delete(`/api/whatsapp/campaigns/${id}`)
export const uploadWhatsAppContacts = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/whatsapp/campaigns/${id}/upload-contacts`, form)
}
export const deleteWhatsAppContacts = (id) => api.delete(`/api/whatsapp/campaigns/${id}/contacts`)
export const startWhatsAppCampaign = (id) => api.post(`/api/whatsapp/campaigns/${id}/start`)
export const stopWhatsAppCampaign = (id) => api.post(`/api/whatsapp/campaigns/${id}/stop`)


export const listRcsTemplates = () => api.get('/api/rcs/templates')
export const createRcsTemplate = (templateId, sender, name) => api.post('/api/rcs/templates', { template_id: templateId, sender, name })
export const deleteRcsTemplate = (id) => api.delete(`/api/rcs/templates/${id}`)

export const createRcsCampaign = (name, templateId, params) =>
  api.post('/api/rcs/campaigns', {
    name, template_id: templateId,
    ...(params && Object.keys(params).length ? { params } : {}),
  })
export const listRcsCampaigns = () => api.get('/api/rcs/campaigns')
export const getRcsCampaign = (id) => api.get(`/api/rcs/campaigns/${id}`)
export const deleteRcsCampaign = (id) => api.delete(`/api/rcs/campaigns/${id}`)
export const uploadRcsContacts = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/rcs/campaigns/${id}/upload-contacts`, form)
}
export const deleteRcsContacts = (id) => api.delete(`/api/rcs/campaigns/${id}/contacts`)
export const startRcsCampaign = (id) => api.post(`/api/rcs/campaigns/${id}/start`)
export const stopRcsCampaign = (id) => api.post(`/api/rcs/campaigns/${id}/stop`)


export const getSmsReadiness = () => api.get('/api/sms/readiness')
export const sendSingleSms = (recipients, message, templateId, senderId) =>
  api.post('/api/sms/send', { recipients, message, template_id: templateId, ...(senderId ? { sender_id: senderId } : {}) })

export const createSmsCampaign = (name, templateId, message) =>
  api.post('/api/sms/campaigns', { name, template_id: templateId, message })
export const listSmsCampaigns = () => api.get('/api/sms/campaigns')
export const getSmsCampaign = (id) => api.get(`/api/sms/campaigns/${id}`)
export const deleteSmsCampaign = (id) => api.delete(`/api/sms/campaigns/${id}`)
export const addSmsRecipients = (id, recipients) => api.post(`/api/sms/campaigns/${id}/recipients`, { recipients })
export const uploadSmsRecipients = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/sms/campaigns/${id}/upload`, form)
}
export const startSmsCampaign = (id) => api.post(`/api/sms/campaigns/${id}/start`)
