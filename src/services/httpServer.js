import express from 'express';
import { log } from '../utils/logger.js';
import config from '../config.js';
import wireguard from './wireguard.js';
import sessionMonitor from './sessionMonitor.js';

/**
 * HTTP Server Service
 * Provides REST API for Backend to manage peers
 * Endpoints: /peer/add, /peer/remove, /peer/stats, /health
 */
class HttpServerService {
    constructor() {
        this.app = express();
        this.server = null;
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        this.app.use(express.json());

        // Request logging
        this.app.use((req, res, next) => {
            log.http(`${req.method} ${req.path}`);
            next();
        });

        // Error handling
        this.app.use((err, req, res, next) => {
            log.error('HTTP server error', err);
            res.status(500).json({
                success: false,
                error: err.message
            });
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            const activeSessions = sessionMonitor.getActiveSessionCount();
            const load = wireguard.getCurrentLoad();

            res.json({
                success: true,
                status: 'online',
                uptime: process.uptime(),
                activeSessions,
                load: `${load.toFixed(1)}%`,
                maxPeers: config.node.maxPeers,
                nodeId: config.node.id,
                endpoint: config.node.endpoint
            });
        });

        // Add peer (called by Backend when session starts)
        this.app.post('/peer/add', async (req, res) => {
            try {
                const { sessionId, clientPublicKey, clientIP } = req.body;

                if (!sessionId || !clientPublicKey) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: sessionId, clientPublicKey'
                    });
                }

                log.http(`Adding peer for session ${sessionId}`);

                // Assign IP if not provided
                const assignedIP = clientIP || wireguard.assignClientIP();

                // Add peer to WireGuard
                const peer = await wireguard.addPeer(clientPublicKey, assignedIP, sessionId);

                // Generate client config
                const clientConfig = wireguard.generateClientConfig(clientPublicKey, assignedIP);

                res.json({
                    success: true,
                    peer: {
                        sessionId,
                        clientIP: assignedIP,
                        publicKey: peer.publicKey,
                        addedAt: peer.addedAt
                    },
                    config: clientConfig
                });

            } catch (error) {
                log.error('Failed to add peer', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Remove peer (called by Backend when session ends)
        this.app.delete('/peer/remove', async (req, res) => {
            try {
                const { sessionId } = req.body;

                if (!sessionId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required field: sessionId'
                    });
                }

                log.http(`Removing peer for session ${sessionId}`);

                const removed = await wireguard.removePeer(sessionId);

                if (!removed) {
                    return res.status(404).json({
                        success: false,
                        error: 'Peer not found'
                    });
                }

                res.json({
                    success: true,
                    message: `Peer ${sessionId} removed successfully`
                });

            } catch (error) {
                log.error('Failed to remove peer', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get peer stats (called by Backend to track usage)
        this.app.get('/peer/stats', (req, res) => {
            try {
                const { sessionId } = req.query;

                if (sessionId) {
                    // Get stats for specific session
                    const stats = wireguard.getPeerStats(parseInt(sessionId));

                    if (!stats) {
                        return res.status(404).json({
                            success: false,
                            error: 'Peer not found'
                        });
                    }

                    return res.json({
                        success: true,
                        sessionId: parseInt(sessionId),
                        stats
                    });
                }

                // Get stats for all active sessions
                const allStats = sessionMonitor.getActiveSessionStats();

                res.json({
                    success: true,
                    count: allStats.length,
                    sessions: allStats
                });

            } catch (error) {
                log.error('Failed to get peer stats', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get all active peers
        this.app.get('/peers', (req, res) => {
            const peers = wireguard.getAllPeers();

            res.json({
                success: true,
                count: peers.length,
                peers: peers.map(p => ({
                    sessionId: p.sessionId,
                    allowedIPs: p.allowedIPs,
                    addedAt: p.addedAt
                }))
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Not found'
            });
        });
    }

    /**
     * Start HTTP server
     */
    async start() {
        return new Promise((resolve, reject) => {
            const port = config.service.httpPort;

            this.server = this.app.listen(port, '0.0.0.0', () => {
                log.http(`HTTP server listening on port ${port}`);
                log.http('Available endpoints:');
                log.http('  GET  /health        - Health check');
                log.http('  POST /peer/add      - Add peer');
                log.http('  DELETE /peer/remove - Remove peer');
                log.http('  GET  /peer/stats    - Get peer stats');
                log.http('  GET  /peers         - List all peers');

                resolve();
            });

            this.server.on('error', (error) => {
                log.error('HTTP server error', error);
                reject(error);
            });
        });
    }

    /**
     * Stop HTTP server
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    log.http('HTTP server stopped');
                    resolve();
                });
            });
        }
    }
}

export default new HttpServerService();
