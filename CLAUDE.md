# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BrowserTools MCP is a Model Context Protocol server that enables AI-powered applications to capture and analyze browser data through a Chrome extension. It provides tools for monitoring browser console output, network traffic, taking screenshots, and running comprehensive audits (accessibility, performance, SEO, best practices).

## Architecture

The project consists of three main components:

1. **Chrome Extension** (`chrome-extension/`) - Captures browser data (console logs, network requests, DOM elements, screenshots)
2. **Node Server** (`browser-tools-server/`) - Middleware that facilitates communication between the extension and MCP server
3. **MCP Server** (`browser-tools-mcp/`) - Model Context Protocol server that provides standardized tools for AI clients

Data flow: `AI Client (e.g. Cursor) ↔ MCP Server ↔ Node Server ↔ Chrome Extension`

## Development Commands

### Building and Running

```bash
# Build MCP server
cd browser-tools-mcp
npm run build

# Build Node server  
cd browser-tools-server
npm run build

# Start Node server (run this first)
cd browser-tools-server
npm start
# OR use published version: npx @agentdeskai/browser-tools-server@latest

# Start MCP server
cd browser-tools-mcp
npm start
# OR use published version: npx @agentdeskai/browser-tools-mcp@latest
```

### Testing and Development

```bash
# Inspect MCP server tools
cd browser-tools-mcp
npm run inspect

# Inspect live published version
cd browser-tools-mcp
npm run inspect-live
```

### Publishing

```bash
# Update and publish MCP server
cd browser-tools-mcp
npm run update

# Publish Node server
cd browser-tools-server
npm run prepublishOnly && npm publish
```

## Key Components

### MCP Server (`browser-tools-mcp/mcp-server.ts`)
- Main MCP server implementation
- Server discovery mechanism (auto-finds Node server on ports 3025-3035)
- Tools for browser interaction:
  - `getConsoleLogs`, `getConsoleErrors` - Browser console monitoring
  - `getNetworkLogs`, `getNetworkErrors` - Network request tracking
  - `takeScreenshot` - Screenshot capture
  - `getSelectedElement` - DOM element inspection
  - `wipeLogs` - Clear stored logs
  - `runAccessibilityAudit`, `runPerformanceAudit`, `runSEOAudit`, `runBestPracticesAudit` - Lighthouse audits
  - `runAuditMode`, `runDebuggerMode`, `runNextJSAudit` - Batch operations

### Node Server (`browser-tools-server/browser-connector.ts`)
- Express server with WebSocket support for extension communication
- Lighthouse integration for web audits
- Screenshot handling with cross-platform path conversion
- Auto-discovery on available ports (3025-3035)
- Clone/session service for webpage cloning features

### Chrome Extension
- DevTools panel integration
- Real-time data capture (console, network, DOM)
- WebSocket communication with Node server
- Screenshot capture with configurable save paths

## Configuration

### Environment Variables
- `BROWSER_TOOLS_PORT` - Set server port (default: 3025)
- `BROWSER_TOOLS_HOST` - Set server host (default: 127.0.0.1)
- `PORT` - Alternative port setting for Node server
- `SERVER_HOST` - Server binding interface (default: 0.0.0.0)

### Server Discovery
Both servers use automatic discovery mechanisms:
- MCP server discovers Node server via `.identity` endpoint
- Fallback port scanning from 3025-3035
- `.port` file persistence for coordination

## TypeScript Configuration

Both projects use modern TypeScript with:
- Target: ES2020
- Module: NodeNext (ES modules)
- Strict mode enabled
- Output to `dist/` directory

## Key Development Patterns

### Error Handling
- Graceful degradation when browser extension is disconnected
- Retry mechanisms for server discovery
- Comprehensive error responses from all tools

### Data Processing
- Configurable log limits and truncation
- String size limits to prevent token overflow
- Header filtering for network requests
- Platform-specific path handling (Windows/WSL/macOS/Linux)

### Audit System
- Puppeteer-based headless browser automation
- Lighthouse integration for comprehensive audits
- Structured JSON responses with metadata
- 60-second browser instance persistence for efficiency

## Installation Notes

The system requires three components to be installed:
1. Chrome extension (from GitHub releases)
2. MCP server (`npx @agentdeskai/browser-tools-mcp@latest`)
3. Node server (`npx @agentdeskai/browser-tools-server@latest`)

The Node server must be running before starting the MCP server. The Chrome extension communicates with the Node server via WebSocket on the discovered port.

## Clone Feature Architecture

The project includes experimental webpage cloning functionality:
- Session-based cloning service (`clone/session-service.ts`)
- Asset management for downloaded resources
- Pseudo-state capture for CSS states
- Animation and transition recording capabilities

## Platform Considerations

- Screenshot paths are converted for platform compatibility
- macOS-specific AppleScript integration for Cursor auto-paste
- Windows UNC and WSL path handling
- Cross-platform WebSocket communication