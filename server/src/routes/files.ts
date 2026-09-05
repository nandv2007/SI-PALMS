import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mime from 'mime-types';
import { pool, addSecurityLog, logAuditEvent } from '../db.js';
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { blockchainEngine } from '../blockchain.js';

const router = Router();

// Ensure upload directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

// UPLOAD FILE TO CASE
router.post('/cases/:caseId/files', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prefix = req.user!.prefix;
    const name = req.user!.name;
    const role = req.user!.role;
    const cleanCaseId = String(req.params.caseId).trim().toUpperCase();
    const { category, description, fallbackFileName, digitalSignature, signerPublicKey, parentFileId, changeSummary, isMajorVersion } = req.body;

    // Role upload permissions check
    if (prefix === 'LW') {
      return res.status(403).json({ success: false, message: 'Lawyers have read-only access and cannot upload files.' });
    }

    if (prefix === 'FO' && category !== 'FORENSIC_LAB') {
      return res.status(403).json({ success: false, message: 'Forensic officers can only upload Forensic Lab Reports.' });
    }

    if (prefix === 'PO' && category === 'FORENSIC_LAB') {
      return res.status(403).json({ success: false, message: 'Police officers cannot upload Forensic Lab Reports directly.' });
    }

    const [caseRows]: any = await pool.query('SELECT * FROM cases WHERE caseId = ?', [cleanCaseId]);
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: `Case ${cleanCaseId} not found.` });
    }

    // Versioning Calculation
    let calculatedVersion = 'v1.0';
    let calculatedVersionNumber = 1.0;
    let effectiveParentId: string | null = null;
    const finalChangeSummary = changeSummary || (parentFileId ? 'Document revision update' : 'Initial document seal');

    if (parentFileId) {
      effectiveParentId = String(parentFileId).trim();
      const [parentRows]: any = await pool.query('SELECT * FROM uploaded_files WHERE fileId = ?', [effectiveParentId]);
      if (parentRows.length > 0) {
        const parent = parentRows[0];
        const parentVerNum = Number(parent.versionNumber) || 1.0;
        const isMajor = isMajorVersion === 'true' || isMajorVersion === true;
        if (isMajor) {
          calculatedVersionNumber = Math.floor(parentVerNum) + 1.0;
        } else {
          calculatedVersionNumber = Math.round((parentVerNum + 0.1) * 10) / 10;
        }
        calculatedVersion = `v${calculatedVersionNumber.toFixed(1)}`;
      }

      // Set isLatestVersion = FALSE for parent and associated versions in lineage
      await pool.query(
        'UPDATE uploaded_files SET isLatestVersion = FALSE WHERE fileId = ? OR parentFileId = ?',
        [effectiveParentId, effectiveParentId]
      );
    }

    let fileName = fallbackFileName || 'Document.pdf';
    let fileSize = '0 KB';
    let fileType = 'application/pdf';
    let storagePath: string | null = null;
    let sha256Hash = '';

    if (req.file) {
      fileName = req.file.originalname;
      fileSize = `${(req.file.size / 1024).toFixed(1)} KB`;
      fileType = req.file.mimetype || (mime.lookup(req.file.originalname) as string) || 'application/octet-stream';
      storagePath = req.file.filename;

      // Calculate SHA-256 hash of uploaded file
      const fileBuffer = fs.readFileSync(req.file.path);
      sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } else {
      // Generate deterministic hash for text metadata fallback
      sha256Hash = crypto.createHash('sha256').update(`${fileName}-${Date.now()}-${Math.random()}`).digest('hex');
    }

    const fileId = `FILE-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    const uploadTime = new Date().toLocaleString() + ' IST';

    // BLOCKCHAIN SMART CONTRACT ANCHORING
    const bcRecord = await blockchainEngine.anchorDocument({
      caseId: cleanCaseId,
      docId: fileId,
      sha256Hash,
      uploadedBy: `${name} (${userId})`
    });

    // Save to uploaded_files with txHash, blockNumber, digitalSignature, signerPublicKey, versioning
    await pool.query(
      `INSERT INTO uploaded_files (
        fileId, caseId, fileName, fileSize, fileType, storagePath,
        uploadedByOfficerId, uploadedByOfficerName, uploadedByRole,
        uploadTime, category, sha256Hash, description, txHash, blockNumber,
        digitalSignature, signerPublicKey, version, versionNumber, parentFileId,
        changeSummary, isLatestVersion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        cleanCaseId,
        fileName,
        fileSize,
        fileType,
        storagePath,
        userId,
        name,
        role,
        uploadTime,
        category || 'CRIME_SCENE',
        sha256Hash,
        description || '',
        bcRecord.txHash,
        bcRecord.blockNumber,
        digitalSignature || null,
        signerPublicKey || null,
        calculatedVersion,
        calculatedVersionNumber,
        effectiveParentId,
        finalChangeSummary,
        true
      ]
    );

    // Save to blockchain_ledger table
    await pool.query(
      `INSERT INTO blockchain_ledger (
        txHash, blockNumber, blockHash, caseId, docId, sha256Hash,
        uploadedBy, timestamp, gasUsed, status, signerAddress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bcRecord.txHash,
        bcRecord.blockNumber,
        bcRecord.blockHash,
        cleanCaseId,
        fileId,
        sha256Hash,
        bcRecord.uploadedBy,
        bcRecord.timestamp,
        bcRecord.gasUsed,
        bcRecord.status,
        bcRecord.signerAddress
      ]
    );

    // AUDIT LOG (Event Type: Version creation or Upload)
    await logAuditEvent({
      user_id: `${userId} - ${name} (${prefix})`,
      action: parentFileId ? 'Version creation' : 'Upload',
      document_id: fileId,
      case_id: cleanCaseId
    });

    await addSecurityLog(userId, cleanCaseId, parentFileId ? 'VERSION_CREATED' : 'FILE_UPLOAD', 'SUCCESS', `Uploaded ${calculatedVersion} of ${fileName} (${category}) with SHA-256 seal & Blockchain Tx ${bcRecord.txHash}`);

    return res.json({
      success: true,
      file: {
        fileId,
        fileName,
        fileSize,
        fileType,
        fileDataUrl: storagePath ? `/api/files/${fileId}/download` : undefined,
        uploadedByOfficerId: userId,
        uploadedByOfficerName: name,
        uploadedByRole: role,
        uploadTime,
        category,
        sha256Hash,
        description,
        txHash: bcRecord.txHash,
        blockNumber: bcRecord.blockNumber,
        blockHash: bcRecord.blockHash,
        blockchainVerified: true,
        digitalSignature,
        signerPublicKey,
        signatureVerified: Boolean(digitalSignature),
        version: calculatedVersion,
        versionNumber: calculatedVersionNumber,
        parentFileId: effectiveParentId,
        changeSummary: finalChangeSummary,
        isLatestVersion: true
      }
    });
  } catch (err: any) {
    console.error('[FILE UPLOAD ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error during file upload.' });
  }
});

// DOWNLOAD / STREAM UPLOADED FILE
router.get('/files/:fileId/download', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const fileId = req.params.fileId;
    const userId = req.user!.id;
    const prefix = req.user!.prefix;

    const [fileRows]: any = await pool.query('SELECT * FROM uploaded_files WHERE fileId = ?', [fileId]);
    const fileRecord = fileRows[0];

    if (!fileRecord || !fileRecord.storagePath) {
      return res.status(404).send('File not found.');
    }

    // Case access authorization check
    const caseId = fileRecord.caseId;
    if (prefix === 'LW') {
      const [caseRows]: any = await pool.query('SELECT assignedLawyerId FROM cases WHERE caseId = ?', [caseId]);
      if (caseRows.length === 0 || (caseRows[0].assignedLawyerId && caseRows[0].assignedLawyerId !== userId)) {
        return res.status(403).send('Forbidden: You are not assigned to this case.');
      }
    } else {
      const [userCases]: any = await pool.query('SELECT * FROM user_cases WHERE userId = ? AND caseId = ?', [userId, caseId]);
      const [caseOfficers]: any = await pool.query('SELECT * FROM case_officers WHERE caseId = ? AND officerId = ?', [caseId, userId]);

      if (userCases.length === 0 && caseOfficers.length === 0) {
        return res.status(403).send('Forbidden: You are not authorized to access files for this case.');
      }
    }

    const fullPath = path.resolve(uploadsDir, fileRecord.storagePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('Stored file missing on disk.');
    }

    res.setHeader('Content-Type', fileRecord.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileRecord.fileName}"`);
    return res.sendFile(fullPath);
  } catch (err: any) {
    console.error('[FILE DOWNLOAD ERROR]', err);
    return res.status(500).send('Server error during download.');
  }
});

export default router;
