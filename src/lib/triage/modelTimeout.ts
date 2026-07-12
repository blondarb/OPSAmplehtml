export class ClinicalModelTimeoutError extends Error {
  readonly name = 'ClinicalModelTimeoutError'

  constructor(
    public readonly label: string,
    public readonly timeoutMs: number,
    message = 'Clinical model deadline exceeded',
  ) {
    super(message)
  }
}

export async function runClinicalModelWithTimeout<T>(input: {
  label: string
  timeoutMs: number
  operation: (signal: AbortSignal) => Promise<T>
}): Promise<T> {
  if (
    !input.label.trim() ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1
  ) {
    throw new ClinicalModelTimeoutError(
      input.label || 'invalid_model_branch',
      input.timeoutMs,
      'Invalid clinical model deadline configuration',
    )
  }

  const controller = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort()
      reject(new ClinicalModelTimeoutError(input.label, input.timeoutMs))
    }, input.timeoutMs)
  })

  try {
    return await Promise.race([
      input.operation(controller.signal),
      timeoutPromise,
    ])
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}
