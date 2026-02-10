import { BaseValueObject } from '@core/domain/value-objects/base-value-object'

export class GigabytesValueObject extends BaseValueObject<number> {
  static create(value: number): GigabytesValueObject {
    return new GigabytesValueObject(value * 1024 * 1024 * 1024)
  }
}
