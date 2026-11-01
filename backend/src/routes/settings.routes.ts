import { Router } from 'express';
import { getSuppressionList, addSuppression, removeSuppression } from '../controllers/settings.controller';

const router = Router();

router.get('/suppression', getSuppressionList);
router.post('/suppression', addSuppression);
router.delete('/suppression/:id', removeSuppression);

export default router;
