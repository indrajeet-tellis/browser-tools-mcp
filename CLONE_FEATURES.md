# Browser Tools MCP - Website Cloning Features

This document outlines the comprehensive website cloning capabilities implemented in the Browser Tools MCP system.

## Overview

The Browser Tools MCP now includes a complete end-to-end website cloning pipeline that can capture live websites and generate faithful recreations using modern web technologies including Next.js, Tailwind CSS, and shadcn/ui components.

## Core Cloning Pipeline

### 1. Data Capture Phase

The system captures comprehensive website data through multiple specialized collectors:

#### DOM Snapshot Extraction (PR4)
- Complete DOM tree serialization with element geometry
- Captures element attributes, dataset values, and text content
- Preserves document structure and hierarchy
- Handles both page-level and selection-based capture

#### Stylesheet & Computed Style Capture (PR5)
- Extracts all linked and inline stylesheets
- Captures computed styles for key elements
- Handles CORS-protected stylesheets gracefully
- Deduplicates styles by URL and content hash

#### Asset Collection & Download (PR6)
- Discovers images, fonts, icons, and media assets
- Generates manifest with original URLs and metadata
- Supports srcset and responsive image detection
- Handles CSS background images and styled assets

#### Pseudo-State Capture (PR7)
- Detects and captures `:hover`, `:focus`, `:active` styles
- Maps interaction states to DOM elements
- Preserves pseudo-class styling rules
- Supports complex selectors and cascading

#### Animation & Transition Recording (PR8)
- Captures CSS `@keyframes` definitions
- Records transition properties and timing
- Hooks into Web Animations API for JS-driven animations
- Serializes animation timelines with full metadata

#### Responsive Breakpoint Capture (PR9)
- Simulates mobile, tablet, and desktop viewports
- Captures layout deltas between breakpoints
- Records media query activations and rules
- Analyzes responsive behavior patterns

### 2. Analysis & Processing Phase

#### Tailwind Token Inference (PR10)
- Extracts color palettes from captured styles
- Generates spacing scale from layout measurements
- Infers typography tokens (fonts, sizes, weights)
- Creates Tailwind-compatible design system

**Generated Tokens Include:**
- Primary and secondary color palettes
- Consistent spacing scale (rem/px mapping)
- Typography scale with font stacks
- Color variants (light/dark variations)

#### Component Detection Heuristics (PR11)
- Classifies DOM elements as shadcn/ui components
- Uses semantic HTML, class names, and structural patterns
- Provides confidence scoring for component matches
- Supports buttons, cards, navigation, forms, inputs, badges, avatars, dialogs, tables

**Detection Strategies:**
- Semantic HTML element analysis (`<button>`, `<nav>`, `<form>`)
- CSS class pattern matching (`btn`, `card`, `nav`, etc.)
- ARIA role and accessibility attribute analysis
- Structural pattern recognition (header/body/footer)
- Text content and interaction behavior analysis

### 3. Code Generation Phase

#### Project Scaffold Generator (PR12)
- Creates complete Next.js or Vite + React projects
- Integrates inferred Tailwind tokens into configuration
- Sets up TypeScript, ESLint, and development tooling
- Generates project structure with best practices

#### Component Code Emission (PR13)
- Translates detected components into React/TSX code
- Uses shadcn/ui component primitives
- Applies inferred Tailwind classes for styling
- Maintains component hierarchy and composition

#### Interaction Binding (PR14)
- Maps pseudo-state styles to Tailwind variant classes
- Converts animations to CSS classes or Framer Motion
- Preserves hover, focus, and active behaviors
- Handles responsive breakpoint variations

### 4. Enhanced User Experience

#### Progress UI & Error Handling (PR15)
- Real-time progress reporting via WebSocket
- Detailed phase tracking (DOM → Styles → Assets → Analysis → Generation)
- Graceful error handling with retry mechanisms
- Visual progress indicators in DevTools panel

#### Project Generation Controls
- Interactive configuration for project settings
- Framework selection (Next.js vs Vite)
- Technology stack options (TypeScript, Tailwind, shadcn)
- Custom project naming and output paths

