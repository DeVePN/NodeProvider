import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Validate and export configuration
 * Throws error if required variables are missing
 */
class Config {
    constructor() {
        this.validateRequired();
        this.loadConfig();
    }

    validateRequired() {
        const required = [
            'BACKEND_URL',
            'NODE_REGION',
            'NODE_COUNTRY',
            'SESSION_MANAGER_ADDRESS',
            'TON_NETWORK',
            'TON_API_URL'
        ];

        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    }

    loadConfig() {
        // Backend
        this.backend = {
            url: process.env.BACKEND_URL,
            apiKey: process.env.BACKEND_API_KEY || ''
        };

        // Node identity
        this.node = {
            id: process.env.NODE_ID || 'node-1',
            endpoint: process.env.NODE_ENDPOINT || 'localhost:51820',
            region: process.env.NODE_REGION,
            country: process.env.NODE_COUNTRY,
            city: process.env.NODE_CITY || '',
            maxPeers: parseInt(process.env.MAX_PEERS || '10'),
            bandwidthMbps: parseInt(process.env.BANDWIDTH_MBPS || '100')
        };

        // Pricing
        this.pricing = {
            perGb: BigInt(process.env.PRICE_PER_GB || '100000'), // nanoTON
            perMinute: BigInt(process.env.PRICE_PER_MINUTE || '10000'), // nanoTON
            perByte: BigInt(process.env.PRICE_PER_GB || '100000') / BigInt(1073741824) // Calculate from GB
        };

        // WireGuard
        this.wireguard = {
            interface: process.env.WG_INTERFACE || 'wg0',
            privateKey: process.env.WG_PRIVATE_KEY || '',
            publicKey: process.env.WG_PUBLIC_KEY || '',
            port: parseInt(process.env.WG_PORT || '51820')
        };

        // TON Blockchain
        this.ton = {
            network: process.env.TON_NETWORK || 'testnet',
            apiUrl: process.env.TON_API_URL,
            nodeRegistryAddress: process.env.NODE_REGISTRY_ADDRESS || '',
            sessionManagerAddress: process.env.SESSION_MANAGER_ADDRESS,
            walletMnemonic: process.env.TON_WALLET_MNEMONIC || '',
            walletVersion: process.env.TON_WALLET_VERSION || 'v4r2'
        };

        // Service settings
        this.service = {
            httpPort: parseInt(process.env.HTTP_SERVER_PORT || '8080'),
            sessionPollInterval: parseInt(process.env.SESSION_POLL_INTERVAL || '30000'), // ms
            heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '60000'), // ms
            logLevel: process.env.LOG_LEVEL || 'debug'
        };

        // Runtime state
        this.state = {
            registered: false,
            onChainNodeId: null,
            startTime: Date.now()
        };
    }

    // Helper to check if WireGuard keys are configured
    hasWireguardKeys() {
        return this.wireguard.privateKey && this.wireguard.publicKey &&
               this.wireguard.privateKey !== 'YOUR_WG_PRIVATE_KEY' &&
               this.wireguard.publicKey !== 'YOUR_WG_PUBLIC_KEY';
    }

    // Helper to check if TON wallet is configured
    hasTonWallet() {
        return this.ton.walletMnemonic && this.ton.walletMnemonic.split(' ').length >= 24;
    }

    // Helper to get full backend URL
    getBackendUrl(path) {
        const base = this.backend.url.replace(/\/$/, '');
        return `${base}${path}`;
    }

    // Update on-chain node ID after registration
    setOnChainNodeId(nodeId) {
        this.state.onChainNodeId = nodeId;
        this.state.registered = true;
    }
}

// Export singleton instance
const config = new Config();
export default config;
