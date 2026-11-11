# Graph Report - frmerchandise  (2026-11-11)

## Corpus Check
- 56 files · ~83,036 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .css 3, (none) 2, .graphify-bak 1)

## Summary
- 259 nodes · 695 edges · 17 communities (13 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a57e9125`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- updateSaleCheckoutValues
- initCustomDropdowns
- setView
- showToast
- FR Merchandise POS
- Review Focus
- renderBranchSelector
- index.ts
- check-sales-items.mjs
- isMobileScreen
- compilerOptions
- alignTableBadges
- escapeHtml
- service-worker.js
- Daily Spot Cash Design

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 47 edges
2. `renderInventory()` - 37 edges
3. `showToast()` - 28 edges
4. `api()` - 26 edges
5. `money()` - 25 edges
6. `refresh()` - 21 edges
7. `renderPaginationControls_()` - 19 edges
8. `askConfirmation()` - 16 edges
9. `renderCart()` - 16 edges
10. `renderDashboard()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Task 2: Branch-scoped Daily Spot Cash UI` --references--> `askConfirmation()`  [INFERRED]
  docs/superpowers/plans/2026-09-29-daily-spot-cash.md → app.js
- `Task 2: Branch-scoped Daily Spot Cash UI` --references--> `renderDailySpotCash()`  [INFERRED]
  docs/superpowers/plans/2026-09-29-daily-spot-cash.md → app.js
- `Backup and Restore` --rationale_for--> `FR Merchandise POS`  [INFERRED]
  docs/OPERATIONS.md → README.md
- `Release Procedure` --rationale_for--> `FR Merchandise POS`  [INFERRED]
  docs/OPERATIONS.md → README.md
- `Graphify Workflow` --references--> `FR Merchandise POS`  [INFERRED]
  AGENTS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **FIFO Auditability Workflow** — readme_fifo_selling_price_batches, tasks_bundle_sales, docs_operations_backup_and_restore [INFERRED 0.75]

## Communities (17 total, 4 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.03
Nodes (70): actionConfirmDialog, actionConfirmSubmitBtn, adminAccounts, allProducts, appShell, backdrop, bindQuarantineFilterChips_(), branches (+62 more)

### Community 1 - "updateSaleCheckoutValues"
Cohesion: 0.50
Nodes (4): cartItemTotal(), openSaleCheckout(), saleSubtotal(), updateSaleCheckoutValues()

### Community 2 - "initCustomDropdowns"
Cohesion: 0.22
Nodes (11): closeDatePicker(), closeDropdown(), initCustomDatePickers(), initCustomDropdowns(), initSidebarBranchSwitcher(), openDatePicker(), openDropdown(), positionDropdownMenu() (+3 more)

### Community 3 - "setView"
Cohesion: 0.12
Nodes (28): buildSalesPdfReport_(), ensureCreditsDateDefaults(), ensureDailyExpensesDateDefaults(), ensureDailySpotCashDateDefaults(), ensureQuarantineDateDefaults(), ensureSalesDateDefaults(), ensureTransfersDateDefaults(), exportSalesPdf() (+20 more)

### Community 4 - "showToast"
Cohesion: 0.14
Nodes (39): api(), applySession(), askConfirmation(), backgroundRefresh(), calculateOutstandingCreditAccounts(), changeOwnPassword(), completeRequiredPasswordChange(), deleteCreditPayment() (+31 more)

### Community 5 - "FR Merchandise POS"
Cohesion: 0.20
Nodes (6): FR Merchandise POS, Google Apps Script Web App, Google Sheets, Bundle Sales, Individual Item Returns, Returns Replacements and Bundles

### Community 6 - "Review Focus"
Cohesion: 0.29
Nodes (6): Daily Spot Cash Implementation Plan, Global Constraints, Review Focus, Task 1: Database and permission contract, Task 2: Branch-scoped Daily Spot Cash UI, Task 3: Deployment and acceptance verification

### Community 8 - "renderBranchSelector"
Cohesion: 0.83
Nodes (4): renderBranchSelector(), renderSidebarBranchMenu(), setActiveBranch(), updateActiveBranchLabels()

### Community 9 - "index.ts"
Cohesion: 0.40
Nodes (4): allowedPermissions, corsHeaders, fail(), json()

### Community 10 - "check-sales-items.mjs"
Cohesion: 0.13
Nodes (8): checks, failures, files, context, error, helper, items, report

### Community 11 - "isMobileScreen"
Cohesion: 0.50
Nodes (4): handleMenuToggle(), handleSidebarCollapse(), initSidebarState(), isMobileScreen()

### Community 14 - "escapeHtml"
Cohesion: 0.20
Nodes (39): addToCart(), bindPaginationEvents_(), displayCustomerName(), displayedSellingPrice(), escapeHtml(), formatDateTime(), getCartPriceBreakdown(), getCustomerInitials() (+31 more)

### Community 19 - "Daily Spot Cash Design"
Cohesion: 0.22
Nodes (8): Acceptance criteria, Access and audit, Daily Spot Cash Design, Data flow, Goal, Record model, Scope, User interface

## Knowledge Gaps
- **2 isolated node(s):** `Google Sheets`, `Individual Item Returns`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 98 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Task 2: Branch-scoped Daily Spot Cash UI` connect `Review Focus` to `showToast`, `escapeHtml`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `Google Sheets`, `Individual Item Returns` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.02666666666666667 - nodes in this community are weakly interconnected._
- **Why does `renderDailySpotCash()` connect `escapeHtml` to `app.js`, `setView`, `showToast`, `Review Focus`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `setView` be split into smaller, more focused modules?**
  _Cohesion score 0.12169312169312169 - nodes in this community are weakly interconnected._
- **Should `showToast` be split into smaller, more focused modules?**
  _Cohesion score 0.13630229419703105 - nodes in this community are weakly interconnected._
- **Should `check-sales-items.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._