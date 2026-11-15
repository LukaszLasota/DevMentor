import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';

const baseUrl = inject('baseUrl');
const browser = createAgentBrowser(`devmentor-integration-${process.pid}`);

describe('pages in a real browser (agent-browser)', () => {
  afterAll(async () => {
    await browser.close();
  });

  // Signed-in /admin (operator, mentee refused) is covered in github-sign-in.test.ts.
  it('/admin sends a visitor without a session to /sign-in with returnTo', async () => {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitForUrl('**/sign-in?returnTo=%2Fadmin');

    expect(new URL(await browser.url()).search).toBe('?returnTo=%2Fadmin');
    await browser.waitForText('Sign in to DevMentor');
    expect(await browser.attr('a[href^="/api/auth/github"]', 'href')).toBe('/api/auth/github?returnTo=%2Fadmin');
  });

  it('/sign-in explains a GitHub error code', async () => {
    const page = await browser.open(`${baseUrl}/sign-in?error=github_cancelled`);

    expect(page.title).toBe('Sign in · DevMentor');
    await browser.waitForText('You cancelled GitHub sign-in.');
    expect(await browser.text('main')).toContain('Forgot your password? Use GitHub with the same email.');
  });

  it('/ renders the public home page', async () => {
    const page = await browser.open(baseUrl);

    expect(page.title).toBe('DevMentor');
    expect(await browser.text('h1')).toContain('To get started, edit the');
  });
});
