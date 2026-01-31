import { PartSizePolicy } from '@modules/video-processor/domain-service/part-size-policy'
import { Result } from '@core/domain/result'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { PartSizePolicyError } from '@core/errors/part-size-policy.error'

export class CalculateVideoParts {
  create(videoMetadata: VideoMetadataVO): Result<number, PartSizePolicyError> {
    if (PartSizePolicy.isSmallVideo(videoMetadata.value.totalSize)) {
      return Result.ok(1)
    }

    const result = PartSizePolicy.calculate(videoMetadata.value.totalSize)
    if (result.isFailure) return Result.fail(result.error)

    return Result.ok(result.value.numberOfParts)
  }
}
