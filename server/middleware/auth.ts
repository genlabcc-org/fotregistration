import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('[SECURITY FATAL] JWT_SECRET environment variable is missing or empty. Server cannot sign or verify tokens securely.');
  }
  return secret;
}

// In-memory token revocation blacklist for explicit logout invalidation
interface RevokedTokenEntry {
  revokedAt: number;
  expiresAt: number;
}

const revokedTokens = new Map<string, RevokedTokenEntry>();

// Prune expired entries from the revocation store every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, record] of revokedTokens.entries()) {
    if (now > record.expiresAt) {
      revokedTokens.delete(token);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Explicitly revokes a JWT token upon logout
 */
export function revokeToken(token: string): void {
  if (!token) return;
  try {
    const secret = getJwtSecret();
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const now = Date.now();
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : now + 24 * 60 * 60 * 1000;
    revokedTokens.set(token, { revokedAt: now, expiresAt });
  } catch {
    // If decoding fails, still record standard 24h retention
    revokedTokens.set(token, { revokedAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  }
}

/**
 * Checks if a token has been explicitly invalidated upon logout
 */
export function isTokenRevoked(token: string): boolean {
  if (!token) return true;
  return revokedTokens.has(token);
}

export interface AuthenticatedRequest extends Request {
  admin?: {
    id: number;
    email: string;
  };
}

export interface AuthenticatedUserRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.fot_admin_token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized. Admin session token missing.' });
    return;
  }

  if (isTokenRevoked(token)) {
    res.status(401).json({ error: 'Session invalidated. Please sign in again.' });
    return;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { id: number; email: string; role?: string };

    // Zero-Trust: Strictly verify administrator role claim
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden. Administrator privileges required.' });
      return;
    }

    req.admin = { id: decoded.id, email: decoded.email };
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('[SECURITY FATAL]')) {
      res.status(500).json({ error: 'Server authentication configuration error.' });
      return;
    }
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

export function requireUser(req: AuthenticatedUserRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.fot_user_token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  if (isTokenRevoked(token)) {
    res.status(401).json({ error: 'Session invalidated. Please sign in again.' });
    return;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { id: string; email: string; name: string; role?: string };

    // Zero-Trust: Strictly verify user or admin account
    if (decoded.role !== 'user' && decoded.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden. User account required.' });
      return;
    }

    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('[SECURITY FATAL]')) {
      res.status(500).json({ error: 'Server authentication configuration error.' });
      return;
    }
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

// Strict JWT Token generation with < 24h expiration limit (12 hours)
export function signAdminToken(admin: { id: number; email: string }): string {
  return jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, getJwtSecret(), { expiresIn: '12h' });
}

export function signUserToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'user' }, getJwtSecret(), { expiresIn: '12h' });
}
