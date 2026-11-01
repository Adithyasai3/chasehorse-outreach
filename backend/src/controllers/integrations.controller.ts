import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getEnrichoStatus } from '../lib/enricho';
import { config } from '../config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function getIntegrationsStatus(req: Request, res: Response) {
  try {
    const enrichoStatus = await getEnrichoStatus();

    const gmailAccount = await prisma.gmailAccount.findFirst({
      where: { isActive: true },
      select: { email: true, lastSyncAt: true, syncStatus: true, lastErrorMessage: true },
    });

    const aiUsage = await prisma.aIUsageLog.aggregate({
      _sum: { totalTokens: true },
      _count: { id: true },
    });

    return res.json({
      enricho: {
        ...enrichoStatus,
        hasApiKey: Boolean(config.enricho.apiKey),
      },
      gemini: {
        isConnected: Boolean(config.gemini.apiKey),
        model: config.gemini.model,
        totalCalls: aiUsage._count.id,
        totalTokens: aiUsage._sum.totalTokens || 0,
        hasApiKey: Boolean(config.gemini.apiKey),
      },
      gmail: {
        isConnected: Boolean(gmailAccount),
        connectedEmail: gmailAccount?.email || null,
        lastSyncAt: gmailAccount?.lastSyncAt || null,
        syncStatus: gmailAccount?.syncStatus || 'IDLE',
        hasClientId: Boolean(config.gmail.clientId),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function testGemini(req: Request, res: Response) {
  try {
    const apiKey = req.body.apiKey || config.gemini.apiKey;
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Gemini API key is required' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: config.gemini.model || 'gemini-2.5-flash' });
    const result = await model.generateContent('Respond with "ChaseHorse Gemini AI connection verified" in JSON: {"status": "ok"}');
    const text = result.response.text();

    return res.json({ success: true, response: text });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function testEnricho(req: Request, res: Response) {
  try {
    const status = await getEnrichoStatus();
    return res.json({ success: status.isConnected, status });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
