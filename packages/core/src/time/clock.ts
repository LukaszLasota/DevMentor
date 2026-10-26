/** Source of the current time. Services and token helpers take a `Clock` so tests can fix "now". */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
