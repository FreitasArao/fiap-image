import {
  CreateVideoURLS,
  MegaBytesValueObject,
} from '@core/domain/create-video-urls'
import { beforeAll, describe, expect, it } from 'bun:test'

describe('CreateVideoUrls', () => {
  let sut: CreateVideoURLS
  beforeAll(() => {
    sut = new CreateVideoURLS()
  })
  it('When a video metadadta size is lower than 5mb should return 1 part', () => {
    const videoMetadata = {
      totalSize: 4 * 1024 * 1024,
      duration: 100000000,
    }

    const parts = sut.create(videoMetadata)

    expect(parts.isSuccess).toBe(true)
    expect(parts.value).toBe(1)
  })
  it.each([
    // Pequenos
    { size: MegaBytesValueObject.create(5.1), expected: 1 },
    { size: MegaBytesValueObject.create(31.9), expected: 1 },
    { size: MegaBytesValueObject.create(32), expected: 1 },
    { size: MegaBytesValueObject.create(32.1), expected: 2 },
    { size: MegaBytesValueObject.create(63.9), expected: 2 },
    { size: MegaBytesValueObject.create(64), expected: 2 },
    { size: MegaBytesValueObject.create(64.1), expected: 3 },
    // Tamanhos médios
    { size: MegaBytesValueObject.create(100), expected: 4 },
    { size: MegaBytesValueObject.create(100.5), expected: 4 },
    { size: MegaBytesValueObject.create(128), expected: 4 },
    { size: MegaBytesValueObject.create(129), expected: 5 },
    { size: MegaBytesValueObject.create(256.3), expected: 9 },
    { size: MegaBytesValueObject.create(512.7), expected: 17 },
    { size: MegaBytesValueObject.create(1024.4), expected: 33 },
    // Arquivos grandes
    { size: MegaBytesValueObject.create(5120), expected: 160 },
    { size: MegaBytesValueObject.create(10240), expected: 320 },
    { size: MegaBytesValueObject.create(25600), expected: 800 },
    { size: MegaBytesValueObject.create(50001), expected: 1563 },
    { size: MegaBytesValueObject.create(75123.4), expected: 2348 },
    { size: MegaBytesValueObject.create(100000), expected: 3125 },
    // Próximo do limite de 10.000 partes
    { size: MegaBytesValueObject.create(300000), expected: 9375 },
    { size: MegaBytesValueObject.create(310000), expected: 9688 },
    { size: MegaBytesValueObject.create(319999), expected: 10000 },
    { size: MegaBytesValueObject.create(320000), expected: 10000 },
  ])('When video size is $size.value MB should return $expected parts', ({
    size,
    expected,
  }) => {
    const videoMetadata = {
      totalSize: size.value,
      duration: 100000000,
    }

    const parts = sut.create(videoMetadata)

    expect(parts.isSuccess).toBe(true)
    expect(parts.value).toBe(expected)
  })
})
