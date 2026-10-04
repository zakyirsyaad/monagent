// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MonadA2AEscrow
 * @notice Micro-task escrow contract for agent-to-agent subcontracting with instant Monad settlement
 */
contract MonadA2AEscrow {
    enum JobStatus {
        Created,
        Funded,
        Completed,
        Refunded
    }

    struct Job {
        address client;
        address worker;
        uint256 bounty;
        uint256 deadline;
        JobStatus status;
        string taskDescription;
        string resultURI;
    }

    uint256 private _nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed worker, uint256 bounty);
    event JobCompleted(uint256 indexed jobId, string resultURI);
    event JobRefunded(uint256 indexed jobId);

    function createAndFundJob(
        address worker,
        string calldata taskDescription,
        uint256 durationHours
    ) external payable returns (uint256 jobId) {
        require(msg.value > 0, "Bounty required");
        require(worker != address(0), "Invalid worker");

        jobId = _nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            worker: worker,
            bounty: msg.value,
            deadline: block.timestamp + (durationHours * 1 hours),
            status: JobStatus.Funded,
            taskDescription: taskDescription,
            resultURI: ""
        });

        emit JobCreated(jobId, msg.sender, worker, msg.value);
    }

    function completeJob(uint256 jobId, string calldata resultURI) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "Job not funded");
        require(msg.sender == job.client, "Only client can release escrow");

        uint256 payout = job.bounty;
        job.bounty = 0;
        job.status = JobStatus.Completed;
        job.resultURI = resultURI;

        (bool sent, ) = payable(job.worker).call{value: payout}("");
        require(sent, "Payment transfer failed");

        emit JobCompleted(jobId, resultURI);
    }

    function refundExpiredJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "Job not funded");
        require(block.timestamp > job.deadline, "Deadline not passed");
        require(msg.sender == job.client, "Only client can refund");

        uint256 refundAmount = job.bounty;
        job.bounty = 0;
        job.status = JobStatus.Refunded;

        (bool sent, ) = payable(job.client).call{value: refundAmount}("");
        require(sent, "Refund transfer failed");
        emit JobRefunded(jobId);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
