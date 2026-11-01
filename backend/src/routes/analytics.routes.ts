import { Router } from 'express';
import { getDashboardAnalytics } from '../controllers/analytics.controller';

const router = Router();

router.get('/dashboard', getDashboardAnalytics);

export default router;
