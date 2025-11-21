import { log } from './utils/logger.js';
import config from './config.js';
import blockchain from './services/blockchain.js';
import registration from './services/registration.js';
import wireguard from './services/wireguard.js';
import sessionMonitor from './services/sessionMonitor.js';
import httpServer from './services/httpServer.js';
import heartbeat from './services/heartbeat.js';

/**
 * DeVPN Node Provider Daemon
 * Main entry point for the node provider service
 */
class NodeProviderDaemon {
    constructor() {
        this.running = false;
    }

    /**
     * Start the daemon
     */
    async start() {
        try {
            this.printBanner();

            log.info('Starting DeVPN Node Provider Daemon...');
            log.info(`Node ID: ${config.node.id}`);
            log.info(`Region: ${config.node.region}, ${config.node.country}`);
            log.info(`Endpoint: ${config.node.endpoint}`);
            log.info(`Backend: ${config.backend.url}`);
            log.info(`Network: ${config.ton.network}`);

            // Step 1: Initialize blockchain client
            log.info('\n[1/5] Initializing blockchain connection...');
            await blockchain.initialize();

            // Step 2: Ensure WireGuard keys exist
            log.info('\n[2/5] Checking WireGuard configuration...');
            await wireguard.generateServerKeypair();

            // Step 3: Register node (if not already registered)
            log.info('\n[3/5] Registering node...');

            if (!registration.isRegistered()) {
                const result = await registration.register();
                log.info(`✓ Node registered successfully`);
                log.info(`  Off-chain ID: ${result.offChainNodeId}`);

                // TODO: After on-chain registration is implemented, store the nodeId
                // For now, use a mock nodeId for testing
                const mockOnChainNodeId = 1; // This should come from NodeRegistry after registration
                config.setOnChainNodeId(mockOnChainNodeId);

                log.warn('⚠️ Using mock on-chain nodeId=1 for testing');
                log.warn('TODO: Implement actual NodeRegistry.RegisterNode transaction');
            } else {
                log.info('✓ Node already registered');
            }

            // Step 4: Start HTTP server
            log.info('\n[4/5] Starting HTTP server...');
            await httpServer.start();

            // Step 5: Start session monitoring
            log.info('\n[5/5] Starting session monitor...');

            if (!config.state.onChainNodeId) {
                log.warn('⚠️ On-chain nodeId not available, using mock nodeId=1');
                config.setOnChainNodeId(1);
            }

            await sessionMonitor.start(config.state.onChainNodeId);

            // Step 6: Start heartbeat (will fail gracefully if endpoint doesn't exist)
            log.info('\n[6/6] Starting heartbeat service...');
            heartbeat.start();

            this.running = true;

            log.info('\n' + '='.repeat(60));
            log.info('✅ DeVPN Node Provider Daemon is ONLINE');
            log.info('='.repeat(60));
            log.info(`HTTP API: http://localhost:${config.service.httpPort}`);
            log.info(`Session polling: Every ${config.service.sessionPollInterval / 1000}s`);
            log.info(`Heartbeat interval: Every ${config.service.heartbeatInterval / 1000}s`);
            log.info('');
            log.info('Press Ctrl+C to stop...');
            log.info('='.repeat(60) + '\n');

            // Setup graceful shutdown
            this.setupShutdownHandlers();

        } catch (error) {
            log.error('Failed to start daemon', error);
            process.exit(1);
        }
    }

    /**
     * Stop the daemon
     */
    async stop() {
        if (!this.running) {
            return;
        }

        log.info('\nShutting down DeVPN Node Provider Daemon...');

        // Stop services
        heartbeat.stop();
        sessionMonitor.stop();
        await httpServer.stop();

        this.running = false;

        log.info('✓ Daemon stopped successfully');
        process.exit(0);
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        process.on('SIGINT', async () => {
            log.info('\nReceived SIGINT signal');
            await this.stop();
        });

        process.on('SIGTERM', async () => {
            log.info('\nReceived SIGTERM signal');
            await this.stop();
        });

        process.on('uncaughtException', (error) => {
            log.error('Uncaught exception', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            log.error('Unhandled promise rejection', reason);
        });
    }

    /**
     * Print startup banner
     */
    printBanner() {
        console.log('\n' + '='.repeat(60));
        console.log('  ____   __     ______  _   _ ');
        console.log(' |  _ \\  \\ \\   / /  _ \\| \\ | |');
        console.log(' | | | |  \\ \\ / /| |_) |  \\| |');
        console.log(' | |_| |   \\ V / |  __/| |\\  |');
        console.log(' |____/     \\_/  |_|   |_| \\_|');
        console.log('');
        console.log('  Node Provider Daemon v1.0.0');
        console.log('  Decentralized P2P VPN Network');
        console.log('='.repeat(60) + '\n');
    }
}

// Create and start daemon
const daemon = new NodeProviderDaemon();
daemon.start().catch((error) => {
    log.error('Fatal error during startup', error);
    process.exit(1);
});
