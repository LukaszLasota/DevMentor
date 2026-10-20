import { createRequestScope } from '@/server/container';

export async function GET() {
  try {
    const scope = await createRequestScope();
    await scope.cradle.em.execute('select 1');

    return Response.json({ status: 'ok', database: 'up' });
  } catch {
    return Response.json({ status: 'error', database: 'down' }, { status: 503 });
  }
}
