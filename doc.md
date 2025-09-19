# Shadcn Website Cloning Enhancement Plan

## 1. Objective
Deliver an end-to-end BrowserTools enhancement that can clone a target webpage (or selected subtree) and output a faithful recreation implemented in the shadcn/ui component architecture. The solution must capture layout, CSS (including responsive rules), animations, and interaction states directly from the live DOM, then translate that telemetry into an opinionated Next.js + Tailwind codebase structured with shadcn/ui primitives.

## 2. Success Criteria & Constraints
- **Visual fidelity**: Layout, spacing, typography, and color tokens must match the source within 1–2px and 2–3% color variance.
- **Interaction coverage**: Hover, focus, active, and motion states recorded and reproduced via CSS, Tailwind utilities, or framer-motion-friendly variants.
- **Componentization**: Output code uses shadcn/ui components (e.g., `Button`, `Card`, `NavigationMenu`) with extracted props, slots, and composition patterns.
- **Asset completeness**: All media, fonts, and SVGs downloaded and linked relative to the generated project.
- **Agent workflow**: Features exposed as new MCP tools that can be orchestrated from IDE agents without manual browser steps beyond selecting the scope.
- **Performance**: Data collection must complete within ~10s for single-page clones on modern devices; heavy capture tasks need progress reporting.

## 3. Current System Snapshot
- **Chrome Extension (`chrome-extension/`)**: Injects DevTools panel, streams console/network, allows element selection, screenshots, and server discovery.
- **Browser Tools Server (`browser-tools-server/`)**: Express + WebSocket service mediating between extension and MCP, currently focused on logs, screenshots, Lighthouse audits.
- **MCP Server (`browser-tools-mcp/`)**: Exposes audit tools to MCP clients, manages discovery of the browser server, currently returns textual audit summaries.
- **Gaps for cloning**: No DOM snapshot API, no CSS/asset harvesting, limited interaction capture, no downstream code generation.

## 4. Capability Gap Analysis
| Requirement | Existing Support | Required Additions |
|-------------|------------------|--------------------|
| DOM hierarchy & semantics | Element selection only | Full DOM snapshot API with semantic tagging, layout metadata |
| CSS & design tokens | None | Stylesheet crawler, computed style resolver, custom property extraction |
| State/interaction capture | None | Pseudo-state trigger engine, animation timeline recorder |
| Asset packaging | Screenshots only | Downloader for images, fonts, SVG, video with manifest |
| Responsive behavior | None | Multi-viewport replay pipeline capturing breakpoints |
| Code generation | None | Shadcn-aware builder, template scaffolding, Tailwind token mapping |

## 5. Proposed Data Flow
1. **Scope Selection**: User selects `document` or highlight subtree in DevTools panel.
2. **Data Capture (extension)**:
   - Injected script walks DOM, serializes nodes, captures bounding boxes, computed styles (default, hover, active, focus), animation definitions, applied fonts.
   - Network panel feed reused to gather asset URLs; new fetchers download binary data via server.
3. **Processing (browser server)**:
   - Normalizes style data, deduplicates CSS rules, resolves inheritance/cascade, builds breakpoint matrix.
   - Downloads assets, stores under `/tmp/browser-tools-clone/<session>` and records SHA metadata.
   - Maps interaction timelines (transitions, keyframes) into declarative descriptors.
4. **Generation (MCP server)**:
   - Aggregates capture payloads, calls `generateShadcnClone` tool to build project template (Next.js App Router + Tailwind + shadcn), configures `tailwind.config.ts` with extracted tokens.
   - Produces zipped artifact plus JSON summary for the agent to present.
5. **Delivery**: MCP client retrieves artifact, optionally previews via screenshot diffs or design reports.

## 6. Chrome Extension Enhancements
- **New injected helpers** (`panel.js` → content scripts):
  - `captureDomSnapshot({rootSelector?, includeStates})` returning DOM tree with attributes, computed styles for base and pseudo states, geometry, dataset, accessibility roles.
  - `collectStylesheets()` enumerating `<link>` + `<style>` nodes, capturing CSS text, source URLs, and media queries.
  - `scanAnimations()` collecting `@keyframes`, transition durations, easing, iteration counts; record JS-driven animations by intercepting `Element.animate` and `requestAnimationFrame` usage.
  - `captureInteractions()` toggling `:hover`, `:focus`, `:active` via `CSSPseudoElement` API or manual dispatch, storing delta styles.
  - `collectFonts()` capturing `@font-face` declarations, computed font families, and `font-display` rules.
- **Panel UI**: Add “Clone Page” and “Clone Selection” buttons, progress HUD, scope selector, and export action.
- **Messaging**: Extend background ↔ panel messaging to stream chunked results to avoid 4MB DevTools messaging limit.

## 7. Browser Server Enhancements
- **New routes/WebSocket topics**:
  - `POST /clone/session/start` – initialize capture session, allocate workspace, persist `.port` data.
  - `POST /clone/dom` – accept streamed DOM snapshot chunks.
  - `POST /clone/assets` – queue asset downloads, respond with local paths + metadata.
  - `POST /clone/finish` – trigger generation pipeline.
