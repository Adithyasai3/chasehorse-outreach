import { Router } from 'express';
import {
  listCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  triggerCompanyResearch,
  addCompanyNote,
} from '../controllers/companies.controller';

const router = Router();

router.get('/', listCompanies);
router.get('/:id', getCompanyById);
router.patch('/:id', updateCompany);
router.delete('/:id', deleteCompany);
router.post('/:id/research', triggerCompanyResearch);
router.post('/:id/notes', addCompanyNote);

export default router;
