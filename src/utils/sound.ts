/**
 * Tiny Web Audio helper. All sounds are generated locally, no assets are
 * downloaded and every failure is swallowed so audio can never break the game.
 */

type SoundName = 'move' | 'win' | 'lose' | 'draw'

let context: AudioContext | null = null
let contextUnavailable = false

function getAudioContext(): AudioContext | null {
  if (contextUnavailable) return null
  if (typeof window === 'undefined') return null

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      contextUnavailable = true
      return null
    }
    if (!context) context = new Ctor()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    contextUnavailable = true
    return null
  }
}

interface ToneOptions {
  frequency: number
  duration: number
  delay?: number
  type?: OscillatorType
  gain?: number
}

function playTone({ frequency, duration, delay = 0, type = 'sine', gain = 0.08 }: ToneOptions) {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const start = ctx.currentTime + delay
    const oscillator = ctx.createOscillator()
    const amplifier = ctx.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)

    amplifier.gain.setValueAtTime(0.0001, start)
    amplifier.gain.exponentialRampToValueAtTime(gain, start + 0.012)
    amplifier.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    oscillator.connect(amplifier)
    amplifier.connect(ctx.destination)

    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  } catch {
    // Audio is a nice-to-have, never a hard requirement.
  }
}

const SOUNDS: Record<SoundName, () => void> = {
  move: () => playTone({ frequency: 520, duration: 0.08, type: 'triangle', gain: 0.05 }),
  win: () => {
    playTone({ frequency: 523.25, duration: 0.14, type: 'triangle', gain: 0.07 })
    playTone({ frequency: 659.25, duration: 0.14, delay: 0.11, type: 'triangle', gain: 0.07 })
    playTone({ frequency: 783.99, duration: 0.24, delay: 0.22, type: 'triangle', gain: 0.08 })
  },
  lose: () => {
    playTone({ frequency: 320, duration: 0.18, type: 'sine', gain: 0.06 })
    playTone({ frequency: 214, duration: 0.28, delay: 0.15, type: 'sine', gain: 0.06 })
  },
  draw: () => {
    playTone({ frequency: 392, duration: 0.16, type: 'sine', gain: 0.06 })
    playTone({ frequency: 294, duration: 0.24, delay: 0.14, type: 'sine', gain: 0.06 })
  },
}

export function playSound(name: SoundName): void {
  try {
    SOUNDS[name]()
  } catch {
    // ignore
  }
}

export function isAudioSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.AudioContext)
}
