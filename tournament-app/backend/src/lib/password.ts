import bcrypt from 'bcryptjs';

// Cost factor for bcrypt. 10 is bcrypt's own recommended minimum as of
// this writing; raise it over time as hardware gets faster, not down.
const SALT_ROUNDS = 10;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function comparePassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
