import { ZodError } from 'zod';
import { McpToolResult } from '../tools/types.js';

/**
 * Moodle Error Hierarchy
 */

export class MoodleError extends Error {
  public errorcode?: string;
  public errorDetails?: any;

  constructor(message: string, errorcode?: string, errorDetails?: any) {
    super(message);
    this.name = 'MoodleError';
    this.errorcode = errorcode;
    this.errorDetails = errorDetails;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MoodleAuthError extends MoodleError {
  constructor(message: string, errorcode: string = 'auth_error', errorDetails?: any) {
    super(message, errorcode, errorDetails);
    this.name = 'MoodleAuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MoodleRestError extends MoodleError {
  public exception?: string;

  constructor(message: string, errorcode: string = 'rest_error', exception?: string, errorDetails?: any) {
    super(message, errorcode, errorDetails);
    this.name = 'MoodleRestError';
    this.exception = exception;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MoodleNetworkError extends MoodleError {
  constructor(message: string, errorcode: string = 'network_error', errorDetails?: any) {
    super(message, errorcode, errorDetails);
    this.name = 'MoodleNetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MoodleSSRFError extends MoodleError {
  public targetUrl?: string;

  constructor(message: string, targetUrl?: string, errorcode: string = 'ssrf_blocked') {
    super(message, errorcode, { targetUrl });
    this.name = 'MoodleSSRFError';
    this.targetUrl = targetUrl;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface McpErrorPayload {
  code: string;
  message: string;
  category: 'auth' | 'network' | 'validation' | 'moodle_rest' | 'security' | 'internal';
  details?: unknown;
  toolName?: string;
}

/**
 * Formats any caught error (MoodleError, ZodError, or generic Error) into a standardized MCP error result.
 */
export function formatMcpError(
  error: unknown,
  context?: { toolName?: string; functionName?: string }
): McpToolResult {
  const toolName = context?.toolName;
  let payload: McpErrorPayload;

  if (error instanceof ZodError) {
    const issues = error.errors.map((e) => `${e.path.join('.') || 'param'}: ${e.message}`).join(', ');
    payload = {
      code: 'validation_error',
      message: `Error executing tool${toolName ? ` '${toolName}'` : ''}: Invalid parameters (${issues})`,
      category: 'validation',
      details: error.flatten(),
      toolName,
    };
  } else if (error instanceof MoodleAuthError) {
    payload = {
      code: error.errorcode || 'auth_error',
      message: error.message,
      category: 'auth',
      details: error.errorDetails,
      toolName,
    };
  } else if (error instanceof MoodleSSRFError) {
    payload = {
      code: error.errorcode || 'ssrf_blocked',
      message: error.message,
      category: 'security',
      details: { targetUrl: error.targetUrl },
      toolName,
    };
  } else if (error instanceof MoodleNetworkError) {
    payload = {
      code: error.errorcode || 'network_error',
      message: error.message,
      category: 'network',
      details: error.errorDetails,
      toolName,
    };
  } else if (error instanceof MoodleRestError) {
    const rawDetails = error.errorDetails && typeof error.errorDetails === 'object'
      ? { ...error.errorDetails }
      : error.errorDetails;

    // Strip sensitive internal debug metadata to prevent server-side path & SQL leakage
    if (rawDetails && typeof rawDetails === 'object') {
      delete rawDetails.debuginfo;
      delete rawDetails.backtrace;
      delete rawDetails.stacktrace;
    }

    payload = {
      code: error.errorcode || 'rest_error',
      message: error.message,
      category: 'moodle_rest',
      details: { exception: error.exception, raw: rawDetails },
      toolName,
    };
  } else if (error instanceof MoodleError) {
    payload = {
      code: error.errorcode || 'moodle_error',
      message: error.message,
      category: 'internal',
      details: error.errorDetails,
      toolName,
    };
  } else {
    const rawMsg = error instanceof Error ? error.message : String(error);
    payload = {
      code: 'internal_error',
      message: toolName ? `Error executing tool '${toolName}': ${rawMsg}` : rawMsg,
      category: 'internal',
      toolName,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError: true,
  };
}
