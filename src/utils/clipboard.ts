/**
 * Clipboard and Web Share helpers with graceful fallbacks.
 *
 * The clipboard API is unavailable in insecure contexts and can be blocked by
 * permissions policies, so a selection based fallback is always provided.
 */

export type CopyOutcome = 'copied' | 'shared' | 'cancelled' | 'failed'

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** Copies text to the clipboard, falling back to a selection based copy. */
export async function copyToClipboard(text: string): Promise<CopyOutcome> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    return legacyCopy(text) ? 'copied' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Shares a link using the Web Share API when it is available, otherwise
 * copies it to the clipboard.
 */
export async function shareOrCopy(
  title: string,
  text: string,
  url: string,
): Promise<CopyOutcome> {
  const share = typeof navigator !== 'undefined' ? navigator.share : undefined
  if (typeof share === 'function') {
    try {
      await share({ title, text, url })
      return 'shared'
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason - fall back to copying.
    }
  }
  return copyToClipboard(url)
}
