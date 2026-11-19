/**
 * Indirect Prompt Injection Defense & PII Stripping
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'salt',
  'secret',
  'auth',
  'sesskey',
  'token',
  'privatetoken',
  'userprivateaccesskey',
  'lastip',
  'firstaccess',
  'lastaccess',
  'lastlogin',
  'currentlogin',
  'preferences',
  'apikey',
  'accesstoken',
  'sessionid',
  'cookiekey',
  'authtoken',
  'bearertoken',
  'idnumber',
  'phone1',
  'phone2',
  'address',
]);

/**
 * Encloses untrusted user content (submissions, forum posts, comments)
 * in <user_content untrusted="true"> tags while escaping attempts to break out of the fence.
 */
export function sanitizeUntrustedContent(content?: string | null): string {
  if (!content || typeof content !== 'string') {
    return '<user_content untrusted="true">\n\n</user_content>';
  }

  // 1. Neutralize closing tag breakout attempts: </user_content...> -> &lt;/user_content...&gt;
  let sanitized = content.replace(/<\s*\/\s*user_content(\s*[^>]*)?>/gi, (_match, group1) => {
    const attr = (group1 || '').trim();
    return attr ? `&lt;/user_content ${attr}&gt;` : '&lt;/user_content&gt;';
  });

  // 2. Neutralize opening tag spoofing attempts: <user_content...> -> &lt;user_content...&gt;
  sanitized = sanitized.replace(/<\s*user_content(\s*[^>]*)?>/gi, (_match, group1) => {
    return `&lt;user_content${group1 || ''}&gt;`;
  });

  return `<user_content untrusted="true">\n${sanitized.trim()}\n</user_content>`;
}

/**
 * Recursively strips sensitive fields (passwords, hashes, salts, session tokens, IPs)
 * from Moodle API responses before exposing them to agent contexts.
 */
export function stripSensitiveFields<T = any>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'object') {
    if (seen.has(data as object)) {
      return data;
    }
    seen.add(data as object);
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripSensitiveFields(item, seen)) as unknown as T;
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        continue;
      }
      cleaned[key] = stripSensitiveFields(value, seen);
    }
    return cleaned as T;
  }

  return data;
}
