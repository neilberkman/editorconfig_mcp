# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - In Development

### Added

- Claude Code installation instructions in README

## [1.0.1] - 2025-01-06

### Added

- Initial release of EditorConfig MCP Server
- MCP-compliant API with JSON Schema validation
- Two main endpoints: `/v1/tools/format_file` and `/v1/tools/format_files`
- OpenAPI 3.0 specification endpoint
- MCP manifest endpoint at `/.well-known/mcp/servers.json`
- Rate limiting (100 requests/minute)
- Path security validation
- Health check endpoint
- Comprehensive error handling with helpful hints
- ESLint and Prettier for code quality
- Comprehensive test suite using Jest and Supertest
- GitHub Actions for CI/CD
- Support for global npm installation
- MIT License

### Security

- Path traversal protection
- Input validation using JSON Schema
- Payload size limit (1MB)
- Automatic ignoring of sensitive directories (node_modules, .git)
