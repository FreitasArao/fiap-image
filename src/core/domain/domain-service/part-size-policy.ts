import { Result } from '@core/domain/result'
import { GigabytesValueObject } from '@core/domain/value-object/gigabytes.vo'
import { MegabytesValueObject } from '@core/domain/value-object/megabytes.vo'
import {
  PartSizePolicyError,
  PartSizePolicyResult,
} from '@core/errors/part-size-policy.error'

export class PartSizePolicy {
  static readonly PARTS_LIMIT = 10_000
  static readonly SAFE_PART_SIZE = MegabytesValueObject.create(32).value
  static readonly MIN_PART_SIZE = MegabytesValueObject.create(5).value
  static readonly MAX_PART_SIZE = GigabytesValueObject.create(5).value

  static isSmallVideo(bytes: number): boolean {
    return bytes <= PartSizePolicy.MIN_PART_SIZE
  }

  static calculate(
    bytes: number,
  ): Result<PartSizePolicyResult, PartSizePolicyError> {
    const minPartSize = Math.ceil(bytes / PartSizePolicy.PARTS_LIMIT)

    const partSize = Math.max(minPartSize, PartSizePolicy.SAFE_PART_SIZE)

    const numberOfParts = Math.ceil(bytes / partSize)

    if (partSize < PartSizePolicy.MIN_PART_SIZE) {
      return Result.fail(
        new PartSizePolicyError('Part size is too small, must be at least 5MB'),
      )
    }

    if (partSize > PartSizePolicy.MAX_PART_SIZE) {
      return Result.fail(
        new PartSizePolicyError('Part size is too large, must be at most 5GB'),
      )
    }

    if (numberOfParts > PartSizePolicy.PARTS_LIMIT) {
      return Result.fail(
        new PartSizePolicyError(
          `File too large, would require ${numberOfParts} parts (max: ${PartSizePolicy.PARTS_LIMIT})`,
        ),
      )
    }

    return Result.ok({ partSize, numberOfParts })
  }
}
