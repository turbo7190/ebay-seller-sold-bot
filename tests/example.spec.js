const { test, expect } = require('@playwright/test');

test.describe('API Tests', () => {
  test('should return welcome message on GET /', async ({ request }) => {
    const response = await request.get('/');
    
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.message).toBe('Welcome to eBay Server');
    expect(data.status).toBe('running');
    expect(data.timestamp).toBeDefined();
  });

  test('should return health status on GET /health', async ({ request }) => {
    const response = await request.get('/health');
    
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('should handle query parameters on GET /api/hello', async ({ request }) => {
    const response = await request.get('/api/hello', {
      params: { name: 'Playwright', version: '1.40' }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.message).toBe('Hello from eBay Server API');
    expect(data.query.name).toBe('Playwright');
    expect(data.query.version).toBe('1.40');
  });

  test('should echo POST request body', async ({ request }) => {
    const testBody = {
      name: 'Test User',
      email: 'test@example.com'
    };
    
    const response = await request.post('/api/echo', {
      data: testBody
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.body).toEqual(testBody);
    expect(data.timestamp).toBeDefined();
  });

  test('should return 404 for non-existent route', async ({ request }) => {
    const response = await request.get('/non-existent-route');
    
    expect(response.status()).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe('Not Found');
  });
});

