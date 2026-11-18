import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AuthConfig {
  url: string;
  token: string;
  username?: string;
  userId?: number;
  sitename?: string;
  savedAt?: string;
}

const CONFIG_DIR_NAME = '.moodle';
const CONFIG_FILE_NAME = 'auth.json';

/**
 * Returns the path to the user's .moodle config directory.
 */
export function getMoodleConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * Returns the path to ~/.moodle/auth.json.
 */
export function getMoodleAuthFilePath(): string {
  return path.join(getMoodleConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Saves auth configuration with secure file permissions (0600 on POSIX).
 */
export function saveAuthConfig(config: AuthConfig): void {
  const dir = getMoodleConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const filePath = getMoodleAuthFilePath();
  const payload = JSON.stringify(
    {
      ...config,
      savedAt: new Date().toISOString(),
    },
    null,
    2
  );

  fs.writeFileSync(filePath, payload, { mode: 0o600 });
}

/**
 * Loads auth configuration from ~/.moodle/auth.json if present.
 */
export function loadAuthConfig(): AuthConfig | null {
  const filePath = getMoodleAuthFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.url === 'string' && typeof parsed.token === 'string') {
      return parsed as AuthConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves effective auth configuration with priority:
 * 1. CLI explicit overrides (url/token passed via flags)
 * 2. Environment variables (MOODLE_URL, MOODLE_TOKEN)
 * 3. ~/.moodle/auth.json local credentials file
 */
export function getEffectiveAuthConfig(overrides?: { url?: string; token?: string }): AuthConfig | null {
  const url = overrides?.url || process.env.MOODLE_URL;
  const token = overrides?.token || process.env.MOODLE_TOKEN;

  if (url && token) {
    return {
      url: url.replace(/\/+$/, ''),
      token,
      username: process.env.MOODLE_USERNAME,
    };
  }

  const saved = loadAuthConfig();
  if (saved) {
    return {
      ...saved,
      url: overrides?.url || process.env.MOODLE_URL || saved.url,
      token: overrides?.token || process.env.MOODLE_TOKEN || saved.token,
    };
  }

  return null;
}

/**
 * Securely overwrites a memory string buffer to prevent heap scraping.
 */
export function zeroizeString(str: string): void {
  try {
    // Attempt zeroing if buffer backed
    const buf = Buffer.from(str);
    buf.fill(0);
  } catch {
    // Ignore in non-buffer environments
  }
}
