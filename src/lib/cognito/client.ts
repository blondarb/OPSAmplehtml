/**
 * Cognito Browser-Side Auth
 *
 * signIn uses direct Cognito API (USER_PASSWORD_AUTH) — the SDK's SRP flow
 * fails on ESSENTIALS tier pools. Other flows (signUp, confirmSignUp, etc.)
 * still use amazon-cognito-identity-js.
 * After successful auth, stores tokens in httpOnly cookies via /api/auth/session.
 */

import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || ''
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

function createUserPool(): CognitoUserPool | null {
  if (!userPoolId || !clientId) return null
  return new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId })
}

const userPool = createUserPool()

function getCognitoUser(email: string): CognitoUser | null {
  if (!userPool) return null
  return new CognitoUser({ Username: email, Pool: userPool })
}

/** Store tokens in httpOnly cookies via API route */
async function storeSession(session: CognitoUserSession): Promise<void> {
  const idToken = session.getIdToken().getJwtToken()
  const accessToken = session.getAccessToken().getJwtToken()
  const refreshToken = session.getRefreshToken().getToken()

  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accessToken, refreshToken }),
  })
}

/** Clear session cookies */
async function clearSession(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' })
}

export async function signIn(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const cognitoUser = getCognitoUser(email)
  if (!cognitoUser) {
    return { error: 'Auth not configured' }
  }

  try {
    // Use direct Cognito API call with USER_PASSWORD_AUTH
    // The SDK's SRP flow has issues with ESSENTIALS tier pools
    const region = userPoolId.split('_')[0]
    const endpoint = `https://cognito-idp.${region}.amazonaws.com/`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg = data.message || data.__type || 'Sign in failed'
      return { error: msg }
    }

    if (data.AuthenticationResult) {
      // Store tokens in cookies
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: data.AuthenticationResult.IdToken,
          accessToken: data.AuthenticationResult.AccessToken,
          refreshToken: data.AuthenticationResult.RefreshToken,
        }),
      })

      // Also set tokens in the SDK's storage so getCurrentUser/getCurrentSession work
      if (userPool) {
        const keyPrefix = `CognitoIdentityServiceProvider.${clientId}`
        const lastUser = email
        const storage = typeof window !== 'undefined' ? window.localStorage : null
        if (storage) {
          storage.setItem(`${keyPrefix}.LastAuthUser`, lastUser)
          storage.setItem(`${keyPrefix}.${lastUser}.idToken`, data.AuthenticationResult.IdToken)
          storage.setItem(`${keyPrefix}.${lastUser}.accessToken`, data.AuthenticationResult.AccessToken)
          storage.setItem(`${keyPrefix}.${lastUser}.refreshToken`, data.AuthenticationResult.RefreshToken)
        }
      }

      return { error: null }
    }

    if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return { error: 'Password change required. Please reset your password.' }
    }

    return { error: `Unexpected response: ${data.ChallengeName || 'unknown'}` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sign in failed' }
  }
}

export async function signUp(
  email: string,
  password: string
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  return new Promise((resolve) => {
    if (!userPool) {
      resolve({ error: 'Auth not configured', needsConfirmation: false })
      return
    }

    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    ]

    userPool.signUp(email, password, attributes, [], (err, result) => {
      if (err) {
        resolve({ error: err.message || 'Sign up failed', needsConfirmation: false })
        return
      }
      const needsConfirmation = result ? !result.userConfirmed : true
      resolve({ error: null, needsConfirmation })
    })
  })
}

export async function confirmSignUp(
  email: string,
  code: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = getCognitoUser(email)
    if (!cognitoUser) {
      resolve({ error: 'Auth not configured' })
      return
    }

    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        resolve({ error: err.message || 'Confirmation failed' })
        return
      }
      resolve({ error: null })
    })
  })
}

export async function resendConfirmationCode(
  email: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = getCognitoUser(email)
    if (!cognitoUser) {
      resolve({ error: 'Auth not configured' })
      return
    }

    cognitoUser.resendConfirmationCode((err) => {
      if (err) {
        resolve({ error: err.message || 'Could not resend code' })
        return
      }
      resolve({ error: null })
    })
  })
}

export async function forgotPassword(
  email: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = getCognitoUser(email)
    if (!cognitoUser) {
      resolve({ error: 'Auth not configured' })
      return
    }

    cognitoUser.forgotPassword({
      onSuccess: () => resolve({ error: null }),
      onFailure: (err) => resolve({ error: err.message || 'Failed to send reset code' }),
    })
  })
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = getCognitoUser(email)
    if (!cognitoUser) {
      resolve({ error: 'Auth not configured' })
      return
    }

    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve({ error: null }),
      onFailure: (err) => resolve({ error: err.message || 'Password reset failed' }),
    })
  })
}

export async function signOut(): Promise<void> {
  if (userPool) {
    const currentUser = userPool.getCurrentUser()
    if (currentUser) {
      currentUser.signOut()
    }
  }
  await clearSession()
}

export async function getCurrentSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    if (!userPool) {
      resolve(null)
      return
    }

    const currentUser = userPool.getCurrentUser()
    if (!currentUser) {
      resolve(null)
      return
    }

    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null)
        return
      }
      resolve(session)
    })
  })
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const session = await getCurrentSession()
  if (!session) return null

  const idToken = session.getIdToken()
  const sub = idToken.payload.sub as string
  const email = idToken.payload.email as string

  if (!sub || !email) return null
  return { id: sub, email }
}
