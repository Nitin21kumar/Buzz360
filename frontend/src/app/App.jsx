import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { firebaseAuth, missingFirebaseEnvVars } from '../shared/lib/firebase.js'
import * as api from '../shared/lib/api.js'
import { PermissionsProvider, usePermissions } from '../shared/lib/permissions.jsx'
import AuthPage from '../features/auth/AuthPage.jsx'
import ResetPasswordPage from '../features/auth/ResetPasswordPage.jsx'
import Sidebar from '../shared/components/Sidebar.jsx'
import SearchBar from '../shared/components/SearchBar.jsx'
import Dashboard from '../features/dashboard/Dashboard.jsx'
import TextToSpeech from '../features/tts/TextToSpeech.jsx'
import SpeechToText from '../features/stt/SpeechToText.jsx'
import Campaigns from '../features/campaigns/Campaigns.jsx'
import ManageVoices from '../features/voices/ManageVoices.jsx'
import WhatsAppCampaigns from '../features/whatsapp/WhatsAppCampaigns.jsx'
import RCSCampaigns from '../features/rcs/RCSCampaigns.jsx'
import SMSCampaigns from '../features/sms/SMSCampaigns.jsx'
import UserManagement from '../features/users/UserManagement.jsx'
import AccessDenied from '../shared/components/AccessDenied.jsx'
import Settings from '../features/settings/Settings.jsx'
import Loader from '../shared/components/Loader.jsx'
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout.js'

const ALL_MODULES = ['dashboard', 'campaigns', 'whatsapp', 'tts', 'stt', 'voices', 'users']
const MODULE_LABEL = { dashboard: 'Dashboard', campaigns: 'Campaigns', whatsapp: 'WhatsApp', tts: 'Text to Speech', stt: 'Speech to Text', voices: 'Manage Voices', users: 'User Management', sms: 'SMS', rcs: 'RCS', settings: 'Settings' }

const ALWAYS_VISIBLE_MODULES = ['sms', 'rcs', 'settings']


const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

function FirebaseSetupNeeded() {
  return (
    <div className="auth-loading-screen">
      <div className="access-denied" style={{ maxWidth: 460 }}>
        <div className="access-denied-icon" style={{ background: 'linear-gradient(145deg, var(--warning), #F97316)' }}>
          <TriangleAlert size={26} color="#fff" />
        </div>
        <h2>Firebase setup needed</h2>
        <p>
          <code>frontend/.env</code> is missing or incomplete. Copy <code>.env.example</code> to <code>.env</code> and
          fill in your Firebase project's config (Project Settings &gt; General &gt; Your apps), then restart the dev server.
        </p>
        <p style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11.5 }}>
          Missing: {missingFirebaseEnvVars.join(', ')}
        </p>
      </div>
    </div>
  )
}

function App() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [user, setUser] = useState(null)

  const [profile, setProfile] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState(null)


  const [resetOobCode, setResetOobCode] = useState(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('mode') === 'resetPassword' ? params.get('oobCode') : null
  })
  const clearResetFlow = () => {
    setResetOobCode(null)
    window.history.replaceState({}, '', window.location.pathname)
  }

  useEffect(() => {
    if (missingFirebaseEnvVars.length) return
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u)
      setCheckingAuth(false)
      if (!u) { setProfile(null); setCatalog(null) }
    })
    return unsub
  }, [])

  if (missingFirebaseEnvVars.length) {
    return <FirebaseSetupNeeded />
  }

  if (resetOobCode) {
    return <ResetPasswordPage oobCode={resetOobCode} onDone={clearResetFlow} />
  }


  const loadProfile = async () => {
    setLoadingProfile(true)
    setProfileError(null)
    try {
      const res = await api.getMyProfile()
      setProfile(res.data.profile)
      setCatalog(res.data.catalog)
    } catch (e) {
      setProfileError(e?.response?.data?.detail || 'Could not load your account. Please try signing in again.')
    } finally {
      setLoadingProfile(false)
    }
  }

  useEffect(() => { if (user) loadProfile() }, [user])

  if (checkingAuth) {
    return (
      <div className="auth-loading-screen">
        <Loader label="Loading" size="lg" />
      </div>
    )
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />
  }

  if (loadingProfile || !profile || !catalog) {
    return (
      <div className="auth-loading-screen">
        {profileError ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 14 }}>{profileError}</p>
            <button className="dash-btn dash-btn--primary" onClick={loadProfile}>Retry</button>
          </div>
        ) : (
          <Loader label="Loading" size="lg" />
        )}
      </div>
    )
  }

  return (
    <PermissionsProvider profile={profile} catalog={catalog} refreshProfile={loadProfile}>
      <AuthenticatedApp user={user} />
    </PermissionsProvider>
  )
}

