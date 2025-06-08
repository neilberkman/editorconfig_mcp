# EditorConfig MCP Server

A Model Context Protocol (MCP) compliant server that formats files using `.editorconfig` rules.

This project started from a specific workflow issue I kept running into. I found that while working with AI coding agents, they would often generate code with minor formatting errors, like trailing whitespace or inconsistent newlines. Our linters would then flag these issues, and the agent would spend valuable cycles fixing its own simple mistakes.

This EditorConfig MCP Server is the tool I built to solve that problem for myself. It acts as a proactive formatting gatekeeper, using your project's .editorconfig rules to ensure files are correct from the start. My hope is that it might be useful to others who've encountered a similar frustration in their AI-assisted development process.

## Installation

### Global Installation (Recommended)

```bash
npm install -g editorconfig-mcp-server
```

Then start the server:

```bash
editorconfig-mcp-server
```

### Using npx (No Installation)

```bash
npx editorconfig-mcp-server
```

### Local Installation

```bash
npm install editorconfig-mcp-server
```

Then add to your project's scripts in `package.json`:

```json
{
  "scripts": {
    "format-server": "editorconfig-mcp-server"
  }
}
```

### From Source

```bash
git clone https://github.com/yourusername/editorconfig-mcp-server.git
cd editorconfig-mcp-server
npm install
npm start
```

## Features

- **MCP Compliant**: Follows all MCP design patterns and best practices
- **JSON Schema Validation**: All inputs are validated using JSON Schema
- **Rate Limiting**: Built-in rate limiting (100 requests/minute)
- **OpenAPI Spec**: Self-documenting API with OpenAPI 3.0 specification
- **Versioned API**: Uses semantic versioning with `/v1/` prefix
- **Stateless**: No state retained between requests
- **Security**: Path validation prevents directory traversal attacks
- **Error Handling**: Consistent error format with helpful hints

## Installation

```bash
npm install
```

## Usage

### Starting the Server

```bash
# If installed globally
editorconfig-mcp-server

# Using npx
npx editorconfig-mcp-server

# With custom port
PORT=8080 editorconfig-mcp-server

# From source
npm start
```

The server will start on port 8432 by default.

### Configuration

- `PORT` - Server port (default: 8432)
  - Default port chosen to avoid conflicts with common development servers
  - Example: `PORT=8080 editorconfig-mcp-server`

### Integration with AI Tools

#### Claude Code

To add this server to Claude Code, run:

```bash
claude mcp add editorconfig npx editorconfig-mcp-server
```

#### Other MCP-Compatible Tools

This server is designed to be used with AI coding assistants that support MCP. Configure your AI tool to connect to:

- Base URL: `http://localhost:8432`
- Protocol: MCP over HTTP

## API Endpoints

### Tools (Actions)

#### `POST /v1/tools/format_file`

Format a single file using .editorconfig rules.

**Request:**

```json
{
  "file_path": "src/index.js"
}
```

**Response:**

```json
{
  "success": true,
  "file_path": "src/index.js",
  "bytes": 1234
}
```

#### `POST /v1/tools/format_files`

Format multiple files matching a glob pattern.

**Request:**

```json
{
  "pattern": "**/*.js"
}
```

**Response:**

```json
{
  "success": true,
  "pattern": "**/*.js",
  "count": 5,
  "files": ["src/index.js", "src/utils.js", ...]
}
```

### Metadata

- `GET /openapi.json` - OpenAPI 3.0 specification
- `GET /.well-known/mcp/servers.json` - MCP server manifest
- `GET /health` - Health check endpoint

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Error type",
  "message": "Human-readable message",
  "hint": "Helpful suggestion",
  "expected_format": {} // Optional, for validation errors
}
```

## Rate Limiting

The server implements rate limiting:

- Window: 1 minute
- Max requests: 100 per window
- Returns 429 status when exceeded

## Security

- Input validation using JSON Schema
- Path traversal protection
- Payload size limit (1MB)
- Ignores sensitive directories (node_modules, .git)

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality additions
- PATCH version for backwards-compatible bug fixes

To release a new version:

```bash
# For a patch release (1.0.0 -> 1.0.1)
npm version patch

# For a minor release (1.0.0 -> 1.1.0)
npm version minor

# For a major release (1.0.0 -> 2.0.0)
npm version major
```

This will:

1. Run the linter
2. Update the version in package.json
3. Create a git commit and tag
4. Push the commit and tag to GitHub

## Publishing

### NPM Package

To publish this package to npm:

1. Create an npm account at https://www.npmjs.com
2. Login to npm: `npm login`
3. Update version using `npm version` (see above)
4. Run: `npm publish`

For automated publishing via GitHub:

1. Add your npm token as a GitHub secret named `NPM_TOKEN`
2. Create a GitHub release - the publish workflow will automatically publish to npm

### MCP Server Registry

To register this server in the MCP registry:

1. Ensure your server implements the MCP specification
2. Host your server publicly (e.g., npm, GitHub releases)
3. Submit a PR to the MCP registry repository

## Development

```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Start server
npm start
```

## License

MIT
