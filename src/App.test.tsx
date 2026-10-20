import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { STORAGE_KEY } from './utils/storage'

function cell(row: number, column: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Row ${row}, column ${column}:`) })
}

function cellText(index: number): string {
  return cell(Math.floor(index / 3) + 1, (index % 3) + 1).getAttribute('aria-label') ?? ''
}

function readStored(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('initial render', () => {
  it('renders the board, the score and the controls', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /tic-tac-toe pro/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Row \d, column \d:/ })).toHaveLength(9)
    expect(screen.getByTestId('score-player')).toBeInTheDocument()
    expect(screen.getByTestId('score-draw')).toBeInTheDocument()
    expect(screen.getByTestId('score-computer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart round/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new match/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /vs computer/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /2 players/i })).not.toBeChecked()
  })

  it('shows an empty history state', () => {
    render(<App />)
    expect(screen.getByText(/no completed rounds yet/i)).toBeInTheDocument()
  })

  it('announces the current turn', () => {
    render(<App />)
    expect(screen.getByText(/your turn/i)).toBeInTheDocument()
  })
})

describe('player versus computer', () => {
  it('places the human symbol and lets the computer answer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(cell(1, 1))
    expect(cellText(0)).toContain('X')

    await waitFor(() => {
      const labels = Array.from(
        screen.getAllByRole('button', { name: /^Row \d, column \d:/ }),
      ).map((element) => element.getAttribute('aria-label') ?? '')
      expect(labels.filter((label) => label.endsWith('O')).length).toBe(1)
    })
  })

  it('blocks human input while the computer is thinking', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(cell(1, 1))
    // The computer is now thinking - the cell must not accept another symbol.
    await user.click(cell(2, 2))
    expect(cellText(4)).toContain('empty')
  })

  it('never lets the human overwrite an existing move', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(cell(1, 1))
    await user.click(cell(1, 1))
    expect(cellText(0)).toContain('X')
  })

  it('cancels a pending computer move when the round is restarted', async () => {
    // `delay: null` keeps the clicks instantaneous so the restart always
    // happens before the computer reply is due.
    const user = userEvent.setup({ delay: null })
    render(<App />)

    await user.click(cell(1, 1))
    await user.click(screen.getByRole('button', { name: /restart round/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /restart round/i }))

    // Give the (cancelled) computer reply more than enough time to arrive.
    await new Promise((resolve) => setTimeout(resolve, 900))

    expect(cellText(0)).toContain('empty')
    expect(cellText(4)).toContain('empty')
    expect(screen.queryAllByTestId('history-entry')).toHaveLength(0)
  })

  it('lets the computer move first when the human plays O', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    const settings = screen.getByRole('dialog')
    await user.click(within(settings).getByRole('radio', { name: 'O' }))
    await user.keyboard('{Escape}')

    await waitFor(() => {
      const labels = Array.from(
        screen.getAllByRole('button', { name: /^Row \d, column \d:/ }),
      ).map((element) => element.getAttribute('aria-label') ?? '')
      expect(labels.filter((label) => label.endsWith('X')).length).toBe(1)
    })
  })
})

describe('two player mode', () => {
  it('alternates between both players without a computer reply', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    expect(cellText(0)).toContain('X')

    await user.click(cell(1, 2))
    expect(cellText(1)).toContain('O')

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(cellText(4)).toContain('empty')
  })

  it('identifies the player whose turn it is', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    expect(screen.getByText(/player 1 \(x\) to move/i)).toBeInTheDocument()

    await user.click(cell(1, 1))
    expect(screen.getByText(/player 2 \(o\) to move/i)).toBeInTheDocument()
  })

  it('records the winner and updates the score exactly once', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 1))
    await user.click(cell(1, 2))
    await user.click(cell(2, 2))
    await user.click(cell(1, 3))

    const result = screen.getByTestId('game-result')
    expect(within(result).getByText(/player 1 wins/i)).toBeInTheDocument()
    expect(screen.getByTestId('score-x')).toHaveTextContent('1')
    expect(screen.getByTestId('score-draw')).toHaveTextContent('0')
    expect(screen.getAllByTestId('history-entry')).toHaveLength(1)
  })
})

describe('round and match management', () => {
  it('asks for confirmation before discarding a round in progress', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))

    await user.click(screen.getByRole('radio', { name: /vs computer/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/switch game mode\?/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /switch mode/i }))
    await waitFor(() => {
      expect(cellText(0)).toContain('empty')
    })
  })

  it('restarts a round and clears the board', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 2))

    await user.click(screen.getByRole('button', { name: /restart round/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /restart round/i }))

    await waitFor(() => {
      expect(cellText(0)).toContain('empty')
      expect(cellText(4)).toContain('empty')
    })
  })

  it('asks for confirmation before starting a new match mid round', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))

    await user.click(screen.getByRole('button', { name: /new match/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/start a new match\?/i)).toBeInTheDocument()
  })

  it('starts a new match and resets the scores', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 1))
    await user.click(cell(1, 2))
    await user.click(cell(2, 2))
    await user.click(cell(1, 3))
    expect(screen.getByTestId('score-x')).toHaveTextContent('1')

    // The round is already finished, so no confirmation is needed.
    await user.click(screen.getByRole('button', { name: /new match/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('score-x')).toHaveTextContent('0')
    })
    expect(screen.queryAllByTestId('history-entry')).toHaveLength(0)
  })
})

describe('settings and statistics', () => {
  it('opens the settings dialog and can be closed with the escape key', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/settings/i)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('moves focus into the dialog and restores it on close', async () => {
    const user = userEvent.setup()
    render(<App />)

    const trigger = screen.getByRole('button', { name: /open settings/i })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog')
    const closeButton = within(dialog).getByRole('button', { name: /close dialog/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(closeButton)
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('keeps the keyboard focus inside the dialog', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    const dialog = screen.getByRole('dialog')

    for (let index = 0; index < 12; index += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('requires a confirmation before resetting the statistics', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    const settings = screen.getByRole('dialog')
    await user.click(within(settings).getByRole('button', { name: /^reset$/i }))

    const confirm = screen.getByRole('dialog')
    expect(within(confirm).getByText(/reset all statistics\?/i)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: /reset statistics/i }))

    await waitFor(() => {
      expect(screen.getByTestId('score-player')).toHaveTextContent('0')
    })
  })

  it('toggles the sound preference', async () => {
    const user = userEvent.setup()
    render(<App />)

    const soundButton = screen.getByRole('button', { name: /enable sound effects/i })
    await user.click(soundButton)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mute sound effects/i })).toBeInTheDocument()
    })
  })
})

describe('persistence', () => {
  it('stores the preferences and the statistics in localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 1))
    await user.click(cell(1, 2))
    await user.click(cell(2, 2))
    await user.click(cell(1, 3))

    await waitFor(() => {
      const stored = readStored()
      expect((stored.stats as { pvp: { xWins: number } }).pvp.xWins).toBe(1)
    })

    unmount()

    render(<App />)
    expect(screen.getByTestId('score-x')).toHaveTextContent('1')
    expect(screen.getAllByTestId('history-entry')).toHaveLength(1)
  })

  it('falls back to the defaults when the stored data is corrupted', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"version":1,"mode":"nope"')
    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByTestId('score-player')).toHaveTextContent('0')
    expect(screen.getByRole('radio', { name: /vs computer/i })).toBeChecked()
  })

  it('ignores an incompatible schema version', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, mode: 'pvp', difficulty: 'hard' }),
    )
    render(<App />)
    expect(screen.getByRole('radio', { name: /vs computer/i })).toBeChecked()
  })
})

describe('accessibility', () => {
  it('supports keyboard play with the arrow keys and enter', async () => {
    const user = userEvent.setup()
    render(<App />)

    const first = cell(1, 1)
    first.focus()
    expect(document.activeElement).toBe(first)

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cell(1, 2))

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(cell(2, 2))

    await user.keyboard('{Enter}')
    expect(cellText(4)).toContain('X')
  })

  it('exposes the result through a live region', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 1))
    await user.click(cell(1, 2))
    await user.click(cell(2, 2))
    await user.click(cell(1, 3))

    const result = screen.getByTestId('game-result')
    expect(result).toHaveAttribute('role', 'status')
    expect(result).toHaveAttribute('aria-live', 'polite')
  })

  it('marks cells that cannot be played as disabled for assistive technology', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    expect(cell(1, 1)).toHaveAttribute('aria-disabled', 'true')
  })

  it('ignores every interaction once the round is over', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: /2 players/i }))
    await user.click(cell(1, 1))
    await user.click(cell(2, 1))
    await user.click(cell(1, 2))
    await user.click(cell(2, 2))
    await user.click(cell(1, 3))

    await user.click(cell(3, 3))
    await user.click(cell(3, 1))
    expect(cellText(8)).toContain('empty')
    expect(cellText(6)).toContain('empty')
    expect(screen.getAllByTestId('history-entry')).toHaveLength(1)
  })
})
