/*
 * RecordSafe blockchain integration placeholder.
 *
 * The Remix VM is isolated and cannot be used as the RPC endpoint for this API.
 * Before enabling writes:
 * 1. Deploy FIRRegistry.sol to a local Hardhat node or a testnet.
 * 2. Set BLOCKCHAIN_RPC_URL and CONTRACT_ADDRESS in .env.
 * 3. Add the compiled ABI to this service.
 * 4. Use a dedicated relayer private key stored in a secure secret manager (never commit it).
 *
 * Do not store citizen names, addresses, complaint descriptions, or evidence on-chain.
 * This starter intentionally does not pretend a transaction was written to blockchain.
 */
function isConfigured() {
  return Boolean(process.env.BLOCKCHAIN_RPC_URL && process.env.CONTRACT_ADDRESS);
}
module.exports = { isConfigured };
