import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sipalms-secret-key-2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    prefix: string;
    name: string;
  };
}

export function generateToken(user: { id: string; role: string; prefix: string; name: string }) {
  return jwt.sign(
    { id: user.id, role: user.role, prefix: user.prefix, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = decoded as AuthenticatedRequest['user'];
    next();
  });
}
