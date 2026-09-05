import { Router } from 'express';
import { pool, addSecurityLog, logAuditEvent } from '../db.js';
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Helper to format full CaseRecord with officers and uploaded files
async function getCaseRecord(caseId: string) {
  const [caseRows]: any = await pool.query('SELECT * FROM cases WHERE caseId = ?', [caseId]);
  const caseData = caseRows[0];
  if (!caseData) return null;

  const [officerRows]: any = await pool.query('SELECT officerId FROM case_officers WHERE caseId = ?', [caseId]);

  const [files]: any = await pool.query('SELECT * FROM uploaded_files WHERE caseId = ? ORDER BY fileId DESC', [caseId]);

  return {
    ...caseData,
    assignedOfficerIds: officerRows.map((o: any) => o.officerId),
    uploadedFiles: files.map((f: any) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      fileDataUrl: f.storagePath ? `/api/files/${f.fileId}/download` : undefined,
      uploadedByOfficerId: f.uploadedByOfficerId,
      uploadedByOfficerName: f.uploadedByOfficerName,
      uploadedByRole: f.uploadedByRole,
      uploadTime: f.uploadTime,
      category: f.category,
      sha256Hash: f.sha256Hash,
      description: f.description,
      txHash: f.txHash,
      blockNumber: f.blockNumber,
      digitalSignature: f.digitalSignature,
      signerPublicKey: f.signerPublicKey,
      version: f.version || 'v1.0',
      versionNumber: f.versionNumber ? parseFloat(f.versionNumber) : 1.0,
      parentFileId: f.parentFileId || null,
      changeSummary: f.changeSummary || null,
      isLatestVersion: f.isLatestVersion !== undefined && f.isLatestVersion !== null ? Boolean(f.isLatestVersion) : true
    }))
  };
}

// GET ALL CASES MAP
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const [caseRows]: any = await pool.query('SELECT caseId FROM cases');

    const casesRecordDict: Record<string, any> = {};
    for (const c of caseRows) {
      const record = await getCaseRecord(c.caseId);
      if (record) {
        casesRecordDict[c.caseId] = record;
      }
    }

    return res.json(casesRecordDict);
  } catch (err: any) {
    console.error('[CASES GET ALL ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
});

