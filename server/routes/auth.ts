import { Router, Response } from 'express';
import { prisma } from '../index';
import { getAuthUrl, getTokensFromCode, getUserInfo, generateSessionToken } from '../lib/auth';
import { setSession, deleteSession, getSession, AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

// Initiate Google OAuth
router.get('/google', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.redirect('/?error=oauth_error');
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/?error=missing_code');
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Get user info
    const userInfo = await getUserInfo(tokens.access_token);
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { email: userInfo.email },
      update: {
        name: userInfo.name,
        image: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        email: userInfo.email,
        name: userInfo.name,
        image: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // Create session
    const sessionToken = generateSessionToken();
    setSession(sessionToken, user.id);

    // Set session cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to app
    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=auth_failed');
  }
});

// Get current user
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const sessionToken = req.cookies?.session;
  
  if (!sessionToken) {
    return res.json({ user: null });
  }

  const userId = getSession(sessionToken);
  
  if (!userId) {
    return res.json({ user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      createdAt: true,
    },
  });

  res.json({ user });
});

// Logout
router.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  const sessionToken = req.cookies?.session;
  
  if (sessionToken) {
    deleteSession(sessionToken);
  }

  res.clearCookie('session');
  res.json({ success: true });
});

export default router;
