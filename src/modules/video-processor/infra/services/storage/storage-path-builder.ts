export const StorageContext = {
  VIDEO_FILE: 'file',
  VIDEO_PARTS: 'parts',
  VIDEO_PRINTS: 'prints',
} as const

export type StorageContextType =
  (typeof StorageContext)[keyof typeof StorageContext]

export interface StorageConfig {
  videoBucket: string
  region: string
}

export interface StoragePath {
  bucket: string
  key: string
  fullPath: string
  videoId: string
  context: StorageContextType
  resourceId: string
}

export interface ParsedStoragePath {
  bucket: string
  videoId: string
  context: StorageContextType
  resourceId: string
  fullPath: string
  key: string
}

const VALID_CONTEXTS: StorageContextType[] = [
  StorageContext.VIDEO_FILE,
  StorageContext.VIDEO_PARTS,
  StorageContext.VIDEO_PRINTS,
]

export class StoragePathBuilder {
  constructor(private readonly config: StorageConfig) {}

  get bucket(): string {
    return this.config.videoBucket
  }

  videoFile(videoId: string, filename: string): StoragePath {
    return this.build(videoId, StorageContext.VIDEO_FILE, filename)
  }

  videoPart(videoId: string, partId: string): StoragePath {
    return this.build(videoId, StorageContext.VIDEO_PARTS, partId)
  }

  videoPrint(videoId: string, printId: string): StoragePath {
    return this.build(videoId, StorageContext.VIDEO_PRINTS, printId)
  }

  parse(fullPath: string): ParsedStoragePath | null {
    const parts = fullPath.split('/')

    if (parts.length < 5) {
      return null
    }

    if (parts[1] !== 'video') {
      return null
    }

    const context = parts[3] as StorageContextType
    if (!VALID_CONTEXTS.includes(context)) {
      return null
    }

    return {
      bucket: parts[0],
      videoId: parts[2],
      context,
      resourceId: parts.slice(4).join('/'),
      fullPath,
      key: parts.slice(1).join('/'),
    }
  }

  extractVideoId(fullPath: string): string | null {
    const parsed = this.parse(fullPath)
    return parsed?.videoId ?? null
  }

  private build(
    videoId: string,
    context: StorageContextType,
    resourceId: string,
  ): StoragePath {
    const key = `video/${videoId}/${context}/${resourceId}`

    return {
      bucket: this.config.videoBucket,
      key,
      fullPath: `${this.config.videoBucket}/${key}`,
      videoId,
      context,
      resourceId,
    }
  }
}

export function createStoragePathBuilder(): StoragePathBuilder {
  return new StoragePathBuilder({
    videoBucket:
      process.env.S3_INPUT_BUCKET ||
      process.env.VIDEO_BUCKET ||
      'fiapx-video-parts',
    region: process.env.AWS_REGION || 'us-east-1',
  })
}
