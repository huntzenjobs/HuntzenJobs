// Client ID management for freemium tracking
// Uses localStorage + cookie for persistence

const CLIENT_ID_KEY = 'huntzen_client_id'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

function generateClientId(): string {
  return 'hzn_' + crypto.randomUUID().replace(/-/g, '')
}

function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

export function getClientId(): string {
  // Try to get from localStorage first
  if (typeof window !== 'undefined') {
    let clientId = localStorage.getItem(CLIENT_ID_KEY)

    // If not in localStorage, try cookie
    if (!clientId) {
      clientId = getCookie(CLIENT_ID_KEY)
    }

    // If still not found, generate new one
    if (!clientId) {
      clientId = generateClientId()
    }

    // Store in both localStorage and cookie for redundancy
    localStorage.setItem(CLIENT_ID_KEY, clientId)
    setCookie(CLIENT_ID_KEY, clientId, COOKIE_MAX_AGE)

    return clientId
  }

  return generateClientId()
}

export function resetClientId(): void {
  if (typeof window !== 'undefined') {
    const newId = generateClientId()
    localStorage.setItem(CLIENT_ID_KEY, newId)
    setCookie(CLIENT_ID_KEY, newId, COOKIE_MAX_AGE)
  }
}
