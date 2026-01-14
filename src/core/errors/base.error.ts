export abstract class BaseError extends Error {
  abstract readonly code: string
  protected constructor(message: string) {
    super(message)
    this.name = new.target.name
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
      stack: this.stack,
    }
  }
}
