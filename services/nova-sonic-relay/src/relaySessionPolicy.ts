import { matchesSignedStartConfig } from './relayAuth.js'
import type { RelayStartConfig } from './wsProtocol.js'

type Accepted = { ok: true }
type Rejected = {
  ok: false
  code: 'config_mismatch' | 'duplicate_start' | 'system_text_forbidden'
  message: string
}
export type RelayPolicyDecision = Accepted | Rejected

/** Per-connection fail-closed authorization for browser control frames. */
export class RelaySessionPolicy {
  private started = false

  constructor(private readonly expectedConfigDigest: string) {}

  authorizeStart(config: RelayStartConfig): RelayPolicyDecision {
    if (this.started) {
      return {
        ok: false,
        code: 'duplicate_start',
        message: 'session already started',
      }
    }
    if (!matchesSignedStartConfig(config, this.expectedConfigDigest)) {
      return {
        ok: false,
        code: 'config_mismatch',
        message: 'start configuration does not match signed authorization',
      }
    }
    // Set before the asynchronous model stream is opened so two start frames
    // arriving back-to-back cannot race past this guard.
    this.started = true
    return { ok: true }
  }

  authorizeSystemText(): RelayPolicyDecision {
    return {
      ok: false,
      code: 'system_text_forbidden',
      message: 'browser-originated system text is not authorized',
    }
  }
}
