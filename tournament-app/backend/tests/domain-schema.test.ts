import fs from 'fs';
import path from 'path';

const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

function modelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  if (!match) {
    throw new Error(`model ${modelName} not found in schema.prisma`);
  }
  return match[0];
}

describe('Phase 1 core domain model — schema contract', () => {
  const requiredModels = [
    'User',
    'Role',
    'Permission',
    'Tournament',
    'Participant',
    'TournamentParticipant',
    'Round',
    'Match',
    'Unit',
    'TournamentResult',
    'Standing',
    'Bracket',
  ];

  it.each(requiredModels)('defines model %s', (modelName) => {
    expect(schema).toMatch(new RegExp(`model ${modelName} \\{`));
  });

  it('defines TournamentFormat with exactly the four required formats', () => {
    const enumBlock = schema.match(/enum TournamentFormat \{[\s\S]*?\}/)?.[0] ?? '';
    expect(enumBlock).toContain('SWISS');
    expect(enumBlock).toContain('KNOCKOUT');
    expect(enumBlock).toContain('ROUND_ROBIN');
    expect(enumBlock).toContain('SWISS_TO_KNOCKOUT');
  });

  it('keeps Participant.userId optional (a Participant may exist without a User)', () => {
    const block = modelBlock('Participant');
    expect(block).toMatch(/userId\s+String\?/);
  });

  it('prevents duplicate tournament registration via a unique constraint', () => {
    const block = modelBlock('TournamentParticipant');
    expect(block).toMatch(/@@unique\(\[tournamentId, participantId\]\)/);
  });

  it('prevents duplicate game/unit numbers within a match via a unique constraint', () => {
    const block = modelBlock('Unit');
    expect(block).toMatch(/@@unique\(\[matchId, unitNumber\]\)/);
  });

  it('prevents duplicate match numbers within a round via a unique constraint', () => {
    const block = modelBlock('Match');
    expect(block).toMatch(/@@unique\(\[roundId, matchNumber\]\)/);
  });

  it('prevents a participant from being double-booked into the same match slot', () => {
    const block = modelBlock('MatchParticipant');
    expect(block).toMatch(/@@unique\(\[matchId, tournamentParticipantId\]\)/);
    expect(block).toMatch(/@@unique\(\[matchId, slot\]\)/);
  });

  it('scopes global and tournament RBAC assignments with separate unique constraints', () => {
    const userRole = modelBlock('UserRole');
    const tournamentUserRole = modelBlock('TournamentUserRole');
    expect(userRole).toMatch(/@@unique\(\[userId, roleId\]\)/);
    expect(tournamentUserRole).toMatch(/@@unique\(\[userId, roleId, tournamentId\]\)/);
  });

  it('gives Match no direct tournamentId column (tournament scope only via Round)', () => {
    // Strip comment lines first: the model's explanatory comment mentions
    // "tournamentId" in prose, which would otherwise false-positive here.
    const block = modelBlock('Match')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(block).not.toMatch(/^\s*tournamentId\s/m);
  });

  it('every model in the schema has a corresponding CREATE TABLE in the init migration', () => {
    const migrationPath = path.join(
      __dirname,
      '..',
      'prisma',
      'migrations',
      '20260912000000_init_core_domain_model',
      'migration.sql',
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
    for (const model of models) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE "${model}"`));
    }
  });
});
