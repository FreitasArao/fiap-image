import { Result } from '@core/domain/result'

export interface ExtractFramesResult {
  outputDir: string
  count: number
}

export interface VideoProcessorService {
  setup(): Promise<void>
  cleanup(): Promise<void>
  extractFramesFromUrl(
    inputUrl: string,
    startTime: number,
    endTime: number,
    frameInterval: number,
  ): Promise<Result<ExtractFramesResult, Error>>
  uploadDir(
    localDir: string,
    bucket: string,
    prefix: string,
    pattern: string,
  ): Promise<Result<void, Error>>
}
