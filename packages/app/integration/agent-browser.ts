import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const bin = fileURLToPath(new URL('../../../node_modules/.bin/agent-browser', import.meta.url));
const COMMAND_TIMEOUT_MS = 60_000;

interface AgentBrowserResult<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/** Thin wrapper around the agent-browser CLI with an isolated session per test file. */
export function createAgentBrowser(session: string) {
  async function run<T = Record<string, unknown>>(...args: string[]): Promise<T> {
    let stdout: string;

    try {
      ({ stdout } = await execFileAsync(bin, [...args, '--json'], {
        env: { ...process.env, AGENT_BROWSER_SESSION: session },
        timeout: COMMAND_TIMEOUT_MS,
      }));
    } catch (error) {
      // A failed command still prints its JSON result; anything else is a real failure.
      stdout = (error as { stdout?: string }).stdout ?? '';
      if (!stdout) throw error;
    }

    const result = JSON.parse(stdout) as AgentBrowserResult<T>;

    if (!result.success) {
      throw new Error(`agent-browser ${args.join(' ')} failed: ${result.error}`);
    }

    return result.data;
  }

  return {
    run,
    open: (url: string) => run<{ title: string; url: string }>('open', url),
    waitForText: (text: string) => run('wait', '--text', text),
    waitForUrl: (pattern: string) => run('wait', '--url', pattern),
    /** Waits until the page is hydrated and idle; clicks before that can hit a streaming layout. */
    waitForIdle: () => run('wait', '--load', 'networkidle'),
    url: async () => (await run<{ url: string }>('get', 'url')).url,
    attr: async (selector: string, name: string) => (await run<{ value: string | null }>('get', 'attr', selector, name)).value,
    text: async (selector: string) => (await run<{ text: string }>('get', 'text', selector)).text,
    click: (selector: string) => run('click', selector),
    /** Clears the field and types the text. */
    fill: (selector: string, text: string) => run('fill', selector, text),
    value: async (selector: string) => (await run<{ value: string }>('get', 'value', selector)).value,
    clickButton: (name: string) => run('find', 'role', 'button', 'click', '--name', name),
    count: async (selector: string) => (await run<{ count: number }>('get', 'count', selector)).count,
    /** Value of a cookie of the current page's browser context, `undefined` when it is not set. */
    cookie: async (name: string) =>
      (await run<{ cookies: { name: string; value: string }[] }>('cookies', 'get')).cookies.find((cookie) => cookie.name === name)?.value,
    close: () => run('close'),
  };
}
