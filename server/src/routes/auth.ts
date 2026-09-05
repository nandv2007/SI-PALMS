import { Router } from 'express';
import { pool, addSecurityLog } from '../db.js';
import { generateToken, authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { officerId, password } = req.body;

    if (!officerId) {
      return res.status(400).json({ status: 'INVALID_INPUT', message: 'Officer ID is required.' });
    }

    const cleanId = String(officerId).trim().toUpperCase();
    const cleanPass = String(password || '').trim();

    const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [cleanId]);
    const user = rows[0];

    if (!user) {
      return res.status(200).json({
        status: 'NEW_OFFICER_REGISTRATION_REQUIRED',
        message: `Officer ID "${cleanId}" is not registered in SI-PALMS. Please create an officer account below.`
      });
    }

    if (user.password !== cleanPass) {
      await addSecurityLog(cleanId, 'SYSTEM', 'LOGIN_ATTEMPT', 'WARNING', 'Failed login attempt - Incorrect password');
      return res.status(200).json({
        status: 'INVALID_PASSWORD',
        message: `Incorrect password for Officer ID "${cleanId}".`
      });
    }

    // Fetch assigned case IDs
    const [caseRows]: any = await pool.query('SELECT caseId FROM user_cases WHERE userId = ?', [cleanId]);
    const assignedCaseIds = caseRows.map((r: any) => r.caseId);

    const token = generateToken({
      id: user.id,
      role: user.role,
      prefix: user.prefix,
      name: user.name
    });

    await addSecurityLog(cleanId, 'SYSTEM', 'LOGIN_SUCCESS', 'SUCCESS', `Officer ${user.name} signed into workstation`);

    const { password: _, ...userWithoutPass } = user;

    return res.json({
      status: 'SUCCESS',
      token,
      user: {
        ...userWithoutPass,
        assignedCaseIds
      }
    });
  } catch (err: any) {
    console.error('[AUTH LOGIN ERROR]', err);
    return res.status(500).json({ status: 'ERROR', message: err.message || 'Server error during login.' });
  }
});

// REGISTER NEW OFFICER ACCOUNT
router.post('/register', async (req, res) => {
  try {
    const { id, password, name, rankTitle, role, department, station } = req.body;

    if (!id || !password || !name || !role) {
      return res.status(400).json({ message: 'Missing required fields for officer registration.' });
    }

    const cleanId = String(id).trim().toUpperCase();

    const rolePrefixMap: Record<string, string> = {
      POLICE_OFFICER: 'PO',
      INVESTIGATOR: 'IN',
      FORENSIC_OFFICER: 'FO',
      LAWYER: 'LW'
    };

    const prefix = rolePrefixMap[role] || 'PO';

    const roleClearanceMap: Record<string, string> = {
      PO: 'Level 1 - Case Details & Evidence Upload Access',
      IN: 'Level 2 - Case Evidence & Relational Intelligence',
      FO: 'Level 3 - Forensic Lab Report Upload',
      LW: 'Level 4 - Read-Only Court Evidence Disclosure Vault'
    };

    const clearance = roleClearanceMap[prefix] || 'Level 1';
    const badgeNumber = `${prefix}-REG-${Math.floor(1000 + Math.random() * 9000)}`;

    const [existingRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [cleanId]);
    if (existingRows.length > 0) {
      return res.status(400).json({ message: `Officer ID "${cleanId}" is already registered.` });
    }

    await pool.query(
      `INSERT INTO users (id, password, name, rankTitle, role, prefix, department, station, badgeNumber, clearance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanId,
        password,
        name,
        rankTitle || 'Officer',
        role,
        prefix,
        department || 'Precinct',
        station || 'Station Headquarters',
        badgeNumber,
        clearance
      ]
    );

    await addSecurityLog(cleanId, 'SYSTEM', 'OFFICER_REGISTRATION', 'SUCCESS', `New officer account created for ${name} (${role})`);

    const token = generateToken({ id: cleanId, role, prefix, name });

    return res.json({
      status: 'SUCCESS',
      token,
      user: {
        id: cleanId,
        password,
        name,
        rankTitle: rankTitle || 'Officer',
        role,
        prefix,
        department: department || 'Precinct',
        station: station || 'Station Headquarters',
        badgeNumber,
        clearance,
        assignedCaseIds: []
      }
    });
  } catch (err: any) {
    console.error('[AUTH REGISTER ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error during registration.' });
  }
});

// GET CURRENT USER PROFILE
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const [userRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    const [caseRows]: any = await pool.query('SELECT caseId FROM user_cases WHERE userId = ?', [userId]);
    const assignedCaseIds = caseRows.map((r: any) => r.caseId);

    const { password: _, ...userWithoutPass } = user;

    return res.json({
      user: {
        ...userWithoutPass,
        assignedCaseIds
      }
    });
  } catch (err: any) {
    console.error('[AUTH ME ERROR]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
});

export default router;
