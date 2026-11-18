import net from 'net';
import dns from 'dns';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SecureLookupOptions {
  allowPrivateNetwork?: boolean;
  lookupTimeoutMs?: number;
}

export type LookupFunction = (
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
) => void;

const CLOUD_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'instance-data',
  '100.100.100.200',
]);

/**
 * Parses IPv4 string into 4 number octets. Returns null if invalid.
 */
function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Checks if an IPv4 address is a cloud metadata address.
 */
function isCloudMetadataIpv4(octets: number[]): boolean {
  // 169.254.169.254 or link-local 169.254.0.0/16
  if (octets[0] === 169 && octets[1] === 254) return true;
  // 100.100.100.200 (Alibaba Cloud metadata)
  if (octets[0] === 100 && octets[1] === 100 && octets[2] === 100 && octets[3] === 200) return true;
  return false;
}

/**
 * Checks if an IPv4 address is loopback (127.0.0.0/8 or 0.0.0.0).
 */
function isLoopbackIpv4(octets: number[]): boolean {
  return octets[0] === 127 || (octets[0] === 0 && octets[1] === 0 && octets[2] === 0 && octets[3] === 0);
}

/**
 * Checks if an IPv4 address is private under RFC 1918.
 */
function isRfc1918Ipv4(octets: number[]): boolean {
  // 10.0.0.0/8
  if (octets[0] === 10) return true;
  // 172.16.0.0/12
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  // 192.168.0.0/16
  if (octets[0] === 192 && octets[1] === 168) return true;
  return false;
}

/**
 * Checks if an IPv6 address is loopback.
 */
function isLoopbackIpv6(cleanIp: string): boolean {
  const norm = cleanIp.toLowerCase();
  return norm === '::1' || norm === '0000:0000:0000:0000:0000:0000:0000:0001' || norm === '::';
}

/**
 * Checks if an IPv6 address is link-local (fe80::/10).
 */
function isLinkLocalIpv6(cleanIp: string): boolean {
  const norm = cleanIp.toLowerCase();
  return norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb');
}

/**
 * Checks if an IPv6 address is Unique Local Address (fc00::/7).
 */
function isUniqueLocalIpv6(cleanIp: string): boolean {
  const norm = cleanIp.toLowerCase();
  return norm.startsWith('fc') || norm.startsWith('fd');
}

/**
 * Detects IPv4-mapped IPv6 address (::ffff:w.x.y.z or ::ffff:hhhh:hhhh or 0:0:0:0:0:ffff:...)
 * and returns the parsed IPv4 octets, or null if not an IPv4-mapped address.
 */
function extractIpv4Mapped(cleanIp: string): number[] | null {
  const norm = cleanIp.toLowerCase().replace(/^\[|\]$/g, '');

  // 1. Dotted format: ::ffff:1.2.3.4 or full 0:0:0:0:0:ffff:1.2.3.4
  const dotMatch = norm.match(/^(?:(?:::)|(?:0+:){1,5}|(?:::0+:))ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotMatch) {
    return parseIpv4(dotMatch[1]);
  }

  // 2. Hex format: ::ffff:a9fe:a9fe or full 0:0:0:0:0:ffff:a9fe:a9fe
  const hexMatch = norm.match(/^(?:(?:::)|(?:0+:){1,5}|(?:::0+:))ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMatch) {
    const h1 = parseInt(hexMatch[1], 16);
    const h2 = parseInt(hexMatch[2], 16);
    if (!isNaN(h1) && !isNaN(h2) && h1 >= 0 && h1 <= 0xffff && h2 >= 0 && h2 <= 0xffff) {
      return [(h1 >> 8) & 0xff, h1 & 0xff, (h2 >> 8) & 0xff, h2 & 0xff];
    }
  }

  return null;
}

/**
 * Checks if an IP is loopback, RFC 1918, link-local, or cloud metadata.
 */
export function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '');
  const ipType = net.isIP(clean);

  if (ipType === 4) {
    const octets = parseIpv4(clean);
    if (!octets) return false;
    return isLoopbackIpv4(octets) || isRfc1918Ipv4(octets) || isCloudMetadataIpv4(octets);
  }

  if (ipType === 6) {
    const mappedOctets = extractIpv4Mapped(clean);
    if (mappedOctets) {
      return isLoopbackIpv4(mappedOctets) || isRfc1918Ipv4(mappedOctets) || isCloudMetadataIpv4(mappedOctets);
    }
    return isLoopbackIpv6(clean) || isLinkLocalIpv6(clean) || isUniqueLocalIpv6(clean);
  }

  return false;
}

/**
 * Validates a target URL against SSRF vulnerabilities.
 * Enforces protocol checks, loopback/private IP blocking, and metadata service rejection.
 */
