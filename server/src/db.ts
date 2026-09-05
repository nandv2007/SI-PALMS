import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { blockchainEngine } from './blockchain.js';

dotenv.config();

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'sipalms_db';

export let pool: mysql.Pool;

export async function initDatabase() {
  try {
    // 1. Create database if it doesn't exist using root connection
    const rootConn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;`);
    await rootConn.end();

    // 2. Initialize MySQL Pool
    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log(`[DB] Connected to MySQL database "${MYSQL_DATABASE}" at ${MYSQL_HOST}:${MYSQL_PORT}`);

    // 3. Create Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        rankTitle VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        prefix VARCHAR(10) NOT NULL,
        department VARCHAR(255) NOT NULL,
        station VARCHAR(255) NOT NULL,
        badgeNumber VARCHAR(100) NOT NULL,
        clearance VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        caseId VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        incidentLocation VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        assignedLawyerId VARCHAR(50) DEFAULT NULL,
        assignedLawyerName VARCHAR(255) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS case_officers (
        caseId VARCHAR(50) NOT NULL,
        officerId VARCHAR(50) NOT NULL,
        PRIMARY KEY (caseId, officerId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_cases (
        userId VARCHAR(50) NOT NULL,
        caseId VARCHAR(50) NOT NULL,
        PRIMARY KEY (userId, caseId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        fileId VARCHAR(50) PRIMARY KEY,
        caseId VARCHAR(50) NOT NULL,
        fileName VARCHAR(255) NOT NULL,
        fileSize VARCHAR(50),
        fileType VARCHAR(100),
        storagePath VARCHAR(255),
        uploadedByOfficerId VARCHAR(50) NOT NULL,
        uploadedByOfficerName VARCHAR(255) NOT NULL,
        uploadedByRole VARCHAR(50) NOT NULL,
        uploadTime VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        sha256Hash VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        txHash VARCHAR(66) DEFAULT NULL,
        blockNumber INT DEFAULT NULL,
        digitalSignature TEXT DEFAULT NULL,
        signerPublicKey TEXT DEFAULT NULL,
        version VARCHAR(20) DEFAULT 'v1.0',
        versionNumber DECIMAL(3,1) DEFAULT 1.0,
        parentFileId VARCHAR(50) DEFAULT NULL,
        changeSummary TEXT DEFAULT NULL,
        isLatestVersion BOOLEAN DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure columns exist on pre-existing tables
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN txHash VARCHAR(66) DEFAULT NULL;'); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN blockNumber INT DEFAULT NULL;'); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN digitalSignature TEXT DEFAULT NULL;'); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN signerPublicKey TEXT DEFAULT NULL;'); } catch {}
    try { await pool.query("ALTER TABLE uploaded_files ADD COLUMN version VARCHAR(20) DEFAULT 'v1.0';"); } catch {}
    try { await pool.query("ALTER TABLE uploaded_files ADD COLUMN versionNumber DECIMAL(3,1) DEFAULT 1.0;"); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN parentFileId VARCHAR(50) DEFAULT NULL;'); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN changeSummary TEXT DEFAULT NULL;'); } catch {}
    try { await pool.query('ALTER TABLE uploaded_files ADD COLUMN isLatestVersion BOOLEAN DEFAULT TRUE;'); } catch {}
    try { await pool.query('ALTER TABLE audit_logs ADD COLUMN case_id VARCHAR(50) DEFAULT NULL;'); } catch {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id VARCHAR(50) PRIMARY KEY,
        timestamp VARCHAR(100) NOT NULL,
        officerId VARCHAR(50) NOT NULL,
        caseId VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        details TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        document_id VARCHAR(100) DEFAULT NULL,
        case_id VARCHAR(50) DEFAULT NULL,
        timestamp VARCHAR(100) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blockchain_ledger (
        txHash VARCHAR(66) PRIMARY KEY,
        blockNumber INT NOT NULL,
        blockHash VARCHAR(66) NOT NULL,
        caseId VARCHAR(50) NOT NULL,
        docId VARCHAR(50) NOT NULL,
        sha256Hash VARCHAR(64) NOT NULL,
        uploadedBy VARCHAR(255) NOT NULL,
        timestamp VARCHAR(100) NOT NULL,
        gasUsed INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        signerAddress VARCHAR(66) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await seedInitialData();
  } catch (error) {
    console.error('[DB ERROR] MySQL initialization failed:', error);
    throw error;
  }
}

async function seedInitialData() {
  const [userRows]: any = await pool.query('SELECT COUNT(*) as count FROM users');
  const userCount = userRows[0]?.count || 0;

  if (userCount === 0) {
    console.log('[DB] Seeding initial MySQL users...');
    const initialUsers = [
      {
        id: 'PO-1042',
        password: 'police1042',
        name: 'Inspector Rajesh Kumar',
        rankTitle: 'Station Officer & Case Registrar',
        role: 'POLICE_OFFICER',
        prefix: 'PO',
        department: 'Armoury & Case Operations',
        station: 'Central Precinct No. 4',
        badgeNumber: 'PO-IND-8821',
        clearance: 'Level 1 - Case Details Upload',
        assignedCaseIds: ['CASE-102', 'CASE-104']
      },
      {
        id: 'PO-2055',
        password: 'police2055',
        name: 'Officer Suresh Verma',
        rankTitle: 'Commercial Crime Officer',
        role: 'POLICE_OFFICER',
        prefix: 'PO',
        department: 'Financial Crime Taskforce',
        station: 'Metro Division #02',
        badgeNumber: 'PO-IND-2055',
        clearance: 'Level 1 - Case Details Upload',
        assignedCaseIds: ['CASE-103']
      },
      {
        id: 'IN-8805',
        password: 'invest8805',
        name: 'Senior Det. Anita Sharma',
        rankTitle: 'Lead Case Investigator',
        role: 'INVESTIGATOR',
        prefix: 'IN',
        department: 'Special Crime Branch',
        station: 'District HQ Command',
        badgeNumber: 'IN-IND-3042',
        clearance: 'Level 2 - Case Evidence Intelligence',
        assignedCaseIds: ['CASE-102', 'CASE-103', 'CASE-104']
      },
      {
        id: 'FO-4091',
        password: 'forensic4091',
        name: 'Dr. Vikramaditya Roy',
        rankTitle: 'Chief Forensic Specialist',
        role: 'FORENSIC_OFFICER',
        prefix: 'FO',
        department: 'Digital & Ballistics Forensic Lab',
        station: 'State Crime Lab Annex',
        badgeNumber: 'FO-IND-9102',
        clearance: 'Level 3 - Forensic Lab Upload',
        assignedCaseIds: ['CASE-102', 'CASE-103']
      },
      {
        id: 'LW-9120',
        password: 'lawyer9120',
        name: 'Advocate Meera Deshmukh',
        rankTitle: 'Public Prosecutor',
        role: 'LAWYER',
        prefix: 'LW',
        department: 'State Legal Cell',
        station: 'High Court Directorate',
        badgeNumber: 'LW-IND-5011',
        clearance: 'Level 4 - Read-Only Court Vault',
        assignedCaseIds: ['CASE-102', 'CASE-103', 'CASE-104']
      }
    ];

    for (const u of initialUsers) {
      await pool.query(
        `INSERT INTO users (id, password, name, rankTitle, role, prefix, department, station, badgeNumber, clearance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.password, u.name, u.rankTitle, u.role, u.prefix, u.department, u.station, u.badgeNumber, u.clearance]
      );

      for (const caseId of u.assignedCaseIds) {
        await pool.query('INSERT IGNORE INTO user_cases (userId, caseId) VALUES (?, ?)', [u.id, caseId]);
      }
    }
  }

  const [caseRows]: any = await pool.query('SELECT COUNT(*) as count FROM cases');
  const caseCount = caseRows[0]?.count || 0;

  if (caseCount === 0) {
    console.log('[DB] Seeding initial MySQL cases...');
    const initialCases = [
      {
        caseId: 'CASE-102',
        title: 'State vs. Sector 14 High-Value Robbery Incident',
        incidentLocation: 'Sector 14 Financial Quarter',
        status: 'OPEN_INVESTIGATION',
        assignedOfficerIds: ['PO-1042', 'IN-8805', 'FO-4091', 'LW-9120'],
        assignedLawyerId: 'LW-9120',
        assignedLawyerName: 'Advocate Meera Deshmukh'
      },
      {
        caseId: 'CASE-103',
        title: 'Downtown Commercial Financial Fraud',
        incidentLocation: 'Metro Bank Tower #02',
        status: 'FORENSIC_REVIEW',
        assignedOfficerIds: ['PO-2055', 'IN-8805', 'FO-4091'],
        assignedLawyerId: null,
        assignedLawyerName: null
      },
      {
        caseId: 'CASE-104',
        title: 'High-Tech Cyber Intrusion & Ransomware',
        incidentLocation: 'State Server Data Center',
        status: 'OPEN_INVESTIGATION',
        assignedOfficerIds: ['PO-1042', 'IN-8805'],
        assignedLawyerId: null,
        assignedLawyerName: null
      }
    ];

    for (const c of initialCases) {
      await pool.query(
        `INSERT INTO cases (caseId, title, incidentLocation, status, assignedLawyerId, assignedLawyerName)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [c.caseId, c.title, c.incidentLocation, c.status, c.assignedLawyerId, c.assignedLawyerName]
      );

      for (const offId of c.assignedOfficerIds) {
        await pool.query('INSERT IGNORE INTO case_officers (caseId, officerId) VALUES (?, ?)', [c.caseId, offId]);
      }
    }
  }
}

export async function addSecurityLog(officerId: string, caseId: string, action: string, status: 'SUCCESS' | 'RESTRICTED' | 'WARNING', details: string) {
  try {
    const id = `LOG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toLocaleString() + ' IST';
    await pool.query(
      `INSERT INTO security_logs (id, timestamp, officerId, caseId, action, status, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, timestamp, officerId, caseId, action, status, details]
    );
  } catch (err) {
    console.error('[DB LOG ERROR]', err);
  }
}

export async function logAuditEvent(params: { user_id: string; action: string; document_id?: string | null; case_id?: string | null }) {
  try {
    const timestamp = new Date().toLocaleString() + ' IST';
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, document_id, case_id, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [params.user_id, params.action, params.document_id || null, params.case_id || null, timestamp]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err);
  }
}
