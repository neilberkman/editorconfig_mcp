#!/usr/bin/env node

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const eclint = require('eclint');
const vfs = require('vinyl-fs');
const Ajv = require('ajv');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8432; // Default port for EditorConfig MCP
const API_VERSION = '1.0.0';

// JSON Schema validator
const ajv = new Ajv();

// Middleware
app.use(express.json({ limit: '1mb' })); // Limit payload size

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded',
      hint: 'Please wait before making more requests',
    });
  },
});

app.use(limiter);

// Input schemas
const formatFileSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      pattern: '^[^\\0]+$',
      minLength: 1,
      maxLength: 1024,
    },
  },
  required: ['file_path'],
  additionalProperties: false,
};

const formatFilesSchema = {
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      pattern: '^[^\\0]+$',
      minLength: 1,
      maxLength: 256,
      default: '**/*',
    },
  },
  additionalProperties: false,
};

// Compiled validators
const validateFormatFile = ajv.compile(formatFileSchema);
const validateFormatFiles = ajv.compile(formatFilesSchema);

// Helper functions
function isPathSafe(filePath) {
  const projectRoot = process.cwd();
  const absolutePath = path.resolve(projectRoot, filePath);
  return absolutePath.startsWith(projectRoot) && !absolutePath.includes('..');
}

function sendError(res, status, message, hint, expected_format) {
  const error = { error: message, message, hint };
  if (expected_format) {
    error.expected_format = expected_format;
  }
  return res.status(status).json(error);
}

// Tools endpoints (verb_noun pattern)

/**
 * Format a single file
 */
app.post('/v1/tools/format_file', async (req, res) => {
  if (!validateFormatFile(req.body)) {
    return sendError(res, 422, 'Invalid input', 'Check the file_path field', {
      file_path: 'string (path to file)',
    });
  }

  const { file_path } = req.body;

  if (!isPathSafe(file_path)) {
    return sendError(res, 403, 'Forbidden path', 'File path must be within the project directory');
  }

  try {
    await fs.access(file_path);

    // Use vinyl-fs to read, process with eclint, and write back
    await new Promise((resolve, reject) => {
      vfs
        .src(file_path) // Read file as vinyl stream
        .pipe(eclint.fix()) // Process with eclint
        .pipe(vfs.dest(path.dirname(file_path))) // Write back to same directory
        .on('finish', resolve)
        .on('error', reject);
    });

    // Get the file size after formatting
    const stats = await fs.stat(file_path);

    res.json({
      success: true,
      file_path,
      bytes: stats.size,
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendError(res, 404, 'File not found', `File does not exist: ${file_path}`);
    }
    return sendError(res, 500, 'Processing failed', 'An error occurred while formatting the file');
  }
});

/**
 * Format multiple files matching a pattern
 */
app.post('/v1/tools/format_files', async (req, res) => {
  if (!validateFormatFiles(req.body)) {
    return sendError(res, 422, 'Invalid input', 'Check the pattern field', {
      pattern: 'string (glob pattern, optional)',
    });
  }

  const { pattern = '**/*' } = req.body;

  try {
    const matchedFiles = [];
    const processedFiles = [];
    const skippedFiles = [];

    // Use vinyl-fs for both globbing and processing
    await new Promise((resolve, reject) => {
      const srcStream = vfs.src(pattern, {
        nodir: true,
        ignore: ['node_modules/**', '.git/**', '*.log'],
      });

      let fileCount = 0;

      srcStream
        .on('data', (file) => {
          fileCount++;
          if (fileCount > 1000) {
            srcStream.destroy();
            reject(new Error('Pattern matches too many files. Limit is 1000.'));
            return;
          }
          matchedFiles.push(file.path);
        })
        .pipe(eclint.fix())
        .on('data', (file) => {
          // File successfully processed by eclint
          processedFiles.push(file.path);
        })
        .on('error', (err, file) => {
          // Handle individual file errors
          if (file && file.path) {
            skippedFiles.push(file.path);
            console.warn(`Skipped file (eclint error): ${file.path} - ${err.message}`);
          }
        })
        .pipe(vfs.dest('.'))
        .on('finish', () => {
          // Check for files that matched but weren't processed
          const processedSet = new Set(processedFiles);
          matchedFiles.forEach((filePath) => {
            if (!processedSet.has(filePath) && !skippedFiles.includes(filePath)) {
              skippedFiles.push(filePath);
              console.warn(`Skipped file (processing error): ${filePath}`);
            }
          });
          resolve();
        })
        .on('error', (err) => {
          console.error(`Stream error: ${err.message}`);
          reject(err);
        });
    });

    if (processedFiles.length === 0 && matchedFiles.length === 0) {
      return res.json({
        success: true,
        pattern,
        count: 0,
        files: [],
      });
    }

    res.json({
      success: true,
      pattern,
      count: processedFiles.length,
      files: processedFiles,
      skipped: skippedFiles.length > 0 ? skippedFiles : undefined,
    });
  } catch (error) {
    console.error('Format files error:', error);
    if (error.message && error.message.includes('too many files')) {
      return sendError(res, 422, 'Too many files', error.message, {
        pattern: 'Use a more specific pattern',
      });
    }
    return sendError(res, 500, 'Processing failed', 'An error occurred while formatting files');
  }
});

// Metadata endpoints

/**
 * OpenAPI specification
 */
app.get('/openapi.json', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'EditorConfig MCP Server',
      description: 'Format files using .editorconfig rules',
      version: API_VERSION,
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths: {
      '/v1/tools/format_file': {
        post: {
          summary: 'Format a single file',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: formatFileSchema,
                example: { file_path: 'src/index.js' },
              },
            },
          },
          responses: {
            200: {
              description: 'File formatted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      file_path: { type: 'string' },
                      bytes: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/tools/format_files': {
        post: {
          summary: 'Format multiple files matching a pattern',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: formatFilesSchema,
                example: { pattern: '**/*.js' },
              },
            },
          },
          responses: {
            200: {
              description: 'Files formatted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      pattern: { type: 'string' },
                      count: { type: 'integer' },
                      files: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      skipped: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'Files that were skipped due to permissions, read errors, or processing errors',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
});

/**
 * MCP manifest
 */
app.get('/.well-known/mcp/servers.json', (req, res) => {
  res.json({
    version: '1.0',
    servers: [
      {
        id: 'editorconfig-formatter',
        name: 'EditorConfig Formatter',
        description: 'Format files using .editorconfig rules',
        version: API_VERSION,
        protocol: 'http',
        endpoints: {
          base: `http://localhost:${PORT}`,
          tools: '/v1/tools',
        },
        capabilities: {
          tools: [
            {
              name: 'format_file',
              description: 'Format a single file',
              input_schema: formatFileSchema,
            },
            {
              name: 'format_files',
              description: 'Format multiple files matching a pattern',
              input_schema: formatFilesSchema,
            },
          ],
        },
      },
    ],
  });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: API_VERSION,
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  sendError(res, 404, 'Endpoint not found', 'Check the API documentation at /openapi.json');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  sendError(res, 500, 'Internal server error', 'An unexpected error occurred');
});

// Only start server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EditorConfig MCP Server v${API_VERSION}`);
    console.log(`Listening on port ${PORT}`);
    console.log(`OpenAPI spec: http://localhost:${PORT}/openapi.json`);
    console.log(`Manifest: http://localhost:${PORT}/.well-known/mcp/servers.json`);
  });
}

module.exports = app;
