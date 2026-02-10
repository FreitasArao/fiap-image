import { BaseValueObject } from '@core/domain/value-objects/base-value-object'

export type PartStatusType = 'pending' | 'uploaded' | 'failed'

export class PartStatusVO extends BaseValueObject<PartStatusType> {
  static create(value: PartStatusType): PartStatusVO {
    return new PartStatusVO(value)
  }
}
