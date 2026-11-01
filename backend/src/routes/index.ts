import { Router } from 'express';
import discoveryRoutes from './discovery.routes';
import companiesRoutes from './companies.routes';
import contactsRoutes from './contacts.routes';
import kanbanRoutes from './kanban.routes';
import servicesRoutes from './services.routes';
import emailRoutes from './email.routes';
import gmailRoutes from './gmail.routes';
import followupsRoutes from './followups.routes';
import analyticsRoutes from './analytics.routes';
import integrationsRoutes from './integrations.routes';
import settingsRoutes from './settings.routes';

const router = Router();

router.use('/discovery', discoveryRoutes);
router.use('/companies', companiesRoutes);
router.use('/contacts', contactsRoutes);
router.use('/kanban', kanbanRoutes);
router.use('/services', servicesRoutes);
router.use('/email', emailRoutes);
router.use('/gmail', gmailRoutes);
router.use('/followups', followupsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/settings', settingsRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ChaseHorse AI Outreach Platform API',
  });
});

export default router;