function AuthenticatedApp({ user }) {
  const { profile, hasModule, refreshProfile } = usePermissions()


  useInactivityLogout(INACTIVITY_TIMEOUT_MS, async () => {
    await signOut(firebaseAuth)
    toast.info("You've been logged out after 5 minutes of inactivity")
  })

  const visibleModules = ALL_MODULES.filter((m) => hasModule(m))
  const [active, setActive] = useState(visibleModules[0] || 'dashboard')
  const [requestCreateCampaign, setRequestCreateCampaign] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchActive, setSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const goToCreateCampaign = () => {
    setActive('campaigns')
    setRequestCreateCampaign(true)
  }

  const closeSearch = () => { setSearchActive(false); setSearchQuery('') }

  const isDashboard = active === 'dashboard'
  const isWhatsapp = active === 'whatsapp'
  const hasAccessToActive = visibleModules.includes(active) || ALWAYS_VISIBLE_MODULES.includes(active)

  if (visibleModules.length === 0) {
    return (
      <div className="auth-loading-screen">
        <AccessDenied
          moduleLabel="anything yet"
          onRefresh={refreshProfile}
          onLogout={async () => {
            await signOut(firebaseAuth)
            toast.success('Logged out successfully')
          }}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={active}
        setActive={setActive}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        searchActive={searchActive}
        onToggleSearch={() => setSearchActive((s) => !s)}
        user={user}
        role={profile.role}
        visibleModules={visibleModules}
        onLogout={async () => {
          await signOut(firebaseAuth)
          toast.success('Logged out successfully')
        }}
      />
      <div className="app-content-col">
        <SearchBar active={searchActive} query={searchQuery} onQueryChange={setSearchQuery} onClose={closeSearch} />
        <main className={isDashboard ? 'app-main app-main--flush' : isWhatsapp ? 'app-main app-main--whatsapp' : 'app-main'}>
          {!hasAccessToActive && <AccessDenied moduleLabel={MODULE_LABEL[active]} />}
          {hasAccessToActive && active === 'dashboard' && <Dashboard user={user} onCreateCampaign={goToCreateCampaign} onOpenCampaigns={() => setActive('campaigns')} searchQuery={searchQuery} />}
          {}
          {visibleModules.includes('tts') && (
            <div style={{ display: active === 'tts' ? 'block' : 'none' }}>
              <TextToSpeech />
            </div>
          )}
          {visibleModules.includes('stt') && (
            <div style={{ display: active === 'stt' ? 'block' : 'none' }}>
              <SpeechToText />
            </div>
          )}
          {hasAccessToActive && active === 'voices' && <ManageVoices />}
          {hasAccessToActive && active === 'whatsapp' && <WhatsAppCampaigns />}
          {hasAccessToActive && active === 'sms' && <SMSCampaigns />}
          {hasAccessToActive && active === 'rcs' && <RCSCampaigns />}
          {hasAccessToActive && active === 'users' && <UserManagement />}
          {hasAccessToActive && active === 'settings' && <Settings />}
          {hasAccessToActive && active === 'campaigns' && (
            <Campaigns
              initialCreate={requestCreateCampaign}
              onConsumeCreate={() => setRequestCreateCampaign(false)}
              onGoToDashboard={() => setActive('dashboard')}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
