import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createClient } from '@supabase/supabase-js'
import App from './App'
import { resetSupabaseClient } from './online/supabase'
import { createFakeSupabase, makeRoomPayload, type FakeSupabase } from './test/fakeSupabase'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const createClientMock = createClient as unknown as ReturnType<typeof vi.fn>

let supabase: FakeSupabase

function cell(row: number, column: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Row ${row}, column ${column}:`) })
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubEnv('VITE_APP_URL', 'https://play.example.com')

  supabase = createFakeSupabase()
  createClientMock.mockReturnValue(supabase.client)
  resetSupabaseClient()

  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

describe('online mode entry', () => {
  it('offers the online mode in the mode selector', () => {
    render(<App />)
    expect(screen.getByRole('radio', { name: /online/i })).toBeInTheDocument()
  })

  it('shows the lobby with create and join options', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))

    expect(screen.getByRole('button', { name: /create private room/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/join with a room code/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
  })

  it('keeps the local modes working', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    expect(cell(1, 1).getAttribute('aria-label')).toContain('X')
  })
})

describe('creating and joining a room', () => {
  it('shows the waiting screen with the room code after creating', async () => {
    const user = userEvent.setup()
    supabase.onRpc('create_online_room', () => makeRoomPayload())
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.click(screen.getByRole('button', { name: /create private room/i }))

    await waitFor(() => {
      expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    expect(screen.getByText(/waiting for your opponent/i)).toBeInTheDocument()
  })

  it('joins a room with a code and shows the board', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'active' }),
      mySymbol: 'O',
    }))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(screen.getByText(/opponent's turn/i)).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: /^Row \d, column \d:/ })).toHaveLength(9)
  })

  it('creates a room on the board size chosen in the lobby', async () => {
    const user = userEvent.setup()
    const payload = makeRoomPayload()
    supabase.onRpc('create_online_room', () => ({
      ...payload,
      room: {
        ...payload.room,
        rows: 5,
        cols: 5,
        winLength: 4,
        board: Array.from({ length: 25 }, () => null),
      },
    }))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.click(screen.getByRole('radio', { name: /^5×5$/ }))
    expect(screen.getByText(/5×5 • 4 to win/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /create private room/i }))

    await waitFor(() => {
      expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    })
    expect(supabase.rpcCalls[0].args).toMatchObject({ p_rows: 5, p_cols: 5 })
    expect(screen.getByText(/you will play a 5×5 board, 4 in a row to win/i)).toBeInTheDocument()
  })

  it('joins a room on the size the creator picked', async () => {
    const user = userEvent.setup()
    const payload = makeRoomPayload({ status: 'active' })
    supabase.onRpc('join_online_room', () => ({
      ...payload,
      mySymbol: 'O',
      room: {
        ...payload.room,
        rows: 6,
        cols: 6,
        winLength: 4,
        board: Array.from({ length: 36 }, () => null),
      },
    }))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Row \d, column \d:/ })).toHaveLength(36)
    })
    expect(screen.getByText('6×6')).toBeInTheDocument()
  })

  it('shows a friendly error when the room is full', async () => {
    const user = userEvent.setup()
    supabase.failRpc('join_online_room', 'room_full')
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(screen.getByText(/already full/i)).toBeInTheDocument()
    })
  })

  it('rejects a malformed code before contacting the server', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'NOPE')

    const joinButton = screen.getByRole('button', { name: /^join$/i })
    expect(joinButton).toBeDisabled()
    expect(screen.getByText(/eight characters, for example/i)).toBeInTheDocument()
    expect(supabase.rpcCalls).toHaveLength(0)
  })
})

describe('invite links', () => {
  it('opens the online mode and offers the room without taking the seat', async () => {
    window.history.replaceState({}, '', '/?room=ABCD1234')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/you were invited to a room/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /join this room/i })).toBeInTheDocument()
    // The seat is not taken automatically.
    expect(supabase.rpcCalls).toHaveLength(0)
  })

  it('joins the invited room when the visitor confirms', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'active' }),
      mySymbol: 'O',
    }))
    window.history.replaceState({}, '', '/?room=ABCD1234')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /join this room/i }))

    await waitFor(() => {
      expect(supabase.rpcCalls.some((call) => call.name === 'join_online_room')).toBe(true)
    })
  })
})

describe('missing configuration', () => {
  it('shows a setup message and keeps the local modes usable', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    resetSupabaseClient()

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))

    expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0)
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()

    // The local modes still work.
    await user.click(screen.getByRole('radio', { name: /vs computer/i }))
    expect(screen.getByRole('radio', { name: /vs computer/i })).toBeChecked()
  })
})

describe('online match controls', () => {
  it('offers a rematch and a leave action in a finished match', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'finished', result: 'X', winnerSymbol: 'X', version: 9 }),
      mySymbol: 'O',
    }))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request rematch/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /leave room/i })).toBeInTheDocument()
  })

  it('shows the connection state', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'active' }),
      mySymbol: 'O',
    }))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      const status = screen.getAllByText(/live/i)
      expect(status.length).toBeGreaterThan(0)
    })
  })
})

/** A room created by someone else - this browser is the guest (O). */
function guestPayload(status: 'active' | 'finished' | 'closed' = 'active') {
  const base = makeRoomPayload({ status })
  const finished = status === 'finished'
  return {
    ...base,
    room: {
      ...base.room,
      result: finished ? ('X' as const) : null,
      winnerSymbol: finished ? ('X' as const) : null,
    },
    players: [
      { ...base.players[0], userId: 'host-user', symbol: 'X' as const, isOwner: true },
      { ...base.players[0], userId: 'anonymous-user', symbol: 'O' as const, isOwner: false },
    ],
    mySymbol: 'O' as const,
  }
}

describe('room permissions', () => {
  it('shows the host the code, invite and share controls in the waiting room', async () => {
    const user = userEvent.setup()
    supabase.onRpc('create_online_room', () => makeRoomPayload())
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.click(screen.getByRole('button', { name: /create private room/i }))

    await waitFor(() => {
      expect(screen.getByText(/waiting for your opponent/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create private room/i })).not.toBeInTheDocument()
  })

  it('offers the invited visitor a guest join and nothing else', async () => {
    window.history.replaceState({}, '', '/?room=ABCD1234')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/you were invited to a room/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/you are joining as guest/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join this room/i })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /create private room/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy code/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy invite link/i })).not.toBeInTheDocument()
  })

  it('only lets the guest accept a rematch the host requested', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => guestPayload('finished'))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    const accept = await screen.findByRole('button', { name: /accept rematch/i })
    expect(accept).toBeDisabled()
    expect(screen.queryByRole('button', { name: /request rematch/i })).not.toBeInTheDocument()
  })

  it('tells the guest the host left and takes the room away', async () => {
    const user = userEvent.setup()
    supabase.onRpc('join_online_room', () => guestPayload('active'))
    supabase.onRpc('get_online_room_state', () => guestPayload('closed'))
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /online/i }))
    await user.type(screen.getByLabelText(/join with a room code/i), 'ABCD1234')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(supabase.channels[0]).toBeDefined()
    })

    await act(async () => {
      supabase.channels[0].emitChange({})
    })

    await waitFor(() => {
      expect(screen.getAllByText(/host left the room/i).length).toBeGreaterThan(0)
    })
  })
})
