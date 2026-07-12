export type SameOriginJsonValidation =
  | { ok: true }
  | { ok: false; status: 403 | 415 }

function originFromHeader(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function validateSameOriginJsonRequest(
  request: Request,
): SameOriginJsonValidation {
  const requestOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  if (origin) {
    if (origin === 'null' || originFromHeader(origin) !== requestOrigin) {
      return { ok: false, status: 403 }
    }
  } else if (!referer || originFromHeader(referer) !== requestOrigin) {
    return { ok: false, status: 403 }
  }

  const mediaType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    return { ok: false, status: 415 }
  }

  return { ok: true }
}
