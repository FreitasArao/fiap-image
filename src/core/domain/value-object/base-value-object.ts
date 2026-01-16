export abstract class BaseValueObject<T> {
  protected readonly _value: T

  protected constructor(value: T) {
    this._value = value
  }

  get value(): T {
    return this._value
  }
}
