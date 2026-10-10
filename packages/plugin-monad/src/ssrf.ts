import net from "node:net";
import dns from "node:dns";
import { CommandError } from "./sdk.js";

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback,
 * link-local, carrier-grade NAT, multicast, or reserved ranges.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [b0, b1, b2, b3] = parts;

    // 0.0.0.0/8 (Current network / "this" network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Private-Use)
    if (b0 === 10) return true;
    // 100.64.0.0/10 (Shared Address Space / CGNAT: 100.64.0.0 - 100.127.255.255)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;
    // 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Private-Use: 172.16.0.0 - 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (b0 === 192 && b1 === 0 && b2 === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (b0 === 192 && b1 === 0 && b2 === 2) return true;
    // 192.88.99.0/24 (6to4 Relay Anycast)
    if (b0 === 192 && b1 === 88 && b2 === 99) return true;
    // 192.168.0.0/16 (Private-Use)
    if (b0 === 192 && b1 === 168) return true;
    // 198.18.0.0/15 (Benchmarking: 198.18.0.0 - 198.19.255.255)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (b0 === 198 && b1 === 51 && b2 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (b0 === 203 && b1 === 0 && b2 === 113) return true;
    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (b0 >= 224 && b0 <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future Use: 240.0.0.0 - 255.255.255.254)
    if (b0 >= 240) return true;
    // 255.255.255.255 (Broadcast)
    if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) return true;

    return false;
  }

  if (family === 6) {
    const normalized = ip.toLowerCase().trim();
    // Unspecified
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
    // Loopback
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    if (normalized.startsWith("::ffff:")) {
      const ipv4Part = normalized.slice(7);
      if (net.isIP(ipv4Part) === 4) {
        return isPrivateOrReservedIp(ipv4Part);
      }
    }

    // Unique Local Addresses (fc00::/7 -> fc00.. to fdff..)
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized) || normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    // Link-Local (fe80::/10 -> fe8., fe9., fea., feb.)
    if (/^fe[89ab][0-9a-f]:/i.test(normalized) || normalized.startsWith("fe80")) {
      return true;
    }
    // Multicast (ff00::/8)
    if (normalized.startsWith("ff")) return true;
    // Discard prefix (100::/64)
    if (normalized.startsWith("100:")) return true;
    // Documentation (2001:db8::/32)
    if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) return true;

    return false;
  }

  // Not a valid standard IP string -> treat as unsafe
  return true;
}

export interface ValidateUrlOptions {
  lookup?: (hostname: string) => Promise<string[]>;
}

/**
 * Validates that a URL is strictly HTTPS and does not resolve to private,
 * loopback, link-local, or metadata endpoints (anti-SSRF guard).
 */
export async function validateSafeUrl(
  urlString: string,
  options?: ValidateUrlOptions
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (err: any) {
    throw new CommandError(
      "INVALID_INPUT",
      `Invalid URL provided: "${urlString}". ${err?.message || ""}`.trim(),
      "Provide a valid HTTPS URL (e.g. https://api.example.com/paid)."
    );
  }

  if (parsed.protocol !== "https:") {
    throw new CommandError(
      "INVALID_INPUT",
      `Invalid protocol "${parsed.protocol}" in URL "${urlString}". Only "https:" is permitted.`,
      "Provide a secure HTTPS URL."
    );
  }

  const rawHost = parsed.hostname.toLowerCase().trim();
  // Strip square brackets for IPv6 URLs like https://[::1]/
  const host = rawHost.startsWith("[") && rawHost.endsWith("]")
    ? rawHost.slice(1, -1)
    : rawHost;

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "metadata.google.internal"
  ) {
    throw new CommandError(
      "INVALID_INPUT",
      `Target host "${rawHost}" is prohibited (loopback, private, or metadata name).`,
      "Provide a public HTTPS endpoint."
    );
  }

  // If host is directly an IP literal
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new CommandError(
        "INVALID_INPUT",
        `Target IP address "${host}" is in a private, loopback, or cloud metadata range.`,
        "Provide a public HTTPS endpoint."
      );
    }
    return parsed;
  }

  // Resolve hostname via DNS
  const lookupFn =
    options?.lookup ||
    (async (h: string) => {
      try {
        const results = await dns.promises.lookup(h, { all: true });
        return results.map((r) => r.address);
      } catch (err: any) {
        throw new CommandError(
          "FETCH_FAILED",
          `DNS resolution failed for host "${h}": ${err?.message || String(err)}`,
          "Verify the domain name and network connectivity."
        );
      }
    });

  const addresses = await lookupFn(host);
  if (!addresses || addresses.length === 0) {
    throw new CommandError(
      "FETCH_FAILED",
      `No IP addresses resolved for host "${host}".`,
      "Verify the domain name."
    );
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr)) {
      throw new CommandError(
        "INVALID_INPUT",
        `Target host "${host}" resolved to prohibited IP address "${addr}".`,
        "Provide a public HTTPS endpoint."
      );
    }
  }

  return parsed;
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  lookup?: (hostname: string) => Promise<string[]>;
}

/**
 * Executes fetch with manual redirect handling and strict SSRF re-validation
 * on each redirect hop.
 */
export async function safeFetch(
  targetUrl: string,
  init?: SafeFetchOptions
): Promise<Response> {
  let currentUrl = targetUrl;
  const maxRedirects = init?.maxRedirects ?? 5;
  let redirects = 0;

  while (true) {
    const validated = await validateSafeUrl(currentUrl, { lookup: init?.lookup });

    const fetchInit: RequestInit = {
      ...init,
      redirect: "manual",
    };

    let res: Response;
    try {
      res = await fetch(validated.href, fetchInit);
    } catch (err: any) {
      if (err instanceof CommandError) throw err;
      throw new CommandError(
        "FETCH_FAILED",
        `Failed to reach target URL: ${err?.message || String(err)}`,
        "Verify endpoint URL and network connectivity."
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || res.headers.get("Location");
      if (!location) {
        return res;
      }
      redirects++;
      if (redirects > maxRedirects) {
        throw new CommandError(
          "FETCH_FAILED",
          `Too many redirects (${redirects}) while contacting ${targetUrl}.`,
          "Check the endpoint redirect chain."
        );
      }

      try {
        const nextUrl = new URL(location, validated.href);
        currentUrl = nextUrl.href;
      } catch (err: any) {
        throw new CommandError(
          "INVALID_INPUT",
          `Invalid redirect location "${location}": ${err?.message || ""}`.trim(),
          "Endpoint must redirect to a valid HTTPS URL."
        );
      }
      continue;
    }

    return res;
  }
}
