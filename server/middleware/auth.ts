import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../lib/firebase-admin';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const idToken = authHeader.slice('Bearer '.length);
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    req.userId = decoded.uid;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice('Bearer '.length);
      const decoded = await firebaseAuth.verifyIdToken(idToken);
      req.userId = decoded.uid;
    }
  } catch (err) {
    req.userId = undefined;
  }

  next();
}
