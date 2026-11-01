import { Router } from 'express';
import {
  listServices,
  createService,
  updateService,
  deleteService,
  matchAllLeads,
} from '../controllers/services.controller';

const router = Router();

router.get('/', listServices);
router.post('/', createService);
router.patch('/:id', updateService);
router.delete('/:id', deleteService);
router.post('/match-all', matchAllLeads);

export default router;
