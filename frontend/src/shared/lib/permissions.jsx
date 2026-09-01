import { createContext, useContext } from 'react'

const PermissionsContext = createContext(null)

export function PermissionsProvider({ profile, catalog, refreshProfile, children }) {

  const hasModule = (module) => {
    if (!profile) return false
    if (profile.role === 'super_admin' || profile.role === 'admin') return true
    return (profile.modules || []).includes(module)
  }

  const can = (module, service) => {
    if (!profile) return false
    if (profile.role === 'super_admin' || profile.role === 'admin') return true
    if (!(profile.modules || []).includes(module)) return false
    if (!service) return true
    return (profile.services || []).includes(`${module}:${service}`)
  }

  const canField = (module, field) => {
    if (!profile) return false
    if (profile.role === 'super_admin' || profile.role === 'admin') return true
    return (profile.fields || []).includes(`${module}:${field}`)
  }

  return (
    <PermissionsContext.Provider value={{ profile, catalog, hasModule, can, canField, refreshProfile }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used within a PermissionsProvider')
  return ctx
}
