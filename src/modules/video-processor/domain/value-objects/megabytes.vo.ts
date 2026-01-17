import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export class MegabytesValueObject extends BaseValueObject<number> {
  static create(value: number): MegabytesValueObject {
    return new MegabytesValueObject(value * 1024 * 1024)
  }
}
