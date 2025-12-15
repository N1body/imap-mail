/**
 * OAuth2 utilities for Microsoft Outlook IMAP authentication
 *
 * Microsoft requires OAuth2 (XOAUTH2) for IMAP access since October 2022.
 * This module handles token refresh and XOAUTH2 string generation.
 */

/**
 * Get a new access token using a refresh token
 * Uses Microsoft's OAuth2 token endpoint for consumer accounts
 */
export async function getAccessToken(
  refreshToken: string,
  clientId: string
): Promise<string> {
  const response = await fetch(
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${response.status}, ${errorText}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Generate XOAUTH2 authentication string for IMAP
 * Format: base64("user=" + user + "\x01auth=Bearer " + accessToken + "\x01\x01")
 */
export function generateXOAuth2String(
  email: string,
  accessToken: string
): string {
  const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`
  return Buffer.from(authString).toString('base64')
}
