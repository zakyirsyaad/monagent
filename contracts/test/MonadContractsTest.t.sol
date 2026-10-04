// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MonadAgentRegistry.sol";
import "../src/MonadA2AEscrow.sol";

contract MonadContractsTest is Test {
    MonadAgentRegistry public registry;
    MonadA2AEscrow public escrow;

    address public client = address(0x1111);
    address public worker = address(0x2222);

    function setUp() public {
        registry = new MonadAgentRegistry();
        escrow = new MonadA2AEscrow();
        vm.deal(client, 10 ether);
    }

    function test_RegisterAgent() public {
        vm.prank(client);
        uint256 agentId = registry.registerAgent(
            "MonadTrader",
            "High speed arbitrage agent",
            client,
            "https://trader.monad.xyz"
        );

        assertEq(agentId, 1);
        assertEq(registry.ownerOf(1), client);

        MonadAgentRegistry.AgentCard memory card = registry.getAgent(1);
        assertEq(card.name, "MonadTrader");
        assertEq(card.walletAddress, client);
        assertTrue(card.active);
    }

    function test_ReputationFeedbackAndSummary() public {
        vm.prank(client);
        uint256 agentId = registry.registerAgent("WorkerAgent", "Subcontractor", worker, "https://worker.xyz");

        vm.prank(client);
        registry.giveFeedback(
            agentId,
            90,
            0,
            "speed",
            "accuracy",
            "https://worker.xyz",
            "https://reviews.xyz/1",
            keccak256("feedback1")
        );

        address otherClient = address(0x3333);
        vm.prank(otherClient);
        registry.giveFeedback(
            agentId,
            100,
            0,
            "speed",
            "accuracy",
            "https://worker.xyz",
            "https://reviews.xyz/2",
            keccak256("feedback2")
        );

        address[] memory filterClients = new address[](0);
        (uint64 count, int128 summaryValue, ) = registry.getSummary(agentId, filterClients, "", "");

        assertEq(count, 2);
        assertEq(summaryValue, 190); // 90 + 100
    }

    function test_EscrowJobLifecycle() public {
        uint256 bounty = 1 ether;

        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: bounty}(
            worker,
            "Execute Monte-Carlo liquidity pool analysis",
            24
        );

        assertEq(jobId, 1);
        assertEq(address(escrow).balance, bounty);

        MonadA2AEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.worker, worker);
        assertEq(uint(job.status), uint(MonadA2AEscrow.JobStatus.Funded));

        uint256 workerBefore = worker.balance;

        // Client completes job and releases bounty
        vm.prank(client);
        escrow.completeJob(jobId, "ipfs://QmReportResultHash");

        assertEq(worker.balance, workerBefore + bounty);
        assertEq(address(escrow).balance, 0);

        job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(MonadA2AEscrow.JobStatus.Completed));
        assertEq(job.resultURI, "ipfs://QmReportResultHash");
    }

    function test_EscrowRefundAfterDeadline() public {
        uint256 bounty = 0.5 ether;

        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: bounty}(
            worker,
            "Task that expires",
            2
        );

        // Fast forward 3 hours
        vm.warp(block.timestamp + 3 hours);

        uint256 clientBefore = client.balance;
        vm.prank(client);
        escrow.refundExpiredJob(jobId);

        assertEq(client.balance, clientBefore + bounty);
    }
}
