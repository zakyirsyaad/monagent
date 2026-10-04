/**
 * Live Monad Testnet Verification & Canary Runner
 *
 * Reads live on-chain state from official Monad Testnet RPC:
 * - Validates chainId (10143 / 0x279f)
 * - Checks live block height & gas price
 * - Verifies deployment bytecode of official ERC-8004 Registries:
 *   * Identity: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   * Reputation: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 * - If MONAD_TESTNET_PRIVATE_KEY is supplied, checks balance and broadcasts
 *   an authentic on-chain micro-transaction to verify live execution!
 *
 * Run: npx tsx scripts/canary-monad-live.ts
 */

import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_EXPLORER_URL,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
} from "../packages/plugin-monad/src/monad.js";

const monadChain = {
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_TESTNET_RPC_URL] },
    public: { http: [MONAD_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: MONAD_TESTNET_EXPLORER_URL },
  },
} as const;

async function main() {
  console.log("================================================================================");
  console.log("⚡ LIVE MONAD TESTNET RPC & ON-CHAIN CANARY INSPECTOR");
  console.log(`🔗 Target RPC: ${MONAD_TESTNET_RPC_URL}`);
  console.log("================================================================================\n");

  const publicClient = createPublicClient({
    chain: monadChain,
    transport: http(),
  });

  // 1. Verify Chain ID
  const chainId = await publicClient.getChainId();
  console.log(`1️⃣ Live Chain ID: ${chainId} (Expected: ${MONAD_TESTNET_CHAIN_ID})`);
  if (chainId !== MONAD_TESTNET_CHAIN_ID) {
    throw new Error(`Chain ID mismatch! Expected ${MONAD_TESTNET_CHAIN_ID}, got ${chainId}`);
  }
  console.log("   ✅ Confirmed: Connected to authentic Monad Testnet!\n");

  // 2. Query Block & Gas Details
  const [blockNumber, gasPrice] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getGasPrice(),
  ]);
  console.log(`2️⃣ Live Chain Status:`);
  console.log(`   🧱 Latest Block: ${blockNumber.toString()}`);
  console.log(`   ⛽ Gas Price: ${formatEther(gasPrice * 1000000000n)} Gwei\n`);

  // 3. Verify ERC-8004 Registries Deployment Bytecode
  console.log("3️⃣ Checking Official Monad ERC-8004 Contract Deployments:");
  const [identityBytecode, reputationBytecode] = await Promise.all([
    publicClient.getBytecode({ address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY }),
    publicClient.getBytecode({ address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY }),
  ]);

  console.log(`   📋 Identity Registry (${MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY}):`);
  console.log(`      Bytecode size: ${identityBytecode ? (identityBytecode.length - 2) / 2 : 0} bytes`);
  console.log(`      Status: ${identityBytecode && identityBytecode.length > 2 ? "✅ ACTIVE ON-CHAIN" : "⚠️ UNCONFIRMED"}`);

  console.log(`   ⭐ Reputation Registry (${MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY}):`);
  console.log(`      Bytecode size: ${reputationBytecode ? (reputationBytecode.length - 2) / 2 : 0} bytes`);
  console.log(`      Status: ${reputationBytecode && reputationBytecode.length > 2 ? "✅ ACTIVE ON-CHAIN" : "⚠️ UNCONFIRMED"}\n`);

  // 4. Live Broadcast Check (if Private Key provided in env)
  const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
  if (!privateKey) {
    console.log("4️⃣ Live Transaction Broadcast: [SKIPPED - READ-ONLY]");
    console.log("   💡 Tip: Set MONAD_TESTNET_PRIVATE_KEY in .env to broadcast an authentic transaction");
    console.log("   Faucet available at: https://faucet.monad.xyz\n");
  } else {
    console.log("4️⃣ Live Transaction Broadcast:");
    const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    console.log(`   👤 Sender Wallet: ${account.address}`);

    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`   💰 Balance: ${formatEther(balance)} MON`);

    if (balance === 0n) {
      console.log("   ⚠️ Balance is 0 MON. Please claim testnet MON from https://faucet.monad.xyz");
    } else {
      const walletClient = createWalletClient({
        account,
        chain: monadChain,
        transport: http(),
      });

      console.log("   🚀 Broadcasting test micro-payment on Monad (0.001 MON to self)...");
      const hash = await walletClient.sendTransaction({
        to: account.address,
        value: parseEther("0.001"),
      });

      console.log(`   ✅ Transaction Submitted!`);
      console.log(`   🔗 Tx Hash: ${hash}`);
      console.log(`   🔍 View Explorer: ${MONAD_TESTNET_EXPLORER_URL}/tx/${hash}\n`);

      console.log("   ⏳ Waiting for block confirmation (1-second block time)...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   🎉 Transaction confirmed in block ${receipt.blockNumber}! Status: ${receipt.status}`);
    }
  }

  console.log("================================================================================");
  console.log("✅ MONAD TESTNET LIVE VERIFICATION COMPLETED");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Live verification error:", err);
  process.exit(1);
});
