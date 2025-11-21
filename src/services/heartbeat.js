import axios from 'axios';
import { log } from '../utils/logger.js';
import config from '../config.js';
import wireguard from './wireguard.js';
import sessionMonitor from './sessionMonitor.js';

/**
 * Heartbeat Service
 * Sends periodic health updates to Backend API
 *
 * NOTE: Backend endpoint /api/node/heartbeat does NOT exist yet
 * This service is structured and ready, but will fail until Backend implements the endpoint
 */
class HeartbeatService {
    constructor() {
        this.running = false;
        this.intervalId = null;
        this.lastHeartbeat = null;
        this.failedAttempts = 0;
    }

    /**
     * Start sending heartbeats to Backend
     */
    start() {
        if (this.running) {
            log.warn('Heartbeat service is already running');
            return;
        }

        this.running = true;

        log.heartbeat(`Starting heartbeat service...`);
        log.heartbeat(`Interval: ${config.service.heartbeatInterval}ms`);

        // Send initial heartbeat
        this.sendHeartbeat();

        // Set up periodic heartbeat
        this.intervalId = setInterval(() => {
            this.sendHeartbeat();
        }, config.service.heartbeatInterval);

        log.heartbeat('Heartbeat service started');
    }

    /**
     * Stop sending heartbeats
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.running = false;
        log.heartbeat('Heartbeat service stopped');
    }

    /**
     * Send heartbeat to Backend API
     * POST /api/node/heartbeat
     */
    async sendHeartbeat() {
        try {
            const payload = this.buildHeartbeatPayload();

            // TODO: Backend needs to implement this endpoint
            const url = config.getBackendUrl('/api/node/heartbeat');

            log.debug(`Sending heartbeat to: ${url}`);

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.backend.apiKey && { 'Authorization': `Bearer ${config.backend.apiKey}` })
                },
                timeout: 10000
            });

            if (response.data.success) {
                this.lastHeartbeat = Date.now();
                this.failedAttempts = 0;
                log.heartbeat('✓ Heartbeat sent successfully');
            } else {
                throw new Error(response.data.error || 'Heartbeat failed');
            }

        } catch (error) {
            this.failedAttempts++;

            if (error.response) {
                // Backend returned error
                if (error.response.status === 404) {
                    log.warn('⚠️ Heartbeat endpoint not implemented yet (404)');
                    log.warn('TODO: Backend needs to add POST /api/node/heartbeat endpoint');
                } else {
                    log.error(`Heartbeat failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
                }
            } else if (error.request) {
                log.warn('No response from Backend API');
            } else {
                log.error('Heartbeat request failed', error);
            }

            // Stop trying after 5 consecutive failures (endpoint doesn't exist)
            if (this.failedAttempts >= 5) {
                log.warn('Heartbeat disabled after 5 failed attempts (endpoint not ready)');
                this.stop();
            }
        }
    }

    /**
     * Build heartbeat payload
     */
    buildHeartbeatPayload() {
        const activePeers = sessionMonitor.getActiveSessionCount();
        const load = wireguard.getCurrentLoad();
        const uptime = process.uptime();

        return {
            nodeId: config.node.id,
            status: 'online',
            load: Math.round(load),
            activePeers,
            maxPeers: config.node.maxPeers,
            uptime: Math.round(uptime),
            bandwidthAvailable: config.node.bandwidthMbps,
            endpoint: config.node.endpoint,
            timestamp: Date.now(),
            metadata: {
                daemon_version: '1.0.0',
                wg_interface: config.wireguard.interface,
                region: config.node.region,
                country: config.node.country
            }
        };
    }

    /**
     * Get last heartbeat timestamp
     */
    getLastHeartbeat() {
        return this.lastHeartbeat;
    }

    /**
     * Check if heartbeat is running
     */
    isRunning() {
        return this.running;
    }

    /**
     * Get failed attempts count
     */
    getFailedAttempts() {
        return this.failedAttempts;
    }
}

export default new HeartbeatService();