export function validateUrl(urlStr: string, allowPrivateNetwork?: boolean): ValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Protocol check: Only http: and https: are permitted
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: `Protocol must be http: or https:, received: ${parsed.protocol}`,
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 1. Unconditional rejection of cloud metadata hosts & IPs (NEVER overridable)
  if (CLOUD_METADATA_HOSTS.has(hostname)) {
    return { valid: false, reason: 'Cloud metadata service access prohibited' };
  }

  const ipType = net.isIP(hostname);

  if (ipType === 4) {
    const octets = parseIpv4(hostname);
    if (octets && isCloudMetadataIpv4(octets)) {
      return { valid: false, reason: 'Cloud metadata service access prohibited' };
    }
  }

  if (ipType === 6) {
    const mappedOctets = extractIpv4Mapped(hostname);
    if (mappedOctets && isCloudMetadataIpv4(mappedOctets)) {
      return { valid: false, reason: 'Cloud metadata service access prohibited' };
    }
    if (isLinkLocalIpv6(hostname)) {
      return { valid: false, reason: 'Cloud metadata or link-local address prohibited' };
    }
  }

  // Check if private networks are permitted
  const privateAllowed =
    allowPrivateNetwork === true || process.env.ALLOW_PRIVATE_NETWORK === 'true';

  // 2. Loopback validation
  if (hostname === 'localhost') {
    if (!privateAllowed) {
      return { valid: false, reason: 'Loopback network address rejected (localhost)' };
    }
    return { valid: true };
  }

  if (ipType === 4) {
    const octets = parseIpv4(hostname);
    if (octets) {
      if (isLoopbackIpv4(octets)) {
        if (!privateAllowed) {
          return { valid: false, reason: `Loopback network address rejected: ${hostname}` };
        }
        return { valid: true };
      }

      if (isRfc1918Ipv4(octets)) {
        if (!privateAllowed) {
          return { valid: false, reason: `Private RFC 1918 network address rejected: ${hostname}` };
        }
        return { valid: true };
      }
    }
  }

  if (ipType === 6) {
    const mappedOctets = extractIpv4Mapped(hostname);
    if (mappedOctets) {
      if (isLoopbackIpv4(mappedOctets)) {
        if (!privateAllowed) {
          return { valid: false, reason: `Loopback IPv6 address rejected: ${hostname}` };
        }
        return { valid: true };
      }

      if (isRfc1918Ipv4(mappedOctets)) {
        if (!privateAllowed) {
          return { valid: false, reason: `Private RFC 1918 network address rejected: ${hostname}` };
        }
        return { valid: true };
      }

      return { valid: true };
    }

    if (isLoopbackIpv6(hostname)) {
      if (!privateAllowed) {
        return { valid: false, reason: `Loopback IPv6 address rejected: ${hostname}` };
      }
      return { valid: true };
    }

    if (isUniqueLocalIpv6(hostname)) {
      if (!privateAllowed) {
        return { valid: false, reason: `Private IPv6 address rejected: ${hostname}` };
      }
      return { valid: true };
    }
  }

  return { valid: true };
}

/**
 * Creates a DNS lookup hook for Node http/https requests that intercepts address resolution.
 * Asserts that resolved IP addresses are not cloud metadata or private/loopback addresses,
 * defeating DNS rebinding attacks at the socket seam before TCP handshake.
 */
export function createSecureLookup(options: SecureLookupOptions = {}): LookupFunction {
  const privateAllowed =
    options.allowPrivateNetwork === true || process.env.ALLOW_PRIVATE_NETWORK === 'true';
  const timeoutMs = options.lookupTimeoutMs ?? 5000;

  return function secureLookup(
    hostname: string,
    opts: any,
    callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
  ) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    let isDone = false;
    let timer: NodeJS.Timeout | null = null;

    const done = (err: NodeJS.ErrnoException | null, address: any, family?: number) => {
      if (isDone) return;
      isDone = true;
      if (timer) clearTimeout(timer);
      callback(err, address, family);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const timeoutErr: NodeJS.ErrnoException = new Error(
          `DNS lookup timed out after ${timeoutMs}ms for host: ${hostname}`
        );
        timeoutErr.code = 'ETIMEDOUT';
        done(timeoutErr, null);
      }, timeoutMs);
    }

    dns.lookup(hostname, opts, (err, address, family) => {
      if (err) {
        return done(err, address, family);
      }

      const addressesToCheck: string[] = [];
      if (Array.isArray(address)) {
        for (const item of address) {
          addressesToCheck.push(item.address);
        }
      } else if (typeof address === 'string') {
        addressesToCheck.push(address);
      }

      for (const ip of addressesToCheck) {
        const clean = ip.replace(/^\[|\]$/g, '');
        const ipType = net.isIP(clean);

        // 1. Cloud metadata check (NEVER overridable)
        if (ipType === 4) {
          const octets = parseIpv4(clean);
          if (octets && isCloudMetadataIpv4(octets)) {
            const ssrfErr: NodeJS.ErrnoException = new Error(
              `DNS resolution to cloud metadata address blocked: ${ip}`
            );
            ssrfErr.code = 'ENOTFOUND';
            return done(ssrfErr, null);
          }
        } else if (ipType === 6) {
          const mappedOctets = extractIpv4Mapped(clean);
          if (mappedOctets && isCloudMetadataIpv4(mappedOctets)) {
            const ssrfErr: NodeJS.ErrnoException = new Error(
              `DNS resolution to cloud metadata address blocked: ${ip}`
            );
            ssrfErr.code = 'ENOTFOUND';
            return done(ssrfErr, null);
          }
          if (isLinkLocalIpv6(clean)) {
            const ssrfErr: NodeJS.ErrnoException = new Error(
              `DNS resolution to link-local address blocked: ${ip}`
            );
            ssrfErr.code = 'ENOTFOUND';
            return done(ssrfErr, null);
          }
        }

        // 2. Private & loopback network check
        if (!privateAllowed && isPrivateIp(clean)) {
          const ssrfErr: NodeJS.ErrnoException = new Error(
            `DNS resolution to private/loopback network blocked: ${ip}`
          );
          ssrfErr.code = 'ENOTFOUND';
          return done(ssrfErr, null);
        }
      }

      return done(null, address, family);
    });
  };
}

