import type { KeyboardEvent } from 'react'
import { Circle, X } from 'lucide-react'
import type { Cell } from '../game/types'

export interface GameCellProps {
  index: number
  value: Cell
  row: number
  column: number
  isWinning: boolean
  isLastMove: boolean
  isDisabled: boolean
  tabIndex: number
  onSelect: (index: number) => void
  onKeyDown: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void
}

function describeCell(value: Cell, isWinning: boolean): string {
  if (value === null) return 'empty'
  return isWinning ? `${value}, winning line` : value
}

/** A single, keyboard accessible board cell. */
export function GameCell({
  index,
  value,
  row,
  column,
  isWinning,
  isLastMove,
  isDisabled,
  tabIndex,
  onSelect,
  onKeyDown,
}: GameCellProps) {
  const state = isWinning ? 'winning' : value === null ? 'empty' : 'occupied'

  return (
    <button
      type="button"
      aria-disabled={isDisabled}
      aria-label={`Row ${row + 1}, column ${column + 1}: ${describeCell(value, isWinning)}`}
      data-state={state}
      data-index={index}
      tabIndex={tabIndex}
      onClick={() => {
        if (isDisabled) return
        onSelect(index)
      }}
      onKeyDown={(event) => onKeyDown(index, event)}
      className={`cell-button relative flex aspect-square w-full items-center justify-center rounded-2xl ${
        isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
      }`}
    >
      {value === 'X' ? (
        <X
          className={`mark-x size-[52%] ${isLastMove ? 'animate-symbol-pop' : ''}`}
          strokeWidth={2.75}
          aria-hidden="true"
        />
      ) : null}
      {value === 'O' ? (
        <Circle
          className={`mark-o size-[46%] ${isLastMove ? 'animate-symbol-pop' : ''}`}
          strokeWidth={2.75}
          aria-hidden="true"
        />
      ) : null}
      {isWinning ? (
        <span
          aria-hidden="true"
          className="animate-win-pulse pointer-events-none absolute inset-0 rounded-2xl border-2 border-glow-emerald"
        />
      ) : null}
    </button>
  )
}
