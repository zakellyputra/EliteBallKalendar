import { Router, Response } from 'express';
import crypto from 'crypto';
import { getAuthUrl, getTokensFromCode } from '../lib/auth';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';

const router = Router();

// Initiate Google Calendar OAuth for connected calendar
router.post('/google/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ userId, nonce })).toString('base64url');

    await firestore.collection('users').doc(userId).set({
      calendarConnectNonce: nonce,
      calendarConnectRequestedAt: new Date().toISOString(),
    }, { merge: true });

    const authUrl = getAuthUrl(state);
    res.json({ url: authUrl });
  } catch (err: any) {
    console.error('Error starting calendar OAuth:', err);
    res.status(500).json({ error: err.message || 'Failed to start calendar OAuth' });
  }
});

// Google OAuth callback for calendar connect
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.redirect('/?error=oauth_error');
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.redirect('/?error=missing_code');
  }

  try {
    const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as {
      userId: string;
      nonce: string;
    };

    if (!decodedState?.userId || !decodedState?.nonce) {
      throw new Error('Invalid OAuth state');
    }

    const userDoc = await firestore.collection('users').doc(decodedState.userId).get();
    const userData = userDoc.data();
    if (!userData || userData.calendarConnectNonce !== decodedState.nonce) {
      throw new Error('OAuth state mismatch');
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    await firestore.collection('users').doc(decodedState.userId).set({
      calendarAccessToken: tokens.access_token,
      calendarRefreshToken: tokens.refresh_token || null,
      calendarTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      calendarConnectedAt: new Date().toISOString(),
      calendarConnectNonce: null,
    }, { merge: true });

    res.redirect('http://localhost:3000/?calendar=connected');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=auth_failed');
  }
});

export default router;
