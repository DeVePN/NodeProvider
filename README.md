# DeVPN Node Provider Daemon

VPN node management daemon for the DeVPN decentralized P2P VPN network powered by TON blockchain.

## Features

✅ **On-chain & Off-chain Registration** - Register to Backend API and NodeRegistry contract
✅ **Session Monitoring** - Poll SessionManager for assigned sessions
✅ **WireGuard Management** - Mock peer add/remove (production-ready structure)
✅ **HTTP API** - REST API for Backend to manage peers
✅ **Heartbeat** - Health status reporting to Backend
✅ **Blockchain Integration** - Query TON testnet contracts

## Architecture

```
src/
├── index.js              # Main daemon orchestrator
├── config.js             # Configuration loader
├── services/
│   ├── registration.js   # Node registration (on-chain + off-chain)
│   ├── blockchain.js     # TON client & contract queries
│   ├── wireguard.js      # WireGuard keypair & peer management (mocked)
│   ├── sessionMonitor.js # Session polling & detection
│   ├── httpServer.js     # Express API (:8080)
│   └── heartbeat.js      # Health reporting (endpoint not ready)
└── utils/
    └── logger.js         # Winston logger
```

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Edit `.env` and set:

```env
# Update contract addresses
NODE_REGISTRY_ADDRESS=<your_deployed_NodeRegistry_address>
SESSION_MANAGER_ADDRESS=<your_deployed_SessionManager_address>

# Add TON wallet mnemonic (24 words)
TON_WALLET_MNEMONIC=word1 word2 word3 ... word24

# WireGuard keys will be auto-generated on first run
```

### 3. Start Daemon

```bash
pnpm start
```

## API Endpoints

The daemon exposes a REST API on port 8080:

### `GET /health`
Health check and status

**Response:**
```json
{
  "success": true,
  "status": "online",
  "uptime": 123.45,
  "activeSessions": 3,
  "load": "30.0%",
  "maxPeers": 10
}
```

### `POST /peer/add`
Add a peer (called by Backend when session starts)

**Request:**
```json
{
  "sessionId": 123,
  "clientPublicKey": "base64_wg_public_key",
  "clientIP": "10.8.0.2"
}
```

**Response:**
```json
{
  "success": true,
  "peer": {
    "sessionId": 123,
    "clientIP": "10.8.0.2",
    "addedAt": 1234567890
  },
  "config": "... WireGuard config ..."
}
```

### `DELETE /peer/remove`
Remove a peer (called by Backend when session ends)

**Request:**
```json
{
  "sessionId": 123
}
```

### `GET /peer/stats?sessionId=123`
Get peer statistics

**Response:**
```json
{
  "success": true,
  "sessionId": 123,
  "stats": {
    "rxBytes": 1234567,
    "txBytes": 7654321,
    "lastSeen": 1234567890
  }
}
```

### `GET /peers`
List all active peers

## How It Works

### 1. Registration Flow

On first run, the daemon:
1. Generates WireGuard server keypair (if not exists)
2. Registers to Backend API (off-chain) → receives nodeId
3. Prepares NodeRegistry.RegisterNode transaction (on-chain)
   - *Note: Actual transaction sending requires manual execution for now*

### 2. Session Monitoring

Every 30 seconds:
1. Query SessionManager.getTotalSessions()
2. For each session, query SessionManager.getSession(id)
3. Filter sessions where `nodeId` matches this node
4. Detect new active sessions
5. Auto-add peer to WireGuard (mocked)

### 3. Peer Management

When Backend calls `/peer/add`:
1. Daemon adds peer to WireGuard interface (mocked)
2. Generates client config
3. Returns config to Backend

When Backend calls `/peer/remove`:
1. Daemon removes peer from WireGuard (mocked)

### 4. Heartbeat

Every 60 seconds:
1. Build heartbeat payload (status, load, active peers)
2. Send POST to Backend `/api/node/heartbeat`
   - *Note: This endpoint doesn't exist yet, will fail gracefully*

