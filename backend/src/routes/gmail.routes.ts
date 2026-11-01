import { Router } from 'express';
import { getAuthUrl, oauthCallback, getGmailStatus, disconnectGmail } from '../controllers/gmail.controller';

const router = Router();

router.get('/oauth/url', getAuthUrl);
router.get('/oauth/callback', oauthCallback);
router.get('/status', getGmailStatus);
router.post('/disconnect', disconnectGmail);

export default router;
