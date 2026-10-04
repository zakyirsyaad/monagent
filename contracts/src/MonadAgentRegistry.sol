// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MonadAgentRegistry
 * @notice ERC-8004 compliant Trustless Agent Identity and Reputation Registry for Monad
 */
contract MonadAgentRegistry {
    struct AgentCard {
        string name;
        string description;
        address walletAddress;
        string endpoint;
        uint256 createdAt;
        bool active;
    }

    struct ReputationFeedback {
        address clientAddress;
        int128 value; // -100 to 100
        uint8 decimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        uint256 timestamp;
    }

    uint256 private _nextAgentId = 1;

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => AgentCard) public agentCards;
    mapping(uint256 => ReputationFeedback[]) private _feedbacks;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, address indexed wallet);
    event FeedbackSubmitted(uint256 indexed agentId, address indexed client, int128 value, string tag1, string tag2);

    function registerAgent(
        string calldata name,
        string calldata description,
        address walletAddress,
        string calldata endpoint
    ) external returns (uint256 agentId) {
        require(bytes(name).length > 0, "Name required");
        require(walletAddress != address(0), "Invalid wallet");

        agentId = _nextAgentId++;
        ownerOf[agentId] = msg.sender;

        agentCards[agentId] = AgentCard({
            name: name,
            description: description,
            walletAddress: walletAddress,
            endpoint: endpoint,
            createdAt: block.timestamp,
            active: true
        });

        emit AgentRegistered(agentId, msg.sender, name, walletAddress);
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 decimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(ownerOf[agentId] != address(0), "Agent does not exist");
        require(value >= -100 && value <= 100, "Score range -100 to 100");

        _feedbacks[agentId].push(ReputationFeedback({
            clientAddress: msg.sender,
            value: value,
            decimals: decimals,
            tag1: tag1,
            tag2: tag2,
            endpoint: endpoint,
            feedbackURI: feedbackURI,
            feedbackHash: feedbackHash,
            timestamp: block.timestamp
        }));

        emit FeedbackSubmitted(agentId, msg.sender, value, tag1, tag2);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata,
        string calldata,
        string calldata
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        ReputationFeedback[] storage list = _feedbacks[agentId];
        count = uint64(list.length);
        if (count == 0) {
            return (0, 0, 0);
        }

        int256 total = 0;
        for (uint256 i = 0; i < list.length; i++) {
            total += list[i].value;
        }

        return (count, int128(total), 0);
    }

    function getAgent(uint256 agentId) external view returns (AgentCard memory) {
        require(ownerOf[agentId] != address(0), "Agent not found");
        return agentCards[agentId];
    }
}
