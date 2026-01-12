export {};

declare global {
  namespace Bun {
    interface Env {
      NODE_ENV?: "development" | "production";
      LOG_LEVEL?: "info" | "error" | "warn" | "debug" | "trace";
    }
  }
}