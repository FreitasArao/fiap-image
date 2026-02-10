import { DurationVO } from '@modules/video-processor/domain/value-objects/duration.vo'
import { describe, it, expect } from 'bun:test'

describe('DurationVO', () => {
  it('should be able to create a duration vo', () => {
    const duration = DurationVO.fromMilliseconds(1000)
    expect(duration.milliseconds).toBe(1000)
    expect(duration.seconds).toBe(1)
    expect(duration.minutes).toBe(0.016666666666666666)
  })

  it('should be able to create a duration vo from seconds', () => {
    const duration = DurationVO.fromSeconds(1)
    expect(duration.milliseconds).toBe(1000)
    expect(duration.seconds).toBe(1)
    expect(duration.minutes).toBe(0.016666666666666666)
  })
})
