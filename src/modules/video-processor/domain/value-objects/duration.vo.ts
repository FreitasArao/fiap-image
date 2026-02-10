import { BaseValueObject } from '@core/domain/value-objects/base-value-object'

export class DurationVO extends BaseValueObject<number> {
  private constructor(milliseconds: number) {
    super(milliseconds)
  }

  /**
   * Creates a DurationVO from milliseconds.
   * @param ms Duration in milliseconds (must be positive)
   * @throws Error if ms is not positive
   */
  static fromMilliseconds(ms: number): DurationVO {
    if (ms <= 0) {
      throw new Error('Duration must be greater than 0 milliseconds')
    }
    return new DurationVO(ms)
  }

  /**
   * Creates a DurationVO from seconds.
   * @param seconds Duration in seconds (must be positive)
   * @throws Error if seconds is not positive
   */
  static fromSeconds(seconds: number): DurationVO {
    if (seconds <= 0) {
      throw new Error('Duration must be greater than 0 seconds')
    }
    return new DurationVO(seconds * 1000)
  }

  /**
   * Duration in milliseconds (internal representation).
   */
  get milliseconds(): number {
    return this._value
  }

  /**
   * Duration in seconds.
   */
  get seconds(): number {
    return this._value / 1000
  }

  /**
   * Duration in minutes.
   */
  get minutes(): number {
    return this._value / 60000
  }

  /**
   * Returns true if this duration equals another duration.
   */
  equals(other: DurationVO): boolean {
    return this._value === other._value
  }

  /**
   * Returns a formatted string representation.
   * @example "120000ms (120s)"
   */
  toString(): string {
    return `${this._value}ms (${this.seconds}s)`
  }
}
