import { ServiceUnavailableError } from '../../http/errors';
import type { Cradle } from '../../container/cradle';

export interface HealthStatus {
  database: 'up';
}

export class HealthService {
  private readonly em: Cradle['em'];
  private readonly logger: Cradle['logger'];

  constructor({ em, logger }: Pick<Cradle, 'em' | 'logger'>) {
    this.em = em;
    this.logger = logger;
  }

  async check(): Promise<HealthStatus> {
    try {
      // Constant query, no user input.
      await this.em.execute('select 1');
    } catch (error) {
      this.logger.warn({ err: error }, 'Database health check failed');
      throw new ServiceUnavailableError('Database is unreachable.', { cause: error });
    }

    return { database: 'up' };
  }
}
