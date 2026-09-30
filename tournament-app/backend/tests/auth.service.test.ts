import { AppError } from '../src/middleware/error-handler';
import { AuthServicePrismaClient, createAuthService } from '../src/services/auth.service';

interface FakeUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

function createFakeAuthService() {
  const users: FakeUserRecord[] = [];
  let nextId = 1;

  const prisma: AuthServicePrismaClient = {
    user: {
      findUnique: async ({ where }) => users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }) => {
        const user: FakeUserRecord = { id: `user-${nextId++}`, ...data };
        users.push(user);
        return user;
      },
    },
  };

  // Deterministic fake hash/token functions: no bcryptjs/jsonwebtoken
  // needed to test the register/login control flow.
  const hashPassword = async (plain: string) => `hashed:${plain}`;
  const comparePassword = async (plain: string, hash: string) => hash === `hashed:${plain}`;
  const signToken = (payload: { sub: string; email: string }) => `token-for:${payload.sub}:${payload.email}`;

  const service = createAuthService({ prisma, hashPassword, comparePassword, signToken });
  return { service, users };
}

describe('auth service', () => {
  it('registers a new user and never returns the password hash', async () => {
    const { service, users } = createFakeAuthService();

    const user = await service.register('alice@example.com', 'correct-horse', 'Alice');

    expect(user).toEqual({ id: 'user-1', email: 'alice@example.com', displayName: 'Alice' });
    expect((user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(users[0].passwordHash).toBe('hashed:correct-horse');
  });

  it('rejects registration with an email that is already registered', async () => {
    const { service } = createFakeAuthService();
    await service.register('alice@example.com', 'correct-horse', 'Alice');

    await expect(service.register('alice@example.com', 'another-pw', 'Alice 2')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('logs in with correct credentials and issues a token', async () => {
    const { service } = createFakeAuthService();
    await service.register('alice@example.com', 'correct-horse', 'Alice');

    const result = await service.login('alice@example.com', 'correct-horse');

    expect(result.token).toBe('token-for:user-1:alice@example.com');
    expect(result.user).toEqual({ id: 'user-1', email: 'alice@example.com', displayName: 'Alice' });
  });

  it('rejects login for an unknown email with a generic 401', async () => {
    const { service } = createFakeAuthService();

    await expect(service.login('nobody@example.com', 'whatever')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejects login with the wrong password using the same generic 401 (no user enumeration)', async () => {
    const { service } = createFakeAuthService();
    await service.register('alice@example.com', 'correct-horse', 'Alice');

    let unknownEmailError: unknown;
    let wrongPasswordError: unknown;
    try {
      await service.login('nobody@example.com', 'whatever');
    } catch (err) {
      unknownEmailError = err;
    }
    try {
      await service.login('alice@example.com', 'wrong-password');
    } catch (err) {
      wrongPasswordError = err;
    }

    expect((unknownEmailError as AppError).message).toBe((wrongPasswordError as AppError).message);
    expect((unknownEmailError as AppError).statusCode).toBe((wrongPasswordError as AppError).statusCode);
  });
});
