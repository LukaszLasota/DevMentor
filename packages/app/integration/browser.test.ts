import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';

const baseUrl = inject('baseUrl');
const browser = createAgentBrowser(`devmentor-integration-${process.pid}`);

describe('pages in a real browser (agent-browser)', () => {
  afterAll(async () => {
    await browser.close();
  });

  it('/admin shows the database status fetched through apiCall', async () => {
    const page = await browser.open(`${baseUrl}/admin`);

    expect(page.title).toBe('DevMentor Admin');
    await browser.waitForText('up');
    expect(await browser.text('main')).toContain('Database\tup');
  });

  it('/ renders the public home page', async () => {
    const page = await browser.open(baseUrl);

    expect(page.title).toBe('DevMentor');
    expect(await browser.text('h1')).toContain('To get started, edit the');
  });
});
