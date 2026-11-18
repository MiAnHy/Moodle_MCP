import { describe, it, expect, vi } from 'vitest';
import dns from 'dns';
import { createSecureLookup } from '../../src/security/ssrf.js';
import { postForm } from '../../src/moodle/http-transport.js';

describe('DNS-Rebinding Hardened Socket Seam (Slice 1)', () => {
  it('resolves public IP address normally', async () => {
    const lookup = createSecureLookup();
    await new Promise<void>((resolve, reject) => {
      lookup('1.1.1.1', {}, (err, address, family) => {
        if (err) return reject(err);
        expect(address).toBe('1.1.1.1');
        expect(family).toBe(4);
        resolve();
      });
    });
  });

  it('blocks resolution when IP is AWS/GCP metadata address (169.254.169.254)', async () => {
    // Mock dns.lookup to simulate DNS rebinding returning 169.254.169.254
    const spy = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, '169.254.169.254', 4);
    });

    const lookup = createSecureLookup();
    await new Promise<void>((resolve, reject) => {
      lookup('attacker.rebind.internal', {}, (err, address) => {
        if (err) {
          expect(err.message).toContain('cloud metadata address blocked');
          expect(err.code).toBe('ENOTFOUND');
          return resolve();
        }
        reject(new Error(`Expected error, but got address: ${address}`));
      });
    });

    spy.mockRestore();
  });

  it('blocks resolution when IP is Alibaba metadata address (100.100.100.200)', async () => {
    const spy = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, '100.100.100.200', 4);
    });

    const lookup = createSecureLookup();
    await new Promise<void>((resolve, reject) => {
      lookup('alibaba.metadata.rebind', {}, (err, address) => {
        if (err) {
          expect(err.message).toContain('cloud metadata address blocked');
          return resolve();
        }
        reject(new Error(`Expected error, but got address: ${address}`));
      });
    });

    spy.mockRestore();
  });

  it('blocks resolution to private IP (192.168.1.50) when allowPrivateNetwork is false', async () => {
    const spy = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, '192.168.1.50', 4);
    });

    const lookup = createSecureLookup({ allowPrivateNetwork: false });
    await new Promise<void>((resolve, reject) => {
      lookup('internal.corp.local', {}, (err, address) => {
        if (err) {
          expect(err.message).toContain('private/loopback network blocked');
          return resolve();
        }
        reject(new Error(`Expected error, but got address: ${address}`));
      });
    });

    spy.mockRestore();
  });

  it('permits private IP when allowPrivateNetwork is true, but STILL blocks cloud metadata', async () => {
    const spy = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, '192.168.1.50', 4);
    });

    const lookup = createSecureLookup({ allowPrivateNetwork: true });
    await new Promise<void>((resolve, reject) => {
      lookup('internal.corp.local', {}, (err, address) => {
        if (err) return reject(err);
        expect(address).toBe('192.168.1.50');
        resolve();
      });
    });

    spy.mockRestore();

    // Now test that metadata is STILL blocked even when allowPrivateNetwork: true
    const spyMeta = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, '169.254.169.254', 4);
    });

    await new Promise<void>((resolve, reject) => {
      lookup('rebind-meta.local', {}, (err, address) => {
        if (err) {
          expect(err.message).toContain('cloud metadata address blocked');
          return resolve();
        }
        reject(new Error(`Expected error, but got address: ${address}`));
      });
    });

    spyMeta.mockRestore();
  });

  it('handles array of resolved addresses when opts.all is true', async () => {
    const spy = vi.spyOn(dns, 'lookup').mockImplementation((_host, _opts, callback: any) => {
      callback(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]);
    });

    const lookup = createSecureLookup();
    await new Promise<void>((resolve, reject) => {
      lookup('multi-rebind.com', { all: true }, (err, address) => {
        if (err) {
          expect(err.message).toContain('cloud metadata address blocked');
          return resolve();
        }
        reject(new Error(`Expected error, but got address: ${address}`));
      });
    });

    spy.mockRestore();
  });

  it('postForm integrates lookup and aborts request on DNS rebinding', async () => {
    // Custom lookup that resolves to metadata IP
    const mockLookup = (_host: string, _opts: any, callback: any) => {
      const err: any = new Error('DNS rebinding attempt to cloud metadata blocked: 169.254.169.254');
      err.code = 'ENOTFOUND';
      callback(err, null);
    };

    await expect(
      postForm({
        url: new URL('http://example.com/webservice/rest/server.php'),
        body: 'foo=bar',
        lookup: mockLookup as any,
      })
    ).rejects.toThrow(/DNS rebinding attempt to cloud metadata blocked/);
  });
});