- **Processing modules** (new directory `browser-tools-server/clone/`):
  - `dom-normalizer.ts` – merges snapshots, unwinds shadow DOM, resolves computed styles.
  - `style-compiler.ts` – deduplicates rules, builds Tailwind token proposals (color palette, spacing scale).
  - `interaction-mapper.ts` – converts animations/transitions to data structures (Spring, Duration, Delay, Easing).
  - `asset-manager.ts` – downloads binaries, rewrites URLs, computes placeholder data URIs for small assets.
- **Dependencies**: Consider `css-tree` for parsing, `csso` for minification, `colord` for color conversion, `sharp` for responsive image variants, `fontkit` for font metadata.
- **Security**: Ensure assets downloaded only from inspected origin; sanitize filenames; respect CORS via background fetch from extension when necessary.

## 8. MCP Server Enhancements
- **Tool catalog additions**:
  - `listCloneSessions` – inspect saved captures.
  - `cloneSelection` – orchestrate capture for highlighted node.
  - `clonePage` – clone entire document.
  - `generateShadcnClone` – run codegen pipeline, return artifact path + summary.
- **Workflow**: Tools coordinate with browser server via REST/WebSocket, stream progress events back to client.
- **Outputs**: Provide JSON with keys `projectPath`, `componentMap`, `tokens`, `assetManifest`, `notes`. Optionally surface zipped bundle encoded as base64 if MCP client needs inline transfer.

## 9. Shadcn-Specific Generation Strategy
- **Project scaffold**: Use `create-next-app` + `shadcn/ui` setup tasks scripted via `npx` inside isolated temp directory.
- **Design tokens**:
  - Convert dominant colors to Tailwind theme entries (`primary`, `secondary`, neutrals) with CSS variable mapping.
  - Extract spacing scale by clustering margin/padding values (e.g., 4px increments) and map to Tailwind units (`px`, `0.5`, `1`, etc.).
  - Typography: map captured font stacks to `font-sans`, `font-serif`, define text styles in `/components/ui/typography.tsx` or via Tailwind plugin.
- **Component mapping**:
  - Detect navbars, cards, buttons, tabs, accordions, dialogs; instantiate corresponding shadcn components with props derived from DOM snapshot.
  - For arbitrary layouts (grids, flex), output `div` + Tailwind classes while wrapping repeated patterns into generated components in `/components/custom/`.
  - Maintain metadata file linking original selectors → generated component paths.
- **Interaction reproduction**:
  - Translate CSS animations to Tailwind `animate-` classes or `framer-motion` wrappers, using `variants` derived from animation descriptors.
  - Hover/focus states become Tailwind variant classes (`hover:bg-`, `focus-visible:outline-`). Where Tailwind lacks fidelity, generate scoped CSS modules colocated with component.
- **Content assets**:
  - Copy images/fonts to `public/` with hashed names, update component imports accordingly.
  - Generate `next.config.mjs` for remote images if external URLs remain.

## 10. MVP Breakdown
1. **Phase A – Data Capture Backbone (2 weeks)**
   - DOM snapshot & stylesheet extraction
   - Asset download service
   - Session orchestration + progress streaming
2. **Phase B – Interaction & Responsive Intelligence (2–3 weeks)**
   - Pseudo-state capture, animation timelines
   - Multi-viewport capture (desktop/tablet/mobile presets), responsive diffing
3. **Phase C – Shadcn Code Generator (3 weeks)**
   - Tailwind token inference
   - Component detection heuristics + templating
   - Project scaffold automation, artifact packaging
4. **Phase D – Polish (1–2 weeks)**
   - CLI UX in DevTools panel and MCP tools
   - Error handling, retries, caching
   - Documentation, example clones, regression suite

## 11. Risks & Mitigations
- **Complex CSS features (CSS Houdini, container queries)** – add feature detection, warn when unsupported, capture raw CSS fallback.
- **JS-driven DOM mutations post-load** – instrument MutationObserver during capture window (e.g., 2–3s) to stabilize content.
- **Large pages** – implement pagination of DOM snapshot, skip script tags unless whitelisted, allow user to limit scope.
- **Licensing concerns** – surface warning when cloning trademarked assets, gate download commands behind confirmation.

## 12. Open Questions
- Preferred storage location for generated bundles (`~/Downloads` vs repo `artifacts/`)?
- Should animations default to CSS or offer option for `framer-motion` integration?
- How to handle forms/backend APIs—stub endpoints or leave manual integration notes?
- Do we need diff visualization (DOM vs generated) for QA inside MCP client?

## 13. Next Steps
1. Validate scope with stakeholders; confirm prioritization of full-page vs section clone.
2. Spike on DOM snapshot size and DevTools messaging limits; confirm chunking approach.
3. Prototype Tailwind token inference with existing audit data to ensure palette fidelity.
4. Define automated regression scenario: clone a known marketing page and compare DOM/CSS metrics.
