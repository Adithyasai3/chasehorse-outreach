import { Router } from 'express';
import { getKanbanBoard, moveCompanyStage, createKanbanStage } from '../controllers/kanban.controller';

const router = Router();

router.get('/board', getKanbanBoard);
router.patch('/move', moveCompanyStage);
router.post('/stages', createKanbanStage);

export default router;
