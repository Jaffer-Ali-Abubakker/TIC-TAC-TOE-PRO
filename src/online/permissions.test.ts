import { describe, expect, it } from 'vitest'
import { getPermissions } from './permissions'

describe('room permissions', () => {
  it('gives the lobby create, join and board size', () => {
    const permissions = getPermissions(null, null)
    expect(permissions.canCreateRoom).toBe(true)
    expect(permissions.canJoin).toBe(true)
    expect(permissions.canChangeBoardSize).toBe(true)
    expect(permissions.canCopyCode).toBe(false)
    expect(permissions.canPlay).toBe(false)
  })

  it('lets the host copy the code and invite, and close the room', () => {
    const permissions = getPermissions('host', 'active')
    expect(permissions.canCopyCode).toBe(true)
    expect(permissions.canCopyLink).toBe(true)
    expect(permissions.canShare).toBe(true)
    expect(permissions.canDeleteRoom).toBe(true)
    expect(permissions.canPlay).toBe(true)
    expect(permissions.canLeave).toBe(true)
    expect(permissions.canCreateRoom).toBe(false)
    expect(permissions.canChangeBoardSize).toBe(false)
    expect(permissions.canKick).toBe(false)
  })

  it('lets the guest play and leave, and nothing else', () => {
    const permissions = getPermissions('guest', 'active')
    expect(permissions.canPlay).toBe(true)
    expect(permissions.canLeave).toBe(true)
    expect(permissions.canCreateRoom).toBe(false)
    expect(permissions.canCopyCode).toBe(false)
    expect(permissions.canCopyLink).toBe(false)
    expect(permissions.canShare).toBe(false)
    expect(permissions.canChangeBoardSize).toBe(false)
    expect(permissions.canDeleteRoom).toBe(false)
    expect(permissions.canKick).toBe(false)
    expect(permissions.canStartRematch).toBe(false)
  })

  it('lets the guest accept a rematch but never start one', () => {
    const guest = getPermissions('guest', 'finished')
    expect(guest.canAcceptRematch).toBe(true)
    expect(guest.canStartRematch).toBe(false)

    const host = getPermissions('host', 'finished')
    expect(host.canStartRematch).toBe(true)
  })

  it('gives a spectator only the right to walk away', () => {
    const permissions = getPermissions(null, 'active')
    expect(permissions.canLeave).toBe(true)
    expect(permissions.canPlay).toBe(false)
    expect(permissions.canCreateRoom).toBe(false)
    expect(permissions.canCopyCode).toBe(false)
  })

  it('does not let a guest play a closed room', () => {
    expect(getPermissions('guest', 'closed').canPlay).toBe(false)
  })
})
