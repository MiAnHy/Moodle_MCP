import { MoodleAuthError } from './errors.js';
import { exchangeToken } from './token-exchange.js';
import {
  postForm,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_PAYLOAD_SIZE,
} from './http-transport.js';
import type { MoodleClient, MoodleClientConfig } from '../types/moodle.js';

export type { MoodleClient, MoodleClientConfig };
export { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_PAYLOAD_SIZE };

/**
 * Recursively serializes arbitrary objects and arrays into PHP form bracket notation.
 * e.g. criteria: [{ key: 'email', value: 'x' }] -> criteria[0][key]=email&criteria[0][value]=x
 */
export function serializePhpParams(
  params: Record<string, any>,
  prefix = '',
  seen = new WeakSet<object>()
): string {
  if (params && typeof params === 'object') {
    if (seen.has(params)) {
      return '';
    }
    seen.add(params);
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    const keyPrefix = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item === undefined || item === null) continue;
        const itemPrefix = `${keyPrefix}[${i}]`;
        if (typeof item === 'object') {
          const sub = serializePhpParams(item, itemPrefix, seen);
          if (sub) parts.push(sub);
        } else if (typeof item === 'boolean') {
          parts.push(`${encodeURIComponent(itemPrefix)}=${item ? '1' : '0'}`);
        } else {
          parts.push(`${encodeURIComponent(itemPrefix)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else if (typeof value === 'object') {
      const sub = serializePhpParams(value, keyPrefix, seen);
      if (sub) parts.push(sub);
    } else if (typeof value === 'boolean') {
      parts.push(`${encodeURIComponent(keyPrefix)}=${value ? '1' : '0'}`);
    } else {
      parts.push(`${encodeURIComponent(keyPrefix)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join('&');
}

/**
 * Production Core REST Client for Moodle LMS.
 */
export class MoodleRestClient implements MoodleClient {
  public config: MoodleClientConfig;

  constructor(config: MoodleClientConfig) {
    this.config = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxPayloadSize: DEFAULT_MAX_PAYLOAD_SIZE,
      ...config,
    };
  }

  /**
   * Exchanges username/password for tokens via /login/token.php.
   */
  async login(
    username: string,
    password: string,
    service?: string
  ): Promise<{ token: string; privatetoken?: string }> {
    const result = await exchangeToken(
      this.config.baseUrl,
      { username, password, service },
      {
        allowPrivateNetwork: this.config.allowPrivateNetwork,
        timeoutMs: this.config.timeoutMs,
      }
    );

    this.config.token = result.token;
    return result;
  }

  /**
   * Dispatches a typed Web Service request directly to /webservice/rest/server.php.
   */
  async callFunction<T = any>(
    functionName: string,
    parameters: Record<string, any> = {},
    token?: string
  ): Promise<T> {
    const activeToken = token || this.config.token || this.config.defaultToken;
    if (!activeToken) {
      throw new MoodleAuthError(
        'No authentication token available. Call login() or provide token.',
        'missing_token'
      );
    }

    if (/[\r\n]/.test(activeToken)) {
      throw new MoodleAuthError('Token contains invalid characters (CRLF)', 'crlf_detected');
    }

    const targetUrl = new URL('/webservice/rest/server.php', this.config.baseUrl);

    // Build form payload
    const payloadObject: Record<string, any> = {
      wstoken: activeToken,
      wsfunction: functionName,
      moodlewsrestformat: 'json',
      ...parameters,
    };

    const postData = serializePhpParams(payloadObject);

    return postForm<T>({
      url: targetUrl,
      body: postData,
      timeoutMs: this.config.timeoutMs,
      maxPayloadBytes: this.config.maxPayloadSize,
      rejectUnauthorized: this.config.rejectUnauthorized,
      allowPrivateNetwork: this.config.allowPrivateNetwork,
    });
  }
}
