import { describe, expect, it } from 'vitest';
import { requiresSsl } from '../ssl.ts';

describe('requiresSsl', () => {
  it.each([
    ['an explicit sslmode', 'postgres://app:app@db.example.com:5432/app?sslmode=disable'],
    ['a URL that does not parse', 'not a url'],
    ['localhost', 'postgres://app:app@localhost:5432/app'],
    ['a .localhost name', 'postgres://app:app@db.localhost:5432/app'],
    ['a compose service name behind credentials', 'postgres://user:pass@postgres:5432/app'],
    ['IPv4 loopback', 'postgres://app:app@127.0.0.1:5432/app'],
    ['10/8', 'postgres://app:app@10.0.0.5:5432/app'],
    ['the bottom of 172.16/12', 'postgres://app:app@172.16.0.1:5432/app'],
    ['the top of 172.16/12', 'postgres://app:app@172.31.255.1:5432/app'],
    ['192.168/16', 'postgres://app:app@192.168.1.20:5432/app'],
    ['IPv4 link-local', 'postgres://app:app@169.254.10.10:5432/app'],
    ['IPv6 loopback', 'postgres://app:app@[::1]:5432/app'],
    ['IPv6 unique-local', 'postgres://app:app@[fd12:3456::1]:5432/app'],
    ['IPv6 link-local', 'postgres://app:app@[fe80::1]:5432/app'],
  ])('leaves TLS alone for %s', (_name, url) => {
    expect(requiresSsl(url)).toBe(false);
  });

  it.each([
    ['a public hostname', 'postgres://app:app@db.example.com:5432/app'],
    ['a public IPv4 address', 'postgres://app:app@8.8.8.8:5432/app'],
    ['just below 172.16/12', 'postgres://app:app@172.15.0.1:5432/app'],
    ['just above 172.16/12', 'postgres://app:app@172.32.0.1:5432/app'],
    ['192 outside 192.168/16', 'postgres://app:app@192.167.1.1:5432/app'],
    ['a public IPv6 address', 'postgres://app:app@[2001:db8::1]:5432/app'],
  ])('forces TLS for %s', (_name, url) => {
    expect(requiresSsl(url)).toBe(true);
  });
});
