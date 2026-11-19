#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMoodleServer } from '../server.js';
import { createSseEngine } from '../transport/sse-engine.js';
import { MoodleRestClient } from '../moodle/client.js';
import { RoleProfile } from '../tools/types.js';
import { getEffectiveAuthConfig } from './auth.js';
import { runLoginCommand } from './login.js';

interface CliArgs {
  command?: string;
  transport: 'stdio' | 'sse';
  port: number;
  profile: RoleProfile;
  url?: string;
  token?: string;
  help?: boolean;
}

function parseCliArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    transport: (process.env.MOODLE_TRANSPORT as 'stdio' | 'sse') || 'stdio',
    port: parseInt(process.env.PORT || '3000', 10),
    profile: (process.env.MOODLE_PROFILE as RoleProfile) || 'all',
  };

  for (let i = 2; i < args.length; i++) {
    const rawArg = args[i];

    if (rawArg === 'login') {
      result.command = 'login';
      continue;
    }

    if (rawArg === '--help' || rawArg === '-h') {
      result.help = true;
      continue;
    }

    let key = rawArg;
    let val: string | undefined;

    if (rawArg.includes('=')) {
      const idx = rawArg.indexOf('=');
      key = rawArg.substring(0, idx);
      val = rawArg.substring(idx + 1);
    }

    if (key === '--transport' || key === '-t') {
      const actualVal = val !== undefined ? val : args[++i];
      if (actualVal === 'stdio' || actualVal === 'sse') {
        result.transport = actualVal;
      }
    } else if (key === '--port' || key === '-p') {
      const actualVal = parseInt(val !== undefined ? val : args[++i], 10);
      if (!isNaN(actualVal)) result.port = actualVal;
    } else if (key === '--profile') {
      const actualVal = val !== undefined ? val : args[++i];
      if (actualVal === 'student' || actualVal === 'teacher' || actualVal === 'admin' || actualVal === 'all') {
        result.profile = actualVal as RoleProfile;
      }
    } else if (key === '--url') {
      result.url = val !== undefined ? val : args[++i];
    } else if (key === '--token') {
      result.token = val !== undefined ? val : args[++i];
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Universal Moodle MCP Server (moodle-mcp)

Usage:
  npx moodle-mcp [command] [options]

Commands:
  login                        Interactive login to exchange Moodle credentials for a secure token

Options:
  --transport, -t <stdio|sse>  Transport protocol (default: stdio)
  --profile <role>             Active tool profile: student | teacher | admin | all (default: all)
  --port, -p <number>          HTTP port for SSE transport (default: 3000)
  --url <url>                  Moodle base URL override
  --token <token>              Moodle web service token override
  --help, -h                   Show this help message

Environment Variables:
  MOODLE_URL                   Moodle Base URL (e.g. https://moodle.school.edu)
  MOODLE_TOKEN                 Moodle Web Service Token
  MOODLE_PROFILE               Active tool profile (student, teacher, admin, all)
  MOODLE_TRANSPORT             Transport protocol (stdio or sse)
  PORT                         HTTP port for SSE (default 3000)
`);
}

async function startStdioServer(cliArgs: CliArgs): Promise<void> {
  const authConfig = getEffectiveAuthConfig({ url: cliArgs.url, token: cliArgs.token });

  if (!authConfig) {
    process.stderr.write(
      '[moodle-mcp] Warning: No Moodle credentials found in env or ~/.moodle/auth.json.\n' +
      '[moodle-mcp] Run "npx moodle-mcp login" or provide MOODLE_URL and MOODLE_TOKEN.\n'
    );
  }

  const client = new MoodleRestClient({
    baseUrl: authConfig?.url || 'http://localhost/moodle',
    defaultToken: authConfig?.token,
  });

  const server = createMoodleServer({
    profile: cliArgs.profile,
    client,
    token: authConfig?.token,
    userId: authConfig?.userId,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[moodle-mcp] Server running on stdio transport (Profile: ${cliArgs.profile})\n`
  );
}

async function startSseServer(cliArgs: CliArgs): Promise<void> {
  const defaultAuthConfig = getEffectiveAuthConfig({ url: cliArgs.url, token: cliArgs.token });

  const engine = createSseEngine({
    profile: cliArgs.profile,
    defaultUrl: defaultAuthConfig?.url,
    defaultToken: defaultAuthConfig?.token,
  });

  engine.app.listen(cliArgs.port, () => {
    process.stderr.write(
      `[moodle-mcp] Server running on SSE transport at http://localhost:${cliArgs.port}\n` +
      `[moodle-mcp] - SSE stream endpoint: http://localhost:${cliArgs.port}/sse\n` +
      `[moodle-mcp] - Messages endpoint:   http://localhost:${cliArgs.port}/messages\n` +
      `[moodle-mcp] - Active Profile:       ${cliArgs.profile}\n`
    );
  });
}

export async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv);

  if (cliArgs.help) {
    printHelp();
    return;
  }

  if (cliArgs.command === 'login') {
    await runLoginCommand();
    return;
  }

  if (cliArgs.transport === 'sse') {
    await startSseServer(cliArgs);
  } else {
    await startStdioServer(cliArgs);
  }
}

// Execute main when run as CLI
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main().catch((err) => {
    console.error('[moodle-mcp] Fatal error:', err);
    process.exit(1);
  });
}
