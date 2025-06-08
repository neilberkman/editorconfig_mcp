const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const app = require('./server');

describe('EditorConfig MCP Server', () => {
  const testDir = path.join(__dirname, 'test-files');
  const testFile = path.join(testDir, 'test.js');

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Create test file with formatting issues
    await fs.writeFile(
      testFile,
      '// Test file\nfunction test() {\nconsole.log("test");\n}\n// No newline'
    );
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        version: '1.0.0',
      });
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /openapi.json', () => {
    it('should return OpenAPI specification', async () => {
      const response = await request(app).get('/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        openapi: '3.0.0',
        info: {
          title: 'EditorConfig MCP Server',
          version: '1.0.0',
        },
      });
    });
  });

  describe('POST /v1/tools/format_file', () => {
    it('should format a single file', async () => {
      const response = await request(app)
        .post('/v1/tools/format_file')
        .send({ file_path: testFile });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        file_path: testFile,
      });
      expect(response.body.bytes).toBeGreaterThan(0);

      // Verify file was modified (should have newline at end)
      const content = await fs.readFile(testFile, 'utf8');
      expect(content.endsWith('\n')).toBe(true);
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/v1/tools/format_file')
        .send({ wrong_field: 'test.js' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('Invalid input');
    });

    it('should reject path traversal', async () => {
      const response = await request(app)
        .post('/v1/tools/format_file')
        .send({ file_path: '../../../etc/passwd' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden path');
    });

    it('should handle non-existent files', async () => {
      const response = await request(app)
        .post('/v1/tools/format_file')
        .send({ file_path: 'does-not-exist.js' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('File not found');
    });
  });

  describe('POST /v1/tools/format_files', () => {
    it('should format multiple files', async () => {
      // Create another test file
      const testFile2 = path.join(testDir, 'test2.js');
      await fs.writeFile(testFile2, 'function test2() {}\n// No newline');

      const response = await request(app)
        .post('/v1/tools/format_files')
        .send({ pattern: 'test-files/*.js' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        pattern: 'test-files/*.js',
        count: 2,
      });
      expect(response.body.files).toHaveLength(2);
    });

    it('should handle empty pattern results', async () => {
      const response = await request(app)
        .post('/v1/tools/format_files')
        .send({ pattern: 'test-files/*.xyz' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        count: 0,
        files: [],
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Endpoint not found');
    });
  });
});
