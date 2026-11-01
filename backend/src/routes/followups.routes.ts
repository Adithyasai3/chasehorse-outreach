import { Router } from 'express';
import {
  listFollowUps,
  createFollowUp,
  completeFollowUp,
  generateFollowUpEmail,
} from '../controllers/followups.controller';

const router = Router();

router.get('/', listFollowUps);
router.post('/', createFollowUp);
router.patch('/:id/complete', completeFollowUp);
router.post('/:id/generate-email', generateFollowUpEmail);

export default router;
