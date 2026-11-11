import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SoundName } from './sound'

interface FakeNode {
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  frequency?: {
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  gain?: {
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
}

const ALL_SOUNDS: SoundName[] = [
  'placeX',
  'placeO',
  'hover',
  'win',
  'lose',
  'draw',
  'click',
  'turn',
  'invalid',
  'score',
]

function createFakeContext() {
  const oscillators: FakeNode[] = []
  const gains: FakeNode[] = []
  const filters: FakeNode[] = []
  const convolvers: FakeNode[] = []

  const context = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48_000,
    destination: {} as unknown,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const node: FakeNode = {
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      }
      oscillators.push(node)
      return node
    }),
    createGain: vi.fn(() => {
      const node: FakeNode = {
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        } as unknown as FakeNode['gain'],
      }
      gains.push(node)
      return node
    }),
    createBiquadFilter: vi.fn(() => {
      const node: FakeNode = {
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }
      filters.push(node)
      return node
    }),
    createConvolver: vi.fn(() => {
      const node: FakeNode & { buffer?: unknown } = {
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      convolvers.push(node)
      return node
    }),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(length),
    })),
  }

  return { context, oscillators, gains, filters, convolvers }
}

/** Loads a fresh copy of the module so the cached AudioContext is reset. */
async function loadSoundModule() {
  vi.resetModules()
  return await import('./sound')
}

function installAudioContext(value: unknown) {
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    writable: true,
    value,
  })
}

function installFake(fake: ReturnType<typeof createFakeContext>) {
  installAudioContext(
    vi.fn(function AudioContextMock() {
      return fake.context
    }),
  )
}

const originalAudioContext = window.AudioContext

afterEach(() => {
  installAudioContext(originalAudioContext)
})

describe('playSound', () => {
  it('sweeps upward for X and downward through a low-pass filter for O', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    playSound('placeX')
    expect(fake.oscillators.length).toBeGreaterThanOrEqual(2)
    expect(fake.oscillators[0].frequency?.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      880,
      expect.any(Number),
    )
    expect(fake.oscillators[0].start).toHaveBeenCalled()
    expect(fake.oscillators[0].stop).toHaveBeenCalled()

    const beforeO = fake.oscillators.length
    playSound('placeO')
    expect(fake.oscillators.length).toBeGreaterThan(beforeO)
    expect(fake.filters.length).toBeGreaterThan(0)
  })

  it('plays a four note arpeggio with reverb for a win', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    playSound('win')
    expect(fake.oscillators.length).toBeGreaterThanOrEqual(4)
    expect(fake.convolvers.length).toBe(1)
  })

  it('modulates the draw tones with an LFO', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    playSound('draw')
    // Two tones plus one LFO each.
    expect(fake.oscillators.length).toBeGreaterThanOrEqual(4)
  })

  it('plays every sound without throwing', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    for (const name of ALL_SOUNDS) {
      expect(() => playSound(name)).not.toThrow()
    }
    expect(fake.oscillators.length).toBeGreaterThan(0)
  })

  it('stays silent while muted and comes back when unmuted', async () => {
    const { playSound, setSoundMuted, isSoundMuted } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    setSoundMuted(true)
    expect(isSoundMuted()).toBe(true)
    playSound('placeX')
    playSound('win')
    expect(fake.oscillators.length).toBe(0)

    setSoundMuted(false)
    playSound('placeX')
    expect(fake.oscillators.length).toBeGreaterThan(0)
  })

  it('throttles the hover tick', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)

    playSound('hover')
    playSound('hover')
    playSound('hover')
    expect(fake.oscillators.length).toBe(1)
  })

  it('never throws when the Web Audio API is unavailable', async () => {
    const { playSound } = await loadSoundModule()
    installAudioContext(undefined)

    for (const name of ALL_SOUNDS) {
      expect(() => playSound(name)).not.toThrow()
    }
  })

  it('never throws when the audio context fails mid playback', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    fake.context.createOscillator = vi.fn(() => {
      throw new Error('audio blocked')
    })
    installFake(fake)

    expect(() => playSound('win')).not.toThrow()
  })

  it('skips filters and reverb when the browser does not provide them', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    const bare = {
      ...fake.context,
      createBiquadFilter: undefined,
      createConvolver: undefined,
      createBuffer: undefined,
    }
    installAudioContext(
      vi.fn(function AudioContextMock() {
        return bare
      }),
    )

    expect(() => playSound('placeO')).not.toThrow()
    expect(() => playSound('win')).not.toThrow()
    expect(fake.oscillators.length).toBeGreaterThan(0)
  })
})

describe('isAudioSupported', () => {
  it('reports false when the Web Audio API is missing', async () => {
    const { isAudioSupported } = await loadSoundModule()
    installAudioContext(undefined)
    expect(isAudioSupported()).toBe(false)
  })

  it('reports true when the Web Audio API exists', async () => {
    const { isAudioSupported } = await loadSoundModule()
    const fake = createFakeContext()
    installFake(fake)
    expect(isAudioSupported()).toBe(true)
  })
})