## Development vs Production

### Current State (Local Development)

✅ **Works Now:**
- Configuration loading
- Off-chain registration to Backend API
- TON blockchain queries (testnet)
- Session monitoring & detection
- HTTP API server
- Mock WireGuard peer management
- Logging & error handling

⚠️ **Mocked/TODO:**
- On-chain registration (requires manual transaction)
- Actual WireGuard commands (`wg set`, `wg-quick`)
- Heartbeat endpoint (Backend not ready)

### Production Requirements (VPS)

To deploy on a real VPS:

1. **Install WireGuard:**
   ```bash
   sudo apt install wireguard
   ```

2. **Update `wireguard.js`:**
   - Replace mock functions with real `wg` commands
   - Execute: `wg set wg0 peer <pubkey> allowed-ips <ip>`
   - Parse: `wg show wg0 dump` for stats

3. **Configure Public Endpoint:**
   - Update `NODE_ENDPOINT` to public IP:port
   - Ensure port 51820 UDP is open

4. **Add Heartbeat Endpoint to Backend:**
   - Implement `POST /api/node/heartbeat`
   - Accept nodeId, status, load, activePeers

5. **Run as Systemd Service:**
   ```bash
   sudo systemctl enable devpn-node-provider
   sudo systemctl start devpn-node-provider
   ```

## Logs

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- Console output (colored)

## Testing Locally

### 1. Start the Daemon
```bash
pnpm start
```

### 2. Check Health
```bash
curl http://localhost:8080/health
```

### 3. Test Peer Add
```bash
curl -X POST http://localhost:8080/peer/add \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": 1,
    "clientPublicKey": "test_pubkey_123",
    "clientIP": "10.8.0.2"
  }'
```

### 4. Check Peers
```bash
curl http://localhost:8080/peers
```

### 5. Test Peer Remove
```bash
curl -X DELETE http://localhost:8080/peer/remove \
  -H "Content-Type: application/json" \
  -d '{"sessionId": 1}'
```

## Configuration Reference

### Required
- `BACKEND_URL` - Backend API URL
- `NODE_REGION` - Region (e.g., "Asia")
- `NODE_COUNTRY` - Country (e.g., "Indonesia")
- `SESSION_MANAGER_ADDRESS` - Deployed SessionManager contract
- `TON_NETWORK` - Network (testnet/mainnet)
- `TON_API_URL` - TON API endpoint

### Optional
- `NODE_REGISTRY_ADDRESS` - NodeRegistry contract (for on-chain registration)
- `TON_WALLET_MNEMONIC` - For on-chain transactions
- `PRICE_PER_GB` - Pricing in nanoTON (default: 100000)
- `MAX_PEERS` - Max concurrent peers (default: 10)
- `LOG_LEVEL` - debug/info/warn/error (default: debug)

## Troubleshooting

**Issue**: "Missing required environment variables"
**Fix**: Check `.env` file has all required fields

**Issue**: "Failed to initialize blockchain client"
**Fix**: Verify `SESSION_MANAGER_ADDRESS` is valid and `TON_API_URL` is accessible

**Issue**: "Heartbeat disabled after 5 failed attempts"
**Fix**: Normal! Backend endpoint `/api/node/heartbeat` doesn't exist yet

**Issue**: "No active sessions for node"
**Fix**: Normal if no users have started sessions yet. Test by manually calling SessionManager.StartSession on testnet

## Next Steps

1. **Deploy SessionManager** (if not done): Get contract address for `.env`
2. **Deploy NodeRegistry** (if not done): Get contract address for `.env`
3. **Test locally**: Start daemon, test API endpoints
4. **Get VPS**: Deploy to production with real WireGuard
5. **Add Backend heartbeat endpoint**: Enable health monitoring
6. **Test end-to-end**: Full session flow with client

## License

ISC
