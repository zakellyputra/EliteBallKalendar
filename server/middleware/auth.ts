import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';

// In-memory session store (in production, use Redis or database)
const sessions = new Map<string, string>(); // sessionToken -> userId

export function setSession(sessionToken: string, userId: string): void {
  sessions.set(sessionToken, userId);
}

export function getSession(sessionToken: string): string | undefined {
  return sessions.get(sessionToken);
}

export function deleteSession(sessionToken: string): void {
  sessions.delete(sessionToken);
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = req.cookies?.session;
  
  if (!sessionToken) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const userId = getSession(sessionToken);
  
  if (!userId) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    deleteSession(sessionToken);
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.userId = userId;
  next();
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = req.cookies?.session;
  
  if (sessionToken) {
    const userId = getSession(sessionToken);
    if (userId) {
      req.userId = userId;
    }
  }

  next();
}
