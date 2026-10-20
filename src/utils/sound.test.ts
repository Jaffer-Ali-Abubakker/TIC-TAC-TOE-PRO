import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeNode {
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  frequency?: { setValueAtTime: ReturnType<typeof vi.fn> }
  gain?: {
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
}

function createFakeContext() {
  const oscillators: FakeNode[] = []
  const gains: FakeNode[] = []

  const context = {
    state: 'running',
    currentTime: 0,
    destination: {} as unknown,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const node: FakeNode = {
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
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
  }

  return { context, oscillators, gains }
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

const originalAudioContext = window.AudioContext

afterEach(() => {
  installAudioContext(originalAudioContext)
})

describe('playSound', () => {
  it('creates oscillators for the move sound', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installAudioContext(
      vi.fn(function AudioContextMock() {
        return fake.context
      }),
    )

    playSound('move')
    expect(fake.oscillators.length).toBeGreaterThan(0)
    expect(fake.oscillators[0].start).toHaveBeenCalled()
    expect(fake.oscillators[0].stop).toHaveBeenCalled()
    expect(fake.gains.length).toBeGreaterThan(0)
  })

  it('plays a sequence of tones for a win and a draw', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    installAudioContext(
      vi.fn(function AudioContextMock() {
        return fake.context
      }),
    )

    playSound('win')
    const winCount = fake.oscillators.length
    expect(winCount).toBeGreaterThanOrEqual(3)

    playSound('draw')
    expect(fake.oscillators.length).toBeGreaterThan(winCount)
  })

  it('never throws when the Web Audio API is unavailable', async () => {
    const { playSound } = await loadSoundModule()
    installAudioContext(undefined)

    expect(() => playSound('move')).not.toThrow()
    expect(() => playSound('win')).not.toThrow()
    expect(() => playSound('lose')).not.toThrow()
    expect(() => playSound('draw')).not.toThrow()
  })

  it('never throws when the audio context fails mid playback', async () => {
    const { playSound } = await loadSoundModule()
    const fake = createFakeContext()
    fake.context.createOscillator = vi.fn(() => {
      throw new Error('audio blocked')
    })
    installAudioContext(
      vi.fn(function AudioContextMock() {
        return fake.context
      }),
    )

    expect(() => playSound('win')).not.toThrow()
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
    installAudioContext(
      vi.fn(function AudioContextMock() {
        return fake.context
      }),
    )
    expect(isAudioSupported()).toBe(true)
  })
})
