import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateAuthUrl, handleOAuthCallback } from '../lib/gmail';

export async function getAuthUrl(req: Request, res: Response) {
  try {
    const url = generateAuthUrl();
    return res.json({ url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function oauthCallback(req: Request, res: Response) {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).send('Authorization code missing');
    }

    const account = await handleOAuthCallback(code);
    // Redirect to frontend Integrations page with success status
    return res.redirect(`http://localhost:3000/integrations?gmail_connected=true&email=${encodeURIComponent(account.email)}`);
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return res.redirect(`http://localhost:3000/integrations?error=${encodeURIComponent(err.message)}`);
  }
}

export async function getGmailStatus(req: Request, res: Response) {
  try {
    const account = await prisma.gmailAccount.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        isActive: true,
        lastSyncAt: true,
        syncStatus: true,
        lastErrorMessage: true,
        scopes: true,
      },
    });

    return res.json({
      isConnected: Boolean(account),
      account: account || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function disconnectGmail(req: Request, res: Response) {
  try {
    await prisma.gmailAccount.updateMany({
      data: { isActive: false },
    });

    await prisma.integration.updateMany({
      where: { provider: 'GMAIL' },
      data: { status: 'DISCONNECTED', config: { connectedEmail: null } },
    });

    return res.json({ success: true, message: 'Gmail disconnected successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
