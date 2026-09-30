import request from 'supertest';

import { createApp } from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns 200 and an ok status payload', async () => {
    const app = createApp();

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });
});

describe('GET /api/v1/unknown-route', () => {
  it('returns 404 with a structured error body', async () => {
    const app = createApp();

    const response = await request(app).get('/api/v1/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain('Route not found');
  });
});
