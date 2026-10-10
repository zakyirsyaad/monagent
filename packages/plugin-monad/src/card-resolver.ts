import { type MonadAgentCard } from "./monad.js";
import { safeFetch } from "./ssrf.js";

export interface ResolveAgentCardOptions {
  lookup?: (hostname: string) => Promise<string[]>;
  ipfsGateway?: string;
  timeoutMs?: number;
}

export interface ResolveAgentCardResult {
  card?: MonadAgentCard;
  cardUri: string;
  cardParseError?: string;
}

const MAX_CARD_BODY_BYTES = 65536; // 64 KB cap

/**
 * Resolves and parses ERC-8004 tokenURI (data URIs, https://, ipfs://, raw JSON)
 * into a typed MonadAgentCard, enforcing the on-chain wallet address and SSRF guards.
 */
export async function resolveAgentCard(
  tokenUri: string,
  walletAddress: string,
  agentId: string,
  options?: ResolveAgentCardOptions
): Promise<ResolveAgentCardResult> {
  const trimmedUri = (tokenUri || "").trim();
  if (!trimmedUri) {
    return {
      card: undefined,
      cardUri: "",
    };
  }

  let jsonString = "";
  try {
    if (trimmedUri.startsWith("data:application/json;base64,")) {
      const base64Data = trimmedUri.slice("data:application/json;base64,".length);
      jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
    } else if (
      trimmedUri.startsWith("data:application/json;utf8,") ||
      trimmedUri.startsWith("data:application/json,")
    ) {
      const urlEncoded = trimmedUri.replace(/^data:application\/json(;utf8)?,/, "");
      jsonString = decodeURIComponent(urlEncoded);
    } else if (trimmedUri.startsWith("{") && trimmedUri.endsWith("}")) {
      jsonString = trimmedUri;
    } else if (trimmedUri.startsWith("https://") || trimmedUri.startsWith("ipfs://")) {
      let targetUrl = trimmedUri;
      if (trimmedUri.startsWith("ipfs://")) {
        const rawCid = trimmedUri.slice("ipfs://".length).replace(/^ipfs\//, "");
        const gateway = (
          options?.ipfsGateway ||
          process.env.IPFS_GATEWAY ||
          "https://ipfs.io/ipfs/"
        ).replace(/\/?$/, "/");
        targetUrl = `${gateway}${rawCid}`;
      }

      const timeoutMs = options?.timeoutMs ?? 5000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await safeFetch(targetUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
          lookup: options?.lookup,
        });

        if (!res.ok) {
          throw new Error(`HTTP fetch failed with status ${res.status} (${res.statusText || "Error"})`);
        }

        const text = await res.text();
        if (text.length > MAX_CARD_BODY_BYTES) {
          throw new Error(`Agent card payload exceeded maximum size limit of ${MAX_CARD_BODY_BYTES} bytes`);
        }
        jsonString = text;
      } finally {
        clearTimeout(timer);
      }
    } else {
      throw new Error(`Unsupported tokenURI format or protocol: "${trimmedUri.slice(0, 32)}..."`);
    }

    if (!jsonString) {
      throw new Error("Empty agent card payload");
    }

    const parsedJson = JSON.parse(jsonString);
    if (!parsedJson || typeof parsedJson !== "object") {
      throw new Error("Invalid agent card JSON: root element must be an object");
    }

    // Endpoints extraction: supports services array, endpoints array, or single endpoint
    let endpoints: string[] = [];
    if (Array.isArray(parsedJson.services)) {
      endpoints = parsedJson.services
        .map((s: any) => (typeof s?.endpoint === "string" ? s.endpoint : ""))
        .filter((e: string) => e.length > 0);
    } else if (Array.isArray(parsedJson.endpoints)) {
      endpoints = parsedJson.endpoints
        .filter((e: any) => typeof e === "string" && e.length > 0);
    } else if (typeof parsedJson.endpoint === "string" && parsedJson.endpoint) {
      endpoints = [parsedJson.endpoint];
    }

    const card: MonadAgentCard = {
      name: typeof parsedJson.name === "string" && parsedJson.name.trim() ? parsedJson.name.trim() : `Agent #${agentId}`,
      description: typeof parsedJson.description === "string" ? parsedJson.description : "",
      walletAddress: walletAddress, // Must always be bound to on-chain getAgentWallet()
      endpoints,
      supportedProtocols: Array.isArray(parsedJson.supportedProtocols)
        ? parsedJson.supportedProtocols.map(String)
        : ["mcp", "x402"],
      active: parsedJson.active !== undefined ? Boolean(parsedJson.active) : true,
    };

    return {
      card,
      cardUri: trimmedUri,
    };
  } catch (err: any) {
    return {
      card: undefined,
      cardUri: trimmedUri,
      cardParseError: err?.message || String(err),
    };
  }
}
