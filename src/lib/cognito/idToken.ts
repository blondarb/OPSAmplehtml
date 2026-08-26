import type { JWTPayload, JWTVerifyOptions } from 'jose'

export function cognitoIdTokenVerificationOptions(
  region: string,
  userPoolId: string,
  clientId: string,
): JWTVerifyOptions {
  if (!clientId.trim()) throw new Error('Cognito client ID is not configured.')
  return {
    issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    audience: clientId,
  }
}

export function assertCognitoIdToken(payload: JWTPayload): void {
  if (payload.token_use !== 'id') {
    throw new Error('Cognito token_use must be id.')
  }
}
