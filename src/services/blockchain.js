import { TonClient, Address } from '@ton/ton';
import { log } from '../utils/logger.js';
import config from '../config.js';

/**
 * Blockchain Service
 * Handles TON blockchain interactions for querying sessions and node info
 */
class BlockchainService {
    constructor() {
        this.client = null;
        this.sessionManagerAddress = null;
        this.nodeRegistryAddress = null;
        this.initialized = false;
    }

    /**
     * Initialize TON client and parse contract addresses
     */
    async initialize() {
        try {
            log.blockchain('Initializing TON blockchain client...');

            // Create TON client
            this.client = new TonClient({
                endpoint: config.ton.apiUrl,
                apiKey: undefined // Testnet doesn't require API key
            });

            // Parse contract addresses
            this.sessionManagerAddress = Address.parse(config.ton.sessionManagerAddress);

            if (config.ton.nodeRegistryAddress) {
                this.nodeRegistryAddress = Address.parse(config.ton.nodeRegistryAddress);
            }

            this.initialized = true;

            log.blockchain(`Connected to ${config.ton.network}`);
            log.blockchain(`SessionManager: ${this.sessionManagerAddress.toString()}`);

            if (this.nodeRegistryAddress) {
                log.blockchain(`NodeRegistry: ${this.nodeRegistryAddress.toString()}`);
            }

            return true;

        } catch (error) {
            log.error('Failed to initialize blockchain client', error);
            throw error;
        }
    }

    /**
     * Get total number of sessions from SessionManager
     */
    async getTotalSessions() {
        if (!this.initialized) {
            throw new Error('Blockchain client not initialized');
        }

        try {
            // Call SessionManager.getGetTotalSessions() getter
            const result = await this.client.runMethod(
                this.sessionManagerAddress,
                'getGetTotalSessions'
            );

            const totalSessions = result.stack.readBigNumber();

            log.blockchain(`Total sessions: ${totalSessions}`);

            return Number(totalSessions);

        } catch (error) {
            log.error('Failed to get total sessions', error);
            return 0;
        }
    }

    /**
     * Get session details by ID
     * @param {number} sessionId - Session ID to query
     */
    async getSession(sessionId) {
        if (!this.initialized) {
            throw new Error('Blockchain client not initialized');
        }

        try {
            // Call SessionManager.getGetSession(sessionId) getter
            const result = await this.client.runMethod(
                this.sessionManagerAddress,
                'getGetSession',
                [{ type: 'int', value: BigInt(sessionId) }]
            );

            // Parse session tuple
            const sessionTuple = result.stack.readTuple();

            if (!sessionTuple) {
                return null;
            }

            const session = {
                sessionId,
                user: sessionTuple.readAddress(),
                nodeId: Number(sessionTuple.readBigNumber()),
                depositAmount: sessionTuple.readBigNumber(),
                usageBytes: sessionTuple.readBigNumber(),
                isActive: sessionTuple.readBoolean()
            };

            log.blockchain(`Session ${sessionId}: nodeId=${session.nodeId}, active=${session.isActive}`);

            return session;

        } catch (error) {
            log.error(`Failed to get session ${sessionId}`, error);
            return null;
        }
    }

    /**
     * Query all sessions and filter by nodeId
     * @param {number} nodeId - Node ID to filter sessions
     */
    async getSessionsByNode(nodeId) {
        try {
            const totalSessions = await this.getTotalSessions();

            if (totalSessions === 0) {
                return [];
            }

            log.blockchain(`Querying ${totalSessions} sessions, filtering by nodeId=${nodeId}...`);

            const sessions = [];

            // Query each session and filter
            for (let sessionId = 0; sessionId < totalSessions; sessionId++) {
                const session = await this.getSession(sessionId);

                if (session && session.nodeId === nodeId && session.isActive) {
                    sessions.push(session);
                }
            }

            log.blockchain(`Found ${sessions.length} active sessions for node ${nodeId}`);

            return sessions;

        } catch (error) {
            log.error(`Failed to get sessions for node ${nodeId}`, error);
            return [];
        }
    }

    /**
     * Get node info from NodeRegistry
     * @param {number} nodeId - Node ID to query
     */
    async getNodeInfo(nodeId) {
        if (!this.initialized || !this.nodeRegistryAddress) {
            log.warn('NodeRegistry address not configured');
            return null;
        }

        try {
            // Call NodeRegistry.getGetNode(nodeId) getter
            const result = await this.client.runMethod(
                this.nodeRegistryAddress,
                'getGetNode',
                [{ type: 'int', value: BigInt(nodeId) }]
            );

            const nodeTuple = result.stack.readTuple();

            if (!nodeTuple) {
                return null;
            }

            const node = {
                nodeId,
                owner: nodeTuple.readAddress(),
                metadataHash: nodeTuple.readBigNumber(),
                pricePerByte: nodeTuple.readBigNumber(),
                totalEarnings: nodeTuple.readBigNumber(),
                isActive: nodeTuple.readBoolean()
            };

            log.blockchain(`Node ${nodeId}: active=${node.isActive}, earnings=${node.totalEarnings}`);

            return node;

        } catch (error) {
            log.error(`Failed to get node ${nodeId} info`, error);
            return null;
        }
    }

    /**
     * Get backend public key stored in SessionManager
     */
    async getBackendPubKey() {
        if (!this.initialized) {
            throw new Error('Blockchain client not initialized');
        }

        try {
            const result = await this.client.runMethod(
                this.sessionManagerAddress,
                'getGetBackendPubKey'
            );

            const pubKey = result.stack.readBigNumber();

            log.blockchain(`Backend public key: ${pubKey}`);

            return pubKey;

        } catch (error) {
            log.error('Failed to get backend public key', error);
            return null;
        }
    }

    /**
     * Monitor for new sessions (polling)
     * Calls callback when new sessions are detected
     */
    async monitorSessions(nodeId, callback, intervalMs = 30000) {
        log.blockchain(`Starting session monitor for node ${nodeId} (interval: ${intervalMs}ms)`);

        let lastTotalSessions = 0;

        const poll = async () => {
            try {
                const currentTotal = await this.getTotalSessions();

                if (currentTotal > lastTotalSessions) {
                    log.blockchain(`New sessions detected! Total: ${currentTotal} (was ${lastTotalSessions})`);

                    // Query new sessions
                    const sessions = await this.getSessionsByNode(nodeId);

                    if (sessions.length > 0) {
                        callback(sessions);
                    }

                    lastTotalSessions = currentTotal;
                }

            } catch (error) {
                log.error('Session monitoring error', error);
            }
        };

        // Initial poll
        await poll();

        // Set up polling interval
        const intervalId = setInterval(poll, intervalMs);

        return intervalId;
    }

    /**
     * Check if blockchain client is ready
     */
    isReady() {
        return this.initialized;
    }
}

export default new BlockchainService();
