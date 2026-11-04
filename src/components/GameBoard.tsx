import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { GameCell } from './GameCell'
import type { Board, Player } from '../game/types'

export interface GameBoardProps {
  board: Board
  rows: number
  cols: number
  winningCombination: number[] | null
  lastMoveIndex: number | null
  currentPlayer: Player
  /** `true` when the cell cannot be played (occupied, finished round, AI turn). */
  isInteractive: boolean
  onSelect: (index: number) => void
}

const ARROW_DELTAS: Record<string, { row: number; column: number }> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
}

/**
 * The winning line is positioned inside the grid area spanned by the winning
 * cells, so the browser does the geometry: no measurement, no resize listener.
 */
function describeLine(combination: number[], cols: number): { area: string; kind: string } {
  const first = combination[0]
  const last = combination[combination.length - 1]
  const startRow = Math.floor(first / cols)
  const startCol = first % cols
  const endRow = Math.floor(last / cols)
  const endCol = last % cols

  const area = `${Math.min(startRow, endRow) + 1} / ${Math.min(startCol, endCol) + 1} / ${
    Math.max(startRow, endRow) + 2
  } / ${Math.max(startCol, endCol) + 2}`

  if (startRow === endRow) return { area, kind: 'h' }
  if (startCol === endCol) return { area, kind: 'v' }
  const falling = endRow - startRow === endCol - startCol
  return { area, kind: falling ? 'diag' : 'diag-inv' }
}

/**
 * The board, for any `rows x cols` shape.
 *
 * Uses a roving tab index so the whole board is a single tab stop and the
 * arrow keys move the focus between cells.
 */
export function GameBoard({
  board,
  rows,
  cols,
  winningCombination,
  lastMoveIndex,
  currentPlayer,
  isInteractive,
  onSelect,
}: GameBoardProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const focusCell = useCallback((index: number) => {
    setFocusIndex(index)
    containerRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
      const delta = ARROW_DELTAS[event.key]
      if (!delta) return
      event.preventDefault()

      const row = Math.floor(index / cols) + delta.row
      const column = (index % cols) + delta.column
      if (row < 0 || row >= rows || column < 0 || column >= cols) return

      focusCell(row * cols + column)
    },
    [cols, rows, focusCell],
  )

  const winning = winningCombination ?? []
  const line = winning.length > 0 ? describeLine(winning, cols) : null

  // Big boards need tighter gaps, thinner marks and a smaller radius, or the
  // grid looks like a wall of pills.
  const span = Math.max(rows, cols)
  const density = span <= 4 ? 'cozy' : span <= 6 ? 'tight' : 'dense'

  return (
    <div
      className="board-container"
      data-density={density}
      style={{ '--board-cols': cols, '--board-rows': rows } as CSSProperties}
    >
      <div ref={containerRef} role="group" aria-label="Game board" className="board-grid">
        {board.map((value, index) => (
          <GameCell
            key={index}
            index={index}
            value={value}
            row={Math.floor(index / cols)}
            column={index % cols}
            isWinning={winning.includes(index)}
            isLastMove={lastMoveIndex === index}
            isDisabled={!isInteractive || value !== null}
            tabIndex={index === focusIndex ? 0 : -1}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
          />
        ))}
        {line ? (
          <span
            aria-hidden="true"
            className={`winning-line winning-line--${line.kind}`}
            style={{ gridArea: line.area }}
          />
        ) : null}
      </div>
      <p className="sr-only">
        {`Current turn: ${currentPlayer}. Use the arrow keys to move between cells.`}
      </p>
    </div>
  )
}
