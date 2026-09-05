import { Router } from 'express';
import { pool, logAuditEvent } from '../db.js';
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET SECURITY LOGS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [logs]: any = await pool.query('SELECT * FROM security_logs ORDER BY id DESC LIMIT 100');
    return res.json(logs);
  } catch (err: any) {
    console.error('[LOGS GET ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
});

// GET AUDIT LOGS (Section 2.10)
router.get('/audit-logs', authenticateToken, async (req, res) => {
  try {
    const [logs]: any = await pool.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200');
    return res.json(logs);
  } catch (err: any) {
    console.error('[AUDIT LOGS GET ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
});

// RECORD CLIENT AUDIT LOG EVENT
router.post('/audit-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'UNKNOWN';
    const name = req.user?.name || 'Officer';
    const prefix = req.user?.prefix || 'PO';
    const { action, document_id, case_id } = req.body;

    if (!action) {
      return res.status(400).json({ message: 'Action is required.' });
    }

    const formattedUserId = `${userId} - ${name} (${prefix})`;
    await logAuditEvent({
      user_id: formattedUserId,
      action,
      document_id,
      case_id
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[POST AUDIT LOG ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
});

export default router;
