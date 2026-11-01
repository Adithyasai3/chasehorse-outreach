import { Router } from 'express';
import {
  listContacts,
  createContact,
  updateContact,
  enrichCompanyContacts,
} from '../controllers/contacts.controller';

const router = Router();

router.get('/', listContacts);
router.post('/', createContact);
router.patch('/:id', updateContact);
router.post('/enrich/:companyId', enrichCompanyContacts);

export default router;
