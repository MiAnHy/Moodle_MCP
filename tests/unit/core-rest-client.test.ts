import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { validateUrl, isPrivateIp } from '../../src/security/ssrf.js';
import {
  MoodleError,
  MoodleAuthError,
  MoodleRestError,
  MoodleNetworkError,
  MoodleSSRFError,
} from '../../src/moodle/errors.js';
import { exchangeToken, maskToken } from '../../src/moodle/token-exchange.js';
import { MoodleRestClient, serializePhpParams } from '../../src/moodle/client.js';
import { MockMoodleClient } from '../mocks/mock-moodle-client.js';
import loginSuccessFixture from '../fixtures/login-success.json';
import loginErrorFixture from '../fixtures/login-error.json';
import siteInfoFixture from '../fixtures/site-info.json';

describe('Core REST Client & Token Exchange (Ticket 01)', () => {
  describe('SSRF Guardrail (validateUrl & isPrivateIp)', () => {
    it('permits valid public HTTPS and HTTP URLs', () => {
      const res1 = validateUrl('https://moodle.university.edu');
      expect(res1.valid).toBe(true);

      const res2 = validateUrl('http://public-moodle.example.org/webservice/rest/server.php');
      expect(res2.valid).toBe(true);
    });

    it('rejects invalid or non-HTTP protocols', () => {
      const ftp = validateUrl('ftp://moodle.example.com');
      expect(ftp.valid).toBe(false);
      expect(ftp.reason).toMatch(/Protocol must be http: or https:/i);

      const file = validateUrl('file:///etc/passwd');
      expect(file.valid).toBe(false);

      const gopher = validateUrl('gopher://127.0.0.1:6379/');
      expect(gopher.valid).toBe(false);

      const invalid = validateUrl('not-a-valid-url');
      expect(invalid.valid).toBe(false);
    });

    it('rejects loopback addresses by default', () => {
      const localhost = validateUrl('http://localhost:8080');
      expect(localhost.valid).toBe(false);
      expect(localhost.reason).toMatch(/loopback/i);

      const loopbackIp = validateUrl('http://127.0.0.1:8000');
      expect(loopbackIp.valid).toBe(false);
      expect(loopbackIp.reason).toMatch(/loopback/i);

      const loopbackIp2 = validateUrl('http://127.0.0.2');
      expect(loopbackIp2.valid).toBe(false);

      const ipv6Loopback = validateUrl('http://[::1]:8080');
      expect(ipv6Loopback.valid).toBe(false);
    });

    it('rejects RFC 1918 private subnets by default', () => {
      const classA = validateUrl('http://10.0.0.1');
      expect(classA.valid).toBe(false);
      expect(classA.reason).toMatch(/private/i);

      const classB1 = validateUrl('http://172.16.0.1');
      expect(classB1.valid).toBe(false);

      const classB2 = validateUrl('http://172.31.255.255');
      expect(classB2.valid).toBe(false);

      const classC = validateUrl('http://192.168.1.100');
      expect(classC.valid).toBe(false);
      expect(classC.reason).toMatch(/private/i);
    });

    it('rejects cloud metadata endpoints unconditionally', () => {
      const aws = validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(aws.valid).toBe(false);
      expect(aws.reason).toMatch(/metadata/i);

      const gcp = validateUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(gcp.valid).toBe(false);
      expect(gcp.reason).toMatch(/metadata/i);

      const alibaba = validateUrl('http://100.100.100.200/latest/meta-data/');
      expect(alibaba.valid).toBe(false);
      expect(alibaba.reason).toMatch(/metadata/i);
    });

    it('permits loopback and private subnets ONLY when allowPrivateNetwork is true', () => {
      const local = validateUrl('http://localhost:8080', true);
      expect(local.valid).toBe(true);

      const priv = validateUrl('http://192.168.1.50:8000', true);
      expect(priv.valid).toBe(true);

      const classA = validateUrl('http://10.1.2.3', true);
      expect(classA.valid).toBe(true);
    });

    it('CRITICAL: Cloud metadata remains blocked even when allowPrivateNetwork is true', () => {
      const aws = validateUrl('http://169.254.169.254/latest/meta-data/', true);
      expect(aws.valid).toBe(false);
      expect(aws.reason).toMatch(/metadata/i);

      const gcp = validateUrl('http://metadata.google.internal/computeMetadata/v1/', true);
      expect(gcp.valid).toBe(false);
      expect(gcp.reason).toMatch(/metadata/i);
    });

    it('rejects IPv4-mapped IPv6 cloud metadata addresses unconditionally', () => {
      // Dotted notation
      const mappedDot = validateUrl('http://[::ffff:169.254.169.254]');
      expect(mappedDot.valid).toBe(false);
      expect(mappedDot.reason).toMatch(/metadata/i);

      // Hex notation (a9fe = 169.254)
      const mappedHex = validateUrl('http://[::ffff:a9fe:a9fe]');
      expect(mappedHex.valid).toBe(false);
      expect(mappedHex.reason).toMatch(/metadata/i);

      // Unconditional: remains blocked even when allowPrivateNetwork is true
      const mappedDotAllowed = validateUrl('http://[::ffff:169.254.169.254]', true);
      expect(mappedDotAllowed.valid).toBe(false);
      expect(mappedDotAllowed.reason).toMatch(/metadata/i);

      const mappedHexAllowed = validateUrl('http://[::ffff:a9fe:a9fe]', true);
      expect(mappedHexAllowed.valid).toBe(false);
      expect(mappedHexAllowed.reason).toMatch(/metadata/i);
    });

    it('handles IPv4-mapped IPv6 loopback and private subnets correctly', () => {
      // Default: blocked
      expect(validateUrl('http://[::ffff:127.0.0.1]').valid).toBe(false);
      expect(validateUrl('http://[::ffff:192.168.1.1]').valid).toBe(false);

      // When allowPrivateNetwork is true: permitted
      expect(validateUrl('http://[::ffff:127.0.0.1]', true).valid).toBe(true);
      expect(validateUrl('http://[::ffff:192.168.1.1]', true).valid).toBe(true);
    });

    it('identifies IPv4-mapped IPv6 addresses in isPrivateIp', () => {
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true);
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('respects process.env.ALLOW_PRIVATE_NETWORK="true"', () => {
      const originalEnv = process.env.ALLOW_PRIVATE_NETWORK;
      try {
        process.env.ALLOW_PRIVATE_NETWORK = 'true';
        const local = validateUrl('http://127.0.0.1:8080');
        expect(local.valid).toBe(true);
      } finally {
        process.env.ALLOW_PRIVATE_NETWORK = originalEnv;
      }
    });
  });

  describe('Error Class Hierarchy', () => {
    it('instantiates MoodleError and subclasses correctly', () => {
      const baseErr = new MoodleError('Base error', 'base_code');
      expect(baseErr).toBeInstanceOf(Error);
      expect(baseErr).toBeInstanceOf(MoodleError);
      expect(baseErr.errorcode).toBe('base_code');
      expect(baseErr.name).toBe('MoodleError');

      const authErr = new MoodleAuthError('Invalid credentials', 'invalidlogin');
      expect(authErr).toBeInstanceOf(MoodleError);
      expect(authErr).toBeInstanceOf(MoodleAuthError);
      expect(authErr.errorcode).toBe('invalidlogin');
      expect(authErr.name).toBe('MoodleAuthError');

      const restErr = new MoodleRestError('Access denied', 'accessexception', 'moodle_exception');
      expect(restErr).toBeInstanceOf(MoodleError);
      expect(restErr).toBeInstanceOf(MoodleRestError);
      expect(restErr.errorcode).toBe('accessexception');
      expect(restErr.exception).toBe('moodle_exception');

      const netErr = new MoodleNetworkError('Socket timed out');
      expect(netErr).toBeInstanceOf(MoodleError);
      expect(netErr).toBeInstanceOf(MoodleNetworkError);

      const ssrfErr = new MoodleSSRFError('Blocked private IP', '10.0.0.1');
      expect(ssrfErr).toBeInstanceOf(MoodleError);
      expect(ssrfErr).toBeInstanceOf(MoodleSSRFError);
    });
  });

  describe('Token Exchange & CRLF Defense', () => {
    it('masks tokens correctly to avoid secret leakage', () => {
      expect(maskToken('4a82b9c7e1d5f3a0b2c4e6f8a1d3e5b7')).toBe('4a82***');
      expect(maskToken('short')).toBe('***');
      expect(maskToken('')).toBe('***');
    });

    it('rejects tokens or credentials with CRLF characters', async () => {
      await expect(
        exchangeToken('https://moodle.example.com', {
          username: 'admin\r\nInjected-Header: evil',
          password: 'pass',
        })
      ).rejects.toThrow(MoodleAuthError);

      await expect(
        exchangeToken('https://moodle.example.com', {
          username: 'admin',
          password: 'pass\nEvil',
        })
      ).rejects.toThrow(/CRLF/);
    });

    it('rejects SSRF-blocked target base URLs during token exchange', async () => {
      await expect(
        exchangeToken('http://169.254.169.254', {
          username: 'admin',
          password: 'password123',
        })
      ).rejects.toThrow(MoodleSSRFError);
    });
  });

  describe('PHP Parameter Serializer (serializePhpParams)', () => {
    it('serializes simple key-value pairs', () => {
      const params = { wsfunction: 'core_course_get_courses', moodlewsrestformat: 'json' };
      const query = serializePhpParams(params);
      expect(query).toBe('wsfunction=core_course_get_courses&moodlewsrestformat=json');
    });

    it('converts booleans to 1 and 0', () => {
      const params = { active: true, disabled: false };
      const query = serializePhpParams(params);
      expect(query).toBe('active=1&disabled=0');
    });

    it('serializes nested arrays using PHP bracket notation', () => {
      const params = { courseids: [101, 102, 103] };
      const query = serializePhpParams(params);
      expect(query).toBe('courseids%5B0%5D=101&courseids%5B1%5D=102&courseids%5B2%5D=103');
    });

    it('serializes nested objects and criteria arrays correctly', () => {
      const params = {
        criteria: [
          { key: 'email', value: 'student@example.com' },
          { key: 'auth', value: 'manual' },
        ],
      };
      const query = serializePhpParams(params);
      expect(decodeURIComponent(query)).toContain('criteria[0][key]=email');
      expect(decodeURIComponent(query)).toContain('criteria[0][value]=student@example.com');
      expect(decodeURIComponent(query)).toContain('criteria[1][key]=auth');
      expect(decodeURIComponent(query)).toContain('criteria[1][value]=manual');
    });

    it('ignores undefined and null values', () => {
      const params = { a: 'hello', b: undefined, c: null };
      const query = serializePhpParams(params);
      expect(query).toBe('a=hello');
    });

    it('handles circular references without throwing RangeError or infinite recursion', () => {
      const circular: any = { id: 101, name: 'Intro' };
      circular.self = circular;

      const serialized = serializePhpParams(circular);
      expect(serialized).toBe('id=101&name=Intro');
    });
  });

  describe('MoodleRestClient Execution with HTTP Server', () => {
    let server: http.Server;
    let serverPort: number;
    let serverBaseUrl: string;

    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        server = http.createServer((req, res) => {
          const url = new URL(req.url || '', `http://${req.headers.host}`);

          if (url.pathname === '/login/token.php') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              const params = new URLSearchParams(body);
              const username = params.get('username') || url.searchParams.get('username');
              const password = params.get('password') || url.searchParams.get('password');

              if (username === 'validuser' && password === 'validpass') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(loginSuccessFixture));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(loginErrorFixture));
              }
            });
            return;
          }

          if (url.pathname === '/webservice/rest/server.php') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              const params = new URLSearchParams(body);
              const wsfunction = params.get('wsfunction') || url.searchParams.get('wsfunction');
              const wstoken = params.get('wstoken') || url.searchParams.get('wstoken');

              if (wstoken === 'invalid-token') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  exception: 'moodle_exception',
                  errorcode: 'invalidtoken',
                  message: 'Invalid token - token not found',
                }));
                return;
              }

              if (wsfunction === 'core_webservice_get_site_info') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(siteInfoFixture));
                return;
              }

              if (wsfunction === 'large_payload_test') {
                // Return payload over 10MB
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const chunk = 'A'.repeat(1024 * 1024); // 1MB
                for (let i = 0; i < 11; i++) {
                  res.write(chunk);
                }
                res.end();
                return;
              }

              if (wsfunction === 'hang_timeout_test') {
                // Do not respond, hang connection
                return;
              }

              if (wsfunction === 'http_500_json_error') {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ statusCode: 500, title: 'Internal Server Error' }));
                return;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', function: wsfunction }));
            });
            return;
          }

          res.writeHead(404);
          res.end('Not Found');
        });

        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          serverPort = addr.port;
          serverBaseUrl = `http://127.0.0.1:${serverPort}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('exchanges login credentials successfully', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        allowPrivateNetwork: true,
      });

      const tokens = await client.login('validuser', 'validpass');
      expect(tokens.token).toBe(loginSuccessFixture.token);
      expect(tokens.privatetoken).toBe(loginSuccessFixture.privatetoken);
    });

    it('throws MoodleAuthError on invalid login', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        allowPrivateNetwork: true,
      });

      await expect(client.login('baduser', 'wrongpass')).rejects.toThrow(MoodleAuthError);
    });

    it('calls REST function successfully with site-info', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        token: loginSuccessFixture.token,
        allowPrivateNetwork: true,
      });

      const res = await client.callFunction('core_webservice_get_site_info');
      expect(res.sitename).toBe(siteInfoFixture.sitename);
      expect(res.username).toBe(siteInfoFixture.username);
    });

    it('throws MoodleAuthError when Moodle responds with invalidtoken', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        token: 'invalid-token',
        allowPrivateNetwork: true,
      });

      await expect(client.callFunction('core_webservice_get_site_info')).rejects.toThrow(MoodleAuthError);
    });

    it('enforces 10MB response payload bounds and throws MoodleNetworkError', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        token: loginSuccessFixture.token,
        allowPrivateNetwork: true,
      });

      await expect(client.callFunction('large_payload_test')).rejects.toThrow(MoodleNetworkError);
    });

    it('enforces socket timeout and throws MoodleNetworkError', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        token: loginSuccessFixture.token,
        allowPrivateNetwork: true,
        timeoutMs: 500, // Short timeout for test
      });

      await expect(client.callFunction('hang_timeout_test')).rejects.toThrow(MoodleNetworkError);
    });

    it('rejects with MoodleNetworkError when server returns HTTP 500 with non-Moodle JSON payload', async () => {
      const client = new MoodleRestClient({
        baseUrl: serverBaseUrl,
        token: loginSuccessFixture.token,
        allowPrivateNetwork: true,
      });

      await expect(client.callFunction('http_500_json_error')).rejects.toThrow(MoodleNetworkError);
    });
  });

  describe('MockMoodleClient in-memory test harness', () => {
    it('records call history and returns configured responses', async () => {
      const mock = new MockMoodleClient();
      mock.setResponse('core_webservice_get_site_info', siteInfoFixture);

      const res = await mock.callFunction('core_webservice_get_site_info', { dummy: 1 });
      expect(res.sitename).toBe(siteInfoFixture.sitename);

      const lastCall = mock.getLastCall();
      expect(lastCall).toBeDefined();
      expect(lastCall?.functionName).toBe('core_webservice_get_site_info');
      expect(lastCall?.parameters).toEqual({ dummy: 1 });
    });

    it('simulates error responses in MockMoodleClient', async () => {
      const mock = new MockMoodleClient();
      mock.setError('error_fn', new MoodleRestError('Simulated failure', 'custom_error'));

      await expect(mock.callFunction('error_fn')).rejects.toThrow(MoodleRestError);
    });

    it('simulates login calls in MockMoodleClient', async () => {
      const mock = new MockMoodleClient();
      mock.setLoginResponse({ token: 'mock-abc', privatetoken: 'mock-priv' });

      const login = await mock.login('student1', 'secret');
      expect(login.token).toBe('mock-abc');
      expect(mock.loginCalls.length).toBe(1);
      expect(mock.loginCalls[0].username).toBe('student1');
    });
  });
});
