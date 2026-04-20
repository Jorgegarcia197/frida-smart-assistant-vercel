import { isIP } from 'node:net';

/**
 * Validates URLs used for outbound MCP (SSE / Streamable HTTP).
 *
 * - **HTTPS only** — no `http:` (including localhost dev must use https or tunnel).
 * - **No URL credentials** — rejects `https://user:pass@host/`.
 * - **Blocks obvious loopback / RFC1918 / link-local IPv4 literals** after `URL` canonicalization
 *   (covers decimal / octal / hex literal host tricks where `hostname` becomes a dotted quad).
 * - **Blocks common IPv6 loopback / ULA / link-local literals** and IPv4-mapped private addresses.
 *
 * **Residual risk:** hostnames that DNS-resolve to private IPs (rebinding / nip.io-style) are not
 * detected without a resolver and a fixed policy; mitigate with egress controls or an allowlist
 * if you need stronger guarantees.
 */
export function assertSafeMcpRemoteUrl(raw: string): void {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('Invalid MCP server URL');
  }

  if (u.protocol !== 'https:') {
    throw new Error('MCP server URL must use HTTPS');
  }

  if (u.username || u.password) {
    throw new Error('MCP server URL must not include username or password');
  }

  const host = u.hostname;
  if (!host) {
    throw new Error('MCP server URL must include a hostname');
  }

  const hostLower = host.toLowerCase();
  if (hostLower === 'localhost' || hostLower.endsWith('.localhost')) {
    throw new Error('MCP server URL cannot target localhost');
  }

  const ipKind = isIP(host);
  if (ipKind === 4) {
    if (isBlockedIpv4(host)) {
      throw new Error(
        'MCP server URL cannot target loopback, link-local, or private IPv4 addresses',
      );
    }
    return;
  }

  if (ipKind === 6) {
    if (isBlockedIpv6(hostLower)) {
      throw new Error(
        'MCP server URL cannot target loopback, link-local, or private IPv6 addresses',
      );
    }
    return;
  }
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
}

function isBlockedIpv6(hostLower: string): boolean {
  if (hostLower === '::1') return true;
  if (hostLower.startsWith('fe80:')) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(hostLower)) return true;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(hostLower);
  if (mapped?.[1] && isBlockedIpv4(mapped[1])) return true;

  return false;
}
