export class Result<T, E extends Error = Error> {
  public readonly isSuccess: boolean
  public readonly isFailure: boolean
  private readonly _value: T | null
  private readonly _error: E | null

  private constructor(isSuccess: boolean, value: T | null, error: E | null) {
    if (isSuccess && error)
      throw new Error('InvalidOperation: ok cannot have error')
    if (!isSuccess && !error)
      throw new Error('InvalidOperation: fail must have error')

    this.isSuccess = isSuccess
    this.isFailure = !isSuccess
    this._value = value
    this._error = error
    Object.freeze(this)
  }

  public get value(): T {
    if (!this.isSuccess)
      throw new Error('Cannot get value from a failure result')
    return this._value as T
  }

  public get error(): E {
    if (this.isSuccess)
      throw new Error('Cannot get error from a success result')
    return this._error as E
  }

  public static ok<U>(value?: U): Result<U, never> {
    return new Result<U, never>(true, value ?? null, null)
  }

  public static fail<U, F extends Error>(error: F): Result<U, F> {
    return new Result<U, F>(false, null, error)
  }
}
