import { describe, expect, it } from 'vitest'
import { readOnlineConfig } from './config'

describe('readOnlineConfig', () => {
  it('reports every missing variable', () => {
    const result = readOnlineConfig({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toContain('VITE_SUPABASE_URL')
    expect(result.missing).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(result.error).toMatch(/not configured/i)
  })

  it('rejects a malformed url', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/valid URL/i)
  })

  it('returns the configuration when everything is present', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      VITE_APP_URL: 'https://play.example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.supabaseUrl).toBe('https://abc.supabase.co')
    expect(result.config.supabasePublishableKey).toBe('sb_publishable_x')
    expect(result.config.appUrl).toBe('https://play.example.com')
  })

  it('ignores blank values', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: '   ',
      VITE_SUPABASE_PUBLISHABLE_KEY: '  ',
    })
    expect(result.ok).toBe(false)
  })

  it('falls back to the current origin when no app url is configured', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The runtime origin IS the deployed domain, so invite links stay correct
    // even when VITE_APP_URL is not known at build time.
    expect(result.config.appUrl).toBe(window.location.origin)
    expect(result.config.appUrl).toMatch(/^https?:\/\//)
  })

  it('prefers an explicitly configured app url', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      VITE_APP_URL: 'https://play.example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.appUrl).toBe('https://play.example.com')
  })

  it('ignores a malformed app url and falls back to the origin', () => {
    const result = readOnlineConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      VITE_APP_URL: 'not-a-url',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.appUrl).toBe(window.location.origin)
  })
})
