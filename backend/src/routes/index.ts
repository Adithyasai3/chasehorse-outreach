import { Router } from 'express';
import * as authC from '../controllers/auth.controller';
import * as crm from '../controllers/crm.controller';
import * as integ from '../controllers/integrations.controller';
import * as out from '../controllers/outreach.controller';
import { prisma } from '../lib/prisma';
import { redisReady } from '../lib/redis';
import { requireAuth } from '../middleware/auth';
import { ah, rateLimit } from '../middleware/common';

const r = Router();

// --- Public ---------------------------------------------------------------------------
r.get('/health', ah(async (_req, res) => {
  let db = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', database: db, redis: redisReady() ? 'ok' : 'unavailable', time: new Date().toISOString() });
}));

const authLimiter = rateLimit({ name: 'auth', windowSeconds: 15 * 60, max: 20 });
r.post('/auth/register', authLimiter, ah(authC.register));
r.post('/auth/login', authLimiter, ah(authC.login));
r.post('/auth/logout', ah(authC.logout));

// --- Authenticated ---------------------------------------------------------------------
r.use(requireAuth);
r.use(rateLimit({ name: 'api', windowSeconds: 60, max: 300, by: 'user' }));
const providerLimiter = rateLimit({ name: 'provider', windowSeconds: 60, max: 30, by: 'user' });

r.get('/auth/me', ah(authC.me));
r.patch('/auth/profile', ah(authC.updateProfile));
r.post('/auth/password', ah(authC.changePassword));

// Integrations
r.get('/integrations', ah(integ.status));
r.put('/integrations/gemini', providerLimiter, ah(integ.saveGemini));
r.post('/integrations/gemini/test', providerLimiter, ah(integ.testGemini));
r.put('/integrations/enricho', providerLimiter, ah(integ.saveEnrichoKey));
r.post('/integrations/enricho/test', providerLimiter, ah(integ.testEnricho));
r.get('/integrations/enricho/account', providerLimiter, ah(integ.enrichoAccount));
r.post('/integrations/enricho/oauth/start', providerLimiter, ah(integ.startEnrichoOAuth));
r.get('/integrations/enricho/oauth/callback', ah(integ.enrichoOAuthCallback));
r.post('/integrations/google/start', ah(integ.startGoogle));
r.get('/integrations/google/callback', ah(integ.googleCallback));
r.post('/integrations/google/test', providerLimiter, ah(integ.testGoogle));
r.delete('/integrations/:provider', ah(integ.disconnect));

// Discovery
r.post('/discovery/companies', providerLimiter, ah(crm.searchCompanies));
r.post('/discovery/next', providerLimiter, ah(crm.nextCompanyPage));
r.post('/discovery/save', ah(crm.saveFromRun));
r.get('/discovery/runs', ah(crm.searchRuns));

// Companies, research, people
r.get('/companies', ah(crm.listCompanies));
r.post('/companies', ah(crm.createCompany));
r.get('/companies/:id', ah(crm.getCompany));
r.patch('/companies/:id', ah(crm.updateCompany));
r.delete('/companies/:id', ah(crm.deleteCompany));
r.post('/companies/:id/enrich', providerLimiter, ah(crm.enrichCompany));
r.post('/companies/:id/research', providerLimiter, ah(crm.researchCompany));
r.get('/companies/:id/research/:researchId', ah(crm.getResearch));
r.post('/people/search', providerLimiter, ah(crm.searchPeople));
r.post('/people/next', providerLimiter, ah(crm.nextPeoplePage));
r.post('/people/save', ah(crm.savePeople));
r.get('/contacts', ah(crm.listContacts));
r.post('/contacts', ah(crm.createContact));
r.patch('/contacts/:id', ah(crm.updateContact));
r.delete('/contacts/:id', ah(crm.deleteContact));
r.post('/contacts/:id/find-email', providerLimiter, ah(crm.findEmail));

// Leads / CRM
r.get('/leads', ah(crm.listLeads));
r.get('/leads/board', ah(crm.board));
r.get('/leads/:id', ah(crm.getLead));
r.patch('/leads/:id', ah(crm.updateLead));
r.delete('/leads/:id', ah(crm.deleteLead));
r.post('/leads/:id/move', ah(crm.moveLead));
r.post('/leads/:id/score', providerLimiter, ah(crm.scoreLead));
r.post('/leads/:id/score/override', ah(crm.overrideScore));
r.post('/leads/:id/notes', ah(crm.addNote));
r.delete('/notes/:noteId', ah(crm.deleteNote));
r.get('/tasks', ah(crm.listTasks));
r.post('/tasks', ah(crm.createTask));
r.patch('/tasks/:id', ah(crm.updateTask));
r.delete('/tasks/:id', ah(crm.deleteTask));

// Email
r.get('/emails/drafts', ah(out.listDrafts));
r.post('/emails/drafts/generate', providerLimiter, ah(out.generateDraft));
r.get('/emails/drafts/:id', ah(out.getDraft));
r.patch('/emails/drafts/:id', ah(out.updateDraft));
r.post('/emails/drafts/:id/approve', ah(out.approveDraft));
r.post('/emails/drafts/:id/discard', ah(out.discardDraft));
r.post('/emails/drafts/:id/send', rateLimit({ name: 'send', windowSeconds: 60, max: 20, by: 'user' }), ah(out.sendDraft));
r.get('/emails/history', ah(out.emailHistory));
r.post('/emails/sync-replies', providerLimiter, ah(out.syncReplies));

// Follow-ups
r.get('/followups', ah(out.listFollowUps));
r.post('/followups', ah(out.createFollowUp));
r.patch('/followups/:id', ah(out.updateFollowUp));
r.post('/followups/:id/calendar', providerLimiter, ah(out.addFollowUpToCalendar));

// Campaigns
r.get('/campaigns', ah(out.listCampaigns));
r.post('/campaigns', ah(out.createCampaign));
r.get('/campaigns/:id', ah(out.getCampaign));
r.patch('/campaigns/:id', ah(out.updateCampaign));
r.delete('/campaigns/:id', ah(out.deleteCampaign));
r.post('/campaigns/:id/leads', ah(out.enrollLeads));
r.delete('/campaigns/:id/leads/:leadId', ah(out.unenrollLead));
r.post('/campaigns/:id/generate-drafts', providerLimiter, ah(out.generateCampaignDrafts));

// Settings
r.get('/settings', ah(out.getSettingsHandler));
r.patch('/settings', ah(out.updateSettingsHandler));
r.get('/services', ah(out.listServices));
r.post('/services', ah(out.createService));
r.patch('/services/:id', ah(out.updateService));
r.delete('/services/:id', ah(out.deleteService));
r.get('/suppression', ah(out.listSuppression));
r.post('/suppression', ah(out.addSuppression));
r.delete('/suppression/:id', ah(out.removeSuppression));

// Analytics
r.get('/analytics/dashboard', ah(out.dashboard));
r.get('/analytics/trends', ah(out.trends));

export default r;
