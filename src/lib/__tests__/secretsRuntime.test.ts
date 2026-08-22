import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class SecretsManagerClient {
    send = sendMock
  },
  GetSecretValueCommand: class GetSecretValueCommand {
    constructor(public readonly input: unknown) {}
  },
}))

async function loadSecretsModule() {
  return import('@/lib/secrets')
}

describe('runtime secret resolution', () => {
  beforeEach(() => {
    vi.resetModules()
    sendMock.mockReset()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('loads Cognito and Nova secrets through Secrets Manager in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COGNITO_CLIENT_SECRET_ID', 'sevaro/test/cognito')
    sendMock
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({
          client_secret: 'synthetic-cognito-secret',
        }),
      })
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({
          shared_secret: 'synthetic-nova-secret',
        }),
      })
    const secrets = await loadSecretsModule()

    await expect(secrets.getCognitoClientSecret()).resolves.toBe(
      'synthetic-cognito-secret',
    )
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-nova-secret',
    )
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('uses process-local values without an AWS call outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('COGNITO_CLIENT_SECRET', 'local-cognito-secret')
    vi.stubEnv('NOVA_RELAY_SHARED_SECRET', 'local-nova-secret')
    const secrets = await loadSecretsModule()

    await expect(secrets.getCognitoClientSecret()).resolves.toBe(
      'local-cognito-secret',
    )
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'local-nova-secret',
    )
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('fails closed to an empty secret when production resolution is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COGNITO_CLIENT_SECRET_ID', 'sevaro/test/cognito')
    vi.stubEnv('COGNITO_CLIENT_SECRET', '')
    vi.stubEnv('NOVA_RELAY_SHARED_SECRET', '')
    sendMock.mockRejectedValue(new Error('synthetic unavailable'))
    const secrets = await loadSecretsModule()

    await expect(secrets.getCognitoClientSecret()).resolves.toBe('')
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe('')
  })

  it('treats an unset production Cognito secret ID as a public client without an AWS lookup', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COGNITO_CLIENT_SECRET_ID', '')
    vi.stubEnv('COGNITO_CLIENT_SECRET', '')
    const secrets = await loadSecretsModule()

    await expect(secrets.getCognitoClientSecret()).resolves.toBe('')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('uses RDS_DATABASE when an RDS managed secret omits its database field', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RDS_DATABASE', 'ops_amplehtml_qa')
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({
        host: 'qa-rds.example.internal',
        port: 5432,
        username: 'qa_app',
        password: 'synthetic-password',
      }),
    })
    const secrets = await loadSecretsModule()

    await expect(secrets.getRdsCredentials()).resolves.toEqual({
      host: 'qa-rds.example.internal',
      port: '5432',
      username: 'qa_app',
      password: 'synthetic-password',
      database: 'ops_amplehtml_qa',
    })
  })

  it('caches the Nova secret before the default TTL and refreshes it at expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2033-05-18T03:33:20.000Z'))
    vi.stubEnv('NODE_ENV', 'production')
    sendMock
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ shared_secret: 'synthetic-old-secret' }),
      })
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ shared_secret: 'synthetic-new-secret' }),
      })
    const secrets = await loadSecretsModule()

    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-old-secret',
    )
    vi.advanceTimersByTime(29_999)
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-old-secret',
    )
    expect(sendMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-new-secret',
    )
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['minimum', '1', 5_000],
    ['maximum', '999999', 60_000],
  ])('bounds the configured Nova secret TTL to the %s', async (_name, configured, ttl) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2033-05-18T03:33:20.000Z'))
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NOVA_RELAY_SECRET_CACHE_TTL_MS', configured)
    sendMock
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ shared_secret: 'synthetic-old-secret' }),
      })
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ shared_secret: 'synthetic-new-secret' }),
      })
    const secrets = await loadSecretsModule()

    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-old-secret',
    )
    vi.advanceTimersByTime(ttl - 1)
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-old-secret',
    )
    vi.advanceTimersByTime(1)
    await expect(secrets.getNovaRelaySharedSecret()).resolves.toBe(
      'synthetic-new-secret',
    )
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('preserves indefinite production caching for non-Nova secrets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2033-05-18T03:33:20.000Z'))
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COGNITO_CLIENT_SECRET_ID', 'sevaro/test/cognito')
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ client_secret: 'synthetic-cognito-secret' }),
    })
    const secrets = await loadSecretsModule()

    await expect(secrets.getCognitoClientSecret()).resolves.toBe(
      'synthetic-cognito-secret',
    )
    vi.advanceTimersByTime(24 * 60 * 60 * 1_000)
    await expect(secrets.getCognitoClientSecret()).resolves.toBe(
      'synthetic-cognito-secret',
    )
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
