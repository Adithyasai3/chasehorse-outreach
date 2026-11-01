import { Router } from 'express';
import { getIntegrationsStatus, testGemini, testEnricho } from '../controllers/integrations.controller';

const router = Router();

router.get('/status', getIntegrationsStatus);
router.post('/test-gemini', testGemini);
router.post('/test-enricho', testEnricho);

export default router;
