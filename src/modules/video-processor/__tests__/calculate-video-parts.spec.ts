import { CalculateVideoParts } from "@modules/video-processor/domain/entities/calculate-video-parts";
import { MegabytesValueObject } from "@modules/video-processor/domain/value-objects/megabytes.vo";
import { VideoMetadataVO } from "@modules/video-processor/domain/value-objects/video-metadata.vo";
import { beforeAll, describe, expect, it } from "bun:test";

describe("CalculateVideoParts", () => {
  let sut: CalculateVideoParts;
  beforeAll(() => {
    sut = new CalculateVideoParts();
  });
  it("When a video metadadta size is lower than 5mb should return 1 part", () => {
    const videoMetadata = VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(4).value,
      duration: 100000000,
      filename: 'test',
      extension: 'mp4',
    });
    const parts = sut.create(videoMetadata);

    expect(parts.isSuccess).toBe(true);
    expect(parts.value).toBe(1);
  });
  it.each([
    // Pequenos
    { size: MegabytesValueObject.create(5.1), expected: 1 },
    { size: MegabytesValueObject.create(31.9), expected: 1 },
    { size: MegabytesValueObject.create(32), expected: 1 },
    { size: MegabytesValueObject.create(32.1), expected: 2 },
    { size: MegabytesValueObject.create(63.9), expected: 2 },
    { size: MegabytesValueObject.create(64), expected: 2 },
    { size: MegabytesValueObject.create(64.1), expected: 3 },
    // Tamanhos médios
    { size: MegabytesValueObject.create(100), expected: 4 },
    { size: MegabytesValueObject.create(100.5), expected: 4 },
    { size: MegabytesValueObject.create(128), expected: 4 },
    { size: MegabytesValueObject.create(129), expected: 5 },
    { size: MegabytesValueObject.create(256.3), expected: 9 },
    { size: MegabytesValueObject.create(512.7), expected: 17 },
    { size: MegabytesValueObject.create(1024.4), expected: 33 },
    // Arquivos grandes
    { size: MegabytesValueObject.create(5120), expected: 160 },
    { size: MegabytesValueObject.create(10240), expected: 320 },
    { size: MegabytesValueObject.create(25600), expected: 800 },
    { size: MegabytesValueObject.create(50001), expected: 1563 },
    { size: MegabytesValueObject.create(75123.4), expected: 2348 },
    { size: MegabytesValueObject.create(100000), expected: 3125 },
    // Próximo do limite de 10.000 partes
    { size: MegabytesValueObject.create(300000), expected: 9375 },
    { size: MegabytesValueObject.create(310000), expected: 9688 },
    { size: MegabytesValueObject.create(319999), expected: 10000 },
    { size: MegabytesValueObject.create(320000), expected: 10000 },
  ])(
    "When video size is $size.value MB should return $expected parts",
    ({ size, expected }) => {
      const videoMetadata = VideoMetadataVO.create({
        totalSize: size.value,
        duration: 100000000,
        filename: 'test',
        extension: 'mp4',
      });

      const parts = sut.create(videoMetadata);

      expect(parts.isSuccess).toBe(true);
      expect(parts.value).toBe(expected);
    },
  );
});
