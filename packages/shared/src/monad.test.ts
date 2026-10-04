import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_CAIP2,
  MONAD_OFFICIAL_TESTNET_ERC8004_IDENTITY,
  MONAD_OFFICIAL_TESTNET_ERC8004_REPUTATION,
  MONAD_DEPLOYED_AGENT_REGISTRY,
  MONAD_NETWORK,
  monadAgentCardSchema,
  monadPaymentInputSchema,
  monadReputationFeedbackSchema,
} from "./monad.js";

describe("Monad Testnet domain specifications", () => {
  it("has exact verified parameters for Monad Testnet", () => {
    assert.equal(MONAD_TESTNET_CHAIN_ID, 10143);
    assert.equal(MONAD_MAINNET_CHAIN_ID, 143);
    assert.equal(MONAD_TESTNET_CAIP2, "eip155:10143");
    assert.equal(
      MONAD_OFFICIAL_TESTNET_ERC8004_IDENTITY,
      "0x8004A818BFB912233c491871b3d84c89A494BD9e"
    );
    assert.equal(
      MONAD_OFFICIAL_TESTNET_ERC8004_REPUTATION,
      "0x8004B663056A597Dffe9eCcC1965A193B7388713"
    );
    assert.equal(
      MONAD_DEPLOYED_AGENT_REGISTRY,
      "0x91f80eb44d9082d8881b116696cd8840680e3a1c"
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
