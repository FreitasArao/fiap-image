import { Result } from '@core/domain/result'
import type {
  VideoProcessorService,
  ExtractFramesResult,
} from '../abstractions'

export class FFmpegProcessor implements VideoProcessorService {
  private workDir: string

  constructor(videoId: string) {
    this.workDir = `/tmp/ffmpeg/${videoId}`
  }

  async setup(): Promise<void> {
    const proc = Bun.spawn(['mkdir', '-p', this.workDir])
    await proc.exited
  }

  async cleanup(): Promise<void> {
    const proc = Bun.spawn(['rm', '-rf', this.workDir])
    await proc.exited
  }

  async extractFramesFromUrl(
    inputUrl: string,
    startTime: number,
    endTime: number,
    frameInterval: number,
  ): Promise<Result<ExtractFramesResult, Error>> {
    const outputDir = `${this.workDir}/frames`

    const mkdirProc = Bun.spawn(['mkdir', '-p', outputDir])
    await mkdirProc.exited

    const proc = Bun.spawn([
      'ffmpeg',
      '-ss',
      String(startTime),
      '-to',
      String(endTime),
      '-i',
      inputUrl,
      '-vf',
      `fps=1/${frameInterval}`,
      '-q:v',
      '2',
      `${outputDir}/frame_%04d.jpg`,
      '-y',
    ])

    await proc.exited

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      return Result.fail(
        new Error(`FFmpeg failed with exit code ${proc.exitCode}: ${stderr}`),
      )
    }

    const countProc = Bun.spawn([
      'sh',
      '-c',
      `ls -1 "${outputDir}"/*.jpg 2>/dev/null | wc -l`,
    ])
    const output = await new Response(countProc.stdout).text()
    const count = parseInt(output.trim(), 10) || 0

    return Result.ok({ outputDir, count })
  }

  async uploadDir(
    localDir: string,
    bucket: string,
    prefix: string,
    pattern: string,
  ): Promise<Result<void, Error>> {
    const endpoint = process.env.AWS_ENDPOINT_URL || ''
    const args = [
      'aws',
      's3',
      'sync',
      localDir,
      `s3://${bucket}/${prefix}`,
      '--exclude',
      '*',
      '--include',
      pattern,
    ]

    if (endpoint) {
      args.push('--endpoint-url', endpoint)
    }

    const proc = Bun.spawn(args)
    await proc.exited

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      return Result.fail(
        new Error(
          `S3 upload failed with exit code ${proc.exitCode}: ${stderr}`,
        ),
      )
    }

    return Result.ok(undefined)
  }
}
