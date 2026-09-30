import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The full permission catalog. This list is data, not code: the
// authorization service (src/services/authorization.service.ts) has
// no knowledge of these specific keys -- it just checks whether a
// user's roles grant whatever key a route asks for. Adding a new
// permission here (or via an admin tool in a later phase) requires no
// code change to the authorization logic itself.
const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'TOURNAMENT_CREATE', description: 'Create a new tournament.' },
  { key: 'TOURNAMENT_MANAGE', description: 'Edit tournament settings and lifecycle.' },
  { key: 'TOURNAMENT_VIEW', description: 'View tournament details.' },
  { key: 'PAIRING_GENERATE', description: 'Generate pairings for a round.' },
  { key: 'PAIRING_REVIEW', description: 'Review generated pairings before publication.' },
  { key: 'PAIRING_APPROVE', description: 'Approve reviewed pairings.' },
  { key: 'PAIRING_PUBLISH', description: 'Publish approved pairings to participants.' },
  { key: 'GAME_RESULT_SUBMIT', description: 'Submit the result of a single game/unit.' },
  { key: 'MATCH_RESULT_SUBMIT', description: 'Submit the result of a match.' },
  { key: 'MATCH_RESULT_CONFIRM', description: 'Confirm a submitted match result.' },
  { key: 'MATCH_RESULT_CORRECT', description: 'Correct a previously confirmed match result.' },
  { key: 'MATCH_RESULT_DISPUTE', description: 'Raise a dispute against a match result.' },
  { key: 'STANDINGS_VIEW', description: 'View tournament standings.' },
  { key: 'AUDIT_VIEW', description: 'View audit history of tournament actions.' },
];

// Example roles only. These names carry no special meaning to the
// authorization service or middleware -- an operator is free to
// rename, remove, or add roles (e.g. "Referee", "Streamer") without
// touching any application code.
const EXAMPLE_ROLES: Array<{ name: string; description: string; permissionKeys: string[] }> = [
  {
    name: 'Organizer',
    description: 'Manages a tournament end-to-end.',
    permissionKeys: [
      'TOURNAMENT_CREATE',
      'TOURNAMENT_MANAGE',
      'TOURNAMENT_VIEW',
      'PAIRING_GENERATE',
      'PAIRING_REVIEW',
      'PAIRING_APPROVE',
      'PAIRING_PUBLISH',
      'MATCH_RESULT_CONFIRM',
      'MATCH_RESULT_CORRECT',
      'STANDINGS_VIEW',
      'AUDIT_VIEW',
    ],
  },
  {
    name: 'Competitor',
    description: 'Participates in tournaments.',
    permissionKeys: ['TOURNAMENT_VIEW', 'GAME_RESULT_SUBMIT', 'MATCH_RESULT_SUBMIT', 'MATCH_RESULT_DISPUTE', 'STANDINGS_VIEW'],
  },
];

async function main(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const roleDef of EXAMPLE_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description },
      create: { name: roleDef.name, description: roleDef.description },
    });

    for (const key of roleDef.permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
