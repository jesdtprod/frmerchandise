# Graph Report - frmerchandise  (2026-09-28)

## Corpus Check
- 57 files · ~81,091 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .css 2, .graphify-bak 1)

## Summary
- 257 nodes · 564 edges · 26 communities (18 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `09ad49e5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- refresh
- generateSalesPdf
- escapeHtml
- money
- FR Merchandise POS
- initCustomDropdowns
- What You Must Do When Invoked
- closeDropdown
- index.ts
- check-pos.mjs
- isMobileScreen
- compilerOptions
- alignTableBadges
- renderStockInHistoryTable
- service-worker.js
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- loadSupabaseSession_
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 41 edges
2. `renderInventory()` - 27 edges
3. `api()` - 26 edges
4. `showToast()` - 25 edges
5. `refresh()` - 21 edges
6. `money()` - 19 edges
7. `renderCart()` - 15 edges
8. `askConfirmation()` - 13 edges
9. `displayCustomerName()` - 13 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Workflow` --references--> `FR Merchandise POS`  [INFERRED]
  AGENTS.md → README.md
- `Backup and Restore` --rationale_for--> `FR Merchandise POS`  [INFERRED]
  docs/OPERATIONS.md → README.md
- `Release Procedure` --rationale_for--> `FR Merchandise POS`  [INFERRED]
  docs/OPERATIONS.md → README.md
- `Bundle Sales` --conceptually_related_to--> `FIFO Selling Price Batches`  [EXTRACTED]
  TASKS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **FIFO Auditability Workflow** — readme_fifo_selling_price_batches, tasks_bundle_sales, docs_operations_backup_and_restore [INFERRED 0.75]

## Communities (26 total, 8 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.04
Nodes (46): actionConfirmDialog, actionConfirmSubmitBtn, adminAccounts, allProducts, appShell, backdrop, branches, bundleAvailability (+38 more)

### Community 1 - "refresh"
Cohesion: 0.17
Nodes (17): calculateOutstandingCreditAccounts(), cartItemTotal(), displayedSellingPrice(), enforcePasswordResetLogout_(), getCartPriceBreakdown(), initAuth(), refresh(), renderAuthSkeletons() (+9 more)

### Community 2 - "generateSalesPdf"
Cohesion: 0.13
Nodes (23): applySession(), bindQuarantineFilterChips_(), ensureQuarantineDateDefaults(), ensureSalesDateDefaults(), formatDateInput(), formatTransferQuantity(), generateInventoryReportPdf(), generateQuarantinePdf() (+15 more)

### Community 3 - "escapeHtml"
Cohesion: 0.21
Nodes (29): addToCart(), api(), askConfirmation(), backgroundRefresh(), changeOwnPassword(), completeRequiredPasswordChange(), deleteCreditPayment(), deleteProduct() (+21 more)

### Community 4 - "money"
Cohesion: 0.19
Nodes (22): displayCustomerName(), money(), openCreditHistory(), openCreditPayment(), openSaleReturnDialog(), openSaleReturnHistoryDialog(), releaseSaleReplacement_(), renderCreditPayments() (+14 more)

### Community 5 - "FR Merchandise POS"
Cohesion: 0.20
Nodes (10): Graphify Workflow, Backup and Restore, Release Procedure, FIFO Selling Price Batches, FR Merchandise POS, Google Apps Script Web App, Google Sheets, Bundle Sales (+2 more)

### Community 6 - "initCustomDropdowns"
Cohesion: 0.38
Nodes (7): initCustomDropdowns(), openSaleCheckout(), saleSubtotal(), sortSelectOptionsAtoZ_(), syncSaleCustomerOptions(), updateCustomDropdown(), updateSaleCheckoutValues()

### Community 7 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 8 - "closeDropdown"
Cohesion: 0.25
Nodes (8): closeDatePicker(), closeDropdown(), initCustomDatePickers(), initSidebarBranchSwitcher(), openDatePicker(), openDropdown(), positionDropdownMenu(), repositionOpenDropdowns()

### Community 9 - "index.ts"
Cohesion: 0.40
Nodes (5): ref_npm_supabase, allowedPermissions, corsHeaders, fail(), json()

### Community 10 - "check-pos.mjs"
Cohesion: 0.40
Nodes (4): ref_node_fs, checks, failures, files

### Community 11 - "isMobileScreen"
Cohesion: 0.50
Nodes (4): handleMenuToggle(), handleSidebarCollapse(), initSidebarState(), isMobileScreen()

### Community 17 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 18 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 19 - "loadSupabaseSession_"
Cohesion: 0.50
Nodes (5): getAppData_(), loadSupabaseSession_(), profileToAccount_(), requireSupabase_(), throwIfError_()

### Community 20 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 21 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 22 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **93 isolated node(s):** `Usage`, `What graphify is for`, `Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)`, `Step 1 - Ensure graphify is installed`, `Step 2 - Detect files` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 114 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `escapeHtml` to `app.js`, `refresh`, `generateSalesPdf`, `money`, `initCustomDropdowns`, `renderStockInHistoryTable`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Usage`, `What graphify is for`, `Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0392156862745098 - nodes in this community are weakly interconnected._
- **Should `generateSalesPdf` be split into smaller, more focused modules?**
  _Cohesion score 0.12648221343873517 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._