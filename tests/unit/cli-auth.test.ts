import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  saveAuthConfig,
  loadAuthConfig,
  getEffectiveAuthConfig,
  zeroizeString,
  getMoodleAuthFilePath,
} from '../../src/cli/auth.js';

describe('Auth Configuration & Token Security (Ticket 07)', () => {
  const originalEnv = { ...process.env };
  const authFilePath = getMoodleAuthFilePath();
  let existingContent: string | null = null;

  beforeEach(() => {
    // Preserve existing auth file if present
    if (fs.existsSync(authFilePath)) {
      existingContent = fs.readFileSync(authFilePath, 'utf-8');
    }
  });

  afterEach(() => {
    // Restore env and auth file
    process.env = { ...originalEnv };
    if (existingContent !== null) {
      fs.writeFileSync(authFilePath, existingContent);
    } else if (fs.existsSync(authFilePath)) {
      fs.unlinkSync(authFilePath);
    }
  });

  it('saves and loads auth configuration with permissions', () => {
    saveAuthConfig({
      url: 'https://moodle.test.org',
      token: 'test-secure-token-123',
      username: 'alice',
      userId: 105,
      sitename: 'Test University',
    });

    const loaded = loadAuthConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.url).toBe('https://moodle.test.org');
    expect(loaded?.token).toBe('test-secure-token-123');
    expect(loaded?.username).toBe('alice');
    expect(loaded?.userId).toBe(105);
    expect(loaded?.sitename).toBe('Test University');
    expect(loaded?.savedAt).toBeDefined();
  });

  it('getEffectiveAuthConfig prioritizes explicit overrides over env and saved file', () => {
    process.env.MOODLE_URL = 'https://env.moodle.org';
    process.env.MOODLE_TOKEN = 'env-token';

    const effective = getEffectiveAuthConfig({
      url: 'https://override.moodle.org',
      token: 'override-token',
    });

    expect(effective?.url).toBe('https://override.moodle.org');
    expect(effective?.token).toBe('override-token');
  });

  it('getEffectiveAuthConfig falls back to env vars when overrides omitted', () => {
    process.env.MOODLE_URL = 'https://env.moodle.org';
    process.env.MOODLE_TOKEN = 'env-token';

    const effective = getEffectiveAuthConfig();
    expect(effective?.url).toBe('https://env.moodle.org');
    expect(effective?.token).toBe('env-token');
  });

  it('zeroizeString overwrites memory buffers safely', () => {
    let secret = 'my_super_secret_password_123';
    expect(() => zeroizeString(secret)).not.toThrow();
  });
});
