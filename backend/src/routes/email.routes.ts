import { Router } from 'express';
import {
  generateDraft,
  listDrafts,
  updateDraft,
  executeSendEmail,
  listEmailThreads,
  triggerSync,
  simulateIncomingReply,
} from '../controllers/email.controller';

const router = Router();

router.post('/generate', generateDraft);
router.get('/drafts', listDrafts);
router.patch('/drafts/:id', updateDraft);
router.post('/send', executeSendEmail);
router.get('/threads', listEmailThreads);
router.post('/sync', triggerSync);
router.post('/simulate-reply', simulateIncomingReply);

export default router;
