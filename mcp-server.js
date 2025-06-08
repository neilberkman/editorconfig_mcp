#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const eclint = require('eclint');
const vfs = require('vinyl-fs');

// Set up readline for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Buffer for incomplete messages
let buffer = '';

// Send JSON-RPC response
function send(response) {
  const message = JSON.stringify(response);
  process.stdout.write(message + '\n');
}

// Send error response
function sendError(id, code, message, data) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  });
}

// Format a single file
async function formatFile(filePath) {
  try {
    // Check if file exists
    await fs.access(filePath);

    // Use vinyl-fs to format the file
    await new Promise((resolve, reject) => {
      vfs
        .src(filePath)
        .pipe(eclint.fix())
        .pipe(vfs.dest(path.dirname(filePath)))
        .on('finish', resolve)
        .on('error', reject);
    });

    const stats = await fs.stat(filePath);
    return {
      success: true,
      file_path: filePath,
      bytes: stats.size,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}

// Format multiple files
async function formatFiles(pattern = '**/*') {
  const processedFiles = [];
  const skippedFiles = [];

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
      })
      .pipe(eclint.fix())
      .on('data', (file) => {
        processedFiles.push(file.path);
      })
      .on('error', (err, file) => {
        if (file && file.path) {
          skippedFiles.push(file.path);
        }
      })
      .pipe(vfs.dest('.'))
      .on('finish', resolve)
      .on('error', reject);
  });

  return {
    success: true,
    pattern,
    count: processedFiles.length,
    files: processedFiles,
    skipped: skippedFiles.length > 0 ? skippedFiles : undefined,
  };
}

// Handle JSON-RPC request
async function handleRequest(request) {
  if (!request.jsonrpc || request.jsonrpc !== '2.0') {
    sendError(request.id, -32600, 'Invalid Request', 'Must be JSON-RPC 2.0');
    return;
  }

  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'editorconfig-mcp-server',
              version: '1.0.0',
            },
          },
        });
        break;

      case 'initialized':
        // No response needed for notification
        break;

      case 'tools/list':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'format_file',
                description: 'Format a single file using .editorconfig rules',
                inputSchema: {
                  type: 'object',
                  properties: {
                    file_path: {
                      type: 'string',
                      description: 'Path to the file to format',
                    },
                  },
                  required: ['file_path'],
                },
              },
              {
                name: 'format_files',
                description: 'Format multiple files matching a pattern',
                inputSchema: {
                  type: 'object',
                  properties: {
                    pattern: {
                      type: 'string',
                      description: 'Glob pattern for files to format',
                      default: '**/*',
                    },
                  },
                },
              },
            ],
          },
        });
        break;

      case 'tools/call':
        if (!params || !params.name) {
          sendError(id, -32602, 'Invalid params', 'Missing tool name');
          return;
        }

        let result;
        switch (params.name) {
          case 'format_file':
            if (!params.arguments || !params.arguments.file_path) {
              sendError(id, -32602, 'Invalid params', 'Missing file_path');
              return;
            }
            result = await formatFile(params.arguments.file_path);
            break;

          case 'format_files':
            result = await formatFiles(params.arguments?.pattern);
            break;

          default:
            sendError(id, -32601, 'Method not found', `Unknown tool: ${params.name}`);
            return;
        }

        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
        break;

      default:
        sendError(id, -32601, 'Method not found', `Unknown method: ${method}`);
    }
  } catch (error) {
    sendError(id, -32000, 'Server error', error.message);
  }
}

// Process incoming data
rl.on('line', (line) => {
  buffer += line;

  try {
    const request = JSON.parse(buffer);
    buffer = '';
    handleRequest(request);
  } catch {
    // Not a complete JSON object yet, wait for more data
    if (!line.trim()) {
      buffer = ''; // Reset on empty line
    }
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
