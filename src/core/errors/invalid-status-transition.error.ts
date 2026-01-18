export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(
      `Invalid status transition: cannot transition from '${fromStatus}' to '${toStatus}'`,
    )
    this.name = 'InvalidStatusTransitionError'
  }
}
