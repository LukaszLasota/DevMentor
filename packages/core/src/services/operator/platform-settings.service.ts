import type { Cradle } from '../../container/cradle';
import type { SessionLength } from '../../domain/session-lengths';
import { ServiceUnavailableError } from '../../http/errors';

/** Allowed price range for one session length, in minor units of the platform currency. */
export interface PriceBounds {
  minCents: number;
  maxCents: number;
}

export interface PlatformSettings {
  /** ISO 4217, two decimals (Q-P1: PLN). */
  currency: string;
  bounds: Record<SessionLength, PriceBounds>;
}

export const SETTINGS_UNAVAILABLE_MESSAGE = 'Prices cannot be set right now.';

/**
 * The operator's platform settings (spec 2026-10-21-mentor-prices): the one currency and the price
 * bounds per session length, set by hand (R16). Reads the validated env today; a later settings table
 * sits behind the same methods. Unset settings fail closed: `get` answers 503, `tryGet` `null`.
 */
export class PlatformSettingsService {
  private readonly env: Cradle['env'];

  constructor({ env }: Pick<Cradle, 'env'>) {
    this.env = env;
  }

  /** The settings, or `null` when they are not configured (readiness reports `settings` unmet). */
  tryGet(): PlatformSettings | null {
    const { PLATFORM_CURRENCY: currency, PLATFORM_PRICE_BOUNDS: bounds } = this.env;

    // env.ts refuses boot when only one of the two is set.
    if (currency === undefined || bounds === undefined) {
      return null;
    }

    return { currency, bounds };
  }

  /** The settings, or 503 `SERVICE_UNAVAILABLE` when they are not configured. */
  get(): PlatformSettings {
    const settings = this.tryGet();

    if (settings === null) {
      throw new ServiceUnavailableError(SETTINGS_UNAVAILABLE_MESSAGE);
    }

    return settings;
  }

  /** The bounds of one session length (503 when unconfigured). */
  boundsFor(length: SessionLength): PriceBounds {
    return this.get().bounds[length];
  }
}
