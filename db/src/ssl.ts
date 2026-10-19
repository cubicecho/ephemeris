/** A block of IPv4 addresses that never routes off a private network, by its first two octets. */
interface PrivateIpv4Range {
  first: number;
  secondFrom: number;
  secondTo: number;
}

const LAST_OCTET = 255;

/** Loopback, the three RFC 1918 blocks, and link-local. */
const PRIVATE_IPV4_RANGES: readonly PrivateIpv4Range[] = Object.freeze([
  { first: 127, secondFrom: 0, secondTo: LAST_OCTET },
  { first: 10, secondFrom: 0, secondTo: LAST_OCTET },
  { first: 172, secondFrom: 16, secondTo: 31 },
  { first: 192, secondFrom: 168, secondTo: 168 },
  { first: 169, secondFrom: 254, secondTo: 254 },
]);

/** Name endings that only resolve on a private network: mDNS, the usual LAN zones and the reserved home zone. */
const PRIVATE_SUFFIXES: readonly string[] = Object.freeze(['.localhost', '.local', '.lan', '.internal', '.home.arpa']);
const LOCALHOST = 'localhost';

const IPV4 = /^(?<first>\d{1,3})\.(?<second>\d{1,3})\.\d{1,3}\.\d{1,3}$/;
const IPV6_LOOPBACK = '::1';
/** fc00::/7. */
const IPV6_UNIQUE_LOCAL = /^f[cd]/;
/** fe80::/10. */
const IPV6_LINK_LOCAL = /^fe[89ab]/;

/**
 * Reads the host out of a connection string.
 *
 * The parsed hostname, never the raw string: a URL carrying credentials puts the userinfo where a prefix match looks
 * for the host.
 *
 * @param url - Connection URL.
 * @returns The lowercased host without IPv6 brackets, or null when the URL does not parse.
 */
function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether an IPv4 address sits in a block that stays on a private network.
 *
 * @param first - The address's first octet.
 * @param second - The address's second octet.
 * @returns true for loopback, RFC 1918 and link-local addresses.
 */
function isPrivateIpv4(first: number, second: number): boolean {
  return PRIVATE_IPV4_RANGES.some(
    (range) => range.first === first && second >= range.secondFrom && second <= range.secondTo,
  );
}

/**
 * Whether a host can only be reached from a private network.
 *
 * "Private" is wider than loopback here, because self-hosting is. A bare `postgres` is a service on a compose
 * network, `10.0.0.5` is a box on the LAN and `db.lan` is its name.
 *
 * @param host - A hostname or IP address, as `URL.hostname` gives it. Brackets and case are ignored.
 * @returns true for loopback, RFC 1918, link-local and unique-local addresses, a dotless name, or a private suffix.
 */
export function isPrivateHost(host: string): boolean {
  const hostname = host.replace(/^\[|\]$/g, '').toLowerCase();
  const isPrivateName = hostname === LOCALHOST || PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (isPrivateName) {
    return true;
  }
  // A name with no dots is a container or LAN hostname, not a public address.
  const isBareName = hostname.includes('.') === false && hostname.includes(':') === false;
  if (isBareName) {
    return true;
  }

  const ipv4 = IPV4.exec(hostname);
  if (ipv4?.groups) {
    return isPrivateIpv4(Number(ipv4.groups.first), Number(ipv4.groups.second));
  }

  if (hostname.includes(':')) {
    return hostname === IPV6_LOOPBACK || IPV6_UNIQUE_LOCAL.test(hostname) || IPV6_LINK_LOCAL.test(hostname);
  }

  return false;
}

/**
 * Whether to insist on TLS for a connection string.
 *
 * Not for a private host: none speaks TLS by default there, and demanding it breaks the connection.
 *
 * @param url - Connection URL.
 * @returns false for an explicit sslmode, an unparseable URL, or a private or local host.
 */
export function requiresSsl(url: string): boolean {
  // An explicit sslmode is the operator's decision; postgres-js reads it itself.
  if (/[?&]sslmode=/i.test(url)) {
    return false;
  }

  const hostname = parseHostname(url);
  if (hostname === null) {
    return false;
  }
  return isPrivateHost(hostname) === false;
}
