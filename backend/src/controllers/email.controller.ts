import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generatePersonalizedEmail, classifyIncomingReply } from '../lib/gemini';
import { sendEmail, syncGmailReplies } from '../lib/gmail';

export async function generateDraft(req: Request, res: Response) {
  try {
    const { companyId, contactId, serviceId, outreachStyle = 'DIRECT_INTRO' } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        contacts: true,
        research: true,
        serviceMatches: { include: { service: true } },
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Select contact
    const targetContact = contactId
      ? company.contacts.find((c) => c.id === contactId)
      : company.contacts.find((c) => c.isPrimary) || company.contacts[0];

    if (!targetContact) {
      return res.status(400).json({ error: 'No contact found for this company. Please add or enrich contacts first.' });
    }

    // Select service
    let targetService = serviceId
      ? await prisma.service.findUnique({ where: { id: serviceId } })
      : null;

    if (!targetService) {
      const topMatch = company.serviceMatches[0];
      targetService = topMatch ? topMatch.service : await prisma.service.findFirst({ where: { isActive: true } });
    }

    if (!targetService) {
      return res.status(400).json({ error: 'No active ChaseHorse service available. Please configure services first.' });
    }

    const matchEntry = company.serviceMatches.find((m) => m.serviceId === targetService?.id);

    // Call Gemini AI
    const draftContent = await generatePersonalizedEmail({
      company: { name: company.name, industry: company.industry, city: company.city },
      contact: { fullName: targetContact.fullName, firstName: targetContact.firstName, title: targetContact.title },
      service: {
        name: targetService.name,
        valueProposition: targetService.valueProposition,
        caseStudies: targetService.caseStudies,
      },
      matchReason: matchEntry?.whyRelevant,
      outreachStyle,
    });

    // Save as draft in DB
    const draft = await prisma.emailDraft.create({
      data: {
        companyId: company.id,
        contactId: targetContact.id,
        serviceId: targetService.id,
        outreachStyle,
        subject: draftContent.subject,
        bodyText: draftContent.bodyText,
        bodyHtml: draftContent.bodyHtml,
        personalizationEvidence: draftContent.personalizationEvidence,
        status: 'DRAFT',
        isApproved: false,
        generatedByAi: true,
      },
      include: {
        company: true,
        contact: true,
        service: true,
      },
    });

    return res.status(201).json({ draft });
  } catch (err: any) {
    console.error('Email generation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate email draft' });
  }
}

export async function listDrafts(req: Request, res: Response) {
  try {
    const { companyId } = req.query;
    const where: any = {};
    if (companyId && typeof companyId === 'string') where.companyId = companyId;

    const drafts = await prisma.emailDraft.findMany({
      where,
      include: { contact: true, service: true, company: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ drafts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateDraft(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { subject, bodyText, bodyHtml, isApproved, status } = req.body;

    const draft = await prisma.emailDraft.update({
      where: { id },
      data: {
        subject,
        bodyText,
        bodyHtml,
        isApproved,
        status,
      },
    });

    return res.json({ draft });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function executeSendEmail(req: Request, res: Response) {
  try {
    const { draftId, companyId, contactId, toEmail, subject, bodyText, bodyHtml } = req.body;

    let targetTo = toEmail;
    let targetSubject = subject;
    let targetText = bodyText;
    let targetHtml = bodyHtml;
    let targetCompId = companyId;
    let targetContId = contactId;

    if (draftId) {
      const draft = await prisma.emailDraft.findUnique({
        where: { id: draftId },
        include: { contact: true },
      });
      if (!draft) return res.status(404).json({ error: 'Draft not found' });
      targetTo = targetTo || draft.contact?.email;
      targetSubject = targetSubject || draft.subject;
      targetText = targetText || draft.bodyText;
      targetHtml = targetHtml || draft.bodyHtml;
      targetCompId = targetCompId || draft.companyId;
      targetContId = targetContId || draft.contactId;
    }

    if (!targetTo) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const message = await sendEmail({
      companyId: targetCompId,
      contactId: targetContId,
      toEmail: targetTo,
      subject: targetSubject,
      bodyText: targetText,
      bodyHtml: targetHtml,
      draftId,
    });

    return res.json({ success: true, message });
  } catch (err: any) {
    console.error('Send email error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listEmailThreads(req: Request, res: Response) {
  try {
    const threads = await prisma.emailThread.findMany({
      include: {
        company: true,
        contact: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return res.json({ threads });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function triggerSync(req: Request, res: Response) {
  try {
    const result = await syncGmailReplies();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function simulateIncomingReply(req: Request, res: Response) {
  try {
    const { companyId, contactId, incomingText, subject } = req.body;
    if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { contacts: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const contact = contactId
      ? company.contacts.find((c) => c.id === contactId)
      : company.contacts[0];

    const senderEmail = contact?.email || `contact@${company.domain || 'example.com'}`;
    const senderName = contact?.fullName || 'Decision Maker';

    // AI classify reply
    const classification = await classifyIncomingReply({
      incomingBody: incomingText || 'Thanks for reaching out! We are definitely interested in exploring your warehousing and FTL solutions for our regional operations. Can you send over a proposal or rate card?',
      senderName,
      senderEmail,
      companyName: company.name,
    });

    // Create EmailThread
    const thread = await prisma.emailThread.create({
      data: {
        gmailThreadId: `sim_reply_th_${Date.now()}`,
        subject: subject || `Re: Exploring ChaseHorse Logistics for ${company.name}`,
        companyId: company.id,
        contactId: contact?.id,
        hasReplies: true,
        messagesCount: 1,
        status: 'ACTIVE',
        messages: {
          create: {
            gmailMessageId: `sim_reply_msg_${Date.now()}`,
            direction: 'INBOUND',
            fromEmail: senderEmail,
            toEmail: 'outreach@chasehorse.com',
            subject: subject || `Re: Exploring ChaseHorse Logistics for ${company.name}`,
            bodyText: incomingText || 'Thanks for reaching out! We are definitely interested in exploring your warehousing and FTL solutions for our regional operations. Can you send over a proposal or rate card?',
            snippet: (incomingText || 'Thanks for reaching out! We are definitely interested...').substring(0, 100),
            receivedAt: new Date(),
            companyId: company.id,
            contactId: contact?.id,
            sentiment: classification.sentiment,
            intent: classification.intent,
            suggestedReply: classification.suggestedReply,
          },
        },
      },
      include: { messages: true },
    });

    // Update company Kanban stage to 'Replied'
    const repliedStage = await prisma.kanbanStage.findUnique({ where: { key: 'replied' } });
    if (repliedStage) {
      await prisma.company.update({
        where: { id: company.id },
        data: { kanbanStageId: repliedStage.id },
      });
    }

    // Log activity
    await prisma.leadActivity.create({
      data: {
        companyId: company.id,
        contactId: contact?.id,
        type: 'EMAIL_RECEIVED',
        title: `Simulated Reply Received from ${senderName}`,
        description: `Sentiment: ${classification.sentiment}. Intent: ${classification.intent}`,
      },
    });

    return res.json({ success: true, thread, classification });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
