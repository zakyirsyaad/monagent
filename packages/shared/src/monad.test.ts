import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_CAIP2,
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
  MONAD_NETWORK,
  monadAgentCardSchema,
  monadPaymentInputSchema,
  monadReputationFeedbackSchema,
} from "./monad.js";

describe("Monad Testnet domain specifications", () => {
  it("has exact verified parameters for Monad Testnet", () => {
    assert.equal(MONAD_TESTNET_CHAIN_ID, 10143);
    assert.equal(MONAD_TESTNET_CAIP2, "eip155:10143");
    assert.equal(
      MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
      "0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51"
    );
    assert.equal(
      MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
      "0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51"
    );
    assert.equal(MONAD_NETWORK.nativeCurrency.symbol, "MON");
    assert.equal(MONAD_NETWORK.nativeCurrency.decimals, 18);
  });

  it("validates an agent card successfully", () => {
    const validCard = {
      name: "MonadArbitrageAgent",
      description: "High frequency arbitrage agent on Monad DEXes",
      endpoints: ["https://agent.example.com/api"],
      walletAddress: "0x1234567890123456789012345678901234567890",
      supportedProtocols: ["mcp", "x402"],
      active: true,
    };
    const parsed = monadAgentCardSchema.parse(validCard);
    assert.equal(parsed.name, "MonadArbitrageAgent");
  });

  it("rejects invalid payment inputs", () => {
    assert.throws(() => {
      monadPaymentInputSchema.parse({
        to: "0xinvalid",
        amount: "1.5",
      });
    });
    assert.throws(() => {
      monadPaymentInputSchema.parse({
        to: "0x1234567890123456789012345678901234567890",
        amount: "-5.0",
      });
    });
  });

  it("validates reputation feedback schema", () => {
    const feedback = {
      agentId: "42",
      value: 95,
      decimals: 0,
      tag1: "speed",
      tag2: "defi",
      endpoint: "https://agent.example.com/api",
      feedbackURI: "https://agent.example.com/reviews/42",
    };
    const parsed = monadReputationFeedbackSchema.parse(feedback);
    assert.equal(parsed.value, 95);
  });
});
