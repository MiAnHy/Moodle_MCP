import { describe, it, expect } from 'vitest';
import { stripSensitiveFields } from '../../src/transformers/sanitizer.js';
import { MoodleRestError, formatMcpError } from '../../src/moodle/errors.js';
import { exchangeToken } from '../../src/moodle/token-exchange.js';

describe('Security Hardening Protections', () => {
  it('strips extended sensitive keys (apikey, accesstoken, sessionid, idnumber, phone, address)', () => {
    const dirty = {
      username: 'student1',
      apikey: 'secret-api-key',
      accesstoken: 'secret-oauth-token',
      sessionid: 'sess_99999',
      cookiekey: 'cookie_val',
      authtoken: 'auth_val',
      bearertoken: 'bearer_val',
      idnumber: 'NAT-ID-12345678',
      phone1: '+1-555-0199',
      phone2: '+1-555-0198',
      address: '123 University Way',
      fullname: 'Student One',
    };

    const cleaned = stripSensitiveFields(dirty);

    expect(cleaned.fullname).toBe('Student One');
    expect(cleaned.username).toBe('student1');
    expect(cleaned.apikey).toBeUndefined();
    expect(cleaned.accesstoken).toBeUndefined();
    expect(cleaned.sessionid).toBeUndefined();
    expect(cleaned.cookiekey).toBeUndefined();
    expect(cleaned.authtoken).toBeUndefined();
    expect(cleaned.bearertoken).toBeUndefined();
    expect(cleaned.idnumber).toBeUndefined();
    expect(cleaned.phone1).toBeUndefined();
    expect(cleaned.phone2).toBeUndefined();
    expect(cleaned.address).toBeUndefined();
  });

  it('sanitizes debuginfo and stacktraces from MoodleRestError details', () => {
    const errorWithDebug = new MoodleRestError(
      'Database query error occurred',
      'dmlqueryexception',
      'dml_read_exception',
      {
        errorcode: 'dmlqueryexception',
        message: 'Database query error',
        debuginfo: 'SELECT * FROM mdl_user WHERE id = 123; [path: /var/www/moodle/lib/dml/moodle_database.php: line 45]',
        backtrace: 'Trace stack details...',
        stacktrace: 'Internal PHP stacktrace...',
        courseid: 42,
      }
    );

    const formatted = formatMcpError(errorWithDebug, { toolName: 'test_tool' });
    const parsed = JSON.parse(formatted.content[0].text);

    expect(parsed.code).toBe('dmlqueryexception');
    expect(parsed.details.raw.courseid).toBe(42);
    expect(parsed.details.raw.debuginfo).toBeUndefined();
    expect(parsed.details.raw.backtrace).toBeUndefined();
    expect(parsed.details.raw.stacktrace).toBeUndefined();
  });

  it('rejects null byte in credentials during token exchange', async () => {
    await expect(
      exchangeToken('https://moodle.example.com', {
        username: 'admin\0malicious',
        password: 'password123',
      })
    ).rejects.toThrow('Username contains invalid characters (CRLF/Null)');
  });
});
