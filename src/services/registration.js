import axios from 'axios';
import { Address } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { log } from '../utils/logger.js';
import config from '../config.js';
import wireguard from './wireguard.js';

/**
 * Registration Service
 * Handles both on-chain (NodeRegistry contract) and off-chain (Backend API) registration
 */
class RegistrationService {
    constructor() {
        this.registered = false;
        this.offChainNodeId = null;
        this.onChainNodeId = null;
    }

    /**
     * Full registration flow
     * 1. Generate WireGuard keypair if needed
     * 2. Register to Backend API (off-chain)
     * 3. Prepare NodeRegistry transaction (on-chain)
     */
    async register() {
        try {
            log.registration('Starting node registration...');

            // Step 1: Ensure WireGuard keys exist
            await wireguard.generateServerKeypair();

            // Step 2: Register off-chain
            await this.registerOffChain();

            // Step 3: Prepare on-chain registration
            log.registration('On-chain registration transaction prepared');
            log.warn('TODO: Execute NodeRegistry.RegisterNode transaction using TON wallet');
            log.warn('This requires TON wallet mnemonic and blockchain.js integration');

            this.registered = true;
            log.registration('Node registration completed successfully');

            return {
                offChainNodeId: this.offChainNodeId,
                onChainNodeId: this.onChainNodeId,
                publicKey: config.wireguard.publicKey,
                endpoint: config.node.endpoint
            };

        } catch (error) {
            log.error('Registration failed', error);
            throw error;
        }
    }

    /**
     * Get wallet address from mnemonic
     */
    async getWalletAddress() {
        if (!config.hasTonWallet()) {
            throw new Error('TON wallet mnemonic not configured');
        }

        const mnemonic = config.ton.walletMnemonic.split(' ');
        const keyPair = await mnemonicToPrivateKey(mnemonic);
        const wallet = WalletContractV4.create({
            workchain: 0,
            publicKey: keyPair.publicKey
        });

        return wallet.address.toString();
    }

    /**
     * Register node to Backend API (off-chain)
     * POST /api/node/register
     */
    async registerOffChain() {
        log.registration('Registering to Backend API (off-chain)...');

        // Derive wallet address from mnemonic
        const walletAddress = await this.getWalletAddress();
        log.debug(`Node owner wallet: ${walletAddress}`);

        const payload = {
            owner_wallet: walletAddress,
            wg_public_key: config.wireguard.publicKey,
            endpoint: config.node.endpoint,
            region: config.node.region,
            country: config.node.country,
            city: config.node.city || undefined,
            price_per_gb: Number(config.pricing.perGb),
            price_per_minute: Number(config.pricing.perMinute),
            max_peers: config.node.maxPeers,
            bandwidth_mbps: config.node.bandwidthMbps,
            version: '1.0.0',
            metadata: {
                daemon_version: '1.0.0',
                os: process.platform,
                started_at: new Date().toISOString()
            }
        };

        try {
            const url = config.getBackendUrl('/api/node/register');
            log.debug(`Sending registration request to: ${url}`);

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.backend.apiKey && { 'Authorization': `Bearer ${config.backend.apiKey}` })
                },
                timeout: 30000
            });

            if (!response.data.success) {
                throw new Error(response.data.error || 'Registration failed');
            }

            this.offChainNodeId = response.data.node.id;

            log.registration(`Off-chain registration successful!`);
            log.info(`Node ID: ${this.offChainNodeId}`);
            log.info(`Endpoint: ${config.node.endpoint}`);
            log.info(`Region: ${config.node.region}, ${config.node.country}`);
            log.info(`Price: ${config.pricing.perGb} nanoTON/GB`);

            return response.data;

        } catch (error) {
            if (error.response) {
                log.error(`Backend API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                log.error('No response from Backend API - is the server running?');
            } else {
                log.error('Registration request failed', error);
            }
            throw error;
        }
    }

    /**
     * Prepare on-chain registration transaction
     * Returns the transaction parameters for NodeRegistry.RegisterNode
     *
     * NOTE: Actual transaction sending requires blockchain.js integration
     */
    prepareOnChainRegistration() {
        // Calculate metadata hash (simplified for hackathon)
        const metadata = {
            region: config.node.region,
            country: config.node.country,
            endpoint: config.node.endpoint
        };

        // Simple hash: convert JSON to string and use length as hash (not secure, just for demo)
        const metadataString = JSON.stringify(metadata);
        const metadataHash = BigInt(metadataString.length);

        const txParams = {
            message: 'RegisterNode',
            metadataHash: metadataHash,
            pricePerByte: config.pricing.perByte,
            value: '0.05' // TON amount to send with transaction
        };

        log.registration('On-chain registration parameters:');
        log.debug(`Metadata hash: ${metadataHash}`);
        log.debug(`Price per byte: ${config.pricing.perByte} nanoTON`);

        return txParams;
    }

    /**
     * Update node metadata (both on-chain and off-chain)
     */
    async updateMetadata(updates) {
        log.registration('Updating node metadata...');

        // Update Backend API
        try {
            const url = config.getBackendUrl(`/api/node/${this.offChainNodeId}`);
            await axios.put(url, updates, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.backend.apiKey && { 'Authorization': `Bearer ${config.backend.apiKey}` })
                }
            });

            log.registration('Off-chain metadata updated successfully');
        } catch (error) {
            log.error('Failed to update off-chain metadata', error);
        }

        // TODO: Update on-chain metadata via NodeRegistry.UpdateMetadata
        log.warn('TODO: Update on-chain metadata via NodeRegistry.UpdateMetadata transaction');

        return true;
    }

    /**
     * Check if node is registered
     */
    isRegistered() {
        return this.registered && this.offChainNodeId !== null;
    }

    /**
     * Get node IDs
     */
    getNodeIds() {
        return {
            offChain: this.offChainNodeId,
            onChain: this.onChainNodeId
        };
    }
}

export default new RegistrationService();
