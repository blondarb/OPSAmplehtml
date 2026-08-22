import { describe, expect, it } from 'vitest'
import {
  assertCognitoIdToken,
  cognitoIdTokenVerificationOptions,
} from '@/lib/cognito/idToken'

describe('Cognito ID-token verification contract', () => {
  it('binds verification to the exact pool issuer and app-client audience', () => {
    expect(
      cognitoIdTokenVerificationOptions('us-east-2', 'us-east-2_synthetic', 'client-qa'),
    ).toEqual({
      issuer: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_synthetic',
      audience: 'client-qa',
    })
  })

  it('rejects missing client configuration and access-token claims', () => {
    expect(() =>
      cognitoIdTokenVerificationOptions('us-east-2', 'us-east-2_synthetic', ''),
    ).toThrow('client ID')
    expect(() => assertCognitoIdToken({ token_use: 'access' })).toThrow('token_use')
    expect(() => assertCognitoIdToken({ token_use: 'id' })).not.toThrow()
  })
})
