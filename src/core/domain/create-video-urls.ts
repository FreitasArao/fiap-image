import { Result } from '@core/domain/result'
import { BaseError } from '@core/errors/base.error'

export type VideoMetadata = {
  totalSize: number
  duration: number
}

export class MegaBytesValueObject {
  private readonly _value: number

  private constructor(value: number) {
    this._value = value
  }

  static create(value: number): MegaBytesValueObject {
    return new MegaBytesValueObject(value * 1024 * 1024)
  }

  get value(): number {
    return this._value
  }
}

export class GigabytesValueObject {
  private readonly _value: number
  private constructor(value: number) {
    this._value = value
  }
  static create(value: number): GigabytesValueObject {
    return new GigabytesValueObject(value * 1024 * 1024 * 1024)
  }

  get value(): number {
    return this._value
  }
}

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

export class PartSizePolicy {
  private readonly PARTS_LIMIT = 10_000
  private readonly SAFE_PART_SIZE = MegaBytesValueObject.create(32).value
  private readonly MIN_PART_SIZE = MegaBytesValueObject.create(5).value
  private readonly MAX_PART_SIZE = GigabytesValueObject.create(5).value

  calculate(bytes: number): Result<PartSizePolicyResult, PartSizePolicyError> {
    // Calculate minimum part size to stay within 10,000 parts
    const minPartSize = Math.ceil(bytes / this.PARTS_LIMIT)

    // Use at least the safe part size (32 MB baseline)
    const partSize = Math.max(minPartSize, this.SAFE_PART_SIZE)

    // Calculate number of parts
    const numberOfParts = Math.ceil(bytes / partSize)

    if (partSize < this.MIN_PART_SIZE) {
      return Result.fail(
        new PartSizePolicyError('Part size is too small, must be at least 5MB'),
      )
    }

    if (partSize > this.MAX_PART_SIZE) {
      return Result.fail(
        new PartSizePolicyError('Part size is too large, must be at most 5GB'),
      )
    }

    if (numberOfParts > this.PARTS_LIMIT) {
      return Result.fail(
        new PartSizePolicyError(
          `File too large, would require ${numberOfParts} parts (max: ${this.PARTS_LIMIT})`,
        ),
      )
    }

    return Result.ok({ partSize, numberOfParts })
  }
}

export class CreateVideoURLS {
  create(videoMetadata: VideoMetadata): Result<number, PartSizePolicyError> {
    if (videoMetadata.totalSize <= MegaBytesValueObject.create(5).value) {
      return Result.ok(1)
    }

    const result = new PartSizePolicy().calculate(videoMetadata.totalSize)
    if (result.isFailure) return Result.fail(result.error)

    return Result.ok(result.value.numberOfParts)
  }
}
