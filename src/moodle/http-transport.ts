import http from 'http';
import https from 'https';
import { validateUrl, createSecureLookup, LookupFunction } from '../security/ssrf.js';
import {
  MoodleAuthError,
  MoodleNetworkError,
  MoodleRestError,
  MoodleSSRFError,
} from './errors.js';

export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB

export interface HttpPostRequest {
  url: URL;
  body: string;
  timeoutMs?: number;
  maxPayloadBytes?: number;
  rejectUnauthorized?: boolean;
  allowPrivateNetwork?: boolean;
  lookup?: LookupFunction;
}

/**
 * Single canonical HTTP form post transport for all Moodle network communication.
 * Enforces:
 * - Pre-flight SSRF URL validation
 * - Connection and socket timeout with proper req.destroy()
 * - isSettled guard against double-resolution / double-rejection
 * - Strict 10MB payload size limit preventing memory exhaustion DoS
 * - HTTP status code error checking
 * - Safe JSON parsing and Moodle REST/Auth error mapping
 */
export async function postForm<T = any>(req: HttpPostRequest): Promise<T> {
  // 1. SSRF validation
  const validation = validateUrl(req.url.origin, req.allowPrivateNetwork);
  if (!validation.valid) {
    throw new MoodleSSRFError(
      validation.reason || 'Target URL blocked by SSRF guardrail',
      req.url.origin
    );
  }

  const transport = req.url.protocol === 'https:' ? https : http;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxPayloadSize = req.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_SIZE;

  return new Promise<T>((resolve, reject) => {
    let isSettled = false;

    const safeReject = (err: Error) => {
      if (!isSettled) {
        isSettled = true;
        reject(err);
      }
    };

    const safeResolve = (val: T) => {
      if (!isSettled) {
        isSettled = true;
        resolve(val);
      }
    };

    const secureLookup =
      req.lookup ??
      createSecureLookup({ allowPrivateNetwork: req.allowPrivateNetwork });

    const clientReq = transport.request(
      req.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(req.body),
        },
        timeout: timeoutMs,
        rejectUnauthorized: req.rejectUnauthorized ?? true,
        lookup: secureLookup as any,
      },
      (res) => {
        let responseBody = '';
        let totalBytes = 0;
        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          totalBytes += Buffer.byteLength(chunk);
          if (totalBytes > maxPayloadSize) {
            clientReq.destroy();
            res.destroy();
            safeReject(
              new MoodleNetworkError(
                `Response exceeded maximum allowed 10MB size limit (${totalBytes} bytes received)`,
                'payload_too_large'
              )
            );
            return;
          }
          responseBody += chunk;
        });

        res.on('end', () => {
          if (isSettled) return;

          let parsed: any;
          try {
            parsed = JSON.parse(responseBody);
          } catch {
            safeReject(
              new MoodleNetworkError(
                `Moodle HTTP Error ${res.statusCode}: Invalid JSON response`,
                'invalid_json',
                { raw: responseBody.slice(0, 500) }
              )
            );
            return;
          }

          // Detect Moodle REST or Login error structures
          if (parsed && typeof parsed === 'object') {
            if (parsed.exception) {
              const errorcode = parsed.errorcode || 'moodle_exception';
              const message = parsed.message || 'Moodle REST request exception';

              if (
                errorcode === 'invalidtoken' ||
                errorcode === 'accessexception' ||
                message.toLowerCase().includes('token')
              ) {
                safeReject(new MoodleAuthError(message, errorcode, parsed));
              } else {
                safeReject(new MoodleRestError(message, errorcode, parsed.exception, parsed));
              }
              return;
            }

            if (parsed.error || parsed.errorcode) {
              const errorcode = parsed.errorcode || 'rest_error';
              const message = parsed.error || 'Moodle request failed';
              if (
                errorcode === 'invalidlogin' ||
                errorcode === 'invalidtoken' ||
                message.toLowerCase().includes('login') ||
                message.toLowerCase().includes('token')
              ) {
                safeReject(new MoodleAuthError(message, errorcode, parsed));
              } else {
                safeReject(new MoodleRestError(message, errorcode, undefined, parsed));
              }
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            safeReject(
              new MoodleNetworkError(
                `Moodle HTTP Error ${res.statusCode}: Request failed`,
                'http_error',
                { statusCode: res.statusCode, body: parsed }
              )
            );
            return;
          }

          safeResolve(parsed as T);
        });

        res.on('error', (err) => {
          safeReject(new MoodleNetworkError(`Response stream error: ${err.message}`));
        });
      }
    );

    clientReq.on('timeout', () => {
      clientReq.destroy();
      safeReject(
        new MoodleNetworkError(
          `Request timed out after ${timeoutMs}ms`,
          'socket_timeout'
        )
      );
    });

    clientReq.on('error', (err: any) => {
      const msg = err.message || '';
      if (
        msg.includes('DNS rebinding') ||
        msg.includes('cloud metadata address blocked') ||
        msg.includes('private/loopback network blocked')
      ) {
        safeReject(new MoodleSSRFError(msg, req.url.origin));
      } else {
        safeReject(new MoodleNetworkError(`Network request error: ${msg}`));
      }
    });

    clientReq.write(req.body);
    clientReq.end();
  });
}
