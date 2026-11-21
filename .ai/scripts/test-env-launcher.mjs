// om-prepare-test-env: launcher started (detached) by .ai/scripts/test-env-up.sh.
// Runs the GitHub and Stripe stubs and the production build of the app against the test PostgreSQL —
// the same wiring as packages/app/integration/global-setup.ts — and stays in the foreground until killed.
// Disposable demo values only: the stub credentials below are not real keys.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startGithubStub } from '../../scripts/lib/github-stub.mjs';
import { startStripeStub } from '../../scripts/lib/stripe-stub.mjs';

const [databaseUrl, port, runtimeFile] = process.argv.slice(2);
const appDir = fileURLToPath(new URL('../../packages/app/', import.meta.url));
const nextBin = fileURLToPath(new URL('../../node_modules/.bin/next', import.meta.url));
const baseUrl = `http://127.0.0.1:${port}`;
const STRIPE_SECRET_KEY = 'sk_test_integration';
const STRIPE_WEBHOOK_SECRET = 'whsec_integration';

const github = await startGithubStub({ port: 0, clientId: 'test-env-client', clientSecret: 'test-env-secret' });
const stripe = await startStripeStub({ secretKey: STRIPE_SECRET_KEY, webhookSecret: STRIPE_WEBHOOK_SECRET, webhookUrl: `${baseUrl}/api/webhooks/stripe` });

writeFileSync(runtimeFile, JSON.stringify({ githubStubUrl: github.url, stripeStubUrl: stripe.url }));

const app = spawn(nextBin, ['start', '--port', port, '--hostname', '127.0.0.1'], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    APP_URL: baseUrl,
    ALLOW_TEST_OVERRIDES: '1',
    MAIL_PROVIDER: 'log',
    DEVMENTOR_GITHUB_OAUTH_URL: github.url,
    DEVMENTOR_GITHUB_API_URL: github.url,
    GITHUB_CLIENT_ID: 'test-env-client',
    GITHUB_CLIENT_SECRET: 'test-env-secret',
    OPERATOR_EMAILS: 'mock-operator@devmentor.test',
    PLATFORM_CURRENCY: 'PLN',
    PLATFORM_PRICE_BOUNDS: JSON.stringify({ '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } }),
    STRIPE_API_URL: stripe.url,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
  },
});

const stop = async () => {
  app.kill();
  await Promise.allSettled([github.close(), stripe.close()]);
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
app.on('exit', async (code) => {
  await Promise.allSettled([github.close(), stripe.close()]);
  process.exit(code ?? 1);
});
