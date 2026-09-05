import { Router } from 'express';
import { pool } from '../db.js';
import { blockchainEngine } from '../blockchain.js';

const router = Router();

// GET VERIFICATION PROOF FOR A SPECIFIC DOCUMENT
router.get('/verify/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const [fileRows]: any = await pool.query('SELECT * FROM uploaded_files WHERE fileId = ?', [fileId]);
    
    if (fileRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `File ID "${fileId}" not found in database.`
      });
    }

    const file = fileRows[0];
    const currentHash = file.sha256Hash;

    // Check database blockchain ledger first
    const [ledgerRows]: any = await pool.query('SELECT * FROM blockchain_ledger WHERE docId = ?', [fileId]);
    let ledgerRecord = ledgerRows[0];

    // If not found in DB ledger table, verify via memory engine
    const verification = blockchainEngine.verifyDocument(fileId, currentHash);

    if (ledgerRecord) {
      const hashesMatch = ledgerRecord.sha256Hash.toLowerCase() === currentHash.toLowerCase();
      return res.json({
        success: true,
        verification: {
          isValid: hashesMatch,
          docId: fileId,
          caseId: file.caseId,
          fileName: file.fileName,
          currentHash,
          onChainHash: ledgerRecord.sha256Hash,
          uploadedBy: ledgerRecord.uploadedBy,
          timestamp: ledgerRecord.timestamp,
          txHash: ledgerRecord.txHash,
          blockNumber: ledgerRecord.blockNumber,
          blockHash: ledgerRecord.blockHash,
          signerAddress: ledgerRecord.signerAddress,
          contractAddress: blockchainEngine.getContractAddress(),
          gasUsed: ledgerRecord.gasUsed,
          verificationMessage: hashesMatch
            ? 'CRYPTOGRAPHIC MATCH CONFIRMED: On-chain ledger state matches document SHA-256 fingerprint perfectly.'
            : `TAMPER WARNING: Current file hash does NOT match the immutable on-chain record anchored in Block #${ledgerRecord.blockNumber}!`
        }
      });
    }

    return res.json({
      success: true,
      verification: {
        ...verification,
        fileName: file.fileName,
        contractAddress: blockchainEngine.getContractAddress()
      }
    });
  } catch (err: any) {
    console.error('[BLOCKCHAIN VERIFY ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET FULL BLOCKCHAIN LEDGER (MINED BLOCKS & TRANSACTIONS)
router.get('/ledger', async (req, res) => {
  try {
    const [rows]: any = await pool.query('SELECT * FROM blockchain_ledger ORDER BY blockNumber DESC LIMIT 50');
    const records = rows.length > 0 ? rows : blockchainEngine.getAllRecords();

    return res.json({
      success: true,
      blockHeight: blockchainEngine.getBlockHeight(),
      contractAddress: blockchainEngine.getContractAddress(),
      signerAddress: blockchainEngine.getSignerAddress(),
      totalRecords: records.length,
      ledger: records
    });
  } catch (err: any) {
    return res.json({
      success: true,
      blockHeight: blockchainEngine.getBlockHeight(),
      contractAddress: blockchainEngine.getContractAddress(),
      signerAddress: blockchainEngine.getSignerAddress(),
      totalRecords: blockchainEngine.getAllRecords().length,
      ledger: blockchainEngine.getAllRecords()
    });
  }
});

// GET BLOCKCHAIN STATS OVERVIEW
router.get('/stats', async (req, res) => {
  try {
    const [countRows]: any = await pool.query('SELECT COUNT(*) as count FROM blockchain_ledger');
    const totalAnchored = countRows[0]?.count || blockchainEngine.getAllRecords().length;

    return res.json({
      success: true,
      stats: {
        network: 'Ethereum Private Layer-2 Proof-of-Authority (PoA)',
        chainId: 1337,
        contractAddress: blockchainEngine.getContractAddress(),
        signerAddress: blockchainEngine.getSignerAddress(),
        blockHeight: blockchainEngine.getBlockHeight(),
        totalAnchoredDocuments: totalAnchored,
        consensusProtocol: 'Cryptographic SHA-256 Proof-of-Authority',
        status: 'OPERATIONAL'
      }
    });
  } catch {
    return res.json({
      success: true,
      stats: {
        network: 'Ethereum Private Layer-2 Proof-of-Authority (PoA)',
        chainId: 1337,
        contractAddress: blockchainEngine.getContractAddress(),
        signerAddress: blockchainEngine.getSignerAddress(),
        blockHeight: blockchainEngine.getBlockHeight(),
        totalAnchoredDocuments: blockchainEngine.getAllRecords().length,
        consensusProtocol: 'Cryptographic SHA-256 Proof-of-Authority',
        status: 'OPERATIONAL'
      }
    });
  }
});

export default router;
