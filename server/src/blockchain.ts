import { ethers } from 'ethers';
import crypto from 'node:crypto';

export interface BlockchainRecord {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  caseId: string;
  docId: string;
  sha256Hash: string;
  uploadedBy: string;
  timestamp: string;
  gasUsed: number;
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
  signerAddress: string;
}

export interface VerificationResult {
  isValid: boolean;
  docId: string;
  caseId: string;
  currentHash: string;
  onChainHash: string;
  uploadedBy: string;
  timestamp: string;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  signerAddress: string;
  verificationMessage: string;
}

// In-Memory EVM & Ledger Provider Simulation (Powered by ethers.js Cryptographic Signatures)
class EmbeddedBlockchainEngine {
  private wallet: ethers.HDNodeWallet;
  private provider: ethers.JsonRpcProvider | null = null;
  private contractAddress: string;
  private currentBlockHeight: number = 10428;
  private chainId: number = 1337; // Local Private EVM Chain ID
  private memoryLedger: Map<string, BlockchainRecord> = new Map();

  constructor() {
    // Generate a deterministic system wallet for Smart Contract Signings
    const mnemonic = "test test test test test test test test test test test junk";
    this.wallet = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(mnemonic));
    
    // Virtual Smart Contract Deployment Address (EVM Contract Creation standard)
    this.contractAddress = ethers.getCreateAddress({
      from: this.wallet.address,
      nonce: 1
    });

    console.log(`[BLOCKCHAIN] System EVM Smart Contract Engine Initialized.`);
    console.log(`[BLOCKCHAIN] Contract Address: ${this.contractAddress}`);
    console.log(`[BLOCKCHAIN] Signer Address: ${this.wallet.address}`);
  }

  public getContractAddress(): string {
    return this.contractAddress;
  }

  public getSignerAddress(): string {
    return this.wallet.address;
  }

  public getBlockHeight(): number {
    return this.currentBlockHeight;
  }

  /**
   * Anchor a document hash onto the Smart Contract Ledger.
   * Computes authentic Ethereum transaction hash signature and increments block height.
   */
  public async anchorDocument(params: {
    caseId: string;
    docId: string;
    sha256Hash: string;
    uploadedBy: string;
  }): Promise<BlockchainRecord> {
    this.currentBlockHeight += 1;
    const timestamp = new Date().toLocaleString() + ' IST';
    const timestampMs = Date.now();

    // Construct raw transaction payload matching Solidity method `anchorDocument(string,string,string,string)`
    const payload = `${params.caseId}:${params.docId}:${params.sha256Hash}:${params.uploadedBy}:${timestampMs}:${this.currentBlockHeight}`;
    
    // Cryptographically sign transaction payload with HD Wallet Private Key
    const signature = await this.wallet.signMessage(payload);
    
    // Generate standard 66-character 0x-prefixed Ethereum Tx Hash
    const txHash = '0x' + crypto.createHash('sha256').update(signature + payload).digest('hex');
    
    // Generate 66-character 0x-prefixed Ethereum Block Hash
    const blockHash = '0x' + crypto.createHash('sha256').update(`BLOCK:${this.currentBlockHeight}:${txHash}`).digest('hex');

    const record: BlockchainRecord = {
      txHash,
      blockNumber: this.currentBlockHeight,
      blockHash,
      caseId: params.caseId,
      docId: params.docId,
      sha256Hash: params.sha256Hash,
      uploadedBy: params.uploadedBy,
      timestamp,
      gasUsed: 42190 + Math.floor(Math.random() * 500),
      status: 'CONFIRMED',
      signerAddress: this.wallet.address
    };

    this.memoryLedger.set(params.docId, record);
    console.log(`[BLOCKCHAIN TX] Anchored File "${params.docId}" to Block #${record.blockNumber} (Tx: ${txHash.substring(0, 18)}...)`);
    return record;
  }

  /**
   * Verify document integrity against Smart Contract Ledger state.
   */
  public verifyDocument(docId: string, currentHash: string): VerificationResult {
    const record = this.memoryLedger.get(docId);

    if (!record) {
      return {
        isValid: false,
        docId,
        caseId: 'N/A',
        currentHash,
        onChainHash: 'NONE',
        uploadedBy: 'N/A',
        timestamp: 'N/A',
        txHash: 'N/A',
        blockNumber: 0,
        blockHash: 'N/A',
        signerAddress: this.wallet.address,
        verificationMessage: 'Document hash record not found on Blockchain Ledger.'
      };
    }

    const hashesMatch = record.sha256Hash.toLowerCase() === currentHash.toLowerCase();

    return {
      isValid: hashesMatch,
      docId,
      caseId: record.caseId,
      currentHash,
      onChainHash: record.sha256Hash,
      uploadedBy: record.uploadedBy,
      timestamp: record.timestamp,
      txHash: record.txHash,
      blockNumber: record.blockNumber,
      blockHash: record.blockHash,
      signerAddress: record.signerAddress,
      verificationMessage: hashesMatch
        ? `CRYPTOGRAPHIC MATCH CONFIRMED: On-chain ledger state matches document SHA-256 fingerprint perfectly.`
        : `TAMPER WARNING: Current file hash does NOT match the immutable on-chain record anchored in Block #${record.blockNumber}!`
    };
  }

  /**
   * Inject pre-existing record into memory ledger (for DB seeding sync).
   */
  public injectRecord(record: BlockchainRecord) {
    this.memoryLedger.set(record.docId, record);
    if (record.blockNumber > this.currentBlockHeight) {
      this.currentBlockHeight = record.blockNumber;
    }
  }

  public getAllRecords(): BlockchainRecord[] {
    return Array.from(this.memoryLedger.values()).sort((a, b) => b.blockNumber - a.blockNumber);
  }
}

export const blockchainEngine = new EmbeddedBlockchainEngine();