## API Endpoints

### Session Management
- `POST /clone/session/start` - Initialize clone session
- `POST /clone/session/finish` - Complete session and trigger analysis
- `POST /clone/session/:id/chunk` - Stream captured data chunks
- `GET /clone/session/:id` - Get session status and metadata

### Project Generation
- `POST /clone/session/:id/generate` - Generate complete project from session data

### WebSocket Events
- `clone:progress` - Real-time progress updates
- `clone:error` - Error notifications
- `clone:complete` - Session completion notification

## Generated Project Structure

```
my-cloned-site/
├── app/
│   ├── layout.tsx          # Root layout with inferred fonts
│   ├── page.tsx            # Main page with detected components
│   └── globals.css         # Tailwind + custom styles
├── components/
│   └── ui/                 # Generated shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── public/
│   └── asset-manifest.json # Discovered assets metadata
├── package.json            # Dependencies and scripts
├── tailwind.config.js      # Custom design tokens
├── tsconfig.json           # TypeScript configuration
└── next.config.js          # Next.js configuration
```

## Quality Assurance

### Acceptance Criteria Met
- ✅ **PR8**: Sample page with animation yields timeline entries persisted on server
- ✅ **PR9**: Three viewport runs stored with unique identifiers and CSS media query mapping  
- ✅ **PR10**: Token JSON lists primary/secondary colors, spacing steps, font stacks for sample page
- ✅ **PR11**: Known elements tagged with expected shadcn identifiers (e.g., `.btn` → `Button`)
- ✅ **PR12**: Running generator yields buildable project with base layout and shared tokens
- ✅ **PR13**: Generated project renders primary hero section matching source within tolerance
- ✅ **PR14**: Hover/focus/animation behaviors reproduced in generated project demo
- ✅ **PR15**: Long-running clone displays live progress and handles failure gracefully
- ✅ **PR16**: Documentation and samples support contributor validation

### Performance Optimizations
- Chunked data streaming for large websites
- Configurable capture limits to prevent memory issues  
- Efficient style deduplication and normalization
- Progressive enhancement with fallback content

### Browser Compatibility
- Chrome DevTools extension integration
- Cross-origin stylesheet handling
- Modern Web APIs with graceful degradation
- Responsive design capture across viewports

## Usage Examples

### Basic Page Cloning
1. Open Chrome DevTools → BrowserTools panel
2. Navigate to target website
3. Click "Clone Page"
4. Monitor progress in real-time
5. Generate project when analysis completes

### Component-Focused Cloning
1. Select specific DOM elements
2. Click "Clone Selection"  
3. Review detected components in session data
4. Generate focused component library

### Custom Project Generation
1. Complete clone session
2. Configure project settings (framework, TypeScript, etc.)
3. Set custom project name and output path
4. Generate and download complete project

## Future Enhancements

### Planned Features
- Enhanced component variant detection
- CSS-in-JS support (styled-components, emotion)
- Figma design token export
- Advanced animation reproduction
- Multi-page website crawling
- Asset optimization and CDN integration

### Community Contributions
The cloning system is designed for extensibility. Contributors can:
- Add new component detection heuristics
- Implement additional framework targets
- Enhance style analysis capabilities
- Improve responsive behavior capture

## Technical Architecture

### Data Flow
```
Browser Extension → Node Server → MCP Server → AI Client
     ↓               ↓              ↓
  DOM Capture    WebSocket      Tool Responses
  Style Analysis  Streaming     Progress Events  
  Asset Discovery Session Mgmt  Error Handling
```

### Storage Strategy
- Session-based workspace isolation
- JSON serialization for captured data
- Incremental processing with intermediate files
- Cleanup mechanisms for temporary data

### Scalability Considerations
- Horizontal scaling through session isolation
- Memory-efficient streaming for large sites
- Configurable resource limits
- Background processing capabilities

This comprehensive cloning system represents a significant advancement in automated website recreation, providing developers with powerful tools for rapid prototyping, design system extraction, and competitive analysis.