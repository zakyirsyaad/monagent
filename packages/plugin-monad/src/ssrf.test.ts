import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrivateOrReservedIp, validateSafeUrl, safeFetch } from "./ssrf.js";
import { CommandError } from "./sdk.js";

describe("Anti-SSRF Security Guard", () => {
  it("detects IPv4 private, loopback, link-local, and metadata addresses", () => {
    // Loopback
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("127.255.255.254"), true);

    // Link-local & Cloud Metadata
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("169.254.0.1"), true);

    // RFC1918 Private Ranges
    assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.255.255.255"), true);
    assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedIp("172.31.255.255"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);

    // Shared & Test & Reserved
    assert.equal(isPrivateOrReservedIp("0.0.0.0"), true);
    assert.equal(isPrivateOrReservedIp("100.64.0.1"), true);
    assert.equal(isPrivateOrReservedIp("192.0.2.1"), true);
    assert.equal(isPrivateOrReservedIp("224.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("240.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("255.255.255.255"), true);

    // Public IPv4 addresses
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
    assert.equal(isPrivateOrReservedIp("104.18.2.3"), false);
    assert.equal(isPrivateOrReservedIp("142.250.190.46"), false);
  });

  it("detects IPv6 private, loopback, ULA, and IPv4-mapped addresses", () => {
    assert.equal(isPrivateOrReservedIp("::1"), true);
    assert.equal(isPrivateOrReservedIp("::"), true);
    assert.equal(isPrivateOrReservedIp("fc00::1"), true);
    assert.equal(isPrivateOrReservedIp("fd12:3456:789a::1"), true);
    assert.equal(isPrivateOrReservedIp("fe80::1"), true);
    assert.equal(isPrivateOrReservedIp("ff02::1"), true);

    // IPv4-mapped IPv6
    assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:8.8.8.8"), false);

    // Public IPv6
    assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false);
  });

  it("validateSafeUrl rejects non-HTTPS protocols with INVALID_INPUT", async () => {
    const invalidProtocols = [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/api",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "javascript:alert(1)",
      "data:text/plain;base64,SGVsbG8=",
    ];

    for (const url of invalidProtocols) {
      await assert.rejects(
        validateSafeUrl(url),
        (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT",
        `Expected ${url} to be rejected with INVALID_INPUT`
      );
    }
  });

  it("validateSafeUrl rejects prohibited hostnames and IP literals with INVALID_INPUT", async () => {
    const prohibitedUrls = [
      "https://localhost/api",
      "https://sub.localhost/api",
      "https://service.internal/api",
      "https://device.local/api",
      "https://router.lan/api",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://127.0.0.1/api",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.5/api",
      "https://192.168.1.1/api",
      "https://172.16.5.5/api",
      "https://[::1]/api",
    ];

    for (const url of prohibitedUrls) {
      await assert.rejects(
        validateSafeUrl(url),
        (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT",
        `Expected ${url} to be rejected with INVALID_INPUT`
      );
    }
  });

  it("validateSafeUrl rejects domain resolving to private IP via DNS", async () => {
    const mockLookup = async () => ["10.1.2.3"];

    await assert.rejects(
      validateSafeUrl("https://evil-private-target.com/api", { lookup: mockLookup }),
      (err: any) =>
        err instanceof CommandError &&
        err.code === "INVALID_INPUT" &&
        err.message.includes("resolved to prohibited IP address")
    );
  });

  it("validateSafeUrl accepts valid public HTTPS domain", async () => {
    const mockLookup = async () => ["104.18.2.3"];
    const parsed = await validateSafeUrl("https://api.example.com/paid/service", { lookup: mockLookup });
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "api.example.com");
  });

  it("safeFetch blocks redirect to private endpoint", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any) => {
        if (url.includes("initial")) {
          return new Response(null, {
            status: 302,
            headers: { Location: "https://169.254.169.254/latest/meta-data/" },
          });
        }
        return new Response("ok", { status: 200 });
      };

      const mockLookup = async () => ["104.18.2.3"];

      await assert.rejects(
        safeFetch("https://api.example.com/initial", { lookup: mockLookup }),
        (err: any) =>
          err instanceof CommandError &&
          err.code === "INVALID_INPUT" &&
          err.message.includes("private, loopback, or cloud metadata range")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("safeFetch blocks redirect to non-HTTPS protocol", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://example.com/downgraded" },
        });
      };

      const mockLookup = async () => ["104.18.2.3"];

      await assert.rejects(
        safeFetch("https://api.example.com/initial", { lookup: mockLookup }),
        (err: any) =>
          err instanceof CommandError &&
          err.code === "INVALID_INPUT" &&
          err.message.includes('Only "https:" is permitted')
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #31: blocks IPv4-mapped IPv6 URLs including normalized hex representations", async () => {
    // Tests going through validateSafeUrl with full URL strings (Issue #31 acceptance criteria)
    await assert.rejects(
      validateSafeUrl("https://[::ffff:127.0.0.1]/paid"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    await assert.rejects(
      validateSafeUrl("https://[::ffff:169.254.169.254]/latest/meta-data/"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    // Direct assertions on normalized hex representations produced by new URL()
    assert.equal(isPrivateOrReservedIp("::ffff:7f00:1"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:a9fe:a9fe"), true);
  });

  it("Issue #33: blocks NAT64 prefix embedded private IPv4 addresses", async () => {
    // Embedded 127.0.0.1
    await assert.rejects(
      validateSafeUrl("https://[64:ff9b::7f00:1]/paid"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    // Embedded 169.254.169.254
    await assert.rejects(
      validateSafeUrl("https://[64:ff9b::a9fe:a9fe]/paid"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    // Embedded public IPv4 (8.8.8.8) should still be accepted
    const parsed = await validateSafeUrl("https://[64:ff9b::808:808]/paid");
    assert.equal(parsed.protocol, "https:");
  });

  it("Issue #34: blocks Azure IMDS 168.63.129.16 and metadata.azure.internal", async () => {
    assert.equal(isPrivateOrReservedIp("168.63.129.16"), true);

    await assert.rejects(
      validateSafeUrl("https://168.63.129.16/metadata"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    await assert.rejects(
      validateSafeUrl("https://metadata.azure.internal/metadata"),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );
  });

  it("Issue #32: mitigates DNS rebinding by pinning socket connection to validated IP", async () => {
    let callCount = 0;
    // Resolver alternates: first call returns public IP (104.18.2.3), second returns private IP (127.0.0.1)
    const rebindingLookup = async () => {
      callCount++;
      return callCount === 1 ? ["104.18.2.3"] : ["127.0.0.1"];
    };

    const originalFetch = globalThis.fetch;
    let dispatcherCaptured: any = null;
    globalThis.fetch = async (_url: any, init?: any) => {
      dispatcherCaptured = init?.dispatcher;
      return new Response("ok", { status: 200 });
    };

    try {
      const res = await safeFetch("https://rebinding.example.com/paid", { lookup: rebindingLookup });
      assert.equal(res.status, 200);
      assert.ok(dispatcherCaptured, "Dispatcher must be configured to pin socket address");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #32: exercises real DNS resolution against public domain", async () => {
    // Tests real dns.promises.lookup against a known public domain
    const parsed = await validateSafeUrl("https://dns.google/resolve");
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "dns.google");
  });
});
