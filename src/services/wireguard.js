import nacl from 'tweetnacl';
import { log } from '../utils/logger.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * WireGuard Service
 * Handles WireGuard keypair generation and peer management
 * NOTE: Peer management is MOCKED for local development (no real wg commands)
 */
class WireGuardService {
    constructor() {
        this.peers = new Map(); // Mock peer storage
        this.stats = new Map(); // Mock stats storage
    }

    /**
     * Generate WireGuard keypair using Curve25519
     * Saves to .env file if keys don't exist
     */
    async generateServerKeypair() {
        if (config.hasWireguardKeys()) {
            log.wireguard('WireGuard keys already configured');
            return {
                privateKey: config.wireguard.privateKey,
                publicKey: config.wireguard.publicKey
            };
        }

        log.wireguard('Generating new WireGuard server keypair...');

        const keypair = nacl.box.keyPair();
        const privateKey = Buffer.from(keypair.secretKey).toString('base64');
        const publicKey = Buffer.from(keypair.publicKey).toString('base64');

        // Save to .env file
        const envPath = path.join(__dirname, '../../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        envContent = envContent.replace(/WG_PRIVATE_KEY=.*/g, `WG_PRIVATE_KEY=${privateKey}`);
        envContent = envContent.replace(/WG_PUBLIC_KEY=.*/g, `WG_PUBLIC_KEY=${publicKey}`);

        fs.writeFileSync(envPath, envContent);

        // Update config
        config.wireguard.privateKey = privateKey;
        config.wireguard.publicKey = publicKey;

        log.wireguard(`Generated WireGuard keypair and saved to .env`);
        log.wireguard(`Public key: ${publicKey}`);

        return { privateKey, publicKey };
    }

    /**
     * Generate client-specific WireGuard configuration
     * @param {string} clientPublicKey - Client's WireGuard public key
     * @param {string} clientIP - Assigned IP for client (e.g., "10.8.0.2")
     */
    generateClientConfig(clientPublicKey, clientIP) {
        const config = `[Interface]
PrivateKey = ${clientPublicKey}
Address = ${clientIP}/32
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = ${this.getServerPublicKey()}
Endpoint = ${this.getServerEndpoint()}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

        return config;
    }

    /**
     * Mock: Add peer to WireGuard interface
     * In production, this would execute: wg set wg0 peer <pubkey> allowed-ips <ip>
     */
    async addPeer(peerPublicKey, peerIP, sessionId) {
        log.info(`[VPN] ========================================`);
        log.info(`[VPN] New VPN Session #${sessionId}`);
        log.info(`[VPN] Configuring peer...`);
        log.info(`[VPN]   Client IP: ${peerIP}`);
        log.info(`[VPN]   Public Key: ${peerPublicKey.substring(0, 20)}...`);

        // Mock peer data
        const peer = {
            publicKey: peerPublicKey,
            allowedIPs: `${peerIP}/32`,
            sessionId,
            addedAt: Date.now(),
            rxBytes: 0,
            txBytes: 0
        };

        this.peers.set(sessionId, peer);
        this.stats.set(sessionId, { rxBytes: 0, txBytes: 0, lastSeen: Date.now() });

        log.info(`[VPN] ✓ Peer configured successfully`);
        log.info(`[VPN] ✓ VPN tunnel active`);
        log.info(`[VPN] Total active connections: ${this.peers.size}`);
        log.info(`[VPN] ========================================`);

        return peer;
    }

    /**
     * Mock: Remove peer from WireGuard interface
     * In production, this would execute: wg set wg0 peer <pubkey> remove
     */
    async removePeer(sessionId) {
        const peer = this.peers.get(sessionId);

        if (!peer) {
            log.warn(`[VPN] Session ${sessionId} not found`);
            return false;
        }

        log.info(`[VPN] ========================================`);
        log.info(`[VPN] Disconnecting Session #${sessionId}`);
        log.info(`[VPN]   Client IP: ${peer.allowedIPs}`);

        this.peers.delete(sessionId);
        this.stats.delete(sessionId);

        log.info(`[VPN] ✓ Peer removed successfully`);
        log.info(`[VPN] Total active connections: ${this.peers.size}`);
        log.info(`[VPN] ========================================`);

        return true;
    }

    /**
     * Mock: Get peer statistics
     * In production, this would parse output from: wg show wg0 dump
     */
    getPeerStats(sessionId) {
        const stats = this.stats.get(sessionId);

        if (!stats) {
            return null;
        }

        // Incremental growth: 1-21 KB per poll (realistic for demo)
        const rxIncrement = Math.floor(Math.random() * 20000) + 1000; // 1-21 KB
        const txIncrement = Math.floor(Math.random() * 20000) + 1000; // 1-21 KB

        stats.rxBytes += rxIncrement;
        stats.txBytes += txIncrement;
        stats.lastSeen = Date.now();

        return stats;
    }

    /**
     * Get all active peers
     */
    getAllPeers() {
        return Array.from(this.peers.values());
    }

    /**
     * Get server public key
     */
    getServerPublicKey() {
        return config.wireguard.publicKey;
    }

    /**
     * Get server endpoint (IP:port)
     */
    getServerEndpoint() {
        return config.node.endpoint;
    }

    /**
     * Assign client IP from available pool
     * Sequential allocation starting from 10.10.0.2 for demo
     */
    assignClientIP() {
        const activePeers = this.peers.size;
        const ipSuffix = 2 + activePeers; // Start from .2, increment

        if (ipSuffix > 254) {
            throw new Error('IP pool exhausted (max 253 clients)');
        }

        return `10.10.0.${ipSuffix}`;
    }

    /**
     * Get current load (percentage of max peers)
     */
    getCurrentLoad() {
        return (this.peers.size / config.node.maxPeers) * 100;
    }
}

export default new WireGuardService();
