import { exec } from 'child_process'
import { promisify } from 'util'
import { mkdir, rm } from 'fs/promises'

const execAsync = promisify(exec)

export class FFmpegService {
  private workDir: string

  constructor(private videoId: string) {
    this.workDir = `/tmp/ffmpeg/${videoId}`
  }

  async setup(): Promise<void> {
    await mkdir(this.workDir, { recursive: true })
  }

  async cleanup(): Promise<void> {
    await rm(this.workDir, { recursive: true, force: true })
  }

  async download(bucket: string, key: string): Promise<string> {
    const inputPath = `${this.workDir}/input.mp4`
    const endpoint = process.env.AWS_ENDPOINT_URL || ''
    const endpointFlag = endpoint ? `--endpoint-url ${endpoint}` : ''

    await execAsync(
      `aws s3 cp "s3://${bucket}/${key}" "${inputPath}" ${endpointFlag}`,
    )
    return inputPath
  }

  async uploadDir(
    localDir: string,
    bucket: string,
    prefix: string,
    pattern: string,
  ): Promise<void> {
    const endpoint = process.env.AWS_ENDPOINT_URL || ''
    const endpointFlag = endpoint ? `--endpoint-url ${endpoint}` : ''

    await execAsync(
      `aws s3 sync "${localDir}" "s3://${bucket}/${prefix}" --exclude "*" --include "${pattern}" ${endpointFlag}`,
    )
  }

  async split(
    inputPath: string,
    segmentDuration: number,
  ): Promise<{ outputDir: string; count: number }> {
    const outputDir = `${this.workDir}/segments`
    await mkdir(outputDir, { recursive: true })

    await execAsync(
      `ffmpeg -i "${inputPath}" -c copy -map 0 -segment_time ${segmentDuration} -f segment -reset_timestamps 1 "${outputDir}/segment_%03d.mp4" -y`,
    )

    const { stdout } = await execAsync(`ls -1 "${outputDir}"/*.mp4 | wc -l`)
    const count = parseInt(stdout.trim(), 10)

    return { outputDir, count }
  }

  async extractFrames(
    inputPath: string,
    frameInterval: number,
  ): Promise<{ outputDir: string; count: number }> {
    const outputDir = `${this.workDir}/frames`
    await mkdir(outputDir, { recursive: true })

    await execAsync(
      `ffmpeg -i "${inputPath}" -vf "fps=1/${frameInterval}" -q:v 2 "${outputDir}/frame_%04d.jpg" -y`,
    )

    const { stdout } = await execAsync(`ls -1 "${outputDir}"/*.jpg | wc -l`)
    const count = parseInt(stdout.trim(), 10)

    return { outputDir, count }
  }
}
