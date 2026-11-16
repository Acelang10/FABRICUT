export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function respondWithError(res, err, fallback = 500) {
  const status = err.code === 'FIREBASE_NOT_CONFIGURED' ? 503 : err instanceof ValidationError ? 400 : fallback
  res.status(status).json({ error: err.message })
}

export function requireText(value, label) {
  const text = value == null ? '' : String(value).trim()
  if (!text) throw new ValidationError(`${label} is required`)
  return text
}

export function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

export function boundedNumber(value, label, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    const limit = max === Infinity ? `${min} or greater` : `between ${min} and ${max}`
    throw new ValidationError(`${label} must be ${limit}`)
  }
  return number
}
