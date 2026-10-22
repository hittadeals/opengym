// WebAudio beeps + haptics.
//
// Mobile browsers do not let a page start an AudioContext from a timer callback: the
// context is created suspended and every beep is silent. On iOS the ring/silent switch
// also mutes the default "ambient" audio session. Both are fixed here:
//   - unlockAudio() must run inside a real tap (Start, Test sound, any pointerdown), which
//     creates/resumes the context and plays a silent buffer to satisfy iOS.
//   - the audio session is marked as "playback", so timer cues are treated as media and
//     are not silenced by the ringer switch (iOS 16.4+; ignored elsewhere).
let audioCtx = null
let sessionSet = false

function context() {
  if (audioCtx) return audioCtx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try { audioCtx = new AC() } catch (e) { audioCtx = null }
  return audioCtx
}

export function audioReady() {
  return !!audioCtx && audioCtx.state === 'running'
}

// Call from a user gesture. Safe to call repeatedly.
export async function unlockAudio() {
  const ctx = context()
  if (!ctx) return false
  if (audioReady()) return true
  try {
    if (!sessionSet && navigator.audioSession) {
      navigator.audioSession.type = 'playback'
      sessionSet = true
    }
    if (ctx.state === 'suspended') await ctx.resume()
    // A silent 1-sample buffer is the iOS unlock ritual: without a source started during
    // the gesture, later oscillators can still be dropped.
    const b = ctx.createBuffer(1, 1, 22050)
    const s = ctx.createBufferSource()
    s.buffer = b
    s.connect(ctx.destination)
    s.start(0)
    return ctx.state === 'running'
  } catch (e) {
    return false
  }
}

export function beep(enabled, freq, dur, when) {
  if (!enabled) return
  const ctx = context()
  if (!ctx) return
  try {
    // Timers created after the first tap are running; if the context was suspended by
    // the OS (call, backgrounding), ask it to resume before scheduling.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = freq || 880; o.type = 'sine'
    const t0 = ctx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18))
    o.start(t0); o.stop(t0 + (dur || 0.18) + 0.05)
  } catch (e) { /* */ }
}

export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p) } catch (e) { /* */ } }
