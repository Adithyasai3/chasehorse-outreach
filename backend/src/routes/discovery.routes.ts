import { Router } from 'express';
import { interpretQuery, estimateCredits, executeSearch, getSearchHistory } from '../controllers/discovery.controller';

const router = Router();

router.post('/interpret', interpretQuery);
router.post('/estimate', estimateCredits);
router.post('/execute', executeSearch);
router.get('/history', getSearchHistory);

export default router;
