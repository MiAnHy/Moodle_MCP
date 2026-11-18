import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  MoodleAuthError,
  MoodleSSRFError,
  MoodleNetworkError,
  MoodleRestError,
  formatMcpError,
} from '../../src/moodle/errors.js';

describe('Unified MCP Error Serialization Seam (Candidate 3)', () => {
  it('formats MoodleAuthError into standardized MCP error result', () => {
    const error = new MoodleAuthError('Invalid user token supplied', 'invalidtoken');
    const result = formatMcpError(error, { toolName: 'moodle_my_courses' });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('invalidtoken');
    expect(parsed.message).toBe('Invalid user token supplied');
    expect(parsed.category).toBe('auth');
    expect(parsed.toolName).toBe('moodle_my_courses');
  });

  it('formats MoodleSSRFError with security category and target URL', () => {
    const error = new MoodleSSRFError(
      'Target URL blocked by SSRF guardrail',
      'http://169.254.169.254'
    );
    const result = formatMcpError(error);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('ssrf_blocked');
    expect(parsed.category).toBe('security');
    expect(parsed.details.targetUrl).toBe('http://169.254.169.254');
  });

  it('formats MoodleNetworkError with network category', () => {
    const error = new MoodleNetworkError('Request timed out after 30000ms', 'socket_timeout');
    const result = formatMcpError(error);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('socket_timeout');
    expect(parsed.category).toBe('network');
  });

  it('formats MoodleRestError with rest_error category and exception metadata', () => {
    const error = new MoodleRestError(
      'Course not found',
      'invalidcourseid',
      'moodle_exception',
      { courseid: 9999 }
    );
    const result = formatMcpError(error, { toolName: 'moodle_get_course_content' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('invalidcourseid');
    expect(parsed.category).toBe('moodle_rest');
    expect(parsed.details.exception).toBe('moodle_exception');
  });

  it('formats Zod validation error with validation category and formatted parameter issues', () => {
    const schema = z.object({
      courseid: z.number(),
    });

    let zodErr: any;
    try {
      schema.parse({ courseid: 'not-a-number' });
    } catch (err) {
      zodErr = err;
    }

    const result = formatMcpError(zodErr, { toolName: 'test_tool' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('validation_error');
    expect(parsed.category).toBe('validation');
    expect(parsed.message).toContain("Error executing tool 'test_tool'");
    expect(parsed.message).toContain('courseid');
  });
});
