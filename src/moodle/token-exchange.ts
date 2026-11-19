import { validateUrl } from '../security/ssrf.js';
import { MoodleAuthError, MoodleSSRFError } from './errors.js';
import { postForm } from './http-transport.js';
import type { MoodleTokenResponse } from '../types/moodle.js';

export interface TokenExchangeCredentials {
  username: string;
  password: string;
  service?: string;
}

export interface TokenExchangeOptions {
  allowPrivateNetwork?: boolean;
  timeoutMs?: number;
}

/**
 * Masks a token for safe logging and error reporting (e.g. "4a82***").
 */
export function maskToken(token?: string): string {
  if (!token || token.length < 8) {
    return '***';
  }
  return `${token.slice(0, 4)}***`;
}

/**
 * Validates that a string does not contain CRLF or control injection characters.
 */
function assertNoCrlf(str: string, fieldName: string): void {
  if (/[\r\n\0]/.test(str)) {
    throw new MoodleAuthError(
      `${fieldName} contains invalid characters (CRLF/Null)`,
      'crlf_detected'
    );
  }
}

/**
 * Exchanges username and password credentials against Moodle's /login/token.php endpoint.
 */
export async function exchangeToken(
  baseUrl: string,
  credentials: TokenExchangeCredentials,
  options?: TokenExchangeOptions
): Promise<{ token: string; privatetoken?: string }> {
  // 1. SSRF Validation
  const validation = validateUrl(baseUrl, options?.allowPrivateNetwork);
  if (!validation.valid) {
    throw new MoodleSSRFError(validation.reason || 'Target URL blocked by SSRF guardrail', baseUrl);
  }

  // 2. CRLF Validation on input credentials
  assertNoCrlf(credentials.username, 'Username');
  assertNoCrlf(credentials.password, 'Password');
  const service = credentials.service || 'moodle_mobile_app';
  assertNoCrlf(service, 'Service');

  // 3. Password memory handling with guaranteed zeroization
  const passwordBuffer = Buffer.from(credentials.password, 'utf8');

  try {
    const postBody = new URLSearchParams({
      username: credentials.username,
      password: passwordBuffer.toString('utf8'),
      service,
    }).toString();

    const targetUrl = new URL('/login/token.php', baseUrl);

    const data = await postForm<MoodleTokenResponse>({
      url: targetUrl,
      body: postBody,
      timeoutMs: options?.timeoutMs,
      allowPrivateNetwork: options?.allowPrivateNetwork,
    });

    if (!data.token) {
      throw new MoodleAuthError('Moodle returned response without token', 'missing_token');
    }

    // Verify token does not contain CRLF
    assertNoCrlf(data.token, 'Token');
    if (data.privatetoken) {
      assertNoCrlf(data.privatetoken, 'Private token');
    }

    return {
      token: data.token,
      privatetoken: data.privatetoken ?? undefined,
    };
  } finally {
    // 4. Memory Zeroization: zero out the buffer containing sensitive password bytes
    passwordBuffer.fill(0);
  }
}

/**
 * Service namespace for Moodle token exchange operations.
 */
export const TokenExchangeService = {
  login: async (baseUrl: string, username: string, password: string) => {
    const res = await exchangeToken(baseUrl, { username, password });
    return res.token;
  },
  exchangeToken,
  maskToken,
};
