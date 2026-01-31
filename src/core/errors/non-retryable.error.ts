export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableError'
  }

  static isNonRetryable(error: unknown): error is NonRetryableError {
    return error instanceof NonRetryableError
  }
}
