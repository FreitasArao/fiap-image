import { PartSizePolicy } from '@core/domain/domain-service/part-size-policy'
import { Result } from '@core/domain/result'
import { PartSizePolicyError } from '@core/errors/part-size-policy.error'

export type VideoMetadata = {
  totalSize: number
  duration: number
}

export class CreateVideoURLS {
  create(videoMetadata: VideoMetadata): Result<number, PartSizePolicyError> {
    if (PartSizePolicy.isSmallVideo(videoMetadata.totalSize)) {
      return Result.ok(1)
    }

    const result = PartSizePolicy.calculate(videoMetadata.totalSize)
    if (result.isFailure) return Result.fail(result.error)

    return Result.ok(result.value.numberOfParts)
  }
}
