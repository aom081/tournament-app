import { AppError } from '../src/middleware/error-handler';
import { createAuthenticateMiddleware } from '../src/middleware/authenticate';

function fakeRequest(authorizationHeader?: string) {
  return {
    headers: authorizationHeader ? { authorization: authorizationHeader } : {},
  } as unknown as Parameters<ReturnType<typeof createAuthenticateMiddleware>>[0];
}

describe('authenticate middleware', () => {
  it('rejects a request with no Authorization header', () => {
    const middleware = createAuthenticateMiddleware(() => {
      throw new Error('should not be called');
    });
    const req = fakeRequest();
    const next = jest.fn();

    middleware(req, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errArg = next.mock.calls[0][0];
    expect(errArg).toBeInstanceOf(AppError);
    expect((errArg as AppError).statusCode).toBe(401);
  });

  it('rejects a request with a non-Bearer Authorization header', () => {
    const middleware = createAuthenticateMiddleware(() => {
      throw new Error('should not be called');
    });
    const req = fakeRequest('Basic abc123');
    const next = jest.fn();

    middleware(req, {} as never, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('rejects a request whose token fails verification', () => {
    const middleware = createAuthenticateMiddleware(() => {
      throw new Error('invalid signature');
    });
    const req = fakeRequest('Bearer bad-token');
    const next = jest.fn();

    middleware(req, {} as never, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('attaches req.user and calls next() with no error for a valid token', () => {
    const middleware = createAuthenticateMiddleware((token) => {
      expect(token).toBe('good-token');
      return { sub: 'user-1', email: 'alice@example.com' };
    });
    const req = fakeRequest('Bearer good-token');
    const next = jest.fn();

    middleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as unknown as { user: { id: string; email: string } }).user).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
    });
  });
});
