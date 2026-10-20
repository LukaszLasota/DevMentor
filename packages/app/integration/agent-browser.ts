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
    text: async (selector: string) => (await run<{ text: string }>('get', 'text', selector)).text,
    close: () => run('close'),
  };
}
