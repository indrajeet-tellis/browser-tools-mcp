# Shadcn Clone Incremental Delivery Plan

## Delivery Principles
- Ship narrowly scoped PRs that introduce one capability at a time and keep the extension, browser server, and MCP server deployable after each merge.
- Land cross-surface contracts (types, message shapes) before relying on them in downstream packages.
- Provide smoke tests or manual validation notes in every PR (e.g., console command or curl) so contributors can verify the new feature quickly.

## Milestone Overview
1. **Foundation & Session Orchestration** – establish capture session plumbing and data channels.
2. **Visual & Asset Capture** – stream DOM, styles, and assets for a single viewport.
3. **Interaction & Responsive Capture** – extend capture to pseudo states, animations, and breakpoints.
4. **Shadcn Code Generation** – translate captured data into Tailwind tokens and shadcn components.
5. **UX & Documentation Polish** – finalize DevTools UX, progress reporting, and contributor docs.

## PR-Level Task Breakdown

### Milestone 1 – Foundation & Session Orchestration
1. **PR1: Clone Session Contracts**
   - Add shared TypeScript types for clone sessions, snapshot chunks, and progress events (`browser-tools-server/clone/types.ts`, `browser-tools-mcp/clone-types.ts`).
   - Expose stub MCP tools (`clonePage`, `cloneSelection`) returning `"not implemented"` but exercising discovery.
   - Acceptance: MCP call succeeds with placeholder response; type definitions compile across packages.

2. **PR2: Server Session Lifecycle**
   - Implement `/clone/session/start|finish` REST endpoints plus temp workspace allocation in `browser-tools-server`.
   - Persist `.port` discovery data and basic progress streaming over WebSocket.
   - Acceptance: Manual curl can open/close session and receive progress events.

3. **PR3: DevTools Trigger & UI Scaffold**
   - Add “Clone Page/Selection” buttons, session status indicator in `panel.js`.
   - Wire panel → background messaging to call new server endpoints.
   - Acceptance: Clicking the button starts/finishes a no-op session with visible status updates.

### Milestone 2 – Visual & Asset Capture
4. **PR4: DOM Snapshot Extraction**
   - Inject `captureDomSnapshot` content script returning DOM JSON with attributes, geometry, and child nodes.
   - Stream chunks through background → server; store raw JSON on disk.
   - Acceptance: Captured snapshot file reproduces DOM tree depth/ordering for sample page.

5. **PR5: Stylesheet & Computed Style Capture**
   - Add `collectStylesheets` and `getComputedStyles` helpers capturing CSS text and property maps.
   - Merge results server-side, dedupe by URL/hash.
   - Acceptance: Snapshot bundle includes linked + inline CSS and computed styles for top-level nodes.

6. **PR6: Asset Queue & Downloader**
   - Capture asset URLs during snapshot; add `asset-manager.ts` to download images/fonts/SVGs into session workspace.
   - Generate manifest with original URL, local path, content-type, hash.
   - Acceptance: Assets downloaded for sample page; manifest validated via console script.

### Milestone 3 – Interaction & Responsive Capture
7. **PR7: Pseudo-State Capture Engine**
   - Extend content scripts to toggle `:hover`, `:focus`, `:active`, capturing delta styles.
   - Update data model to store state variants per node.
   - Acceptance: Hovering buttons shows captured style diff in stored JSON.

8. **PR8: Animation & Transition Recorder**
   - Detect CSS `@keyframes`, transitions, and JS-driven animations (MutationObserver + `Element.animate` hooks).
   - Serialize timelines with duration/easing metadata.
   - Acceptance: Sample page with animation yields timeline entries persisted on server.

9. **PR9: Responsive Breakpoint Capture**
   - Automate viewport replay (desktop/tablet/mobile); record layout deltas and media query activations.
   - Extend manifest with breakpoint-resolved snapshots and tags.
   - Acceptance: Three viewport runs stored with unique identifiers and CSS media query mapping.

### Milestone 4 – Shadcn Code Generation
10. **PR10: Tailwind Token Inference**
    - Implement `style-compiler.ts` utilities to derive color palette, spacing scale, typography tokens from captured styles.
    - Emit summary JSON consumed by MCP tool response.
    - Acceptance: Token JSON lists primary/secondary colors, spacing steps, font stacks for sample page.

11. **PR11: Component Detection Heuristics**
    - Introduce `component-mapper.ts` to classify navbars, buttons, cards, etc., tagging DOM nodes with candidate shadcn components.
    - Provide mapping table in session artifacts.
    - Acceptance: Known elements tagged with expected shadcn identifiers (e.g., `.btn` → `Button`).

12. **PR12: Project Scaffold Generator**
    - Automate Next.js + shadcn scaffold creation in temp workspace; inject Tailwind config with inferred tokens.
    - Acceptance: Running generator yields buildable project with base layout and shared tokens.

13. **PR13: Component Code Emission**
    - Translate tagged nodes into `.tsx` files using shadcn primitives plus Tailwind classes; copy assets into `public/`.
    - Acceptance: Generated project renders primary hero section matching source within tolerance (manual visual check).

14. **PR14: Interaction Binding**
    - Map pseudo-state and animation data into Tailwind variant classes or `framer-motion` wrappers; wire navigation/menu handlers.
    - Acceptance: Hover/focus/animation behaviors reproduced in generated project demo.

### Milestone 5 – UX & Documentation Polish
15. **PR15: Progress UI & Error Handling**
    - Enhance DevTools panel with progress bar, log viewer, retry controls; ensure MCP tool streams status updates.
    - Acceptance: Long-running clone displays live progress and handles failure gracefully.

16. **PR16: Documentation & Samples**
    - Update `docs/` with user guide, CLI snippets, and sample clone walkthrough; include risk/warning notes.
    - Acceptance: New docs published, internal QA replicates tutorial successfully.

## Dependency Notes
- PR4 depends on PR1–3 for transport scaffolding.
- PR5–6 extend storage schema introduced in PR4; sequence cannot be swapped.
- PR10+ should branch after visual capture pipeline stabilizes (PR4–6 merged).
- Responsive capture (PR9) feeds token inference (PR10); ensure schema allows multiple breakpoints before PR10.

## Validation Matrix
- Maintain `examples/clone-targets/` with canonical test pages; update manual checklist per milestone.
- Introduce lightweight CLI script in PR12+ to build and preview generated project for regression checks.
