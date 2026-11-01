import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export async function getDashboardAnalytics(req: Request, res: Response) {
  try {
    const [
      totalCompanies,
      totalEnrichedCompanies,
      totalQualifiedLeads,
      totalContacts,
      totalVerifiedEmails,
      totalDrafts,
      totalSentEmails,
      totalReplies,
      positiveReplies,
      stagesWithCount,
      enrichmentLogs,
      aiLogs,
      pendingFollowUps,
      companiesByIndustry,
      companiesByCity,
    ] = await Promise.all([
      prisma.company.count({ where: { isArchived: false } }),
      prisma.company.count({ where: { isArchived: false, research: { isNot: null } } }),
      prisma.company.count({ where: { isArchived: false, leadScore: { gte: 70 } } }),
      prisma.contact.count(),
      prisma.contact.count({ where: { isEmailVerified: true } }),
      prisma.emailDraft.count(),
      prisma.emailMessage.count({ where: { direction: 'OUTBOUND' } }),
      prisma.emailMessage.count({ where: { direction: 'INBOUND' } }),
      prisma.emailMessage.count({ where: { direction: 'INBOUND', sentiment: 'POSITIVE' } }),
      prisma.kanbanStage.findMany({
        orderBy: { order: 'asc' },
        include: {
          _count: { select: { companies: { where: { isArchived: false } } } },
        },
      }),
      prisma.enrichmentLog.aggregate({ _sum: { creditsConsumed: true } }),
      prisma.aIUsageLog.aggregate({
        _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
      }),
      prisma.followUp.count({ where: { status: 'PENDING' } }),
      prisma.company.groupBy({
        by: ['industry'],
        where: { isArchived: false, industry: { not: null } },
        _count: { id: true },
      }),
      prisma.company.groupBy({
        by: ['city'],
        where: { isArchived: false, city: { not: null } },
        _count: { id: true },
      }),
    ]);

    // Conversion rates
    const replyRate = totalSentEmails > 0 ? Math.round((totalReplies / totalSentEmails) * 100) : 0;
    const positiveResponseRate = totalReplies > 0 ? Math.round((positiveReplies / totalReplies) * 100) : 0;

    // Funnel
    const funnel = stagesWithCount.map((s) => ({
      stageName: s.name,
      stageKey: s.key,
      color: s.color,
      count: s._count.companies,
    }));

    // Find meetings and converted
    const meetingsScheduled = stagesWithCount.find((s) => s.key === 'meeting_scheduled')?._count.companies || 0;
    const convertedCustomers = stagesWithCount.find((s) => s.key === 'converted')?._count.companies || 0;

    return res.json({
      metrics: {
        totalCompanies,
        totalEnrichedCompanies,
        totalQualifiedLeads,
        totalContacts,
        totalVerifiedEmails,
        totalDrafts,
        totalSentEmails,
        totalReplies,
        positiveReplies,
        meetingsScheduled,
        convertedCustomers,
        pendingFollowUps,
        replyRate,
        positiveResponseRate,
        enrichmentCreditsConsumed: enrichmentLogs._sum.creditsConsumed || 0,
        geminiTotalTokens: aiLogs._sum.totalTokens || 0,
      },
      funnel,
      industryDistribution: companiesByIndustry.map((i) => ({
        industry: i.industry || 'Other',
        count: i._count.id,
      })),
      geographyDistribution: companiesByCity.map((c) => ({
        city: c.city || 'Other',
        count: c._count.id,
      })),
    });
  } catch (err: any) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: err.message });
  }
}
