import { log } from '../utils/logger.js';
import config from '../config.js';
import blockchain from './blockchain.js';
import wireguard from './wireguard.js';

/**
 * Session Monitor Service
 * Polls SessionManager contract for sessions assigned to this node
 * Triggers peer setup when new sessions are detected
 */
class SessionMonitorService {
    constructor() {
        this.running = false;
        this.intervalId = null;
        this.activeSessions = new Map(); // Track active sessions
        this.nodeId = null;
    }

    /**
     * Start monitoring sessions for this node
     * @param {number} nodeId - On-chain node ID to monitor
     */
    async start(nodeId) {
        if (this.running) {
            log.warn('Session monitor is already running');
            return;
        }

        this.nodeId = nodeId;
        this.running = true;

        log.session(`Starting session monitor for node ${nodeId}...`);
        log.session(`Poll interval: ${config.service.sessionPollInterval}ms`);

        // Start polling loop
        await this.poll(); // Initial poll

        this.intervalId = setInterval(async () => {
            await this.poll();
        }, config.service.sessionPollInterval);

        log.session('Session monitor started successfully');
    }

    /**
     * Stop monitoring sessions
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.running = false;
        log.session('Session monitor stopped');
    }

    /**
     * Poll SessionManager for sessions assigned to this node
     */
    async poll() {
        if (!this.nodeId) {
            log.warn('Cannot poll sessions: nodeId not set');
            return;
        }

        try {
            // Query all sessions for this node
            const sessions = await blockchain.getSessionsByNode(this.nodeId);

            if (sessions.length === 0) {
                log.debug(`No active sessions for node ${this.nodeId}`);
                return;
            }

            // Process each session
            for (const session of sessions) {
                await this.handleSession(session);
            }

            // Clean up inactive sessions
            await this.cleanupInactiveSessions(sessions);

        } catch (error) {
            log.error('Session polling error', error);
        }
    }

    /**
     * Handle a detected session
     * Sets up peer if it's a new session
     */
    async handleSession(session) {
        const { sessionId, user, depositAmount, usageBytes } = session;

        // Check if this is a new session
        if (this.activeSessions.has(sessionId)) {
            // Already tracking this session
            return;
        }

        log.session(`\n🎯 ============================================`);
        log.session(`🎯 NEW SESSION DETECTED`);
        log.session(`🎯 ============================================`);
        log.info(`Session ID: ${sessionId}`);
        log.info(`User Wallet: ${user.toString()}`);
        log.info(`Deposit Amount: ${depositAmount} nanoTON`);
        log.info(`Node ID: ${this.nodeId}`);

        // Generate client IP
        const clientIP = wireguard.assignClientIP();

        log.session(`\n📡 Setting up VPN tunnel...`);

        // Mock: Add peer to WireGuard
        // In real implementation, Backend would call /peer/add with client's WG public key
        await wireguard.addPeer(
            `client_wg_key_${sessionId}`, // Mock but realistic looking
            clientIP,
            sessionId
        );

        // Track this session
        this.activeSessions.set(sessionId, {
            ...session,
            clientIP,
            startedAt: Date.now(),
            lastChecked: Date.now()
        });

        log.session(`✅ Session ${sessionId} ready for traffic\n`);
    }

    /**
     * Clean up sessions that are no longer active on-chain
     */
    async cleanupInactiveSessions(activeSessions) {
        const activeSessionIds = new Set(activeSessions.map(s => s.sessionId));

        for (const [sessionId, sessionData] of this.activeSessions.entries()) {
            if (!activeSessionIds.has(sessionId)) {
                log.session(`Session ${sessionId} ended on-chain, cleaning up...`);

                // Remove peer from WireGuard
                await wireguard.removePeer(sessionId);

                // Remove from tracking
                this.activeSessions.delete(sessionId);

                log.session(`Session ${sessionId} cleanup complete`);
            }
        }
    }

    /**
     * Get stats for all active sessions
     */
    getActiveSessionStats() {
        const stats = [];

        for (const [sessionId, sessionData] of this.activeSessions.entries()) {
            const peerStats = wireguard.getPeerStats(sessionId);

            stats.push({
                sessionId,
                clientIP: sessionData.clientIP,
                startedAt: sessionData.startedAt,
                duration: Date.now() - sessionData.startedAt,
                rxBytes: peerStats?.rxBytes || 0,
                txBytes: peerStats?.txBytes || 0,
                totalBytes: (peerStats?.rxBytes || 0) + (peerStats?.txBytes || 0)
            });
        }

        return stats;
    }

    /**
     * Get count of active sessions
     */
    getActiveSessionCount() {
        return this.activeSessions.size;
    }

    /**
     * Check if monitoring is running
     */
    isRunning() {
        return this.running;
    }
}

export default new SessionMonitorService();