// OPEN ASSIGNED CASE
router.post('/:caseId/open', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prefix = req.user!.prefix;
    const name = req.user!.name;
    const cleanCaseId = String(req.params.caseId).trim().toUpperCase();

    const caseData = await getCaseRecord(cleanCaseId);
    if (!caseData) {
      return res.status(404).json({ success: false, message: `Case Number "${cleanCaseId}" was not found.` });
    }

    // Forensic Officer restriction: Police Officer MUST have dispatched the case to forensic first
    if (prefix === 'FO' && caseData.status !== 'FORENSIC_REVIEW') {
      await addSecurityLog(userId, cleanCaseId, 'FORENSIC_ACCESS_BLOCKED', 'RESTRICTED', `Forensic Officer ${userId} attempted to access case ${cleanCaseId} before police dispatch`);
      return res.status(200).json({
        success: false,
        message: `Case ${cleanCaseId} has not been sent to the Forensic Lab by a Police Officer yet.`
      });
    }

    if (prefix === 'LW') {
      // Single lawyer restriction
      if (caseData.assignedLawyerId && caseData.assignedLawyerId !== userId) {
        const lawyerDisplay = caseData.assignedLawyerName
          ? `${caseData.assignedLawyerName} (${caseData.assignedLawyerId})`
          : caseData.assignedLawyerId;

        await addSecurityLog(userId, cleanCaseId, 'LAWYER_ACCESS_BLOCKED', 'RESTRICTED', `Lawyer ${userId} attempted to access case locked by ${lawyerDisplay}`);

        return res.status(200).json({
          success: false,
          message: `Case ${cleanCaseId} is currently being handled by Lawyer ${lawyerDisplay}. You cannot view or access this case file.`
        });
      }

      // Auto-claim case for lawyer if unassigned
      if (!caseData.assignedLawyerId) {
        await pool.query('UPDATE cases SET assignedLawyerId = ?, assignedLawyerName = ? WHERE caseId = ?', [userId, name, cleanCaseId]);
        await pool.query('INSERT IGNORE INTO case_officers (caseId, officerId) VALUES (?, ?)', [cleanCaseId, userId]);
        await pool.query('INSERT IGNORE INTO user_cases (userId, caseId) VALUES (?, ?)', [userId, cleanCaseId]);

        await addSecurityLog(userId, cleanCaseId, 'LAWYER_CASE_CLAIMED', 'SUCCESS', `Lawyer ${name} (${userId}) claimed Case ${cleanCaseId}`);
      }
    } else {
      // Check authorization for non-lawyers
      const [userCases]: any = await pool.query('SELECT * FROM user_cases WHERE userId = ? AND caseId = ?', [userId, cleanCaseId]);
      const [caseOfficers]: any = await pool.query('SELECT * FROM case_officers WHERE caseId = ? AND officerId = ?', [cleanCaseId, userId]);

      if (userCases.length === 0 && caseOfficers.length === 0) {
        await addSecurityLog(userId, cleanCaseId, 'UNAUTHORIZED_ACCESS', 'RESTRICTED', `Officer ${userId} attempted unauthorized access to Case ${cleanCaseId}`);
        return res.status(200).json({
          success: false,
          message: `You are not authorized to access Case ${cleanCaseId}.`
        });
      }
    }

    // AUDIT LOG (Event Type 2: View)
    await logAuditEvent({
      user_id: `${userId} - ${name} (${prefix})`,
      action: 'View',
      document_id: cleanCaseId
    });

    await addSecurityLog(userId, cleanCaseId, 'CASE_OPENED', 'SUCCESS', `Opened Case ${cleanCaseId}`);
    return res.json({ success: true, case: await getCaseRecord(cleanCaseId) });
  } catch (err: any) {
    console.error('[CASES OPEN ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

// ADD / CREATE CASE OR JOIN CASE
router.post('/add', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prefix = req.user!.prefix;
    const name = req.user!.name;
    const { caseNumber } = req.body;

    if (!caseNumber) {
      return res.status(400).json({ success: false, message: 'Enter a case number.' });
    }

    const cleanCaseId = String(caseNumber).trim().toUpperCase();

    let targetCase = await getCaseRecord(cleanCaseId);

    if (!targetCase && prefix !== 'PO') {
      return res.status(200).json({
        success: false,
        message: `Case ${cleanCaseId} has not been created by a Police Officer yet.`
      });
    }

    // Forensic Officer restriction
    if (prefix === 'FO' && targetCase && targetCase.status !== 'FORENSIC_REVIEW') {
      return res.status(200).json({
        success: false,
        message: `Case ${cleanCaseId} has not been sent to the Forensic Lab by a Police Officer yet.`
      });
    }

    if (prefix === 'LW' && targetCase) {
      if (targetCase.assignedLawyerId && targetCase.assignedLawyerId !== userId) {
        const lawyerDisplay = targetCase.assignedLawyerName
          ? `${targetCase.assignedLawyerName} (${targetCase.assignedLawyerId})`
          : targetCase.assignedLawyerId;
        return res.status(200).json({
          success: false,
          message: `Case ${cleanCaseId} is currently being handled by Lawyer ${lawyerDisplay}. You cannot view or access this case file.`
        });
      }
    }

    // Create new case if missing (for PO)
    if (!targetCase) {
      await pool.query(
        `INSERT INTO cases (caseId, title, incidentLocation, status, assignedLawyerId, assignedLawyerName)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanCaseId, `Case Investigation File ${cleanCaseId}`, 'Metro Division Precinct', 'OPEN_INVESTIGATION', null, null]
      );

      // AUDIT LOG (Event Type 5: Version creation)
      await logAuditEvent({
        user_id: `${userId} - ${name} (${prefix})`,
        action: 'Version creation',
        document_id: cleanCaseId
      });

      await addSecurityLog(userId, cleanCaseId, 'CASE_CREATED', 'SUCCESS', `Police officer created new Case ${cleanCaseId}`);
    }

    // Update lawyer assignment if applicable
    if (prefix === 'LW') {
      await pool.query('UPDATE cases SET assignedLawyerId = ?, assignedLawyerName = ? WHERE caseId = ?', [userId, name, cleanCaseId]);
    }

    await pool.query('INSERT IGNORE INTO case_officers (caseId, officerId) VALUES (?, ?)', [cleanCaseId, userId]);
    await pool.query('INSERT IGNORE INTO user_cases (userId, caseId) VALUES (?, ?)', [userId, cleanCaseId]);

    await addSecurityLog(userId, cleanCaseId, 'CASE_ADDED_TO_PORTAL', 'SUCCESS', `Officer ${userId} registered Case ${cleanCaseId} in portal`);

    return res.json({
      success: true,
      case: await getCaseRecord(cleanCaseId)
    });
  } catch (err: any) {
    console.error('[CASES ADD ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

// DISPATCH CASE TO FORENSIC LAB (POLICE OFFICER ONLY)
router.post('/:caseId/send-to-forensic', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prefix = req.user!.prefix;
    const cleanCaseId = String(req.params.caseId).trim().toUpperCase();

    if (prefix !== 'PO') {
      return res.status(403).json({ success: false, message: 'Only Police Officers can dispatch cases to the Forensic Lab.' });
    }

    const caseData = await getCaseRecord(cleanCaseId);
    if (!caseData) {
      return res.status(404).json({ success: false, message: `Case ${cleanCaseId} not found.` });
    }

    await pool.query('UPDATE cases SET status = ? WHERE caseId = ?', ['FORENSIC_REVIEW', cleanCaseId]);
    await addSecurityLog(userId, cleanCaseId, 'SENT_TO_FORENSIC', 'SUCCESS', `Police Officer ${userId} sent Case ${cleanCaseId} to Forensic Lab for lab report upload`);

    return res.json({
      success: true,
      message: `Case ${cleanCaseId} has been successfully sent to the Forensic Lab!`,
      case: await getCaseRecord(cleanCaseId)
    });
  } catch (err: any) {
    console.error('[SEND TO FORENSIC ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

// RELINQUISH LAWYER CASE ASSIGNMENT
router.post('/:caseId/relinquish', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prefix = req.user!.prefix;
    const cleanCaseId = String(req.params.caseId).trim().toUpperCase();

    if (prefix !== 'LW') {
      return res.status(200).json({ success: false, message: 'Only lawyers can give up a case assignment.' });
    }

    const targetCase = await getCaseRecord(cleanCaseId);
    if (!targetCase) {
      return res.status(404).json({ success: false, message: `Case ${cleanCaseId} was not found.` });
    }

    if (targetCase.assignedLawyerId !== userId) {
      return res.status(200).json({ success: false, message: `You are not the assigned lawyer for Case ${cleanCaseId}.` });
    }

    await pool.query('UPDATE cases SET assignedLawyerId = NULL, assignedLawyerName = NULL WHERE caseId = ?', [cleanCaseId]);
    await pool.query('DELETE FROM case_officers WHERE caseId = ? AND officerId = ?', [cleanCaseId, userId]);
    await pool.query('DELETE FROM user_cases WHERE userId = ? AND caseId = ?', [userId, cleanCaseId]);

    await addSecurityLog(userId, cleanCaseId, 'CASE_RELINQUISHED', 'SUCCESS', `Lawyer ${userId} gave up assignment for Case ${cleanCaseId}`);

    return res.json({
      success: true,
      message: `You have given up Case ${cleanCaseId}. It is now available for other lawyers.`
    });
  } catch (err: any) {
    console.error('[CASES RELINQUISH ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

export default router;
