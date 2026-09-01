import { useState, useEffect, useCallback } from 'react'


const THEME_KEY = 'obd-theme'
const THEME_EVENT = 'obd-theme-change'

const VOICE_ADVANCED_KEY = 'obd-voice-advanced'
const VOICE_ADVANCED_EVENT = 'obd-voice-advanced-change'

function readTheme() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(THEME_KEY) === 'dark'
}

function readVoiceAdvanced() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(VOICE_ADVANCED_KEY) === 'true'
}


export function useDarkTheme() {
  const [dark, setDarkState] = useState(readTheme)


  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)

  }, [])

  useEffect(() => {
    const onChange = (e) => setDarkState(e.detail)
    const onStorage = (e) => { if (e.key === THEME_KEY) setDarkState(e.newValue === 'dark') }
    window.addEventListener(THEME_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(THEME_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setDark = useCallback((value) => {
    setDarkState(value)
    document.documentElement.classList.toggle('dark', value)
    window.localStorage.setItem(THEME_KEY, value ? 'dark' : 'light')
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: value }))
  }, [])

  return [dark, setDark]
}


export function useAdvancedVoiceSettings() {
  const [enabled, setEnabledState] = useState(readVoiceAdvanced)

  useEffect(() => {
    const onChange = (e) => setEnabledState(e.detail)
    const onStorage = (e) => { if (e.key === VOICE_ADVANCED_KEY) setEnabledState(e.newValue === 'true') }
    window.addEventListener(VOICE_ADVANCED_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(VOICE_ADVANCED_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setEnabled = useCallback((value) => {
    setEnabledState(value)
    window.localStorage.setItem(VOICE_ADVANCED_KEY, String(value))
    window.dispatchEvent(new CustomEvent(VOICE_ADVANCED_EVENT, { detail: value }))
  }, [])

  return [enabled, setEnabled]
}
