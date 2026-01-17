import { randomUUIDv7 } from 'bun'

export class UniqueEntityID {
  private readonly _id: string

  private constructor(id: string) {
    this._id = id
  }

  static create(id?: string): UniqueEntityID {
    return new UniqueEntityID(id ?? randomUUIDv7())
  }

  get value(): string {
    return this._id
  }

  equals(other: UniqueEntityID): boolean {
    if (other === null || other === undefined) {
      return false
    }

    if (!(other instanceof UniqueEntityID)) {
      return false
    }

    return this._id === other.value
  }
}
