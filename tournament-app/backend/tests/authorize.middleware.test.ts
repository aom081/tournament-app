import { AppError } from '../src/middleware/error-handler';
import { createRequirePermission } from '../src/middleware/authorize';

function fakeRequest(user?: { id: string; email: string }, params: Record<string, string> = {}) {
  return { user, params } as unknown as Parameters<ReturnType<ReturnType<typeof createRequirePermission>>>[0];
}

describe('requirePermission middleware', () => {
  it('rejects with 401 when there is no authenticated user', async () => {
    const requirePermission = createRequirePermission(async () => true);
    const middleware = requirePermission('TOURNAMENT_CREATE');
    const req = fakeRequest(undefined);
    const next = jest.fn();

    await middleware(req, {} as never, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('allows the request when the permission check succeeds (global scope)', async () => {
    const hasPermission = jest.fn(async () => true);
    const requirePermission = createRequirePermission(hasPermission);
    const middleware = requirePermission('AUDIT_VIEW');
    const req = fakeRequest({ id: 'user-1', email: 'alice@example.com' });
    const next = jest.fn();

    await middleware(req, {} as never, next);

    expect(hasPermission).toHaveBeenCalledWith('user-1', 'AUDIT_VIEW', undefined);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 403 when the permission check fails', async () => {
    const requirePermission = createRequirePermission(async () => false);
    const middleware = requirePermission('TOURNAMENT_CREATE');
    const req = fakeRequest({ id: 'user-1', email: 'alice@example.com' });
    const next = jest.fn();

    await middleware(req, {} as never, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('passes the tournamentId from route params when tournamentIdParam is configured', async () => {
    const hasPermission = jest.fn(async () => true);
    const requirePermission = createRequirePermission(hasPermission);
    const middleware = requirePermission('PAIRING_GENERATE', { tournamentIdParam: 'tournamentId' });
    const req = fakeRequest({ id: 'user-1', email: 'alice@example.com' }, { tournamentId: 'tournament-A' });
    const next = jest.fn();

    await middleware(req, {} as never, next);

    expect(hasPermission).toHaveBeenCalledWith('user-1', 'PAIRING_GENERATE', 'tournament-A');
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards unexpected errors from the permission checker to next()', async () => {
    const boom = new Error('db unavailable');
    const requirePermission = createRequirePermission(async () => {
      throw boom;
    });
    const middleware = requirePermission('AUDIT_VIEW');
    const req = fakeRequest({ id: 'user-1', email: 'alice@example.com' });
    const next = jest.fn();

    await middleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
