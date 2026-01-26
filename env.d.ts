export {}

declare global {
  namespace Bun {
    interface Env {
      NODE_ENV?: 'development' | 'production' | 'test'
      LOG_LEVEL?: 'info' | 'error' | 'warn' | 'debug' | 'trace'
      AWS_ACCESS_KEY_ID?: string
      AWS_SECRET_ACCESS_KEY?: string
      AWS_REGION?: string
      AWS_ENDPOINT?: string
      AWS_PUBLIC_ENDPOINT?: string
      VIDEO_BUCKET?: string
    }
  }

  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test'
      LOG_LEVEL?: 'info' | 'error' | 'warn' | 'debug' | 'trace'
      AWS_ACCESS_KEY_ID?: string
      AWS_SECRET_ACCESS_KEY?: string
      AWS_REGION?: string
      AWS_ENDPOINT?: string
      AWS_ENDPOINT_URL?: string
      AWS_PUBLIC_ENDPOINT?: string
      VIDEO_BUCKET?: string
      S3_INPUT_BUCKET?: string
      S3_OUTPUT_BUCKET?: string
      SQS_QUEUE_URL?: string
      SEGMENT_DURATION?: string
      FRAME_INTERVAL?: string
    }
  }
}
