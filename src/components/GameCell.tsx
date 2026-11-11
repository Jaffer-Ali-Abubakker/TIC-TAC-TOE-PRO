import type { KeyboardEvent, PointerEvent } from 'react'
import type { Cell } from '../game/types'
import { playSound } from '../utils/sound'

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

  const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    // A tick only for a mouse that can actually place something; touch drags
    // and the computer's own moves stay silent.
    if (event.pointerType !== 'mouse' || isDisabled) return
    playSound('hover')
  }

  return (
    <button
      type="button"
      aria-disabled={isDisabled}
      aria-label={`Row ${row + 1}, column ${column + 1}: ${describeCell(value, isWinning)}`}
      data-state={state}
      data-index={index}
      data-last={isLastMove}
      data-value={value ?? undefined}
      tabIndex={tabIndex}
      onClick={() => {
        if (isDisabled) return
        onSelect(index)
      }}
      onPointerEnter={handlePointerEnter}
      onKeyDown={(event) => onKeyDown(index, event)}
      className="cell-button"
    >
      {value === 'X' ? (
        <span
          className={`mark-x ${isLastMove ? 'animate-mark-pop' : ''}`}
          aria-hidden="true"
        />
      ) : null}
      {value === 'O' ? (
        <span
          className={`mark-o ${isLastMove ? 'animate-mark-pop' : ''}`}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
