export {}

declare global {
  namespace Bun {
    interface Env {
      NODE_ENV?: 'development' | 'production' | 'test'
      LOG_LEVEL?: 'info' | 'error' | 'warn' | 'debug' | 'trace'
      // AWS Configuration
      AWS_ACCESS_KEY_ID?: string
      AWS_SECRET_ACCESS_KEY?: string
      AWS_REGION?: string
      AWS_ENDPOINT?: string
      /**
       * Public endpoint for presigned URLs that will be accessed by clients (e.g., browser).
       * Use this when running in Docker where the internal endpoint (e.g., localstack:4566)
       * differs from the public endpoint (e.g., localhost:4566).
       * Falls back to AWS_ENDPOINT if not set.
       */
      AWS_PUBLIC_ENDPOINT?: string
    }
  }
}
