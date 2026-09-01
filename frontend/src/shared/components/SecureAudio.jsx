import { useEffect, useRef, useState } from 'react'

export function SecureAudio({ loadUrl, style, controls = true }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const urlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFailed(false)

    loadUrl()
      .then((blobUrl) => {
        if (cancelled) {
          window.URL.revokeObjectURL(blobUrl)
          return
        }
        if (urlRef.current) window.URL.revokeObjectURL(urlRef.current)
        urlRef.current = blobUrl
        setUrl(blobUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (urlRef.current) {
        window.URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [])

  if (failed) {
    return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Couldn't load audio</span>
  }
  if (!url) {
    return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</span>
  }
  return <audio controls={controls} src={url} style={style} />
}

export function SecureDownloadButton({ loadUrl, filename, children, style }) {
  const handleClick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const blobUrl = await loadUrl()
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch {
    }
  }
  return (
    <span onClick={handleClick} style={{ cursor: 'pointer', display: 'inline-flex', ...style }}>
      {children}
    </span>
  )
}
