import { Result } from '@core/domain/result'

const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'] as const

type VideoExtension = (typeof SUPPORTED_VIDEO_EXTENSIONS)[number]

function normalize(extension: string): string {
  return extension.toLowerCase().replace(/^\./, '')
}

function isValidExtension(normalized: string): normalized is VideoExtension {
  return SUPPORTED_VIDEO_EXTENSIONS.includes(normalized as VideoExtension)
}

export class VideoExtensionVO {
  private constructor(private readonly extension: VideoExtension) {}

  static create(extension: string): Result<VideoExtensionVO, Error> {
    const normalized = normalize(extension)

    if (!isValidExtension(normalized)) {
      return Result.fail(
        new Error(
          `Unsupported video extension: ${extension}. Supported: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`,
        ),
      )
    }

    return Result.ok(new VideoExtensionVO(normalized))
  }

  static supportedExtensions(): readonly string[] {
    return SUPPORTED_VIDEO_EXTENSIONS
  }

  static isSupported(extension: string): boolean {
    return isValidExtension(normalize(extension))
  }

  get value(): string {
    return this.extension
  }
}
