// Fullscreen helpers. Android/desktop support the standard API; iPad uses the webkit
// prefixed one. iPhone Safari has no element fullscreen, so callers should hide the control
// when `fullscreenSupported()` is false and rely on the installed PWA for a chrome-free view.
export function fullscreenSupported() {
  if (typeof document === 'undefined') return false
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

export function fullscreenElement() {
  if (typeof document === 'undefined') return null
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

export async function enterFullscreen(el = document.documentElement) {
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
    return true
  } catch (e) {
    return false
  }
}

export async function exitFullscreen() {
  try {
    if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen()
    else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen()
  } catch (e) { /* leaving fullscreen is best-effort */ }
}

// Subscribe to both the standard and prefixed events; returns an unsubscribe function.
export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn)
  document.addEventListener('webkitfullscreenchange', fn)
  return () => {
    document.removeEventListener('fullscreenchange', fn)
    document.removeEventListener('webkitfullscreenchange', fn)
  }
}
