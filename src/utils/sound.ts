/**
 * Tiny Web Audio engine. Every sound is synthesised locally - no assets are
 * downloaded, no library is used and every failure is swallowed so audio can
 * never break the game.
 *
 * X is lime and sharp (an upward sweep), O is cyan and round (a downward
 * sweep), so a player can hear whose mark just landed.
 */

export type SoundName =
  | 'placeX'
  | 'placeO'
  | 'hover'
  | 'win'
  | 'lose'
  | 'draw'
  | 'click'
  | 'turn'
  | 'invalid'
  | 'score'

let context: AudioContext | null = null
let contextUnavailable = false
let muted = false

/** The whole app shares one mute flag, so a component can play a sound without
 *  having to know whether the player turned audio off. */
export function setSoundMuted(value: boolean): void {
  muted = value
}

export function isSoundMuted(): boolean {
  return muted
}

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

/**
 * A short convolution reverb, built once from white noise. Only the win chord
 * uses it, so it is created lazily and skipped entirely when the browser (or a
 * test double) has no `createConvolver`.
 */
let reverb: ConvolverNode | null = null
let reverbUnavailable = false

function getReverb(ctx: AudioContext): ConvolverNode | null {
  if (reverb) return reverb
  if (reverbUnavailable) return null

  try {
    if (typeof ctx.createConvolver !== 'function' || typeof ctx.createBuffer !== 'function') {
      reverbUnavailable = true
      return null
    }
    const seconds = 0.2
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
      }
    }
    reverb = ctx.createConvolver()
    reverb.buffer = impulse
    return reverb
  } catch {
    reverbUnavailable = true
    return null
  }
}

interface ToneOptions {
  frequency: number
  /** Sweep target; omitted notes stay at `frequency`. */
  endFrequency?: number
  duration: number
  delay?: number
  type?: OscillatorType
  gain?: number
  /** Low-pass cutoff, in Hz. */
  filter?: number
  /** Amplitude LFO rate, in Hz (tremolo). */
  tremolo?: number
  /** Send a copy through the reverb bus. */
  reverb?: boolean
}

function playTone({
  frequency,
  endFrequency,
  duration,
  delay = 0,
  type = 'sine',
  gain = 0.08,
  filter,
  tremolo,
  reverb: withReverb = false,
}: ToneOptions) {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const start = ctx.currentTime + delay
    const end = start + duration
    const oscillator = ctx.createOscillator()
    const amplifier = ctx.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end)
    }

    amplifier.gain.setValueAtTime(0.0001, start)
    amplifier.gain.exponentialRampToValueAtTime(gain, start + 0.012)
    amplifier.gain.exponentialRampToValueAtTime(0.0001, end)

    let head: AudioNode = oscillator
    if (filter !== undefined && typeof ctx.createBiquadFilter === 'function') {
      const lowPass = ctx.createBiquadFilter()
      lowPass.type = 'lowpass'
      lowPass.frequency.setValueAtTime(filter, start)
      oscillator.connect(lowPass)
      head = lowPass
    }
    head.connect(amplifier)

    if (tremolo !== undefined) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.setValueAtTime(tremolo, start)
      depth.gain.setValueAtTime(gain / 2, start)
      lfo.connect(depth)
      depth.connect(amplifier.gain)
      lfo.start(start)
      lfo.stop(end + 0.02)
    }

    amplifier.connect(ctx.destination)

    if (withReverb) {
      const bus = getReverb(ctx)
      if (bus) {
        const wet = ctx.createGain()
        wet.gain.setValueAtTime(0.25, start)
        amplifier.connect(bus)
        bus.connect(wet)
        wet.connect(ctx.destination)
      }
    }

    oscillator.start(start)
    oscillator.stop(end + 0.02)
  } catch {
    // Audio is a nice-to-have, never a hard requirement.
  }
}

/** Hover ticks are throttled: a fast pointer must not machine-gun the mix. */
let lastHoverAt = 0

const SOUNDS: Record<SoundName, () => void> = {
  // Lime: sharp, upward.
  placeX: () => {
    playTone({
      frequency: 440,
      endFrequency: 880,
      duration: 0.08,
      type: 'sine',
      gain: 0.22,
    })
    playTone({ frequency: 660, duration: 0.12, delay: 0.04, type: 'triangle', gain: 0.1 })
  },
  // Cyan: a deep bubble that drops.
  placeO: () => {
    playTone({
      frequency: 300,
      endFrequency: 150,
      duration: 0.15,
      type: 'sine',
      gain: 0.28,
      filter: 900,
    })
    playTone({ frequency: 150, duration: 0.16, delay: 0.05, type: 'sine', gain: 0.1 })
  },
  hover: () => {
    const now = Date.now()
    if (now - lastHoverAt < 100) return
    lastHoverAt = now
    playTone({ frequency: 800, duration: 0.04, gain: 0.05 })
  },
  // C5-E5-G5-C6, arpeggio with a little room.
  win: () => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      playTone({
        frequency,
        duration: 0.4,
        delay: index * 0.08,
        type: 'triangle',
        gain: 0.14,
        reverb: true,
      })
    })
  },
  lose: () => {
    playTone({ frequency: 320, duration: 0.18, type: 'sine', gain: 0.1 })
    playTone({ frequency: 214, duration: 0.28, delay: 0.15, type: 'sine', gain: 0.1 })
  },
  draw: () => {
    playTone({ frequency: 400, duration: 0.45, type: 'sine', gain: 0.12, tremolo: 10 })
    playTone({ frequency: 350, duration: 0.45, type: 'sine', gain: 0.12, tremolo: 10 })
  },
  click: () => playTone({ frequency: 600, duration: 0.05, type: 'square', gain: 0.08 }),
  turn: () => playTone({ frequency: 500, duration: 0.06, gain: 0.07 }),
  invalid: () => playTone({ frequency: 150, duration: 0.2, type: 'sawtooth', gain: 0.1, filter: 600 }),
  score: () => {
    playTone({ frequency: 900, duration: 0.08, gain: 0.14 })
    playTone({ frequency: 1200, duration: 0.06, delay: 0.06, gain: 0.1 })
  },
}

export function playSound(name: SoundName): void {
  if (muted) return
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
