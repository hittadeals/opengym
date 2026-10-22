// Spoken interval cues. speechSynthesis also needs to be primed inside a user gesture on
// iOS, so the Start handler calls primeVoice() before the player starts.
let primed = false
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

export function voiceSupported() {
  return !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined'
}

export function primeVoice() {
  if (!synth) return
  try {
    if (!primed) {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      synth.speak(u)
      primed = true
    } else if (synth.paused) synth.resume()
  } catch (e) { /* */ }
}

export function speak(text, lang, voiceURI) {
  if (!synth || !text) return
  try {
    synth.cancel()
    const u = new SpeechSynthesisUtterance(String(text))
    u.lang = lang || document.documentElement.lang || 'en'
    u.rate = 1.05
    u.pitch = 1
    u.volume = 1
    const voices = synth.getVoices ? synth.getVoices() : []
    if (voiceURI) {
      const chosen = voices.find(v => v.voiceURI === voiceURI)
      if (chosen) { u.voice = chosen; u.lang = chosen.lang || u.lang }
    } else {
      const base = String(u.lang).toLowerCase()
      const match = voices.find(v => String(v.lang).toLowerCase() === base) ||
        voices.find(v => String(v.lang).toLowerCase().startsWith(base.split('-')[0]))
      if (match) { u.voice = match; u.lang = match.lang || u.lang }
    }
    synth.speak(u)
  } catch (e) { /* */ }
}

export function listVoices() {
  if (!synth || !synth.getVoices) return []
  try { return synth.getVoices() || [] } catch (e) { return [] }
}

export function stopVoice() {
  try { if (synth) synth.cancel() } catch (e) { /* */ }
}
