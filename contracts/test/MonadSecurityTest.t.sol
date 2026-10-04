// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MonadAgentRegistry.sol";
import "../src/MonadA2AEscrow.sol";

/**
 * Malicious contract to attempt reentrancy attack on MonadA2AEscrow
 */
contract ReentrancyAttacker {
    MonadA2AEscrow public escrow;
    uint256 public targetJobId;
    bool public attacking;
    uint256 public attackCount;

    constructor(address _escrow) {
        escrow = MonadA2AEscrow(_escrow);
    }

    function setTarget(uint256 jobId) external {
        targetJobId = jobId;
    }

    receive() external payable {
        if (!attacking && attackCount < 3) {
            attacking = true;
            attackCount++;
            // Try reentering completeJob or refundExpiredJob
            try escrow.completeJob(targetJobId, "reentrancy") {} catch {}
            attacking = false;
        }
    }
}

contract MonadComprehensiveSecurityTest is Test {
    MonadAgentRegistry public registry;
    MonadA2AEscrow public escrow;

    address public client = address(0x1111);
    address public worker = address(0x2222);
    address public attacker = address(0x9999);

    function setUp() public {
        registry = new MonadAgentRegistry();
        escrow = new MonadA2AEscrow();
        vm.deal(client, 1000 ether);
        vm.deal(worker, 10 ether);
        vm.deal(attacker, 10 ether);
    }

    // =========================================================================
    // 1. NEGATIVE TESTING (MonadAgentRegistry)
    // =========================================================================

    function test_Negative_RegisterAgent_EmptyName_Reverts() public {
        vm.prank(client);
        vm.expectRevert("Name required");
        registry.registerAgent("", "description", client, "https://agent.xyz");
    }

    function test_Negative_RegisterAgent_ZeroWallet_Reverts() public {
        vm.prank(client);
        vm.expectRevert("Invalid wallet");
        registry.registerAgent("Agent", "description", address(0), "https://agent.xyz");
    }

    function test_Negative_GiveFeedback_NonExistentAgent_Reverts() public {
        vm.prank(client);
        vm.expectRevert("Agent does not exist");
        registry.giveFeedback(
            999, // non-existent agentId
            50,
            0,
            "speed",
            "accuracy",
            "https://test.xyz",
            "https://reviews.xyz",
            keccak256("test")
        );
    }

    function test_Negative_GiveFeedback_ScoreTooHigh_Reverts() public {
        vm.prank(client);
        uint256 agentId = registry.registerAgent("Agent", "desc", client, "https://agent.xyz");

        vm.prank(client);
        vm.expectRevert("Score range -100 to 100");
        registry.giveFeedback(
            agentId,
            101, // out of range
            0,
            "speed",
            "accuracy",
            "https://test.xyz",
            "https://reviews.xyz",
            keccak256("test")
        );
    }

    function test_Negative_GiveFeedback_ScoreTooLow_Reverts() public {
        vm.prank(client);
        uint256 agentId = registry.registerAgent("Agent", "desc", client, "https://agent.xyz");

        vm.prank(client);
        vm.expectRevert("Score range -100 to 100");
        registry.giveFeedback(
            agentId,
            -101, // out of range
            0,
            "speed",
            "accuracy",
            "https://test.xyz",
            "https://reviews.xyz",
            keccak256("test")
        );
    }

    function test_Negative_GetAgent_NonExistent_Reverts() public {
        vm.expectRevert("Agent not found");
        registry.getAgent(9999);
    }

    // =========================================================================
    // 2. NEGATIVE TESTING (MonadA2AEscrow)
    // =========================================================================

    function test_Negative_Escrow_ZeroBounty_Reverts() public {
        vm.prank(client);
        vm.expectRevert("Bounty required");
        escrow.createAndFundJob{value: 0}(worker, "Task with zero value", 24);
    }

    function test_Negative_Escrow_ZeroWorker_Reverts() public {
        vm.prank(client);
        vm.expectRevert("Invalid worker");
        escrow.createAndFundJob{value: 1 ether}(address(0), "Task with zero worker", 24);
    }

    function test_Negative_Escrow_WorkerCannotSelfComplete_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 24);

        // Worker attempts to release escrow to themselves without client approval
        vm.prank(worker);
        vm.expectRevert("Only client can release escrow");
        escrow.completeJob(jobId, "worker_self_release");
    }

    function test_Negative_Escrow_UnauthorizedComplete_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 24);

        // Attacker attempts to complete job
        vm.prank(attacker);
        vm.expectRevert("Only client can release escrow");
        escrow.completeJob(jobId, "hacked_result");
    }
    function test_Negative_Escrow_DoubleComplete_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 24);

        // First completion succeeds
        vm.prank(client);
        escrow.completeJob(jobId, "result1");

        // Second completion attempts double spend
        vm.prank(client);
        vm.expectRevert("Job not funded");
        escrow.completeJob(jobId, "result2");
    }

    function test_Negative_Escrow_RefundBeforeDeadline_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 24);

        // Try refunding immediately before deadline
        vm.prank(client);
        vm.expectRevert("Deadline not passed");
        escrow.refundExpiredJob(jobId);
    }

    function test_Negative_Escrow_RefundByNonClient_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 2);

        vm.warp(block.timestamp + 3 hours);

        // Attacker attempts to trigger refund
        vm.prank(attacker);
        vm.expectRevert("Only client can refund");
        escrow.refundExpiredJob(jobId);
    }

    function test_Negative_Escrow_RefundCompletedJob_Reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: 1 ether}(worker, "Task", 2);

        vm.prank(client);
        escrow.completeJob(jobId, "done");

        vm.warp(block.timestamp + 3 hours);

        vm.prank(client);
        vm.expectRevert("Job not funded");
        escrow.refundExpiredJob(jobId);
    }

    // =========================================================================
    // 3. FUZZ TESTING (Property-based tests with randomized inputs)
    // =========================================================================

    function testFuzz_RegisterAgent_ArbitraryString(string calldata name, string calldata desc, address walletAddr) public {
        vm.assume(bytes(name).length > 0 && bytes(name).length < 256);
        vm.assume(walletAddr != address(0));

        uint256 agentId = registry.registerAgent(name, desc, walletAddr, "https://fuzz.agent");
        assertGt(agentId, 0);

        MonadAgentRegistry.AgentCard memory card = registry.getAgent(agentId);
        assertEq(card.name, name);
        assertEq(card.walletAddress, walletAddr);
        assertTrue(card.active);
    }

    function testFuzz_GiveFeedback_ValidScoreRange(int128 score) public {
        vm.assume(score >= -100 && score <= 100);

        uint256 agentId = registry.registerAgent("FuzzAgent", "desc", address(0x8888), "https://fuzz.agent");

        registry.giveFeedback(
            agentId,
            score,
            0,
            "fuzzTag",
            "",
            "",
            "",
            keccak256("fuzz")
        );

        address[] memory emptyList = new address[](0);
        (uint64 count, int128 summaryValue, ) = registry.getSummary(agentId, emptyList, "", "");
        assertEq(count, 1);
        assertEq(summaryValue, score);
    }

    function testFuzz_Escrow_BountyAndDuration(uint96 bounty, uint16 durationHours) public {
        vm.assume(bounty > 0 && bounty < 500 ether);
        vm.assume(durationHours > 0 && durationHours < 1000);

        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: bounty}(worker, "Fuzz Task", durationHours);

        MonadA2AEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.bounty, bounty);
        assertEq(job.deadline, block.timestamp + (uint256(durationHours) * 1 hours));

        uint256 workerBefore = worker.balance;

        vm.prank(client); // Client approves and releases completed escrow
        escrow.completeJob(jobId, "fuzz_result");

        assertEq(worker.balance, workerBefore + bounty);
    }

    // =========================================================================
    // 4. STRESS & BOUNDARY TESTING
    // =========================================================================

    function test_Stress_MassiveFeedbackSubmissions() public {
        uint256 agentId = registry.registerAgent("StressAgent", "High load agent", worker, "https://stress.agent");

        int256 expectedSum = 0;
        uint256 iterations = 100; // Stress test with 100 sequential on-chain feedbacks

        for (uint256 i = 0; i < iterations; i++) {
            int128 score = int128(uint128(i % 100)) - 50; // scores from -50 to +49
            expectedSum += score;

            address reviewer = address(uint160(0x5000 + i));
            vm.prank(reviewer);
            registry.giveFeedback(
                agentId,
                score,
                0,
                "batchStress",
                "",
                "",
                "",
                keccak256(abi.encodePacked(i))
            );
        }

        address[] memory emptyList = new address[](0);
        (uint64 count, int128 summaryValue, ) = registry.getSummary(agentId, emptyList, "", "");

        assertEq(count, iterations);
        assertEq(summaryValue, int128(expectedSum));
    }

    function test_Stress_ConcurrentEscrowJobs() public {
        uint256 totalJobs = 50;
        uint256 singleBounty = 0.1 ether;

        uint256[] memory jobIds = new uint256[](totalJobs);

        // Create 50 escrow jobs sequentially
        for (uint256 i = 0; i < totalJobs; i++) {
            address randomWorker = address(uint160(0x7000 + i));
            vm.prank(client);
            jobIds[i] = escrow.createAndFundJob{value: singleBounty}(
                randomWorker,
                string(abi.encodePacked("Parallel Job #", vm.toString(i))),
                12
            );
        }

        assertEq(address(escrow).balance, totalJobs * singleBounty);

        // Complete all 50 jobs
        for (uint256 i = 0; i < totalJobs; i++) {
            vm.prank(client);
            escrow.completeJob(jobIds[i], "done");
        }

        assertEq(address(escrow).balance, 0, "Escrow balance should be completely depleted");
    }

    // =========================================================================
    // 5. SECURITY & REENTRANCY ATTACK PREVENTION TEST
    // =========================================================================

    function test_Security_ReentrancyAttack_Blocked() public {
        ReentrancyAttacker attackerContract = new ReentrancyAttacker(address(escrow));
        uint256 bounty = 2 ether;

        vm.prank(client);
        uint256 jobId = escrow.createAndFundJob{value: bounty}(
            address(attackerContract),
            "Malicious Job",
            24
        );

        attackerContract.setTarget(jobId);

        uint256 attackerBefore = address(attackerContract).balance;

        // Trigger completeJob -> will invoke receive() on attackerContract
        // State updates before external call prevent draining the escrow
        vm.prank(client);
        escrow.completeJob(jobId, "result");

        // Attacker should only receive the exact bounty, no reentrant drained funds
        assertEq(address(attackerContract).balance, attackerBefore + bounty);
        assertEq(address(escrow).balance, 0);
    }
}
