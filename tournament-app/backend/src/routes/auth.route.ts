import { NextFunction, Request, Response, Router } from 'express';

import { authenticate } from '../middleware/auth.instance';
import { AppError } from '../middleware/error-handler';
import { authorizationService } from '../services/authorization.instance';
import { authService } from '../services/auth.instance';

const router = Router();

router.post('/auth/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, displayName } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
      throw new AppError('email, password and displayName are required', 400);
    }

    const user = await authService.register(email, password, displayName);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError('email and password are required', 400);
    }

    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/auth/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const permissions = await authorizationService.getEffectivePermissionKeys(req.user!.id);
    res.status(200).json({ user: req.user, permissions: Array.from(permissions) });
  } catch (err) {
    next(err);
  }
});

export default router;
