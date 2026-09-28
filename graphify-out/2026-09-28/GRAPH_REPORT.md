# Graph Report - frmerchandise  (2026-09-28)

## Corpus Check
- 60 files · ~81,091 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .css 2, .graphify-bak 1)

## Summary
- 197 nodes · 513 edges · 17 communities (12 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- POS Application Shell
- Application Functions
- Report Generation
- Forms and Date Utilities
- Credit Account Management
- Operations and POS Architecture
- Sales Navigation and Setup
- Cart and Checkout
- Datepicker and Dropdown UI
- Supabase Edge Function
- Quality Assurance Scripts
- Responsive Sidebar UI
- Deno Configuration
- Table Badge Alignment
- Stock-In History
- Progressive Web App

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 41 edges
2. `renderInventory()` - 27 edges
3. `api()` - 26 edges
4. `showToast()` - 25 edges
5. `refresh()` - 21 edges
6. `money()` - 19 edges
7. `renderCart()` - 15 edges
8. `displayCustomerName()` - 13 edges
9. `askConfirmation()` - 13 edges
10. `openSaleReturnDialog()` - 12 edges

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

## Communities (17 total, 5 thin omitted)

### Community 0 - "POS Application Shell"
Cohesion: 0.04
Nodes (43): actionConfirmDialog, actionConfirmSubmitBtn, adminAccounts, allProducts, appShell, backdrop, branches, bundleAvailability (+35 more)

### Community 1 - "Application Functions"
Cohesion: 0.13
Nodes (36): api(), applySession(), askConfirmation(), backgroundRefresh(), changeOwnPassword(), completeRequiredPasswordChange(), deleteProduct(), downloadOperationalBackup() (+28 more)

### Community 2 - "Report Generation"
Cohesion: 0.19
Nodes (19): bindQuarantineFilterChips_(), escapeHtml(), formatTransferQuantity(), generateInventoryReportPdf(), generateQuarantinePdf(), generateSalesPdf(), getInventoryReportMovement(), getInventoryReportRows() (+11 more)

### Community 3 - "Forms and Date Utilities"
Cohesion: 0.19
Nodes (19): ensureQuarantineDateDefaults(), ensureSalesDateDefaults(), formatDateInput(), formatDateTime(), openForm(), renderAdminAccount(), renderBranches(), renderDashboard() (+11 more)

### Community 4 - "Credit Account Management"
Cohesion: 0.27
Nodes (14): calculateOutstandingCreditAccounts(), deleteCreditPayment(), displayCustomerName(), money(), openCreditHistory(), openCreditPayment(), openSaleReturnDialog(), renderCreditPayments() (+6 more)

### Community 5 - "Operations and POS Architecture"
Cohesion: 0.20
Nodes (10): Graphify Workflow, Backup and Restore, Release Procedure, FIFO Selling Price Batches, FR Merchandise POS, Google Apps Script Web App, Google Sheets, Bundle Sales (+2 more)

### Community 6 - "Sales Navigation and Setup"
Cohesion: 0.29
Nodes (10): initCustomDropdowns(), openSaleCheckout(), renderBranchSelector(), renderSidebarBranchMenu(), setActiveBranch(), sortSelectOptionsAtoZ_(), syncSaleCustomerOptions(), updateActiveBranchLabels() (+2 more)

### Community 7 - "Cart and Checkout"
Cohesion: 0.29
Nodes (8): addToCart(), cartItemTotal(), displayedSellingPrice(), getCartPriceBreakdown(), renderCart(), saleSubtotal(), updateCartScrollFade(), updateQty()

### Community 8 - "Datepicker and Dropdown UI"
Cohesion: 0.25
Nodes (8): closeDatePicker(), closeDropdown(), initCustomDatePickers(), initSidebarBranchSwitcher(), openDatePicker(), openDropdown(), positionDropdownMenu(), repositionOpenDropdowns()

### Community 9 - "Supabase Edge Function"
Cohesion: 0.40
Nodes (5): ref_npm_supabase, allowedPermissions, corsHeaders, fail(), json()

### Community 10 - "Quality Assurance Scripts"
Cohesion: 0.40
Nodes (4): ref_node_fs, checks, failures, files

### Community 11 - "Responsive Sidebar UI"
Cohesion: 0.50
Nodes (4): handleMenuToggle(), handleSidebarCollapse(), initSidebarState(), isMobileScreen()

## Knowledge Gaps
- **52 isolated node(s):** `supabaseClient`, `products`, `allProducts`, `branches`, `customers` (+47 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 64 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `Report Generation` to `POS Application Shell`, `Application Functions`, `Forms and Date Utilities`, `Credit Account Management`, `Sales Navigation and Setup`, `Cart and Checkout`, `Stock-In History`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `api()` connect `Application Functions` to `POS Application Shell`, `Credit Account Management`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `renderInventory()` connect `Forms and Date Utilities` to `POS Application Shell`, `Application Functions`, `Report Generation`, `Credit Account Management`, `Cart and Checkout`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `supabaseClient`, `products`, `allProducts` to the rest of the system?**
  _52 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `POS Application Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Application Functions` be split into smaller, more focused modules?**
  _Cohesion score 0.1349206349206349 - nodes in this community are weakly interconnected._