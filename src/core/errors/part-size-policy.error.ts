import { BaseError } from '@core/errors/base.error'

export class PartSizePolicyError extends BaseError {
  readonly code = 'PART_SIZE_POLICY_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'PartSizePolicyError'
  }
}

export type PartSizePolicyResult = {
  partSize: number
  numberOfParts: number
}
