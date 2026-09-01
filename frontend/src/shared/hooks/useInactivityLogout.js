import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']


export function useInactivityLogout(timeoutMs, onTimeout) {
  const timerRef = useRef(null)
  const callbackRef = useRef(onTimeout)
  callbackRef.current = onTimeout

  useEffect(() => {
    const reset = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => callbackRef.current(), timeoutMs)
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset))
    }
  }, [timeoutMs])
}
