const ACTIVE_BRANCH_KEY = 'fr-pos-active-branch';
const ACTIVE_VIEW_KEY = 'fr-pos-active-view';
let activeBranchId = localStorage.getItem(ACTIVE_BRANCH_KEY) || 'MAIN';
const endpointKey = 'fr-pos-api-url';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyyYPXS315h-QMn1WRCAbbDh2BirtPyiF1729_k1reR3SSWLknom-cKPJQuMMsA_gfF/exec';
let products = [];
let allProducts = [];
let branches = [];
let customers = [];
let transfers = [];
let creditAccounts = [];
let creditPayments = [];
let pendingCreditAccount = null;
let salesHistory = [];
let inventoryReportData = {};
let cart = [];
let activeForm = '';
let activeView = 'pos';
let currentSession = null;
let staffAccounts = [];
let adminAccount = null;
let adminAccounts = [];
let editingProductId = '';
let pendingActionConfirmResolver = null;
let toastTimer = null;

const PRODUCT_CATEGORIES = ['LPG', 'Softdrinks', 'Others'];
const PRODUCT_UNITS = ['pc', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'case', 'pack', 'box', 'bag', 'sack', 'tray', 'gallon', 'drum'];

const $ = (selector) => document.querySelector(selector);
const money = (value) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let badgeAlignmentFrame = 0;
function alignTableBadges() {
  const table = $('#inventoryTable');
  if (!table) return;
  const badges = [...table.querySelectorAll('.stock-pill, .low-stock-pill, .category-badge, .transfer-quantity, .credit-sale-badge, .payment-collected-badge')]
    .filter((badge) => badge.getBoundingClientRect().width > 0);

  badges.forEach((badge) => {
    badge.style.width = '';
    badge.style.justifyContent = '';
  });
  if (window.matchMedia('(max-width: 640px)').matches) return;

  const columns = new Map();
  badges.forEach((badge) => {
    const rect = badge.getBoundingClientRect();
    const key = Math.round(rect.left / 4) * 4;
    const column = columns.get(key) || { width: 0, badges: [] };
    column.width = Math.max(column.width, rect.width);
    column.badges.push(badge);
    columns.set(key, column);
  });
  columns.forEach((column) => column.badges.forEach((badge) => {
    badge.style.width = `${Math.ceil(column.width)}px`;
    badge.style.justifyContent = badge.classList.contains('transfer-quantity') ? 'flex-start' : 'center';
  }));
}

function scheduleBadgeAlignment() {
  cancelAnimationFrame(badgeAlignmentFrame);
  badgeAlignmentFrame = requestAnimationFrame(alignTableBadges);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function displayCustomerName(value) {
  return String(value ?? '').toUpperCase();
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureSalesDateDefaults() {
  const dateFrom = $('#salesDateFrom');
  const dateTo = $('#salesDateTo');
  if (!dateFrom || !dateTo) return;

  const today = new Date();
  if (!dateFrom.value) dateFrom.value = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
  if (!dateTo.value) dateTo.value = formatDateInput(today);
  syncCustomDatePicker(dateFrom);
  syncCustomDatePicker(dateTo);
}

function saleDateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDateInput(date);
}

function calculateOutstandingCreditAccounts(sales, payments) {
  const paidBySale = payments.reduce((totals, payment) => {
    totals[payment.saleId] = (totals[payment.saleId] || 0) + Number(payment.amount || 0);
    return totals;
  }, {});
  return sales
    .filter((sale) => String(sale.paymentType || '').toLowerCase() === 'credit')
    .map((sale) => {
      const total = Number(sale.total || 0);
      const paid = paidBySale[sale.saleId] || 0;
      return { saleId: sale.saleId, customerId: sale.customerId, customerName: sale.customerName, date: sale.date, total, paid, balance: Math.max(total - paid, 0) };
    })
    .filter((account) => account.balance > 0.00001)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function updateSalesPrintPeriod() {
  const period = $('#salesPrintPeriod');
  const dateFrom = $('#salesDateFrom')?.value || '';
  const dateTo = $('#salesDateTo')?.value || '';
  if (!period) return;

  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'long' })
    : 'All dates';
  period.textContent = `Period: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
}

function generateSalesPdf() {
  ensureSalesDateDefaults();
  updateSalesPrintPeriod();

  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const dateFrom = $('#salesDateFrom')?.value || '';
  const dateTo = $('#salesDateTo')?.value || '';
  const branch = branches.find((item) => item.id === activeBranchId) || { name: 'Main Branch' };

  const sales = salesHistory.filter((sale) => {
    const matchesTerm = `${sale.saleId} ${sale.customerName} ${sale.paymentType}`.toLowerCase().includes(term);
    const saleDate = saleDateKey(sale.date);
    return matchesTerm && (!dateFrom || saleDate >= dateFrom) && (!dateTo || saleDate <= dateTo);
  });

  const printDoc = $('#salesPrintDocument');
  if (!printDoc) {
    window.print();
    return;
  }

  const totalSales = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalItemsCount = sales.reduce((sum, s) => sum + (s.items || []).reduce((iSum, i) => iSum + Number(i.qty || 1), 0), 0);
  const cashSales = sales.filter((s) => s.paymentType === 'cash');
  const creditSales = sales.filter((s) => s.paymentType === 'credit');
  const totalCash = cashSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalCredit = creditSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalDiscounts = sales.reduce((sum, s) => sum + Number(s.discount || 0), 0);

  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'All dates';
  const periodText = (dateFrom || dateTo)
    ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
    : 'All Recorded Dates';
  const generatedTime = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  printDoc.innerHTML = `
    <div class="report-page">
      <!-- Report Header -->
      <header class="report-header">
        <div class="report-brand-wrap">
          <div class="report-logo">
            <svg viewBox="0 0 36 36" class="report-badge-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18" cy="18" r="16.5" fill="#081326"/>
              <path d="M 2.5 18 A 15.5 15.5 0 0 1 33.5 18" stroke="#E32934" stroke-width="2.6"/>
              <path d="M 33.5 18 A 15.5 15.5 0 0 1 2.5 18" stroke="#0066F5" stroke-width="2.6"/>
              <path d="M9 11h7.5v2.6h-4.8v3.5h3.8v2.5h-3.8V25H9V11z M18.5 11h4.6c2.4 0 4 1.3 4 3.6 0 1.6-.9 2.8-2.3 3.3l2.8 7.1h-2.9l-2.5-6.6h-1.1V25H18.5V11zm2.6 2.4v3.1h1.9c1 0 1.6-.6 1.6-1.5s-.6-1.6-1.6-1.6h-1.9z" fill="#FFFFFF"/>
            </svg>
          </div>
          <div>
            <span class="report-eyebrow">FR MERCHANDISE OPERATIONS</span>
            <h1 class="report-title">Branch Sales & Inventory Ledger</h1>
            <p class="report-subtitle">Official Transaction & Itemized Line-Item Audit Report</p>
          </div>
        </div>

        <div class="report-meta-box">
          <div class="report-meta-row">
            <span class="meta-label">Branch:</span>
            <strong class="meta-val">${escapeHtml(branch.name || 'Main Branch')}</strong>
          </div>
          <div class="report-meta-row">
            <span class="meta-label">Period:</span>
            <strong class="meta-val">${escapeHtml(periodText)}</strong>
          </div>
          <div class="report-meta-row">
            <span class="meta-label">Generated:</span>
            <span class="meta-val">${escapeHtml(generatedTime)}</span>
          </div>
        </div>
      </header>

      <!-- KPI Metrics Strip -->
      <section class="report-kpi-grid">
        <div class="report-kpi-card">
          <span class="kpi-label">Gross Revenue</span>
          <strong class="kpi-val">${money(totalSales)}</strong>
          <span class="kpi-sub">${sales.length} transactions</span>
        </div>
        <div class="report-kpi-card">
          <span class="kpi-label">Cash Collected</span>
          <strong class="kpi-val text-success">${money(totalCash)}</strong>
          <span class="kpi-sub">${cashSales.length} paid cash</span>
        </div>
        <div class="report-kpi-card">
          <span class="kpi-label">Credit Charged</span>
          <strong class="kpi-val text-amber">${money(totalCredit)}</strong>
          <span class="kpi-sub">${creditSales.length} on credit</span>
        </div>
        <div class="report-kpi-card">
          <span class="kpi-label">Total Units Sold</span>
          <strong class="kpi-val">${totalItemsCount}</strong>
          <span class="kpi-sub">Items dispensed</span>
        </div>
      </section>

      <!-- Transactions List with Full Line Items -->
      <section class="report-ledger-body">
        <div class="report-section-title-wrap">
          <h2 class="report-section-title">Itemized Transaction Records</h2>
          <span class="report-count-badge">${sales.length} Completed Orders</span>
        </div>

        ${sales.length === 0 ? `
          <div class="report-empty-state">
            <p>No sales records found for the selected period.</p>
          </div>
        ` : `
          <div class="report-tx-list">
            ${sales.map((sale, saleIndex) => {
              const items = sale.items || [];
              const isCash = sale.paymentType === 'cash';
              const saleDateFormatted = sale.date
                ? new Date(sale.date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                : 'N/A';
              const customerDisplay = displayCustomerName(sale.customerName || 'Walk-in customer');

              return `
                <article class="report-tx-card">
                  <header class="report-tx-head">
                    <div class="tx-head-left">
                      <div class="tx-id-badge">
                        <span class="tx-index">#${saleIndex + 1}</span>
                        <strong class="tx-receipt-no">${escapeHtml(sale.saleId)}</strong>
                      </div>
                      <span class="tx-date">${escapeHtml(saleDateFormatted)}</span>
                    </div>

                    <div class="tx-head-mid">
                      <strong class="tx-customer-name">${escapeHtml(customerDisplay)}</strong>
                      <span class="tx-payment-tag ${isCash ? 'is-cash' : 'is-credit'}">
                        ${isCash ? 'PAID CASH' : 'CREDIT CHARGED'}
                      </span>
                    </div>

                    <div class="tx-head-right">
                      <span class="tx-total-label">Total</span>
                      <strong class="tx-total-amount">${money(sale.total)}</strong>
                    </div>
                  </header>

                  <!-- Line Items Table -->
                  <div class="report-tx-items-wrap">
                    <table class="report-items-table">
                      <thead>
                        <tr>
                          <th style="width: 40px;">#</th>
                          <th>Purchased Item Description</th>
                          <th style="width: 80px; text-align: center;">Qty</th>
                          <th style="width: 110px; text-align: right;">Unit Price</th>
                          <th style="width: 120px; text-align: right;">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${items.length === 0 ? `
                          <tr>
                            <td colspan="5" style="text-align: center; color: #64748b; padding: 8px;">No line items detailed</td>
                          </tr>
                        ` : items.map((it, itIdx) => {
                          const itemQty = Number(it.qty || 1);
                          const itemPrice = Number(it.price || 0);
                          const lineTotal = itemQty * itemPrice;
                          return `
                            <tr>
                              <td class="col-num">${itIdx + 1}</td>
                              <td class="col-name">
                                <strong class="item-name">${escapeHtml(it.name || 'Unknown item')}</strong>
                              </td>
                              <td class="col-qty" style="text-align: center;">${itemQty} ${escapeHtml(it.unit || 'pcs')}</td>
                              <td class="col-price" style="text-align: right;">${money(itemPrice)}</td>
                              <td class="col-total" style="text-align: right;"><strong>${money(lineTotal)}</strong></td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>

                  <!-- Transaction Footer / Sub-breakdown -->
                  <footer class="report-tx-foot">
                    <div class="tx-foot-details">
                      ${isCash && Number(sale.cashTendered) > 0 ? `
                        <span>Cash Tendered: <strong>${money(sale.cashTendered)}</strong> &bull; Change Given: <strong>${money(sale.change || 0)}</strong></span>
                      ` : !isCash ? `
                        <span>Customer Balance Remaining: <strong>${money(sale.creditBalance || 0)}</strong></span>
                      ` : ''}
                    </div>
                    <div class="tx-foot-summary">
                      ${Number(sale.discount) > 0 ? `
                        <span class="tx-discount-note">Discount: -${money(sale.discount)}</span>
                      ` : ''}
                      <span class="tx-items-count">${items.length} item${items.length === 1 ? '' : 's'} (${items.reduce((acc, i) => acc + Number(i.qty || 1), 0)} units)</span>
                    </div>
                  </footer>
                </article>
              `;
            }).join('')}
          </div>
        `}
      </section>

      <!-- Grand Totals Box & Sign-off Block -->
      <footer class="report-document-footer">
        <div class="report-final-totals">
          <div class="final-row">
            <span>Total Gross Sales:</span>
            <strong>${money(totalSales + totalDiscounts)}</strong>
          </div>
          ${totalDiscounts > 0 ? `
            <div class="final-row text-discount">
              <span>Total Discounts Granted:</span>
              <strong>-${money(totalDiscounts)}</strong>
            </div>
          ` : ''}
          <div class="final-row final-grand-total">
            <span>Net Revenue Recorded:</span>
            <strong class="grand-total-val">${money(totalSales)}</strong>
          </div>
        </div>

        <div class="report-sign-block">
          <div class="sign-column">
            <div class="sign-line"></div>
            <span class="sign-title">Prepared By (Cashier / Staff)</span>
            <span class="sign-sub">Signature over printed name</span>
          </div>
          <div class="sign-column">
            <div class="sign-line"></div>
            <span class="sign-title">Audited & Verified By</span>
            <span class="sign-sub">Branch Manager / Operations</span>
          </div>
        </div>

        <div class="report-disclaimer">
          <p>FR MERCHANDISE SYSTEM-GENERATED SALES AUDIT REPORT &bull; CONFIDENTIAL &bull; ALL RIGHTS RESERVED</p>
        </div>
      </footer>
    </div>
  `;

  document.body.dataset.printMode = 'sales';
  const clearPrintMode = () => {
    delete document.body.dataset.printMode;
    printDoc.hidden = true;
    printDoc.innerHTML = '';
    window.removeEventListener('afterprint', clearPrintMode);
  };
  window.addEventListener('afterprint', clearPrintMode);
  printDoc.hidden = false;
  window.print();
}

function generateInventoryReportPdf() {
  const printDoc = $('#salesPrintDocument');
  if (!printDoc) return;

  const branch = branches.find((item) => item.id === activeBranchId) || { name: 'Main Branch' };
  const rows = getInventoryReportRows();
  const generatedTime = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  printDoc.innerHTML = `
    <div class="report-page inventory-print-page">
      <header class="report-header">
        <div class="report-brand-wrap">
          <svg viewBox="0 0 36 36" class="report-badge-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="18" cy="18" r="16.5" fill="#081326"/>
            <path d="M 2.5 18 A 15.5 15.5 0 0 1 33.5 18" stroke="#E32934" stroke-width="2.6"/>
            <path d="M 33.5 18 A 15.5 15.5 0 0 1 2.5 18" stroke="#0066F5" stroke-width="2.6"/>
            <path d="M9 11h7.5v2.6h-4.8v3.5h3.8v2.5h-3.8V25H9V11z M18.5 11h4.6c2.4 0 4 1.3 4 3.6 0 1.6-.9 2.8-2.3 3.3l2.8 7.1h-2.9l-2.5-6.6h-1.1V25H18.5V11zm2.6 2.4v3.1h1.9c1 0 1.6-.6 1.6-1.5s-.6-1.6-1.6-1.6h-1.9z" fill="#FFFFFF"/>
          </svg>
          <div>
            <span class="report-eyebrow">FR MERCHANDISE OPERATIONS</span>
            <h1 class="report-title">Branch Inventory Report</h1>
            <p class="report-subtitle">Stock movement and remaining inventory by product</p>
          </div>
        </div>
        <div class="report-meta-box">
          <div class="report-meta-row"><span class="meta-label">Branch:</span><strong class="meta-val">${escapeHtml(branch.name || 'Main Branch')}</strong></div>
          <div class="report-meta-row"><span class="meta-label">Scope:</span><strong class="meta-val">Active Branch Inventory</strong></div>
          <div class="report-meta-row"><span class="meta-label">Generated:</span><span class="meta-val">${escapeHtml(generatedTime)}</span></div>
        </div>
      </header>

      <section class="report-ledger-body">
        <div class="report-section-title-wrap"><h2 class="report-section-title">Inventory Movement by Product</h2><span class="report-count-badge">${rows.length} Products</span></div>
        <div class="report-tx-card">
          <div class="report-tx-items-wrap">
            <table class="report-items-table inventory-report-table">
              <thead><tr><th>Product</th><th style="text-align:center;">Qty Sold</th><th style="text-align:center;">Qty Stock In</th><th style="text-align:center;">Qty Transfer</th><th style="text-align:center;">Qty Remaining</th><th style="text-align:right;">Status</th></tr></thead>
              <tbody>
                ${rows.map((product) => {
                  const qty = Math.max(Number(product.qty) || 0, 0);
                  const status = getInventoryReportStatus(product);
                  const movement = getInventoryReportMovement(product.id);
                  return `<tr><td class="col-name"><strong class="item-name">${escapeHtml(product.name)}</strong><br><span>${escapeHtml(product.sku || product.id)} &bull; ${escapeHtml(product.unit || 'unit')}</span></td><td style="text-align:center;">${(Number(movement.qtySold) || 0).toLocaleString('en-PH')}</td><td style="text-align:center;">${(Number(movement.qtyStockIn) || 0).toLocaleString('en-PH')}</td><td style="text-align:center;">${formatTransferQuantity(movement)}</td><td style="text-align:center;"><strong>${qty.toLocaleString('en-PH')}</strong></td><td style="text-align:right;">${escapeHtml(status.label)}</td></tr>`;
                }).join('') || '<tr><td colspan="6" style="text-align:center; padding:12px;">No inventory records found.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer class="report-document-footer">
        <div class="report-sign-block"><div class="sign-column"><div class="sign-line"></div><span class="sign-title">Prepared By (Cashier / Staff)</span><span class="sign-sub">Signature over printed name</span></div><div class="sign-column"><div class="sign-line"></div><span class="sign-title">Audited & Verified By</span><span class="sign-sub">Branch Manager / Operations</span></div></div>
        <div class="report-disclaimer"><p>FR MERCHANDISE SYSTEM-GENERATED INVENTORY REPORT &bull; CONFIDENTIAL &bull; ALL RIGHTS RESERVED</p></div>
      </footer>
    </div>
  `;

  document.body.dataset.printMode = 'sales';
  const clearPrintMode = () => {
    delete document.body.dataset.printMode;
    printDoc.hidden = true;
    printDoc.innerHTML = '';
    window.removeEventListener('afterprint', clearPrintMode);
  };
  window.addEventListener('afterprint', clearPrintMode);
  printDoc.hidden = false;
  window.print();
}

function askConfirmation({
  title = 'Confirm Action',
  eyebrow = 'CONFIRM ACTION',
  subtitle = 'Please review before continuing',
  message = 'Are you sure you want to proceed?',
  warning = '',
  confirmText = 'Confirm',
  confirmType = 'primary',
  icon = null,
}) {
  return new Promise((resolve) => {
    pendingActionConfirmResolver = resolve;

    const dialog = $('#actionConfirmDialog');
    const titleEl = $('#actionConfirmTitle');
    const eyebrowEl = $('#actionConfirmEyebrow');
    const subtitleEl = $('#actionConfirmSubtitle');
    const textEl = $('#actionConfirmText');
    const warningBox = $('#actionConfirmWarningBox');
    const warningText = $('#actionConfirmWarning');
    const submitBtn = $('#actionConfirmSubmitBtn');
    const submitText = $('#actionConfirmSubmitText');
    const iconBadge = $('#actionConfirmIcon');

    if (titleEl) titleEl.textContent = title;
    if (eyebrowEl) {
      eyebrowEl.textContent = eyebrow;
      eyebrowEl.className = `modal-eyebrow confirm-eyebrow ${confirmType === 'primary' ? 'primary-theme' : confirmType === 'success' ? 'success-theme' : ''}`;
    }
    if (subtitleEl) subtitleEl.textContent = subtitle;
    if (textEl) textEl.innerHTML = message;

    if (warningBox && warningText) {
      if (warning) {
        warningText.textContent = warning;
        warningBox.hidden = false;
        warningBox.className = `confirm-warning-box ${confirmType === 'primary' ? 'info-theme' : confirmType === 'success' ? 'success-theme' : ''}`;
      } else {
        warningBox.hidden = true;
      }
    }

    if (submitText) submitText.textContent = confirmText;
    if (submitBtn) {
      submitBtn.className = `button ${
        confirmType === 'danger'
          ? 'modal-delete-btn'
          : confirmType === 'success'
          ? 'modal-success-btn'
          : 'modal-save-btn'
      }`;
    }

    if (iconBadge) {
      iconBadge.className = `modal-icon-badge ${
        confirmType === 'danger'
          ? 'confirm-danger-badge'
          : confirmType === 'success'
          ? 'confirm-success-badge'
          : 'confirm-primary-badge'
      }`;

      if (icon) {
        iconBadge.innerHTML = icon;
      } else if (confirmType === 'danger') {
        iconBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      } else if (confirmType === 'success') {
        iconBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else {
        iconBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      }
    }

    if (dialog) dialog.showModal();
  });
}


/* ==========================================================================
   API CLIENT
   ========================================================================== */
async function api(action, payload = {}, method = 'POST') {
  const url = localStorage.getItem(endpointKey) || DEFAULT_API_URL;
  if (!url) throw new Error('Add your Apps Script Web App URL in settings first.');
  const session = currentSession || JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  const securedPayload = ['getSetupStatus', 'createFirstAdmin', 'login', 'restoreSession', 'logout'].includes(action) ? payload : { ...payload, token: payload.token || session?.token };
  const options = method === 'GET' ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...securedPayload }),
  };
  const target = method === 'GET' ? `${url}?${new URLSearchParams({ action, ...securedPayload })}` : url;
  const response = await fetch(target, options);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'The API request failed.');
  return result.data;
}

/* ==========================================================================
   GLOBAL CENTRALIZED FLOATING TOAST NOTIFICATION
   (User Rule: Always use global and centralized floating toast notification)
   ========================================================================== */
function showToast(message, type = 'info') {
  const toast = $('#toast');
  const messageEl = $('#toastMessage');
  const iconWrap = $('#toastIconWrap');
  if (!toast || !messageEl || !iconWrap) return;

  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  };

  iconWrap.innerHTML = icons[type] || icons.info;
  messageEl.textContent = message;
  toast.className = `toast show ${type}`;
  if (typeof toast.showPopover === 'function' && !toast.matches(':popover-open')) toast.showPopover();

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (typeof toast.hidePopover === 'function' && toast.matches(':popover-open')) toast.hidePopover();
    }, 300);
  }, 3200);
}

/* ==========================================================================
   SKELETON LOADING
   (User Rule: Always implement skeleton loading in every)
   ========================================================================== */
function renderSkeletonTable() {
  const table = $('#inventoryTable');
  if (!table) return;
  const headers = activeView === 'products'
    ? ['Product', 'Category', 'Selling price', 'Quantity in stock', 'Low stock', 'Status', 'Action']
    : activeView === 'inventory'
    ? ['Product', 'Category', 'Current stock', 'Stock warning', 'Status']
    : activeView === 'inventoryReports'
    ? ['Product', 'Qty sold', 'Qty stock in', 'Qty transfer', 'Qty remaining', 'Status']
    : activeView === 'branches'
    ? ['Branch', 'Type', 'Address', 'Status', 'Action']
    : activeView === 'customers'
    ? ['Customer', 'Phone', 'Address', 'Status', 'Action']
    : activeView === 'transfers'
    ? ['Transfer', 'Route', 'Product', 'Status', 'Action']
    : activeView === 'credits'
    ? ['Customer', 'Credit Sale', 'Original Amount', 'Amount Due', 'Action']
    : activeView === 'sales'
    ? ['Receipt', 'Date and Time', 'Customer', 'Payment', 'Total', 'Action']
    : activeView === 'staffAccounts'
    ? ['Staff Account', 'Assigned Branch', 'Menu Access', 'Status', 'Action']
    : activeView === 'adminAccount'
    ? ['Administrator', 'Username', 'Access', 'Status', 'Action']
    : ['Product', 'Selling price', 'Stock', 'Action'];

  const getSkeletonMiddleCells = () => {
    if (activeView === 'products') {
      return `
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line price"></div></div>
        <div><div class="skeleton-shimmer skeleton-line qty"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'inventory') {
      return `
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'inventoryReports') {
      return `
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'branches') {
      return `
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
        <div><div class="skeleton-shimmer skeleton-line text" style="width:130px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'customers') {
      return `
        <div><div class="skeleton-shimmer skeleton-line text" style="width:100px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line text" style="width:130px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'transfers') {
      return `
        <div><div class="skeleton-shimmer skeleton-line text" style="width:140px;"></div></div>
        <div class="skeleton-col"><div class="skeleton-shimmer skeleton-line title" style="width:110px;"></div><div class="skeleton-shimmer skeleton-line meta" style="width:60px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
      `;
    }
    if (activeView === 'credits') {
      return `
        <div class="skeleton-col"><div class="skeleton-shimmer skeleton-line title" style="width:105px;"></div><div class="skeleton-shimmer skeleton-line meta" style="width:70px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line price" style="width:80px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line price" style="width:80px;"></div></div>
      `;
    }
    if (activeView === 'sales') {
      return `
        <div><div class="skeleton-shimmer skeleton-line text" style="width:130px;"></div></div>
        <div class="skeleton-col"><div class="skeleton-shimmer skeleton-line title" style="width:135px;"></div><div class="skeleton-shimmer skeleton-line meta" style="width:85px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill" style="width:70px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line price" style="width:90px;"></div></div>
      `;
    }
    if (activeView === 'staffAccounts') {
      return `
        <div><div class="skeleton-shimmer skeleton-line pill" style="width:110px;"></div></div>
        <div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            <div class="skeleton-shimmer skeleton-line pill" style="width:55px;height:22px;border-radius:6px;"></div>
            <div class="skeleton-shimmer skeleton-line pill" style="width:72px;height:22px;border-radius:6px;"></div>
            <div class="skeleton-shimmer skeleton-line pill" style="width:68px;height:22px;border-radius:6px;"></div>
          </div>
        </div>
        <div><div class="skeleton-shimmer skeleton-line pill" style="width:70px;"></div></div>
      `;
    }
    if (activeView === 'adminAccount') {
      return `
        <div><div class="skeleton-shimmer skeleton-line text" style="width:110px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill" style="width:140px;"></div></div>
        <div><div class="skeleton-shimmer skeleton-line pill" style="width:70px;"></div></div>
      `;
    }
    // Default / POS view:
    return `
      <div><div class="skeleton-shimmer skeleton-line price"></div></div>
      <div><div class="skeleton-shimmer skeleton-line pill"></div></div>
    `;
  };

  const hasAction = !['inventory', 'inventoryReports'].includes(activeView);

  const getSkeletonActionCell = () => {
    if (!hasAction) return '';
    if (activeView === 'staffAccounts') {
      return `
        <div class="row-action-cell skeleton-action-cell">
          <span class="table-actions" style="display:flex;gap:6px;align-items:center;">
            <div class="skeleton-shimmer skeleton-line btn" style="width:32px;height:32px;border-radius:9px;"></div>
            <div class="skeleton-shimmer skeleton-line btn" style="width:32px;height:32px;border-radius:9px;"></div>
            <div class="skeleton-shimmer skeleton-line btn" style="width:32px;height:32px;border-radius:9px;"></div>
          </span>
        </div>
      `;
    }
    if (activeView === 'credits' || activeView === 'products') {
      return `
        <div class="row-action-cell skeleton-action-cell">
          <span class="table-actions" style="display:flex;gap:6px;align-items:center;">
            <div class="skeleton-shimmer skeleton-line btn" style="width:32px;height:32px;border-radius:9px;"></div>
            <div class="skeleton-shimmer skeleton-line btn" style="width:32px;height:32px;border-radius:9px;"></div>
          </span>
        </div>
      `;
    }
    return `
      <div class="row-action-cell skeleton-action-cell">
        <div class="skeleton-shimmer skeleton-line btn"></div>
      </div>
    `;
  };

  const rows = Array.from({ length: 5 }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton-col skeleton-prod-col">
        <div class="skeleton-shimmer skeleton-line title"></div>
        <div class="skeleton-shimmer skeleton-line meta"></div>
      </div>
      <div class="row-middle-cells skeleton-middle-cells">
        ${getSkeletonMiddleCells()}
      </div>
      ${getSkeletonActionCell()}
    </div>
  `).join('');

  table.innerHTML = `
    <div class="table-row table-header">
      ${headers.map((header) => `<span>${header}</span>`).join('')}
    </div>
    ${rows}
  `;
}

/* ==========================================================================
   SMOOTH CUSTOM DROPDOWN SYSTEM
   (User Requirement: Make everything smooth and the dropdown must be smooth)
   ========================================================================== */
function initCustomDropdowns(container = document) {
  const selects = container.querySelectorAll('select:not([data-custom-enhanced])');

  selects.forEach((select) => {
    select.setAttribute('data-custom-enhanced', 'true');
    select.classList.add('native-hidden');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    const isBranch = select.id === 'branchSelector' || select.classList.contains('branch-label');
    if (isBranch) {
      wrapper.classList.add('branch-dropdown');
    }

    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    const initialText = selectedOption ? selectedOption.text : 'Select...';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      ${isBranch ? '<span class="status-pulse"></span>' : ''}
      <span class="dropdown-selected-text">${escapeHtml(initialText)}</span>
      <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    `;

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.setAttribute('role', 'listbox');

    const renderMenuOptions = () => {
      menu.innerHTML = '';
      Array.from(select.options).forEach((opt) => {
        const optionEl = document.createElement('div');
        optionEl.className = `dropdown-option${opt.selected ? ' selected' : ''}${opt.disabled ? ' disabled' : ''}`;
        optionEl.setAttribute('role', 'option');
        optionEl.setAttribute('data-value', opt.value);
        optionEl.tabIndex = opt.disabled ? -1 : 0;
        optionEl.innerHTML = `
          <span>${escapeHtml(opt.text)}</span>
          <svg class="opt-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;

        if (!opt.disabled) {
          const selectThisOption = () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            trigger.querySelector('.dropdown-selected-text').textContent = opt.text;
            menu.querySelectorAll('.dropdown-option').forEach((o) => o.classList.remove('selected'));
            optionEl.classList.add('selected');
            closeDropdown(wrapper, trigger);
            trigger.focus();
          };

          optionEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectThisOption();
          });

          optionEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectThisOption();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = optionEl.nextElementSibling;
              if (next && !next.classList.contains('disabled')) next.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prev = optionEl.previousElementSibling;
              if (prev && !prev.classList.contains('disabled')) prev.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeDropdown(wrapper, trigger);
              trigger.focus();
            }
          });
        }

        menu.appendChild(optionEl);
      });
    };

    renderMenuOptions();
    wrapper._renderOptions = renderMenuOptions;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
        if (d !== wrapper) closeDropdown(d, d.querySelector('.dropdown-trigger'));
      });
      if (isOpen) {
        closeDropdown(wrapper, trigger);
      } else {
        openDropdown(wrapper, trigger);
      }
    });

    trigger.addEventListener('keydown', (e) => {
      const isOpen = wrapper.classList.contains('open');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isOpen) {
          openDropdown(wrapper, trigger);
        }
        const activeOpt = menu.querySelector('.dropdown-option.selected') || menu.querySelector('.dropdown-option:not(.disabled)');
        if (activeOpt) activeOpt.focus();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeDropdown(wrapper, trigger);
      }
    });

    select.addEventListener('change', () => {
      const newOpt = select.options[select.selectedIndex];
      if (newOpt) {
        trigger.querySelector('.dropdown-selected-text').textContent = newOpt.text;
        menu.querySelectorAll('.dropdown-option').forEach((o) => {
          o.classList.toggle('selected', o.dataset.value === newOpt.value);
        });
      }
    });

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
  });
}

function updateCustomDropdown(select) {
  if (!select) return;
  const wrapper = select.closest('.custom-dropdown');
  if (!wrapper || typeof wrapper._renderOptions !== 'function') {
    if (wrapper) wrapper.replaceWith(select);
    select.removeAttribute('data-custom-enhanced');
    select.classList.remove('native-hidden');
    initCustomDropdowns(select.parentElement);
    return;
  }
  const selectedOpt = select.options[select.selectedIndex] || select.options[0];
  const triggerText = wrapper.querySelector('.dropdown-selected-text');
  if (triggerText && selectedOpt) {
    triggerText.textContent = selectedOpt.text;
  }
  wrapper._renderOptions();
}

function openDropdown(wrapper, trigger) {
  wrapper.classList.add('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeDropdown(wrapper, trigger) {
  wrapper.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

/* ==========================================================================
   SMOOTH CUSTOM DATE PICKER & CALENDAR SYSTEM
   (User Requirement: Redesign date picker and calendar, make it smooth)
   ========================================================================== */
function initCustomDatePickers(container = document) {
  const dateInputs = container.querySelectorAll('input[type="date"]:not([data-custom-enhanced])');
  if (!dateInputs.length) return;

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  dateInputs.forEach((input) => {
    input.setAttribute('data-custom-enhanced', 'true');
    input.classList.add('native-hidden');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-datepicker';

    let currentView = 'days';
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth();

    if (input.value) {
      const parts = input.value.split('-');
      if (parts.length === 3) {
        viewYear = parseInt(parts[0], 10) || viewYear;
        viewMonth = (parseInt(parts[1], 10) - 1);
      }
    }

    const formatDisplay = (isoStr) => {
      if (!isoStr) return 'Select date';
      const parts = isoStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
      }
      return isoStr;
    };

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'datepicker-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', input.getAttribute('aria-label') || 'Choose date');
    trigger.innerHTML = `
      <span class="datepicker-display-value">${formatDisplay(input.value)}</span>
      <svg class="datepicker-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    `;

    // Create calendar popover
    const popover = document.createElement('div');
    popover.className = 'custom-calendar-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Calendar');

    // Calendar Header
    const calHeader = document.createElement('div');
    calHeader.className = 'cal-header';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'cal-nav-btn cal-nav-prev';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    `;

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'cal-title-btn';
    titleBtn.innerHTML = `
      <span class="cal-title-text">${MONTH_NAMES[viewMonth]} ${viewYear}</span>
      <svg class="cal-title-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    `;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'cal-nav-btn cal-nav-next';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;

    calHeader.appendChild(prevBtn);
    calHeader.appendChild(titleBtn);
    calHeader.appendChild(nextBtn);

    const weekdaysEl = document.createElement('div');
    weekdaysEl.className = 'cal-weekdays';
    weekdaysEl.innerHTML = WEEKDAYS.map(day => `<span>${day}</span>`).join('');

    const daysGrid = document.createElement('div');
    daysGrid.className = 'cal-days-grid';

    const monthsGrid = document.createElement('div');
    monthsGrid.className = 'cal-months-view';
    monthsGrid.hidden = true;

    const calFooter = document.createElement('div');
    calFooter.className = 'cal-footer';
    calFooter.innerHTML = `
      <button type="button" class="cal-action-btn cal-clear-btn">Clear</button>
      <button type="button" class="cal-action-btn cal-today-btn">Today</button>
    `;

    popover.appendChild(calHeader);
    popover.appendChild(weekdaysEl);
    popover.appendChild(daysGrid);
    popover.appendChild(monthsGrid);
    popover.appendChild(calFooter);

    // Helpers
    const updateTriggerDisplay = () => {
      const displayVal = trigger.querySelector('.datepicker-display-value');
      if (displayVal) displayVal.textContent = formatDisplay(input.value);
    };

    const updateTitle = () => {
      const titleText = titleBtn.querySelector('.cal-title-text');
      if (titleText) {
        titleText.textContent = currentView === 'months' ? `${viewYear}` : `${MONTH_NAMES[viewMonth]} ${viewYear}`;
      }
    };

    const renderMonthsView = () => {
      monthsGrid.innerHTML = '';
      const selectedYear = input.value ? parseInt(input.value.split('-')[0], 10) : null;
      const selectedMonth = input.value ? parseInt(input.value.split('-')[1], 10) - 1 : null;

      SHORT_MONTHS.forEach((name, idx) => {
        const monthBtn = document.createElement('button');
        monthBtn.type = 'button';
        monthBtn.className = 'cal-month-cell';
        if (selectedYear === viewYear && selectedMonth === idx) {
          monthBtn.classList.add('is-selected');
        }
        monthBtn.textContent = name;
        monthBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          viewMonth = idx;
          currentView = 'days';
          popover.classList.remove('view-months');
          weekdaysEl.hidden = false;
          daysGrid.hidden = false;
          monthsGrid.hidden = true;
          updateTitle();
          renderDaysView();
        });
        monthsGrid.appendChild(monthBtn);
      });
    };

    const renderDaysView = () => {
      daysGrid.innerHTML = '';
      updateTitle();

      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      const selectedIso = input.value || '';
      const isDateFrom = input.id === 'salesDateFrom';
      const otherInput = isDateFrom ? $('#salesDateTo') : $('#salesDateFrom');
      const otherIso = otherInput?.value || '';

      let rangeStart = isDateFrom ? selectedIso : otherIso;
      let rangeEnd = isDateFrom ? otherIso : selectedIso;
      if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
        const tmp = rangeStart;
        rangeStart = rangeEnd;
        rangeEnd = tmp;
      }

      const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
      const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

      const pad = (n) => String(n).padStart(2, '0');

      // Previous month days
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
        const iso = `${prevY}-${pad(prevM + 1)}-${pad(d)}`;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-day-cell is-other-month';
        cell.textContent = d;
        cell.dataset.date = iso;
        if (iso === selectedIso) cell.classList.add('is-selected');
        if (rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd) cell.classList.add('is-in-range');

        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          viewMonth = prevM;
          viewYear = prevY;
          selectDate(iso);
        });
        daysGrid.appendChild(cell);
      }

      // Current month days
      for (let d = 1; d <= daysInCurrentMonth; d++) {
        const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-day-cell';
        cell.textContent = d;
        cell.dataset.date = iso;

        if (viewYear === todayYear && viewMonth === todayMonth && d === todayDate) {
          cell.classList.add('is-today');
        }
        if (iso === selectedIso) {
          cell.classList.add('is-selected');
        }
        if (rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd) {
          cell.classList.add('is-in-range');
        }

        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          selectDate(iso);
        });
        daysGrid.appendChild(cell);
      }

      // Next month trailing days to complete full grid
      const totalCells = daysGrid.children.length;
      const remainingCells = (totalCells % 7 === 0 && totalCells >= 35) ? 0 : 7 - (totalCells % 7);
      const nextMonthCount = (totalCells + remainingCells < 35) ? remainingCells + 7 : remainingCells;

      for (let d = 1; d <= nextMonthCount; d++) {
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
        const iso = `${nextY}-${pad(nextM + 1)}-${pad(d)}`;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-day-cell is-other-month';
        cell.textContent = d;
        cell.dataset.date = iso;
        if (iso === selectedIso) cell.classList.add('is-selected');
        if (rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd) cell.classList.add('is-in-range');

        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          viewMonth = nextM;
          viewYear = nextY;
          selectDate(iso);
        });
        daysGrid.appendChild(cell);
      }
    };

    const selectDate = (iso) => {
      input.value = iso;
      updateTriggerDisplay();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeDatePicker(wrapper, trigger);
    };

    // Navigation handlers
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentView === 'months') {
        viewYear--;
        updateTitle();
        renderMonthsView();
      } else {
        viewMonth--;
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear--;
        }
        renderDaysView();
      }
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentView === 'months') {
        viewYear++;
        updateTitle();
        renderMonthsView();
      } else {
        viewMonth++;
        if (viewMonth > 11) {
          viewMonth = 0;
          viewYear++;
        }
        renderDaysView();
      }
    });

    titleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentView === 'days') {
        currentView = 'months';
        popover.classList.add('view-months');
        weekdaysEl.hidden = true;
        daysGrid.hidden = true;
        monthsGrid.hidden = false;
        updateTitle();
        renderMonthsView();
      } else {
        currentView = 'days';
        popover.classList.remove('view-months');
        weekdaysEl.hidden = false;
        daysGrid.hidden = false;
        monthsGrid.hidden = true;
        updateTitle();
        renderDaysView();
      }
    });

    // Clear and Today actions
    const clearBtn = calFooter.querySelector('.cal-clear-btn');
    const todayBtn = calFooter.querySelector('.cal-today-btn');

    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      updateTriggerDisplay();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeDatePicker(wrapper, trigger);
    });

    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const today = new Date();
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();
      const pad = (n) => String(n).padStart(2, '0');
      const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(today.getDate())}`;
      selectDate(iso);
    });

    // Open/Close trigger handler
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-datepicker.open').forEach((dp) => {
        if (dp !== wrapper) closeDatePicker(dp, dp.querySelector('.datepicker-trigger'));
      });
      document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
        closeDropdown(d, d.querySelector('.dropdown-trigger'));
      });

      if (isOpen) {
        closeDatePicker(wrapper, trigger);
      } else {
        if (input.value) {
          const parts = input.value.split('-');
          if (parts.length === 3) {
            viewYear = parseInt(parts[0], 10) || viewYear;
            viewMonth = (parseInt(parts[1], 10) - 1);
          }
        }
        currentView = 'days';
        popover.classList.remove('view-months');
        weekdaysEl.hidden = false;
        daysGrid.hidden = false;
        monthsGrid.hidden = true;
        renderDaysView();
        openDatePicker(wrapper, trigger, popover);
      }
    });

    input.addEventListener('change', () => {
      updateTriggerDisplay();
    });

    wrapper._updateDisplay = () => {
      updateTriggerDisplay();
      if (input.value) {
        const parts = input.value.split('-');
        if (parts.length === 3) {
          viewYear = parseInt(parts[0], 10) || viewYear;
          viewMonth = (parseInt(parts[1], 10) - 1);
        }
      }
    };

    // Attach to DOM
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(trigger);
    wrapper.appendChild(popover);
  });
}

function openDatePicker(wrapper, trigger, popover) {
  wrapper.classList.add('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');

  if (popover) {
    const rect = popover.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) {
      popover.classList.add('anchor-right');
    } else {
      popover.classList.remove('anchor-right');
    }
  }
}

function closeDatePicker(wrapper, trigger) {
  wrapper.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function syncCustomDatePicker(input) {
  if (!input) return;
  const wrapper = input.closest('.custom-datepicker');
  if (wrapper && typeof wrapper._updateDisplay === 'function') {
    wrapper._updateDisplay();
  }
}

// Global click-outside & Escape listeners for smooth dropdowns and custom datepickers
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
      closeDropdown(d, d.querySelector('.dropdown-trigger'));
    });
  }
  if (!e.target.closest('.custom-datepicker')) {
    document.querySelectorAll('.custom-datepicker.open').forEach((dp) => {
      closeDatePicker(dp, dp.querySelector('.datepicker-trigger'));
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
      closeDropdown(d, d.querySelector('.dropdown-trigger'));
    });
    document.querySelectorAll('.custom-datepicker.open').forEach((dp) => {
      closeDatePicker(dp, dp.querySelector('.datepicker-trigger'));
    });
  }
});

/* ==========================================================================
   INVENTORY & TABLE RENDERING
   ========================================================================== */
function getInventoryReportRows() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  return products.filter((product) => `${product.name} ${product.category} ${product.sku || ''}`.toLowerCase().includes(term));
}

function getInventoryReportStatus(product) {
  const qty = Number(product.qty) || 0;
  if (product.status !== 'Active') return { label: 'Inactive', className: 'stock-low' };
  if (qty <= 0) return { label: 'Out of stock', className: 'stock-low' };
  if (qty <= Number(product.lowStockLevel || 0)) return { label: 'Low stock', className: 'stock-low' };
  return { label: 'In stock', className: 'stock-normal' };
}

function getInventoryReportMovement(productId) {
  return inventoryReportData[productId] || { qtySold: 0, qtyStockIn: 0, qtyTransferIn: 0, qtyTransferOut: 0 };
}

function formatTransferQuantity(movement) {
  const incoming = Number(movement.qtyTransferIn) || 0;
  const outgoing = Number(movement.qtyTransferOut) || 0;
  if (!incoming && !outgoing) return 'None';
  return `+${incoming.toLocaleString('en-PH')} / -${outgoing.toLocaleString('en-PH')}`;
}

function renderTransferQuantity(movement) {
  const incoming = Number(movement.qtyTransferIn) || 0;
  const outgoing = Number(movement.qtyTransferOut) || 0;
  const badges = [];
  if (incoming) badges.push(`<span class="transfer-badge report-transfer-badge transfer-in">+${incoming.toLocaleString('en-PH')}</span>`);
  if (outgoing) badges.push(`<span class="transfer-badge report-transfer-badge transfer-out">-${outgoing.toLocaleString('en-PH')}</span>`);
  return badges.join('') || '<span class="transfer-badge report-transfer-badge transfer-none">None</span>';
}

function renderInventoryReports() {
  const table = $('#inventoryTable');
  if (!table) return;

  const rows = getInventoryReportRows();

  table.innerHTML = `
    <div class="table-row table-header"><span>Product</span><span>Qty Sold</span><span>Qty Stock In</span><span>Qty Transfer</span><span>Qty Remaining</span><span>Status</span></div>
    ${rows.map((product) => {
      const qty = Math.max(Number(product.qty) || 0, 0);
      const status = getInventoryReportStatus(product);
      const movement = getInventoryReportMovement(product.id);
      return `<div class="table-row">
        <div class="product-cell"><strong class="product-name">${escapeHtml(product.name)}</strong><span class="product-meta">${escapeHtml(product.sku || product.id)} &bull; ${escapeHtml(product.unit || 'unit')}</span></div>
        <div class="row-middle-cells">
          <span class="stock-pill stock-quantity report-qty-sold">${(Number(movement.qtySold) || 0).toLocaleString('en-PH')} ${escapeHtml(product.unit || 'unit')}</span>
          <span class="stock-pill stock-quantity report-qty-stock-in">${(Number(movement.qtyStockIn) || 0).toLocaleString('en-PH')} ${escapeHtml(product.unit || 'unit')}</span>
          <span class="transfer-quantity">${renderTransferQuantity(movement)}</span>
          <span class="stock-pill stock-quantity report-qty-remaining">${qty.toLocaleString('en-PH')} ${escapeHtml(product.unit || 'unit')}</span>
          <span class="stock-pill report-stock-status ${status.className}">${status.label}</span>
        </div>
      </div>`;
    }).join('') || '<div class="empty-state"><p>No products found</p><small>Try adjusting your search query.</small></div>'}
  `;
}

const STAFF_MENU_DEFS = {
  pos: {
    key: 'pos',
    label: 'POS',
    fullName: 'Point of Sale',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
  },
  products: {
    key: 'products',
    label: 'Products',
    fullName: 'Product Registration',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>'
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory',
    fullName: 'Inventory Stock',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>'
  },
  transfers: {
    key: 'transfers',
    label: 'Transfers',
    fullName: 'Stock Transfers',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>'
  },
  customers: {
    key: 'customers',
    label: 'Customers',
    fullName: 'Customers',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>'
  },
  credits: {
    key: 'credits',
    label: 'Credits',
    fullName: 'Credit Payments',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>'
  },
  sales: {
    key: 'sales',
    label: 'Sales',
    fullName: 'Sales History',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>'
  },
  inventoryReports: {
    key: 'inventoryReports',
    label: 'Reports',
    fullName: 'Inventory Reports',
    icon: '<svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
  }
};

function renderStaffPermissions(permissions = []) {
  if (!permissions || !permissions.length) {
    return `<span class="menu-chip menu-chip-none"><svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>No menus</span>`;
  }
  const allKeys = Object.keys(STAFF_MENU_DEFS);
  const isAll = permissions.includes('*') || allKeys.every((key) => permissions.includes(key));
  if (isAll) {
    return `<span class="menu-chip menu-chip-all" title="Full access: All 8 menus permitted"><svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg><span>All Menus</span><span class="menu-chip-all-count">8</span></span>`;
  }
  return permissions.map((perm) => {
    const def = STAFF_MENU_DEFS[perm];
    if (!def) return `<span class="menu-chip">${escapeHtml(perm)}</span>`;
    return `<span class="menu-chip menu-chip-${def.key}" title="${escapeHtml(def.fullName)}">${def.icon}<span>${escapeHtml(def.label)}</span></span>`;
  }).join('');
}

function renderStaffAccounts() {
  const table = $('#inventoryTable');
  if (!table) return;
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const rows = staffAccounts.filter((staff) => `${staff.fullName} ${staff.username}`.toLowerCase().includes(term));
  table.innerHTML = `
    <div class="table-row table-header"><span>Staff Account</span><span>Assigned Branch</span><span>Menu Access</span><span>Status</span><span>Action</span></div>
    ${rows.map((staff) => {
      const branch = branches.find((item) => item.id === staff.branchId);
      return `<div class="table-row">
        <div class="product-cell"><strong class="product-name">${escapeHtml(staff.fullName)}</strong><span class="product-meta">${escapeHtml(staff.username)}${staff.lastLogin ? ` • Last login ${formatDateTime(staff.lastLogin)}` : ' • Not yet signed in'}</span></div>
        <div class="row-middle-cells">
          <span class="category-badge">${escapeHtml(branch?.name || 'Unavailable branch')}</span>
          <span class="account-permissions">${renderStaffPermissions(staff.permissions)}</span>
          <span class="stock-pill ${staff.status === 'Active' ? 'stock-normal' : 'stock-low'}">${escapeHtml(staff.status)}</span>
        </div>
        <div class="row-action-cell"><span class="table-actions">
          <button class="icon-button" data-edit-staff="${staff.id}" aria-label="Edit ${escapeHtml(staff.fullName)}" title="Edit staff account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
          <button class="icon-button primary-icon" data-reset-staff="${staff.id}" aria-label="Reset password for ${escapeHtml(staff.fullName)}" title="Reset password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg></button>
          <button class="icon-button ${staff.status === 'Active' ? 'danger-icon' : 'primary-icon'}" data-toggle-staff="${staff.id}" aria-label="${staff.status === 'Active' ? 'Deactivate' : 'Reactivate'} ${escapeHtml(staff.fullName)}" title="${staff.status === 'Active' ? 'Deactivate' : 'Reactivate'} account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/></svg></button>
        </span></div></div>`;
    }).join('') || '<div class="empty-state"><p>No staff accounts found</p><small>Add a staff account to assign a branch and allowed menus.</small></div>'}
  `;
  table.querySelectorAll('[data-edit-staff]').forEach((button) => button.addEventListener('click', () => openForm('editStaff', button.dataset.editStaff)));
  table.querySelectorAll('[data-toggle-staff]').forEach((button) => button.addEventListener('click', () => toggleStaffStatus(button.dataset.toggleStaff)));
  table.querySelectorAll('[data-reset-staff]').forEach((button) => button.addEventListener('click', () => resetStaffPassword(button.dataset.resetStaff)));
}

function renderAdminAccount() {
  const panel = $('#accountProfilePanel');
  const table = $('#inventoryTable');
  if (!panel || !table) return;
  panel.hidden = true;
  table.innerHTML = `<div class="table-row table-header"><span>Administrator</span><span>Username</span><span>Access</span><span>Status</span><span>Action</span></div>${adminAccounts.map((account) => `<div class="table-row">
    <div class="product-cell"><strong class="product-name">${escapeHtml(account.fullName)}</strong><span class="product-meta">Administrator account</span></div>
    <div class="row-middle-cells">
      <span>${escapeHtml(account.username)}</span>
      <span class="account-permissions"><span class="menu-chip menu-chip-all" title="Full system access across all branches and menus"><svg class="menu-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg><span>All branches &amp; menus</span></span></span>
      <span class="stock-pill ${account.status === 'Active' ? 'stock-normal' : 'stock-low'}">${escapeHtml(account.status)}</span>
    </div>
    <div class="row-action-cell"><span class="table-actions"><button class="icon-button" data-edit-admin="${account.id}" aria-label="Edit ${escapeHtml(account.fullName)}" title="Edit administrator"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>${account.id !== currentSession?.account?.id ? `<button class="icon-button ${account.status === 'Active' ? 'danger-icon' : 'primary-icon'}" data-toggle-admin="${account.id}" aria-label="${account.status === 'Active' ? 'Deactivate' : 'Reactivate'} ${escapeHtml(account.fullName)}" title="${account.status === 'Active' ? 'Deactivate administrator' : 'Reactivate administrator'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg></button>` : ''}</span></div>
  </div>`).join('') || '<div class="empty-state"><p>No administrator accounts found</p></div>'}`;
  table.querySelectorAll('[data-edit-admin]').forEach((button) => button.addEventListener('click', () => openForm('editAdmin', button.dataset.editAdmin)));
  table.querySelectorAll('[data-toggle-admin]').forEach((button) => button.addEventListener('click', () => toggleAdminStatus(button.dataset.toggleAdmin)));
}

function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); }

async function toggleStaffStatus(staffId) {
  const staff = staffAccounts.find((item) => item.id === staffId); if (!staff) return;
  const activating = staff.status !== 'Active';
  const confirmed = await askConfirmation({ title: `${activating ? 'Reactivate' : 'Deactivate'} Staff`, eyebrow: 'STAFF ACCOUNTS', subtitle: 'Confirm account access change', message: `${activating ? 'Restore' : 'Remove'} sign-in access for <strong class="confirm-highlight-name">${escapeHtml(staff.fullName)}</strong>?`, warning: activating ? 'The staff member can sign in again.' : 'All active sessions for this staff member will end immediately.', confirmText: activating ? 'Reactivate' : 'Deactivate', confirmType: activating ? 'primary' : 'danger' });
  if (!confirmed) return;
  await api('setStaffAccountStatus', { staffId, status: activating ? 'Active' : 'Inactive' }); await refresh(); showToast(`Staff account ${activating ? 'reactivated' : 'deactivated'}.`, 'success');
}

function resetStaffPassword(staffId) {
  openForm('resetStaff', staffId);
}

async function saveAdminAccount(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  try { const account = await api('updateAdminAccount', Object.fromEntries(form)); currentSession.account = { ...currentSession.account, ...account }; localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentSession)); adminAccount = account; showToast('Administrator profile updated.', 'success'); } catch (error) { showToast(error.message, 'error'); }
}

async function changeOwnPassword() {
  const form = new FormData($('#adminAccountForm'));
  if (!form.get('currentPassword') || !form.get('newPassword')) { showToast('Enter your current and new password.', 'error'); return; }
  const confirmed = await askConfirmation({ title: 'Change Password', eyebrow: 'ADMINISTRATION', subtitle: 'Confirm security update', message: 'Are you sure you want to change your administrator password?', confirmText: 'Change Password', confirmType: 'primary' });
  if (!confirmed) return;
  try { await api('changeOwnPassword', { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }); $('#adminAccountForm').querySelectorAll('[type="password"]').forEach((input) => { input.value = ''; }); showToast('Password changed successfully.', 'success'); } catch (error) { showToast(error.message, 'error'); }
}

async function toggleAdminStatus(adminId) {
  const account = adminAccounts.find((item) => item.id === adminId); if (!account) return;
  const activating = account.status !== 'Active';
  const confirmed = await askConfirmation({ title: `${activating ? 'Reactivate' : 'Deactivate'} Administrator`, eyebrow: 'ADMINISTRATION', subtitle: 'Confirm administrator access', message: `${activating ? 'Restore' : 'Remove'} full system access for <strong class="confirm-highlight-name">${escapeHtml(account.fullName)}</strong>?`, warning: activating ? 'This administrator can sign in again.' : 'Their active sessions will end immediately.', confirmText: activating ? 'Reactivate' : 'Deactivate', confirmType: activating ? 'primary' : 'danger' });
  if (!confirmed) return;
  try { await api('setAdminAccountStatus', { adminId, status: activating ? 'Active' : 'Inactive' }); await refresh(); showToast(`Administrator ${activating ? 'reactivated' : 'deactivated'}.`, 'success'); } catch (error) { showToast(error.message, 'error'); }
}

function renderDashboard() {
  const dashboard = $('#dashboard');
  if (!dashboard) return;
  const completedSales = salesHistory.filter((sale) => String(sale.status || 'completed').toLowerCase() !== 'cancelled');
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
    return {
      key: formatDateInput(date),
      label: date.toLocaleDateString('en-PH', { weekday: 'short' }),
      dateFormatted: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      total: 0,
      transactions: 0
    };
  });
  const dayMap = Object.fromEntries(days.map((day) => [day.key, day]));
  completedSales.forEach((sale) => {
    const day = dayMap[saleDateKey(sale.date)];
    if (day) { day.total += Number(sale.total || 0); day.transactions += 1; }
  });
  const periodSalesRecords = completedSales.filter((sale) => dayMap[saleDateKey(sale.date)]);
  const todayKey = formatDateInput(today);
  const todaySalesRecords = completedSales.filter((sale) => saleDateKey(sale.date) === todayKey);
  const todaySales = todaySalesRecords.reduce((total, sale) => total + Number(sale.total || 0), 0);
  const todayCashCollected = todaySalesRecords.filter((sale) => sale.paymentType === 'cash').reduce((total, sale) => total + Number(sale.total || 0), 0);
  const creditOutstanding = creditAccounts.reduce((total, account) => total + Number(account.balance || 0), 0);

  const sevenDayTotal = days.reduce((sum, d) => sum + d.total, 0);
  const sevenDayAvg = Math.round(sevenDayTotal / 7);
  const todayAvgTicket = todaySalesRecords.length > 0 ? Math.round(todaySales / todaySalesRecords.length) : 0;
  const cashRatio = todaySales > 0 ? Math.min(Math.round((todayCashCollected / todaySales) * 100), 100) : 0;

  const maxDayTotal = Math.max(...days.map((day) => day.total), 1);
  const productTotals = new Map();
  periodSalesRecords.forEach((sale) => (sale.items || []).forEach((item) => {
    const current = productTotals.get(item.productId) || { id: item.productId, name: item.name, unit: item.unit, qty: 0, total: 0 };
    current.qty += Number(item.qty || 0);
    current.total += Number(item.qty || 0) * Number(item.price || 0);
    productTotals.set(item.productId, current);
  }));
  const topProducts = [...productTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const maxProductQty = topProducts.length > 0 ? Math.max(...topProducts.map((p) => p.qty), 1) : 1;

  const lowStockItems = products.filter((item) => item.status === 'Active' && Number(item.qty) <= Number(item.lowStockLevel || 0));
  const outOfStockCount = lowStockItems.filter((item) => Number(item.qty) <= 0).length;
  const lowStockCount = lowStockItems.filter((item) => Number(item.qty) > 0).length;
  const attentionStock = lowStockItems.slice(0, 5);
  const pendingTransfers = transfers.filter((item) => !['Received', 'Cancelled'].includes(item.status)).slice(0, 5);
  const recentSales = completedSales.slice(0, 5);
  const branchName = branches.find((branch) => branch.id === activeBranchId)?.name || 'Selected Branch';
  const permissions = currentSession?.account?.permissions || ['*'];
  const canAccess = (view) => permissions.includes('*') || permissions.includes(view);

  const todayFormatted = today.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const getCustomerInitials = (name) => {
    const clean = displayCustomerName(name).replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (!clean || clean.toLowerCase() === 'walk-in customer') return 'WC';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  dashboard.innerHTML = `
    <div class="dashboard-header-banner">
      <div class="dashboard-title-area">
        <div class="dashboard-eyebrow-row">
          <span class="dashboard-live-pill">
            <span class="pulse-dot"></span>
            <span>LIVE OPERATIONS</span>
          </span>
          <span class="dashboard-date-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>${escapeHtml(todayFormatted)}</span>
          </span>
        </div>
        <h2 class="dashboard-main-title">${escapeHtml(branchName)} Dashboard</h2>
        <p class="dashboard-main-sub">Real-time revenue metrics, product velocity, and operational stock alerts.</p>
      </div>
      <div class="dashboard-quick-actions">
        <button class="button button-secondary dashboard-action-btn dashboard-refresh-btn" type="button" data-dashboard-action="refresh" title="Refresh dashboard data" aria-label="Refresh dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <div class="dashboard-summary-grid">
      <article class="dashboard-kpi-card kpi-revenue" data-dashboard-view="sales" role="button" tabindex="0" title="Click to view sales history">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <span class="kpi-badge badge-blue">${todaySalesRecords.length} order${todaySalesRecords.length === 1 ? '' : 's'} today</span>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">Today's Gross Sales</span>
          <strong class="kpi-value text-glow-blue">${money(todaySales)}</strong>
        </div>
        <div class="kpi-foot">
          <span class="kpi-foot-sub">Avg order: <b>${money(todayAvgTicket)}</b></span>
          <span class="kpi-foot-link">Ledger &rarr;</span>
        </div>
      </article>

      <article class="dashboard-kpi-card kpi-cash" data-dashboard-view="sales" role="button" tabindex="0" title="Click to view sales records">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-emerald">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
          </div>
          <span class="kpi-badge badge-emerald">${cashRatio}% cash share</span>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">Cash Collected</span>
          <strong class="kpi-value text-success">${money(todayCashCollected)}</strong>
        </div>
        <div class="kpi-foot">
          <span class="kpi-foot-sub">Completed cash sales</span>
          <span class="kpi-foot-link">Details &rarr;</span>
        </div>
      </article>

      ${canAccess('credits') ? `
        <article class="dashboard-kpi-card kpi-credit" data-dashboard-view="credits" role="button" tabindex="0" title="Click to manage credit accounts">
          <div class="kpi-head">
            <div class="kpi-icon-wrap icon-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            </div>
            <span class="kpi-badge badge-amber">${creditAccounts.length} customer${creditAccounts.length === 1 ? '' : 's'}</span>
          </div>
          <div class="kpi-body">
            <span class="kpi-label">Credit Receivables</span>
            <strong class="kpi-value text-amber">${money(creditOutstanding)}</strong>
          </div>
          <div class="kpi-foot">
            <span class="kpi-foot-sub">Outstanding balance due</span>
            <span class="kpi-foot-link">Manage &rarr;</span>
          </div>
        </article>
      ` : ''}

      ${canAccess('inventory') ? `
        <article class="dashboard-kpi-card kpi-stock" data-dashboard-view="inventory" role="button" tabindex="0" title="Click to audit branch inventory">
          <div class="kpi-head">
            <div class="kpi-icon-wrap icon-rose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
            </div>
            <span class="kpi-badge badge-rose">${outOfStockCount > 0 ? `${outOfStockCount} zero stock` : 'Low warnings'}</span>
          </div>
          <div class="kpi-body">
            <span class="kpi-label">Stock Attention</span>
            <strong class="kpi-value text-danger">${lowStockItems.length} <small style="font-size:13px;font-weight:600;color:var(--text-muted);">items</small></strong>
          </div>
          <div class="kpi-foot">
            <span class="kpi-foot-sub">${outOfStockCount} out of stock &bull; ${lowStockCount} low</span>
            <span class="kpi-foot-link">Audit &rarr;</span>
          </div>
        </article>
      ` : ''}
    </div>

    <div class="dashboard-main-grid">
      <section class="dashboard-panel dashboard-sales-panel">
        <div class="dashboard-panel-head">
          <div class="panel-head-titles">
            <span class="panel-eyebrow">REVENUE VELOCITY</span>
            <h3>Daily Sales Trend</h3>
          </div>
          <div class="sales-chart-legend">
            <span class="chart-summary-chip">7-Day Total: <strong>${money(sevenDayTotal)}</strong></span>
            <span class="chart-avg-pill">Avg: ${money(sevenDayAvg)}/day</span>
          </div>
        </div>
        <div class="sales-chart-wrapper">
          <div class="sales-chart" role="img" aria-label="Daily sales trend for the past seven days">
            ${days.map((day) => {
              const isToday = day.key === todayKey;
              const isPeak = day.total === maxDayTotal && day.total > 0;
              const hasSales = day.total > 0;
              const barHeightPct = hasSales ? Math.max(Math.round((day.total / maxDayTotal) * 92), 6) : 3;
              return `
                <div class="sales-chart-col${isToday ? ' is-today' : ''}${isPeak ? ' is-peak' : ''}${!hasSales ? ' is-empty' : ''}">
                  <div class="sales-chart-tooltip" role="tooltip">
                    <span class="tooltip-date">${escapeHtml(day.label)}, ${escapeHtml(day.dateFormatted)}</span>
                    <strong class="tooltip-amount">${money(day.total)}</strong>
                    <span class="tooltip-tx">${day.transactions} transaction${day.transactions === 1 ? '' : 's'}</span>
                  </div>
                  <div class="sales-chart-track">
                    <div class="sales-chart-bar${!hasSales ? ' bar-empty' : ''}" style="${hasSales ? `height:${barHeightPct}%` : ''}" aria-valuenow="${day.total}" aria-label="${escapeHtml(day.label)}: ${money(day.total)}">
                      ${isPeak ? '<span class="peak-badge">PEAK</span>' : ''}
                    </div>
                  </div>
                  <div class="sales-chart-col-foot">
                    <span class="sales-chart-label">${escapeHtml(day.label)}</span>
                    ${isToday ? '<span class="today-marker-dot" title="Today"></span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>

      <section class="dashboard-panel">
        <div class="dashboard-panel-head">
          <div class="panel-head-titles">
            <span class="panel-eyebrow">PRODUCT MOVEMENT</span>
            <h3>Top Moving Products</h3>
          </div>
          <span class="dashboard-period-badge">Past 7 Days</span>
        </div>
        <div class="dashboard-top-list">
          ${topProducts.length ? topProducts.map((product, index) => {
            const rankClass = index === 0 ? 'rank-gold' : index === 1 ? 'rank-silver' : index === 2 ? 'rank-bronze' : 'rank-standard';
            const progressPct = Math.max(Math.round((product.qty / maxProductQty) * 100), 10);
            return `
              <div class="dashboard-prod-row">
                <div class="dashboard-rank ${rankClass}">${index + 1}</div>
                <div class="dashboard-prod-info">
                  <div class="dashboard-prod-top-line">
                    <strong class="dashboard-prod-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong>
                    <span class="dashboard-prod-qty">${product.qty} <small>${escapeHtml(product.unit || 'unit')}</small></span>
                  </div>
                  <div class="dashboard-progress-track">
                    <div class="dashboard-progress-bar ${rankClass}" style="width:${progressPct}%"></div>
                  </div>
                  <div class="dashboard-prod-sub-line">
                    <span class="dashboard-prod-sales-val">${money(product.total)} sales contribution</span>
                  </div>
                </div>
              </div>
            `;
          }).join('') : `
            <div class="dashboard-empty-panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>
              <p>No completed sales recorded in this branch yet.</p>
              <small>Sales transactions will automatically populate product volume rankings.</small>
            </div>
          `}
        </div>
      </section>
    </div>

    <div class="dashboard-bottom-grid">
      ${canAccess('inventory') ? `
        <section class="dashboard-panel">
          <div class="dashboard-panel-head">
            <div class="panel-head-titles">
              <span class="panel-eyebrow">CRITICAL INVENTORY</span>
              <h3>Stock Warnings</h3>
            </div>
            <button class="dashboard-text-link" type="button" data-dashboard-view="inventory">Open inventory &rarr;</button>
          </div>
          <div class="dashboard-feed-list">
            ${attentionStock.length ? attentionStock.map((product) => `
              <div class="dashboard-feed-item">
                <div class="dashboard-feed-item-icon warning-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                </div>
                <div class="dashboard-feed-details">
                  <strong class="dashboard-feed-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong>
                  <span class="dashboard-feed-sub">${product.qty} ${escapeHtml(product.unit || 'unit')} in stock</span>
                </div>
                <span class="stock-pill ${product.qty <= 0 ? 'stock-low' : 'stock-quantity'}" style="${product.qty <= 0 ? 'background:rgba(227,41,52,0.18);color:#ff4d5a;border-color:rgba(227,41,52,0.4);' : 'background:rgba(245,158,11,0.18);color:#fbbf24;border-color:rgba(245,158,11,0.4);'}">
                  ${product.qty <= 0 ? 'Out of stock' : 'Low stock'}
                </span>
              </div>
            `).join('') : `
              <div class="dashboard-empty-feed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                <p>All items are safely above minimum stock levels.</p>
              </div>
            `}
          </div>
        </section>
      ` : ''}

      ${canAccess('transfers') ? `
        <section class="dashboard-panel">
          <div class="dashboard-panel-head">
            <div class="panel-head-titles">
              <span class="panel-eyebrow">BRANCH LOGISTICS</span>
              <h3>Pending Transfers</h3>
            </div>
            <button class="dashboard-text-link" type="button" data-dashboard-view="transfers">View transfers &rarr;</button>
          </div>
          <div class="dashboard-feed-list">
            ${pendingTransfers.length ? pendingTransfers.map((transfer) => `
              <div class="dashboard-feed-item">
                <div class="dashboard-feed-item-icon transfer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                </div>
                <div class="dashboard-feed-details">
                  <strong class="dashboard-feed-title" title="${escapeHtml(transfer.productName || 'Transfer')}">${escapeHtml(transfer.productName || 'Transfer')}</strong>
                  <span class="dashboard-feed-sub">${escapeHtml(transfer.sourceBranchName)} &rarr; ${escapeHtml(transfer.destinationBranchName)} &bull; ${transfer.qty} ${escapeHtml(transfer.unit || 'unit')}</span>
                </div>
                <span class="stock-pill stock-quantity" style="${transfer.status === 'In Transit' ? 'background:rgba(0,102,245,0.18);color:#38bdf8;border-color:rgba(0,102,245,0.4);' : ''}">
                  ${escapeHtml(transfer.status)}
                </span>
              </div>
            `).join('') : `
              <div class="dashboard-empty-feed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                <p>No active stock transfers currently pending.</p>
              </div>
            `}
          </div>
        </section>
      ` : ''}

      <section class="dashboard-panel">
        <div class="dashboard-panel-head">
          <div class="panel-head-titles">
            <span class="panel-eyebrow">LIVE ACTIVITY</span>
            <h3>Latest Completed Sales</h3>
          </div>
          <button class="dashboard-text-link" type="button" data-dashboard-view="sales">View all &rarr;</button>
        </div>
        <div class="dashboard-feed-list">
          ${recentSales.length ? recentSales.map((sale) => {
            const isCash = sale.paymentType === 'cash';
            const initials = getCustomerInitials(sale.customerName);
            const timeStr = sale.date ? new Date(sale.date).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
            return `
              <div class="dashboard-feed-item">
                <div class="dashboard-avatar-badge">${escapeHtml(initials)}</div>
                <div class="dashboard-feed-details">
                  <div class="dashboard-feed-customer-line">
                    <strong class="dashboard-feed-title" title="${escapeHtml(displayCustomerName(sale.customerName))}">${escapeHtml(displayCustomerName(sale.customerName))}</strong>
                    <span class="dashboard-payment-pill ${isCash ? 'is-cash' : 'is-credit'}">${isCash ? 'Cash' : 'Credit'}</span>
                  </div>
                  <span class="dashboard-feed-sub">${escapeHtml(sale.saleId)} &bull; ${escapeHtml(timeStr)}</span>
                </div>
                <strong class="dashboard-sale-amount">${money(sale.total)}</strong>
              </div>
            `;
          }).join('') : `
            <div class="dashboard-empty-feed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <p>No completed sales recorded for this branch yet.</p>
            </div>
          `}
        </div>
      </section>
    </div>
  `;

  // Interactive bindings
  dashboard.querySelectorAll('[data-dashboard-view]').forEach((elem) => {
    elem.addEventListener('click', () => setView(elem.dataset.dashboardView));
    if (elem.classList.contains('dashboard-kpi-card')) {
      elem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setView(elem.dataset.dashboardView);
        }
      });
    }
  });

  dashboard.querySelectorAll('[data-dashboard-action="stockIn"]').forEach((btn) => {
    btn.addEventListener('click', () => openForm('stock'));
  });

  dashboard.querySelectorAll('[data-dashboard-action="refresh"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('is-spinning');
      showToast('Refreshing dashboard data...', 'info');
      try {
        await refresh();
        showToast('Dashboard updated with latest data.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to refresh.', 'error');
      } finally {
        btn.classList.remove('is-spinning');
        btn.disabled = false;
      }
    });
  });
}

function renderDashboardSkeleton() {
  const dashboard = $('#dashboard');
  if (!dashboard) return;
  dashboard.innerHTML = `
    <div class="dashboard-skeleton">
      <div class="dashboard-skeleton-header">
        <div class="skeleton-shimmer dashboard-skeleton-eyebrow"></div>
        <div class="skeleton-shimmer dashboard-skeleton-title"></div>
        <div class="skeleton-shimmer dashboard-skeleton-sub"></div>
      </div>
      <div class="dashboard-summary-grid">
        ${Array.from({ length: 4 }).map(() => `
          <div class="dashboard-skeleton-card">
            <div class="skeleton-shimmer dashboard-skeleton-icon"></div>
            <div class="skeleton-shimmer dashboard-skeleton-val"></div>
            <div class="skeleton-shimmer dashboard-skeleton-label"></div>
            <div class="skeleton-shimmer dashboard-skeleton-footer"></div>
          </div>
        `).join('')}
      </div>
      <div class="dashboard-main-grid">
        <div class="dashboard-skeleton-panel sales-panel-skeleton">
          <div class="skeleton-shimmer skeleton-panel-head"></div>
          <div class="skeleton-chart-tracks">
            ${[40, 75, 55, 90, 60, 85, 45].map((h) => `
              <div class="skeleton-chart-col">
                <div class="skeleton-shimmer skeleton-chart-bar" style="height:${h}%;"></div>
                <div class="skeleton-shimmer skeleton-chart-label"></div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="dashboard-skeleton-panel products-panel-skeleton">
          <div class="skeleton-shimmer skeleton-panel-head"></div>
          <div class="skeleton-prod-rows">
            ${Array.from({ length: 5 }).map(() => `
              <div class="skeleton-prod-row">
                <div class="skeleton-shimmer skeleton-rank-box"></div>
                <div class="skeleton-prod-info-box">
                  <div class="skeleton-shimmer skeleton-prod-line1"></div>
                  <div class="skeleton-shimmer skeleton-prod-bar"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="dashboard-bottom-grid">
        ${Array.from({ length: 3 }).map(() => `
          <div class="dashboard-skeleton-panel feed-panel-skeleton">
            <div class="skeleton-shimmer skeleton-panel-head"></div>
            <div class="skeleton-feed-rows">
              ${Array.from({ length: 4 }).map(() => `
                <div class="skeleton-feed-row">
                  <div class="skeleton-shimmer skeleton-feed-avatar"></div>
                  <div class="skeleton-feed-text">
                    <div class="skeleton-shimmer skeleton-feed-line1"></div>
                    <div class="skeleton-shimmer skeleton-feed-line2"></div>
                  </div>
                  <div class="skeleton-shimmer skeleton-feed-badge"></div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderInventory() {
  if (activeView === 'dashboard') { renderDashboard(); return; }
  if (activeView === 'inventoryReports') {
    renderInventoryReports();
    return;
  }
  if (activeView === 'branches') {
    renderBranches();
    return;
  }
  if (activeView === 'customers') {
    renderCustomers();
    return;
  }
  if (activeView === 'transfers') {
    renderTransfers();
    return;
  }
  if (activeView === 'credits') {
    renderCreditPayments();
    return;
  }
  if (activeView === 'sales') {
    renderSalesHistory();
    return;
  }
  if (activeView === 'staffAccounts') { renderStaffAccounts(); return; }
  if (activeView === 'adminAccount') { renderAdminAccount(); return; }
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const rows = products.filter((product) => `${product.name} ${product.category} ${product.sku || ''}`.toLowerCase().includes(term));
  const table = $('#inventoryTable');
  if (!table) return;

  const headers = activeView === 'products'
    ? ['Product', 'Category', 'Selling price', 'Quantity in stock', 'Low stock', 'Status', 'Action']
    : activeView === 'inventory'
    ? ['Product', 'Category', 'Current stock', 'Stock warning', 'Status']
    : ['Product', 'Selling price', 'Stock', 'Action'];

  const content = rows.map((product) => {
    const isOut = product.qty <= 0;
    const isLow = !isOut && product.qty <= product.lowStockLevel;
    const stockBadge = isOut
      ? `<span class="stock-pill stock-low">Out of stock</span>`
      : isLow
      ? `<span class="stock-pill stock-low">${product.qty} low</span>`
      : `<span class="stock-pill stock-normal">${product.qty} in stock</span>`;

    const statusPill = product.status === 'Active'
      ? `<span class="stock-pill stock-normal" style="font-size:11.5px;">Active</span>`
      : `<span class="stock-pill stock-low" style="font-size:11.5px;">Inactive</span>`;

    const lowStockPill = `
      <span class="low-stock-pill" title="Warning alert trigger: &le; ${product.lowStockLevel ?? 5} ${escapeHtml(product.unit || 'units')}">
        <svg class="pill-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>&le; ${product.lowStockLevel ?? 5}</span>
      </span>
    `;

    const productCell = `
      <div class="product-cell">
        <strong class="product-name">${escapeHtml(product.name)}</strong>
        <span class="product-meta">${escapeHtml(product.sku || product.id)} &bull; ${escapeHtml(product.unit)}</span>
      </div>
    `;

    const categoryCell = `<span class="category-badge">${escapeHtml(product.category || 'General')}</span>`;
    const priceCell = `<span class="price-text">${money(product.price)}</span>`;
    const quantityCell = `<span class="stock-pill stock-quantity">${product.qty} ${escapeHtml(product.unit || 'unit')}</span>`;

    const productRow = `
      ${productCell}
      <div class="row-middle-cells">
        ${categoryCell}
        ${priceCell}
        ${quantityCell}
        <span>${lowStockPill}</span>
        <span>${statusPill}</span>
      </div>
      <div class="row-action-cell">
        <span class="table-actions">
          <button class="icon-button" data-edit="${product.id}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          ${currentSession?.account?.role !== 'staff' ? `<button class="icon-button danger-icon" data-delete="${product.id}" aria-label="Delete ${escapeHtml(product.name)}" title="Delete product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>` : ''}
        </span>
      </div>
    `;

    const stockRow = `
      ${productCell}
      <div class="row-middle-cells">
        ${categoryCell}
        ${stockBadge}
        <span>${lowStockPill}</span>
        <span>${statusPill}</span>
      </div>
    `;

    const posRow = `
      ${productCell}
      <div class="row-middle-cells">
        ${priceCell}
        ${stockBadge}
      </div>
      <div class="row-action-cell">
        <button class="button button-primary add-item" data-add="${product.id}" aria-label="Add ${escapeHtml(product.name)} to cart" title="Add to cart" ${isOut || product.status !== 'Active' ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </button>
      </div>
    `;

    const canAddToCart = activeView === 'pos' && !isOut && product.status === 'Active';
    const rowAttributes = canAddToCart ? ` pos-add-row" data-row-add="${product.id}" role="button" tabindex="0" aria-label="Add ${escapeHtml(product.name)} to cart` : '';
    return `<div class="table-row${rowAttributes}">${activeView === 'products' ? productRow : activeView === 'inventory' ? stockRow : posRow}</div>`;
  }).join('');

  table.innerHTML = `
    <div class="table-row table-header">
      ${headers.map((header) => `<span>${header}</span>`).join('')}
    </div>
    ${content || '<div class="empty-state"><p>No products found</p><small>Try adjusting your search query</small></div>'}
  `;

  table.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.add)));
  table.querySelectorAll('[data-row-add]').forEach((row) => {
    const addRowProduct = () => addToCart(row.dataset.rowAdd);
    row.addEventListener('click', (event) => {
      if (!event.target.closest('button')) addRowProduct();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        addRowProduct();
      }
    });
  });
  table.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openForm('edit', button.dataset.edit)));
  table.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteProduct(button.dataset.delete)));
}

function renderBranches() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const table = $('#inventoryTable');
  if (!table) return;
  const rows = branches.filter((branch) => `${branch.name} ${branch.type} ${branch.address}`.toLowerCase().includes(term));
  table.innerHTML = `
    <div class="table-row table-header">
      <span>Branch</span><span>Type</span><span>Address</span><span>Status</span><span>Action</span>
    </div>
    ${rows.map((branch) => `
      <div class="table-row">
        <div class="product-cell"><strong class="product-name">${escapeHtml(branch.name)}</strong><span class="product-meta">${escapeHtml(branch.id)}${branch.id === activeBranchId ? ' &bull; Active location' : ''}</span></div>
        <div class="row-middle-cells">
          <span class="category-badge">${escapeHtml(branch.type)}</span>
          <span class="branch-address">${escapeHtml(branch.address || 'No address recorded')}</span>
          <span class="stock-pill ${branch.status === 'Active' ? 'stock-normal' : 'stock-low'}">${escapeHtml(branch.status)}</span>
        </div>
        <div class="row-action-cell"><button class="icon-button" data-edit-branch="${branch.id}" aria-label="Edit ${escapeHtml(branch.name)}" title="Edit branch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button></div>
      </div>
    `).join('') || '<div class="empty-state"><p>No branches found</p><small>Add a branch to begin branch-level operations.</small></div>'}
  `;
  table.querySelectorAll('[data-edit-branch]').forEach((button) => button.addEventListener('click', () => openForm('editBranch', button.dataset.editBranch)));
}

function renderCustomers() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const table = $('#inventoryTable');
  if (!table) return;
  const rows = customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.address}`.toLowerCase().includes(term));
  table.innerHTML = `
    <div class="table-row table-header"><span>Customer</span><span>Phone</span><span>Address</span><span>Status</span><span>Action</span></div>
    ${rows.map((customer) => `
      <div class="table-row">
        <div class="product-cell"><strong class="product-name">${escapeHtml(displayCustomerName(customer.name))}</strong><span class="product-meta">${escapeHtml(customer.id)}</span></div>
        <div class="row-middle-cells"><span class="branch-address">${escapeHtml(customer.phone || 'No phone recorded')}</span><span class="branch-address">${escapeHtml(customer.address || 'No address recorded')}</span><span class="stock-pill ${customer.status === 'Active' ? 'stock-normal' : 'stock-low'}">${escapeHtml(customer.status)}</span></div>
        <div class="row-action-cell"><button class="icon-button" data-edit-customer="${customer.id}" aria-label="Edit ${escapeHtml(displayCustomerName(customer.name))}" title="Edit customer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button></div>
      </div>
    `).join('') || '<div class="empty-state"><p>No customers found</p><small>Add a customer for this branch.</small></div>'}
  `;
  table.querySelectorAll('[data-edit-customer]').forEach((button) => button.addEventListener('click', () => openForm('editCustomer', button.dataset.editCustomer)));
}

function renderCreditPayments() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const table = $('#inventoryTable');
  if (!table) return;

  const accounts = creditAccounts.filter((account) => `${account.saleId} ${account.customerName}`.toLowerCase().includes(term));

  table.innerHTML = `
    <div class="table-row table-header">
      <span>Customer</span>
      <span>Credit Sale</span>
      <span>Original Amount</span>
      <span>Amount Due</span>
      <span>Action</span>
    </div>

    ${accounts.map((account) => {
      const total = Number(account.total) || 0;
      const balance = Number(account.balance) || 0;
      const historyCount = creditPayments.filter((p) => p.saleId === account.saleId).length;
      return `
        <div class="table-row">
          <div class="product-cell">
            <strong class="product-name">${escapeHtml(displayCustomerName(account.customerName))}</strong>
            <span class="product-meta">${escapeHtml(account.customerId)}</span>
          </div>
          <div class="row-middle-cells">
            <div class="product-cell">
              <strong class="product-name">${escapeHtml(account.saleId)}</strong>
              <span class="product-meta">${escapeHtml(account.date ? new Date(account.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '')}</span>
            </div>
            <span class="price-text">${money(total)}</span>
            <span class="credit-balance">${money(balance)}</span>
          </div>
          <div class="row-action-cell">
            <span class="table-actions">
              <button class="icon-button success-icon" data-credit-sale="${escapeHtml(account.saleId)}" aria-label="Record Payment" title="Record Payment">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M12 15h.01"/></svg>
              </button>
              <button class="icon-button primary-icon" data-view-payment-history="${escapeHtml(account.saleId)}" aria-label="Payment History (${historyCount})" title="Payment History (${historyCount} recorded)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </button>
            </span>
          </div>
        </div>
      `;
    }).join('') || '<div class="empty-state"><p>No outstanding credit sales</p><small>Credit balances for the selected branch will appear here.</small></div>'}
  `;

  table.querySelectorAll('[data-credit-sale]').forEach((button) => {
    button.addEventListener('click', () => openCreditPayment(button.dataset.creditSale));
  });

  table.querySelectorAll('[data-view-payment-history]').forEach((button) => {
    button.addEventListener('click', () => openCreditHistory(button.dataset.viewPaymentHistory));
  });
}

function renderSalesHistory() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const dateFrom = $('#salesDateFrom')?.value || '';
  const dateTo = $('#salesDateTo')?.value || '';
  const table = $('#inventoryTable');
  if (!table) return;
  const sales = salesHistory.filter((sale) => {
    const matchesTerm = `${sale.saleId} ${sale.customerName} ${sale.paymentType}`.toLowerCase().includes(term);
    const saleDate = saleDateKey(sale.date);
    return matchesTerm && (!dateFrom || saleDate >= dateFrom) && (!dateTo || saleDate <= dateTo);
  });
  table.innerHTML = `
    <div class="table-row table-header"><span>Receipt</span><span>Date and Time</span><span>Customer</span><span>Payment</span><span>Total</span><span>Action</span></div>
    ${sales.map((sale) => {
      const items = sale.items || [];
      const itemsSummary = items.length === 0
        ? 'No items recorded'
        : items.map((i) => `${i.name || 'Item'} (${i.qty}×)`).join(', ');
      const isCash = sale.paymentType === 'cash';
      return `
        <div class="table-row">
          <div class="product-cell">
            <strong class="product-name">${escapeHtml(sale.saleId)}</strong>
            <span class="product-meta sales-items-summary" title="${escapeHtml(itemsSummary)}">${escapeHtml(itemsSummary)}</span>
          </div>
          <div class="row-middle-cells">
            <span class="branch-address">${escapeHtml(sale.date ? new Date(sale.date).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) : '')}</span>
            <div class="product-cell">
              <strong class="product-name">${escapeHtml(displayCustomerName(sale.customerName))}</strong>
              <span class="product-meta">${!isCash ? `Balance: ${money(sale.creditBalance)}` : 'Paid in cash'}</span>
            </div>
            <span class="stock-pill ${isCash ? 'stock-normal' : 'category-badge'}">${escapeHtml(isCash ? 'Cash' : 'Credit')}</span>
            <span class="price-text">${money(sale.total)}</span>
          </div>
          <div class="row-action-cell">
            <button class="icon-button" data-view-sale="${escapeHtml(sale.saleId)}" aria-label="View sale receipt" title="View sale receipt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('') || '<div class="empty-state"><p>No sales found</p><small>Completed sales for the selected branch will appear here.</small></div>'}
  `;
  table.querySelectorAll('[data-view-sale]').forEach((button) => button.addEventListener('click', () => {
    const sale = salesHistory.find((item) => item.saleId === button.dataset.viewSale);
    if (sale) showSaleReceipt({ sale, items: sale.items, customerName: sale.customerName });
  }));
}

function openCreditHistory(saleId) {
  const account = creditAccounts.find((item) => item.saleId === saleId);
  const payments = creditPayments.filter((item) => item.saleId === saleId);

  const customerName = account ? account.customerName : (payments[0]?.customerName || 'Customer');
  const customerId = account ? account.customerId : (payments[0]?.customerId || '');
  const total = account ? Number(account.total) : payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = account ? Number(account.balance) : Math.max(total - paid, 0);
  const percentPaid = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;

  const titleEl = $('#creditHistoryCustomerName');
  const subtitleEl = $('#creditHistorySaleSubtitle');
  if (titleEl) titleEl.textContent = displayCustomerName(customerName);
  if (subtitleEl) subtitleEl.textContent = `${saleId}${customerId ? ` • ${customerId}` : ''}`;

  const summaryEl = $('#creditHistoryModalSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="credit-modal-stat">
        <span class="credit-modal-stat-label">Original Sale</span>
        <strong class="credit-modal-stat-val">${money(total)}</strong>
      </div>
      <div class="credit-modal-stat emerald">
        <span class="credit-modal-stat-label">Total Paid (${percentPaid}%)</span>
        <strong class="credit-modal-stat-val emerald">${money(paid)}</strong>
      </div>
      <div class="credit-modal-stat gold">
        <span class="credit-modal-stat-label">Remaining Balance</span>
        <strong class="credit-modal-stat-val gold">${money(balance)}</strong>
      </div>
    `;
  }

  const listEl = $('#creditHistoryModalList');
  if (listEl) {
    if (payments.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 24px 12px;">
          <p>No payments recorded yet</p>
          <small>No payments have been posted for this credit sale.</small>
        </div>
      `;
    } else {
      listEl.innerHTML = `
        <div class="credit-modal-payments-table">
          <div class="credit-modal-payments-head">
            <span>Payment Date</span>
            <span>Amount</span>
            <span>Reference / Notes</span>
            <span style="text-align:right;">Action</span>
          </div>
          ${payments.map((p) => `
            <div class="credit-modal-payments-row">
              <div class="credit-modal-date-col">
                <strong class="credit-date-text">${escapeHtml(p.date ? new Date(p.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '')}</strong>
                <span class="credit-time-text">${escapeHtml(p.date ? new Date(p.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '')}</span>
              </div>
              <div class="credit-modal-amount-col">
                <span class="payment-collected-badge">+ ${money(p.amount)}</span>
              </div>
              <div class="credit-modal-notes-col">
                <span class="credit-history-notes">${escapeHtml(p.notes || 'Payment settlement')}</span>
              </div>
              <div class="credit-modal-action-col">
                <button class="icon-button danger-icon credit-modal-del-btn" data-modal-delete-payment="${escapeHtml(p.id)}" aria-label="Delete payment" title="Delete payment record">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-1-1-1-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const recordBtn = $('#creditHistoryRecordNewBtn');
  if (recordBtn) {
    recordBtn.style.display = balance > 0 ? 'inline-flex' : 'none';
    recordBtn.onclick = () => {
      $('#creditHistoryDialog').close();
      openCreditPayment(saleId);
    };
  }

  listEl.querySelectorAll('[data-modal-delete-payment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteCreditPayment(btn.dataset.modalDeletePayment);
      openCreditHistory(saleId);
    });
  });

  const dialog = $('#creditHistoryDialog');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function openCreditPayment(saleId) {
  const account = creditAccounts.find((item) => item.saleId === saleId);
  if (!account) return;
  pendingCreditAccount = account;
  $('#creditCustomer').value = displayCustomerName(account.customerName);
  $('#creditSaleId').value = account.saleId;
  $('#creditBalance').value = account.balance.toFixed(2);
  $('#creditAmount').value = '0.00';
  $('#creditAmount').max = account.balance.toFixed(2);
  $('#creditNotes').value = '';
  $('#creditPaymentError').textContent = '';
  $('#creditPaymentDialog').showModal();
}

async function deleteCreditPayment(paymentId) {
  const payment = creditPayments.find((item) => item.id === paymentId);
  if (!payment) return;
  const confirmed = await askConfirmation({
    title: 'Delete Credit Payment',
    eyebrow: 'CREDIT PAYMENTS',
    subtitle: 'Correct a payment mistake',
    message: `Delete the <strong class="confirm-highlight-name">${money(payment.amount)}</strong> payment from ${escapeHtml(displayCustomerName(payment.customerName))}?`,
    warning: 'This payment will be removed and the credit balance will increase again.',
    confirmText: 'Delete Payment',
    confirmType: 'danger',
  });
  if (!confirmed) return;
  try {
    await api('deleteCreditPayment', { paymentId, branchId: activeBranchId });
    await refresh();
    showToast('Credit payment deleted. Balance updated.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderTransfers() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const table = $('#inventoryTable');
  if (!table) return;
  const rows = transfers.filter((transfer) => `${transfer.id} ${transfer.sourceBranchName} ${transfer.destinationBranchName} ${transfer.productName} ${transfer.status}`.toLowerCase().includes(term));
  const action = (transfer) => {
    if (transfer.status === 'Draft' && transfer.sourceBranchId === activeBranchId) {
      return `
        <button class="icon-button primary-icon" data-transfer-action="dispatch" data-transfer-id="${transfer.id}" aria-label="Dispatch transfer" title="Dispatch transfer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        <button class="icon-button danger-icon" data-transfer-action="cancel" data-transfer-id="${transfer.id}" aria-label="Cancel transfer" title="Cancel transfer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      `;
    }
    if (transfer.status === 'In Transit' && transfer.destinationBranchId === activeBranchId) {
      return `
        <button class="icon-button success-icon" data-transfer-action="receive" data-transfer-id="${transfer.id}" aria-label="Receive transfer" title="Receive transfer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      `;
    }
    if (transfer.status === 'In Transit' && transfer.sourceBranchId === activeBranchId) {
      return `
        <button class="icon-button danger-icon" data-transfer-action="cancel" data-transfer-id="${transfer.id}" aria-label="Cancel transfer" title="Cancel transfer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      `;
    }
    return '<span style="color:var(--text-muted);font-size:13px;font-weight:600;padding-left:4px;">&mdash;</span>';
  };
  table.innerHTML = `
    <div class="table-row table-header">
      <span>Transfer</span>
      <span>Route</span>
      <span>Product</span>
      <span>Status</span>
      <span>Action</span>
    </div>
    ${rows.map((transfer) => `
      <div class="table-row">
        <div class="product-cell">
          <strong class="product-name">${escapeHtml(transfer.id)}</strong>
          <span class="product-meta">${escapeHtml(transfer.createdAt ? new Date(transfer.createdAt).toLocaleDateString('en-PH') : '')}</span>
        </div>
        <div class="row-middle-cells">
          <span class="branch-address">${escapeHtml(transfer.sourceBranchName)} to ${escapeHtml(transfer.destinationBranchName)}</span>
          <div class="product-cell">
            <strong class="product-name">${escapeHtml(transfer.productName)}</strong>
            <span class="product-meta">${transfer.qty} ${escapeHtml(transfer.unit)}</span>
          </div>
          <span class="stock-pill ${transfer.status === 'Received' ? 'stock-normal' : transfer.status === 'Cancelled' ? 'stock-low' : 'category-badge'}">${escapeHtml(transfer.status)}</span>
        </div>
        <div class="row-action-cell">
          <span class="table-actions">${action(transfer)}</span>
        </div>
      </div>
    `).join('') || '<div class="empty-state"><p>No stock transfers found</p><small>Create a transfer from the selected branch.</small></div>'}
  `;
  table.querySelectorAll('[data-transfer-action]').forEach((button) => button.addEventListener('click', () => handleTransferAction(button)));
}

async function handleTransferAction(button) {
  const action = button.dataset.transferAction;
  const transfer = transfers.find((item) => item.id === button.dataset.transferId);
  if (!transfer || !['dispatch', 'receive', 'cancel'].includes(action)) return;

  const copy = {
    dispatch: {
      title: 'Dispatch Transfer',
      eyebrow: 'STOCK TRANSFERS',
      subtitle: 'Confirm stock departure',
      confirmText: 'Dispatch Transfer',
      confirmType: 'primary',
      warning: `This will deduct ${transfer.qty} ${transfer.unit} from ${transfer.sourceBranchName} and mark the transfer as In Transit.`
    },
    receive: {
      title: 'Receive Transfer',
      eyebrow: 'STOCK TRANSFERS',
      subtitle: 'Confirm stock arrival',
      confirmText: 'Receive Stock',
      confirmType: 'success',
      warning: `This will add ${transfer.qty} ${transfer.unit} to ${transfer.destinationBranchName} inventory.`
    },
    cancel: {
      title: 'Cancel Transfer',
      eyebrow: 'STOCK TRANSFERS',
      subtitle: 'Confirm transfer cancellation',
      confirmText: 'Cancel Transfer',
      confirmType: 'danger',
      warning: transfer.status === 'In Transit'
        ? `This will return ${transfer.qty} ${transfer.unit} back to ${transfer.sourceBranchName} inventory.`
        : 'This will cancel the draft transfer. No stock has been moved.'
    }
  }[action];

  const confirmed = await askConfirmation({
    title: copy.title,
    eyebrow: copy.eyebrow,
    subtitle: copy.subtitle,
    message: `Are you sure you want to ${action} <strong class="confirm-highlight-name">${escapeHtml(transfer.productName)}</strong> (${transfer.qty} ${escapeHtml(transfer.unit)})?`,
    warning: copy.warning,
    confirmText: copy.confirmText,
    confirmType: copy.confirmType
  });

  if (!confirmed) return;

  const endpoint = { dispatch: 'dispatchTransfer', receive: 'receiveTransfer', cancel: 'cancelTransfer' }[action];
  try {
    await api(endpoint, { transferId: transfer.id, branchId: activeBranchId });
    await refresh();
    showToast(`Transfer ${action === 'receive' ? 'received' : action === 'dispatch' ? 'dispatched' : 'cancelled'}.`, 'success');
  } catch (error) {
    showToast(error.message || 'Failed to process transfer.', 'error');
  }
}

function renderBranchSelector() {
  const selector = $('#branchSelector');
  if (!selector) return;
  const account = currentSession?.account;
  const activeBranches = branches.filter((branch) => branch.status === 'Active' && (account?.role !== 'staff' || branch.id === account.branchId));
  if (activeBranches.length === 0) {
    activeBranches.push({ id: 'MAIN', name: 'Main Branch' });
  }
  if (!activeBranches.some((branch) => branch.id === activeBranchId)) activeBranchId = activeBranches[0]?.id || 'MAIN';
  selector.innerHTML = activeBranches.map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join('');
  selector.value = activeBranchId;
  selector.disabled = account?.role === 'staff';
  updateCustomDropdown(selector);
  updateActiveBranchLabels();
  renderSidebarBranchMenu();
}

function updateActiveBranchLabels() {
  const branch = branches.find((item) => item.id === activeBranchId);
  const name = branch?.name || 'Main Branch';
  const status = branch?.status || 'Active';
  const sideLabel = $('#sidebarBranchName');
  if (sideLabel) sideLabel.textContent = name;
  const badge = $('#sidebarBranchBadge');
  if (badge) {
    const isOnline = status === 'Active';
    badge.className = `branch-status-badge ${isOnline ? 'online' : 'offline'}`;
    badge.innerHTML = `<span class="pulse-dot"></span><span class="status-text">${isOnline ? 'Online' : 'Offline'}</span>`;
  }
  renderSidebarBranchMenu();
}

function renderSidebarBranchMenu() {
  const menu = $('#sidebarBranchMenu');
  if (!menu) return;
  const account = currentSession?.account;
  const activeBranches = branches.filter((branch) => branch.status === 'Active' && (account?.role !== 'staff' || branch.id === account.branchId));
  if (activeBranches.length === 0) {
    activeBranches.push({ id: 'MAIN', name: 'Main Branch' });
  }
  menu.innerHTML = activeBranches.map((b) => `
    <div class="dropdown-option${b.id === activeBranchId ? ' selected' : ''}" role="option" data-value="${escapeHtml(b.id)}" tabindex="0">
      <div class="branch-option-content">
        <span class="branch-opt-name">${escapeHtml(b.name)}</span>
        <span class="branch-opt-type">${escapeHtml(b.type || 'Branch')}</span>
      </div>
      <svg class="opt-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
  `).join('');

  menu.querySelectorAll('.dropdown-option').forEach((opt) => {
    opt.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      const dropdown = $('#sidebarBranchDropdown');
      if (dropdown) closeDropdown(dropdown, $('#sidebarBranchTrigger'));
      await setActiveBranch(val);
    });
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opt.click();
      }
    });
  });
}

function initSidebarBranchSwitcher() {
  const trigger = $('#sidebarBranchTrigger');
  const dropdown = $('#sidebarBranchDropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
      if (d !== dropdown) closeDropdown(d, d.querySelector('.dropdown-trigger') || d.querySelector('button'));
    });
    if (isOpen) {
      closeDropdown(dropdown, trigger);
    } else {
      openDropdown(dropdown, trigger);
    }
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const isOpen = dropdown.classList.contains('open');
      if (!isOpen) openDropdown(dropdown, trigger);
      const activeOpt = dropdown.querySelector('.dropdown-option.selected') || dropdown.querySelector('.dropdown-option');
      if (activeOpt) activeOpt.focus();
    } else if (e.key === 'Escape') {
      closeDropdown(dropdown, trigger);
    }
  });
}

async function setActiveBranch(branchId) {
  if (branchId === activeBranchId) return;
  activeBranchId = branchId;
  localStorage.setItem(ACTIVE_BRANCH_KEY, activeBranchId);
  cart = [];
  renderCart();
  updateActiveBranchLabels();
  await refresh();
  showToast(`${branches.find((branch) => branch.id === branchId)?.name || 'Branch'} is now active.`, 'success');
}

/* ==========================================================================
   CART & CASH CHECKOUT
   ========================================================================== */
function updateCartScrollFade() {
  const container = $('#cartItems');
  if (!container) return;
  if (!cart.length) {
    container.classList.remove('can-scroll-down', 'can-scroll-up');
    return;
  }
  const scrollTolerance = 4;
  const canScrollDown = container.scrollHeight > container.clientHeight && (container.scrollTop + container.clientHeight < container.scrollHeight - scrollTolerance);
  const canScrollUp = container.scrollTop > scrollTolerance;

  container.classList.toggle('can-scroll-down', canScrollDown);
  container.classList.toggle('can-scroll-up', canScrollUp);
}

function updateReceiptScrollFade() {
  const container = $('#receiptDialog .receipt-body');
  if (!container) return;
  const scrollTolerance = 4;
  const canScrollDown = container.scrollHeight > container.clientHeight && (container.scrollTop + container.clientHeight < container.scrollHeight - scrollTolerance);
  const canScrollUp = container.scrollTop > scrollTolerance;

  container.classList.toggle('can-scroll-down', canScrollDown);
  container.classList.toggle('can-scroll-up', canScrollUp);
}

function renderCart() {
  const container = $('#cartItems');
  const badge = $('#mobileCartBadge');
  const orderCount = $('#cartItemsCount');
  const orderCountValue = $('#cartItemsCountValue');
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  if (badge) badge.textContent = totalCount;
  if (orderCount) orderCount.hidden = !cart.length;
  if (orderCountValue) orderCountValue.textContent = `${cart.length} item${cart.length > 1 ? 's' : ''}`;

  if (!cart.length) {
    container.classList.remove('can-scroll-down', 'can-scroll-up');
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
        <p>Cart is empty</p>
        <small>Select items from the catalog</small>
      </div>
    `;
    $('#cartTotal').textContent = money(0);
    return;
  }

  container.innerHTML = `
    ${cart.map((item) => `
      <div class="cart-card">
        <div class="cart-card-header">
          <div class="cart-item-info">
            <strong class="cart-item-title">${escapeHtml(item.name)}</strong>
            <span class="cart-item-meta">${escapeHtml(item.unit || 'unit')} &bull; Base: ${money(item.price)}</span>
          </div>
          <button class="remove cart-remove-btn" aria-label="Remove ${escapeHtml(item.name)}" data-remove="${item.id}" title="Remove item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="cart-card-body">
          <div class="cart-control-col">
            <label class="cart-control-label" for="cartQty_${item.id}">Quantity</label>
            <div class="cart-qty-stepper">
              <button type="button" class="cart-step-btn" data-step-qty="${item.id}" data-delta="-1" aria-label="Decrease quantity">&minus;</button>
              <input id="cartQty_${item.id}" aria-label="Quantity for ${escapeHtml(item.name)}" type="number" min="1" max="${item.stock}" value="${item.qty}" data-qty="${item.id}" />
              <button type="button" class="cart-step-btn" data-step-qty="${item.id}" data-delta="1" aria-label="Increase quantity">&plus;</button>
            </div>
          </div>
          <div class="cart-control-col price-col">
            <label class="cart-control-label" for="cartPrice_${item.id}">Price (PHP)</label>
            <div class="cart-price-input-wrap">
              <span class="cart-currency-prefix">PHP</span>
              <input id="cartPrice_${item.id}" aria-label="Selling price for ${escapeHtml(item.name)}" type="number" min="0" step="0.01" value="${item.price}" data-price="${item.id}" />
            </div>
          </div>
          <div class="cart-subtotal-col">
            <span class="cart-control-label">Subtotal</span>
            <strong class="item-subtotal">${money(item.qty * item.price)}</strong>
          </div>
        </div>
      </div>
    `).join('')}
  `;

  $('#cartTotal').textContent = money(cart.reduce((total, item) => total + item.qty * item.price, 0));

  container.querySelectorAll('[data-qty]').forEach((input) => input.addEventListener('change', () => updateQty(input.dataset.qty, input.value)));
  container.querySelectorAll('[data-price]').forEach((input) => input.addEventListener('change', () => updatePrice(input.dataset.price, input.value)));
  container.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    cart = cart.filter((item) => item.id !== button.dataset.remove);
    renderCart();
  }));
  container.querySelectorAll('[data-step-qty]').forEach((button) => button.addEventListener('click', () => {
    const item = cart.find((entry) => entry.id === button.dataset.stepQty);
    if (!item) return;
    const delta = Number(button.dataset.delta) || 0;
    const newQty = item.qty + delta;
    if (newQty < 1) return;
    if (newQty > item.stock) {
      showToast(`Cannot exceed current stock limit of ${item.stock}.`, 'error');
      return;
    }
    item.qty = newQty;
    renderCart();
  }));

  requestAnimationFrame(updateCartScrollFade);
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    if (existing.qty < product.qty) {
      existing.qty += 1;
      showToast(`Increased ${product.name} quantity to ${existing.qty}.`, 'info');
    } else {
      showToast(`Cannot exceed current stock limit of ${product.qty}.`, 'error');
      return;
    }
  } else {
    cart.push({ ...product, stock: product.qty, qty: 1 });
    showToast(`Added ${product.name} to cart.`, 'success');
  }
  renderCart();
}

function updateQty(id, value) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.qty = Math.min(item.stock, Math.max(1, Number(value) || 1));
  renderCart();
}

function updatePrice(id, value) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.price = Math.max(0, Number(value) || 0);
  renderCart();
}

/* ==========================================================================
   REFRESH DATA
   ========================================================================== */
async function refresh(showSkeleton = true) {
  if (!currentSession?.token) return;
  if (showSkeleton) activeView === 'dashboard' ? renderDashboardSkeleton() : renderSkeletonTable();
  try {
    const data = await api('getAppData', { branchId: activeBranchId }, 'GET');
    branches = data.branches;
    renderBranchSelector();
    products = data.inventory;
    customers = data.customers;
    transfers = data.transfers || [];
    creditPayments = data.creditPayments || [];
    salesHistory = data.salesHistory || [];
    creditAccounts = calculateOutstandingCreditAccounts(salesHistory, creditPayments);
    inventoryReportData = data.inventoryReport || {};
    allProducts = data.products;
    if (activeView === 'staffAccounts') staffAccounts = await api('getStaffAccounts', {}, 'GET');
    if (activeView === 'adminAccount') { adminAccount = await api('getAdminAccount', {}, 'GET'); adminAccounts = await api('getAdminAccounts', {}, 'GET'); }
    renderInventory();
    renderCart();
  } catch (error) {
    renderInventory();
    showToast(error.message, 'error');
  }
}

/* ==========================================================================
   MODALS & FORMS
   (User Rule: Always use loading spinner on add and save within the modal)
   ========================================================================== */
function openForm(type, productId = '') {
  activeForm = type;
  $('#formError').textContent = '';
  const product = products.find((item) => item.id === productId);
  const branch = branches.find((item) => item.id === productId);
  const customer = customers.find((item) => item.id === productId);
  editingProductId = productId;

  const formMeta = {
    product: {
      title: 'Add product',
      eyebrow: 'CATALOG REGISTRATION',
      subtitle: 'Register a new merchandise item into the catalog.',
      submit: 'Add product',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>`,
    },
    edit: {
      title: 'Edit product',
      eyebrow: 'CATALOG SPECIFICATION',
      subtitle: 'Modify product specifications and stock alerts.',
      submit: 'Save changes',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    },
    linkProduct: {
      title: 'Add existing product', eyebrow: 'BRANCH PRODUCT SETUP', subtitle: 'Make a catalog product available in the selected branch.', submit: 'Add to branch',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>`,
    },
    stock: {
      title: 'Stock in replenishment',
      eyebrow: 'INVENTORY RESTOCK',
      subtitle: 'Receive inbound stock shipments.',
      submit: 'Save stock',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14"/><path d="m19 9-7 7-7-7"/><circle cx="12" cy="21" r="1"/></svg>`,
    },
    branch: {
      title: 'Add branch', eyebrow: 'BRANCH MANAGEMENT', subtitle: 'Create a location for independent inventory and sales.', submit: 'Add branch',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 7h4M10 12h4M10 17h4"/></svg>`,
    },
    editBranch: {
      title: 'Edit branch', eyebrow: 'BRANCH MANAGEMENT', subtitle: 'Update the branch location and availability.', submit: 'Save changes',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    },
    customer: {
      title: 'Add customer', eyebrow: 'CUSTOMER MANAGEMENT', subtitle: 'Register a customer for the selected branch.', submit: 'Add customer',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>`,
    },
    editCustomer: {
      title: 'Edit customer', eyebrow: 'CUSTOMER MANAGEMENT', subtitle: 'Update customer information for the selected branch.', submit: 'Save changes',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    },
    staff: {
      title: 'Add staff account', eyebrow: 'STAFF ACCOUNTS', subtitle: 'Assign a branch and the menus this staff member may use.', submit: 'Create staff',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>`,
    },
    editStaff: {
      title: 'Edit staff account', eyebrow: 'STAFF ACCOUNTS', subtitle: 'Update the branch assignment and allowed menus.', submit: 'Save changes',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    },
    resetStaff: {
      title: 'Reset staff password', eyebrow: 'STAFF SECURITY', subtitle: 'Assign a new temporary password for this staff member.', submit: 'Reset password',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>`,
    },
    admin: {
      title: 'Add administrator', eyebrow: 'ADMINISTRATION', subtitle: 'Administrators receive full access to every branch and menu.', submit: 'Add administrator',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`,
    },
    editAdmin: {
      title: 'Edit administrator', eyebrow: 'ADMINISTRATION', subtitle: 'Update your administrator profile.', submit: 'Save changes',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    },
    transfer: {
      title: 'New stock transfer', eyebrow: 'BRANCH OPERATIONS', subtitle: 'Create a draft transfer from the selected branch.', submit: 'Create draft',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    },
  }[type] || {
    title: 'Product form',
    eyebrow: 'MERCHANDISE',
    subtitle: 'Manage catalog and store inventory.',
    submit: 'Save',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>`,
  };

  $('#dialogTitle').textContent = formMeta.title;
  const eyebrowEl = $('#modalEyebrow');
  if (eyebrowEl) eyebrowEl.textContent = formMeta.eyebrow;
  const subtitleEl = $('#modalSubtitle');
  if (subtitleEl) subtitleEl.textContent = formMeta.subtitle;
  const iconWrap = $('#modalIconWrap');
  if (iconWrap) iconWrap.innerHTML = formMeta.icon;

  $('#formSubmit').innerHTML = `<span class="button-text">${formMeta.submit}</span>`;

  const selected = (value, expected) => (value === expected ? ' selected' : '');
  const staff = staffAccounts.find((item) => item.id === productId);

  const productFields = `
    <div class="form-field-group full-field">
      <label for="modalProdName">
        <span class="label-text">Product Name <span class="required">*</span></span>
      </label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><line x1="7" x2="7.01" y1="7" y2="7"/></svg>
        <input id="modalProdName" name="name" placeholder="e.g. Petron 11kg" value="${escapeHtml(product?.name || '')}" required autocomplete="off" />
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalProdCategory">
        <span class="label-text">Category <span class="required">*</span></span>
      </label>
      <select id="modalProdCategory" name="category" required>
        <option value="" disabled${product ? '' : ' selected'}>Select category</option>
        ${PRODUCT_CATEGORIES.map((cat) => `<option value="${cat}"${selected(product?.category, cat)}>${cat}</option>`).join('')}
      </select>
    </div>
    <div class="form-field-group">
      <label for="modalProdUnit">
        <span class="label-text">Unit of Measure <span class="required">*</span></span>
      </label>
      <select id="modalProdUnit" name="unit" required>
        <option value="" disabled${product ? '' : ' selected'}>Select unit</option>
        ${PRODUCT_UNITS.map((unit) => `<option value="${unit}"${selected(product?.unit, unit)}>${unit}</option>`).join('')}
      </select>
    </div>
    <div class="form-field-group">
      <label for="modalProdPrice">
        <span class="label-text">Selling Price (PHP) <span class="required">*</span></span>
      </label>
      <div class="input-with-prefix">
        <span class="input-prefix">PHP</span>
        <input id="modalProdPrice" name="price" type="number" min="0" step="0.01" placeholder="0.00" value="${product?.price ?? ''}" required />
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalProdLowStock">
        <span class="label-text">Low Stock Warning Level <span class="required">*</span></span>
      </label>
      <div class="number-stepper">
        <svg class="input-icon warning-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <input id="modalProdLowStock" name="lowStockLevel" type="number" min="0" step="1" value="${product?.lowStockLevel ?? 5}" required />
        <div class="stepper-buttons">
          <button type="button" class="stepper-btn" data-step-target="modalProdLowStock" data-step-dir="1" aria-label="Increase warning level" title="Increase">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button type="button" class="stepper-btn" data-step-target="modalProdLowStock" data-step-dir="-1" aria-label="Decrease warning level" title="Decrease">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="form-field-group full-field">
      <label for="modalProdStatus">
        <span class="label-text">Status</span>
      </label>
      <select id="modalProdStatus" name="status">
        <option value="Active"${selected(product?.status || 'Active', 'Active')}>Active</option>
        <option value="Inactive"${selected(product?.status, 'Inactive')}>Inactive</option>
      </select>
    </div>
  `;

  const stockFields = `
    <div class="form-field-group full-field">
      <label for="modalStockProduct">
        <span class="label-text">Product <span class="required">*</span></span>
      </label>
      <select id="modalStockProduct" name="productId" required>
        <option value="" disabled selected>Select product to stock in</option>
        ${products.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (Current stock: ${item.qty} ${escapeHtml(item.unit || '')})</option>`).join('')}
      </select>
    </div>
    <div class="form-field-group full-field">
      <label for="modalStockQty">
        <span class="label-text">Quantity to Add <span class="required">*</span></span>
      </label>
      <div class="number-stepper">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14"/><path d="m19 9-7 7-7-7"/><circle cx="12" cy="21" r="1"/></svg>
        <input id="modalStockQty" name="qty" type="number" min="1" step="1" placeholder="Enter quantity received" required />
        <div class="stepper-buttons">
          <button type="button" class="stepper-btn" data-step-target="modalStockQty" data-step-dir="1" aria-label="Increase quantity" title="Increase">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button type="button" class="stepper-btn" data-step-target="modalStockQty" data-step-dir="-1" aria-label="Decrease quantity" title="Decrease">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const availableProducts = allProducts.filter((item) => !products.some((productItem) => productItem.id === item.id));
  const linkProductFields = `
    <div class="form-field-group full-field"><label for="modalLinkProduct"><span class="label-text">Catalog Product <span class="required">*</span></span></label><select id="modalLinkProduct" name="productId" required ${availableProducts.length ? '' : 'disabled'}><option value="" disabled selected>${availableProducts.length ? 'Select product to add' : 'All catalog products are already in this branch'}</option>${availableProducts.map((item) => `<option value="${item.id}" data-price="${item.price}" data-low-stock="${item.lowStockLevel}">${escapeHtml(item.name)} (${escapeHtml(item.sku)})</option>`).join('')}</select></div>
    <div class="form-field-group"><label for="modalLinkPrice"><span class="label-text">Selling Price (PHP) <span class="required">*</span></span></label><div class="input-with-prefix"><span class="input-prefix">PHP</span><input id="modalLinkPrice" name="price" type="number" min="0" step="0.01" placeholder="0.00" required /></div></div>
    <div class="form-field-group"><label for="modalLinkLowStock"><span class="label-text">Low Stock Warning Level <span class="required">*</span></span></label><input id="modalLinkLowStock" name="lowStockLevel" type="number" min="0" step="1" value="5" required /></div>
    <div class="form-field-group full-field"><label for="modalLinkStatus"><span class="label-text">Status</span></label><select id="modalLinkStatus" name="status"><option value="Active" selected>Active</option><option value="Inactive">Inactive</option></select></div>
  `;

  const branchFields = `
    <div class="form-field-group full-field">
      <label for="modalBranchName"><span class="label-text">Branch Name <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M19 21v-4"/><path d="M19 17a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"/><path d="M9 10a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/><rect x="3" y="3" width="18" height="4" rx="1"/></svg>
        <input id="modalBranchName" name="name" placeholder="e.g. North Satellite Branch" value="${escapeHtml(branch?.name || '')}" required autocomplete="off" />
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalBranchType"><span class="label-text">Branch Type <span class="required">*</span></span></label>
      <select id="modalBranchType" name="type" required>
        <option value="Main"${selected(branch?.type || 'Satellite', 'Main')}>Main</option>
        <option value="Satellite"${selected(branch?.type || 'Satellite', 'Satellite')}>Satellite</option>
      </select>
    </div>
    <div class="form-field-group">
      <label for="modalBranchStatus"><span class="label-text">Status</span></label>
      <select id="modalBranchStatus" name="status">
        <option value="Active"${selected(branch?.status || 'Active', 'Active')}>Active</option>
        <option value="Inactive"${selected(branch?.status, 'Inactive')}>Inactive</option>
      </select>
    </div>
    <div class="form-field-group full-field">
      <label for="modalBranchAddress"><span class="label-text">Address</span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        <input id="modalBranchAddress" name="address" placeholder="Street, barangay, city" value="${escapeHtml(branch?.address || '')}" autocomplete="off" />
      </div>
    </div>
  `;

  const customerFields = `
    <div class="form-field-group full-field">
      <label for="modalCustomerName"><span class="label-text">Customer Name <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <input id="modalCustomerName" name="name" placeholder="e.g. Juan Dela Cruz" value="${escapeHtml(customer?.name || '')}" required autocomplete="off" />
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalCustomerPhone"><span class="label-text">Mobile Number</span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <input id="modalCustomerPhone" name="phone" type="tel" placeholder="e.g. 0917 123 4567" value="${escapeHtml(customer?.phone || '')}" autocomplete="tel" />
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalCustomerStatus"><span class="label-text">Status</span></label>
      <select id="modalCustomerStatus" name="status">
        <option value="Active"${selected(customer?.status || 'Active', 'Active')}>Active</option>
        <option value="Inactive"${selected(customer?.status, 'Inactive')}>Inactive</option>
      </select>
    </div>
    <div class="form-field-group full-field">
      <label for="modalCustomerAddress"><span class="label-text">Address</span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        <input id="modalCustomerAddress" name="address" placeholder="Street, barangay, city" value="${escapeHtml(customer?.address || '')}" autocomplete="street-address" />
      </div>
    </div>
  `;

  const destinationBranches = branches.filter((item) => item.id !== activeBranchId && item.status === 'Active');
  const transferFields = `
    <div class="form-field-group full-field"><label for="modalTransferDestination"><span class="label-text">Destination Branch <span class="required">*</span></span></label><select id="modalTransferDestination" name="destinationBranchId" required ${destinationBranches.length ? '' : 'disabled'}><option value="" disabled selected>${destinationBranches.length ? 'Select destination branch' : 'Create another active branch first'}</option>${destinationBranches.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></div>
    <div class="form-field-group full-field"><label for="modalTransferProduct"><span class="label-text">Source Product <span class="required">*</span></span></label><select id="modalTransferProduct" name="productId" required><option value="" disabled selected>Select destination branch first</option></select></div>
    <div class="form-field-group"><label for="modalTransferQty"><span class="label-text">Transfer Quantity <span class="required">*</span></span></label><input id="modalTransferQty" name="qty" type="number" min="1" step="1" placeholder="0" required /></div>
    <div class="form-field-group"><label for="modalTransferNotes"><span class="label-text">Reference / Notes</span></label><input id="modalTransferNotes" name="notes" placeholder="Optional reference" autocomplete="off" /></div>
  `;

  const menuOptions = [
    ['pos', 'Point of Sale'],
    ['products', 'Product Registration'],
    ['inventory', 'Inventory Stock'],
    ['transfers', 'Stock Transfers'],
    ['customers', 'Customers'],
    ['credits', 'Credit Payments'],
    ['sales', 'Sales History'],
    ['inventoryReports', 'Inventory Reports']
  ];
  const menuIcons = {
    pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>',
    inventory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>',
    transfers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
    customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    credits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>',
    sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    inventoryReports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
  };
  const staffFields = `
    <div class="form-field-group">
      <label for="modalStaffName"><span class="label-text">Full Name <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <input id="modalStaffName" name="fullName" value="${escapeHtml(staff?.fullName || '')}" placeholder="e.g. Maria Santos" required autocomplete="name">
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalStaffUsername"><span class="label-text">Username <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
        <input id="modalStaffUsername" name="username" value="${escapeHtml(staff?.username || '')}" ${type === 'editStaff' ? 'readonly' : ''} placeholder="e.g. staff_maria" required autocapitalize="none">
      </div>
    </div>
    ${type === 'staff' ? `
      <div class="form-field-group full-field">
        <label for="modalStaffPassword"><span class="label-text">Temporary Password <span class="required">*</span></span></label>
        <div class="input-with-icon password-input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input id="modalStaffPassword" name="password" type="password" minlength="8" placeholder="Minimum 8 characters" required autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
            <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </button>
        </div>
      </div>
    ` : ''}
    <div class="form-field-group full-field"><label for="modalStaffBranch"><span class="label-text">Assigned Branch <span class="required">*</span></span></label><select id="modalStaffBranch" name="branchId" required><option value="" disabled${staff ? '' : ' selected'}>Select branch</option>${branches.filter((item) => item.status === 'Active').map((item) => `<option value="${escapeHtml(item.id)}"${selected(staff?.branchId, item.id)}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
    <div class="form-field-group full-field">
      <span class="label-text">Allowed Sidebar Menus <span class="required">*</span></span>
      <div class="staff-permission-grid">
        ${menuOptions.map(([value, label]) => {
          const isChecked = Boolean(staff?.permissions?.includes(value));
          return `
            <label class="staff-permission-option${isChecked ? ' is-checked' : ''}">
              <input type="checkbox" name="permissions" value="${value}"${isChecked ? ' checked' : ''}>
              <span class="custom-checkbox" aria-hidden="true">
                <svg class="custom-checkbox-icon" viewBox="0 0 12 10" fill="none">
                  <path d="M1.5 5.2L4.2 8L10.5 1.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="staff-permission-icon-wrap" aria-hidden="true">${menuIcons[value] || ''}</span>
              <span class="staff-permission-label">${label}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
  const currentAdmin = type === 'editAdmin' ? adminAccounts.find((account) => account.id === productId) : adminAccount || currentSession?.account;
  const adminFields = `
    <div class="form-field-group">
      <label for="modalAdminName"><span class="label-text">Full Name <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <input id="modalAdminName" name="fullName" value="${type === 'editAdmin' ? escapeHtml(currentAdmin?.fullName || '') : ''}" placeholder="e.g. Administrator" required autocomplete="name">
      </div>
    </div>
    <div class="form-field-group">
      <label for="modalAdminUsername"><span class="label-text">Username <span class="required">*</span></span></label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
        <input id="modalAdminUsername" name="username" value="${type === 'editAdmin' ? escapeHtml(currentAdmin?.username || '') : ''}" placeholder="e.g. admin" required autocapitalize="none">
      </div>
    </div>
    ${type === 'admin' ? `
      <div class="form-field-group full-field">
        <label for="modalAdminPassword"><span class="label-text">Password <span class="required">*</span></span></label>
        <div class="input-with-icon password-input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input id="modalAdminPassword" name="password" type="password" minlength="8" placeholder="Minimum 8 characters" required autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
            <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </button>
        </div>
      </div>
    ` : ''}
    ${type === 'admin' ? `
      <div class="form-field-group full-field">
        <label for="modalAdminConfirmPassword"><span class="label-text">Confirm Password <span class="required">*</span></span></label>
        <div class="input-with-icon password-input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input id="modalAdminConfirmPassword" name="confirmPassword" type="password" minlength="8" placeholder="Confirm password" required autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1"><svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg></button>
        </div>
      </div>
    ` : ''}
    ${type === 'editAdmin' ? `
      <div class="form-section-divider full-field">
        <div class="form-section-header">
          <div class="form-section-title-wrap">
            <svg class="form-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Change Password</span>
          </div>
          <span class="form-section-badge">Optional</span>
        </div>
        <p class="form-section-subtitle">Leave blank to keep your current password</p>
      </div>
      <div class="form-field-group">
        <label for="modalAdminNewPassword"><span class="label-text">New Password</span></label>
        <div class="input-with-icon password-input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input id="modalAdminNewPassword" name="newPassword" type="password" minlength="8" placeholder="Min. 8 characters" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
            <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </button>
        </div>
      </div>
      <div class="form-field-group">
        <label for="modalAdminConfirmPassword"><span class="label-text">Confirm Password</span></label>
        <div class="input-with-icon password-input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4a1 1 0 0 0-1.4 0l-2.1 2.1a1 1 0 0 0 0 1.4Z"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>
          <input id="modalAdminConfirmPassword" name="confirmPassword" type="password" minlength="8" placeholder="Confirm new password" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
            <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </button>
        </div>
      </div>
    ` : ''}
  `;

  const resetStaffFields = `
    <div class="form-field-group full-field">
      <div class="staff-reset-summary-card">
        <div class="staff-reset-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M19 8v6M22 11h-6"/></svg>
        </div>
        <div class="staff-reset-info">
          <strong class="staff-reset-name">${escapeHtml(staff?.fullName || 'Staff Member')}</strong>
          <span class="staff-reset-meta">${escapeHtml(staff?.username ? `@${staff.username}` : '')}${staff?.branchId ? ` &bull; ${escapeHtml(branches.find((b) => b.id === staff.branchId)?.name || 'Assigned Branch')}` : ''}</span>
        </div>
      </div>
    </div>
    <div class="form-field-group full-field">
      <label for="modalResetStaffPassword"><span class="label-text">New Temporary Password <span class="required">*</span></span></label>
      <div class="input-with-icon password-input-wrap">
        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <input id="modalResetStaffPassword" name="temporaryPassword" type="password" minlength="8" placeholder="Minimum 8 characters" required autocomplete="new-password">
        <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
          <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
        </button>
      </div>
      <p class="field-hint">All active sessions for this account will end immediately. The staff member must set a new permanent password after signing in.</p>
    </div>
  `;

  const container = $('#formFields');
  container.innerHTML = type === 'product' || type === 'edit' ? productFields : type === 'linkProduct' ? linkProductFields : type === 'branch' || type === 'editBranch' ? branchFields : type === 'customer' || type === 'editCustomer' ? customerFields : type === 'staff' || type === 'editStaff' ? staffFields : type === 'resetStaff' ? resetStaffFields : type === 'admin' || type === 'editAdmin' ? adminFields : type === 'transfer' ? transferFields : stockFields;

  // Initialize smooth dropdowns for newly injected selects
  initCustomDropdowns(container);

  // Sync state for permission checkbox cards
  container.querySelectorAll('.staff-permission-option input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const option = checkbox.closest('.staff-permission-option');
      if (option) {
        option.classList.toggle('is-checked', checkbox.checked);
      }
    });
  });

  const linkedProductSelect = $('#modalLinkProduct');
  if (linkedProductSelect) {
    linkedProductSelect.addEventListener('change', () => {
      const option = linkedProductSelect.options[linkedProductSelect.selectedIndex];
      $('#modalLinkPrice').value = option?.dataset.price || '';
      $('#modalLinkLowStock').value = option?.dataset.lowStock || 5;
    });
  }

  const transferDestination = $('#modalTransferDestination');
  const transferProduct = $('#modalTransferProduct');
  if (transferDestination && transferProduct) {
    transferDestination.addEventListener('change', async () => {
      transferProduct.innerHTML = '<option value="" disabled selected>Loading shared products...</option>';
      updateCustomDropdown(transferProduct);
      try {
        const sharedProducts = await api('getTransferProducts', { sourceBranchId: activeBranchId, destinationBranchId: transferDestination.value }, 'GET');
        transferProduct.innerHTML = `<option value="" disabled selected>${sharedProducts.length ? 'Select product from source branch' : 'No shared products in these branches'}</option>${sharedProducts.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (Available: ${item.qty} ${escapeHtml(item.unit)})</option>`).join('')}`;
        updateCustomDropdown(transferProduct);
      } catch (error) {
        transferProduct.innerHTML = '<option value="" disabled selected>Unable to load shared products</option>';
        updateCustomDropdown(transferProduct);
        $('#formError').textContent = error.message;
      }
    });
  }

  // Initialize smooth number steppers
  container.querySelectorAll('[data-step-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.stepTarget;
      const dir = Number(btn.dataset.stepDir) || 1;
      const input = document.getElementById(targetId);
      if (!input) return;
      const step = Number(input.step) || 1;
      const min = input.min !== '' ? Number(input.min) : -Infinity;
      const max = input.max !== '' ? Number(input.max) : Infinity;
      let val = (Number(input.value) || 0) + dir * step;
      if (val < min) val = min;
      if (val > max) val = max;
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  $('#formDialog').showModal();
  if (type === 'resetStaff') {
    setTimeout(() => {
      $('#modalResetStaffPassword')?.focus();
    }, 60);
  }
}

async function deleteProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const confirmed = await askConfirmation({
    title: 'Delete Product',
    eyebrow: 'CATALOG MANAGEMENT',
    subtitle: 'Permanent action • please confirm',
    message: `Are you sure you want to delete <strong class="confirm-highlight-name">${escapeHtml(product.name)}</strong>?`,
    warning: 'This product will be permanently removed from your catalog and inventory records.',
    confirmText: 'Delete Product',
    confirmType: 'danger'
  });

  if (!confirmed) return;

  try {
    await api('deleteProduct', { productId });
    await refresh();
    showToast('Product deleted successfully.', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to delete product.', 'error');
  }
}

/* ==========================================================================
   NAVIGATION & VIEWS
   ========================================================================== */
function setView(view, preserveSidebarOpen = false) {
  const validViews = ['dashboard', 'pos', 'products', 'inventory', 'branches', 'transfers', 'customers', 'credits', 'sales', 'inventoryReports', 'staffAccounts', 'adminAccount'];
  const permissions = currentSession?.account?.permissions || ['*'];
  if (view !== 'dashboard' && !permissions.includes('*') && !permissions.includes(view)) view = permissions[0] || 'pos';
  if (!validViews.includes(view)) view = 'pos';
  activeView = view;
  localStorage.setItem(ACTIVE_VIEW_KEY, activeView);
  const details = {
    dashboard: ['WORKSPACE', 'Dashboard', 'BRANCH OVERVIEW', 'Operational Snapshot'],
    pos: ['WORKSPACE', 'Point of Sale', 'INVENTORY', 'Available Products'],
    products: ['CATALOG', 'Product Registration', 'PRODUCT CATALOG', 'Registered Products'],
    inventory: ['BRANCH INVENTORY', 'Inventory Stock', 'STOCK CONTROL', 'Main Branch Stock'],
    branches: ['BRANCH OPERATIONS', 'Branches', 'LOCATION DIRECTORY', 'Main and Satellite Branches'],
    customers: ['CUSTOMER ACCOUNTS', 'Customers', 'CUSTOMER DIRECTORY', 'Customers in the Selected Branch'],
    credits: ['CUSTOMER ACCOUNTS', 'Credit Payments', 'ACCOUNT RECEIVABLES', 'Outstanding Customer Credit'],
    sales: ['REPORTING', 'Sales History', 'SALES LEDGER', 'Branch Sales History'],
    inventoryReports: ['REPORTING', 'Inventory Reports', 'INVENTORY REPORT', 'Active Branch Stock Report'],
    transfers: ['BRANCH OPERATIONS', 'Stock Transfers', 'TRANSFER TRACKING', 'Outgoing and Incoming Branch Stock'],
    staffAccounts: ['ADMINISTRATION', 'Staff Accounts', 'STAFF ACCOUNTS', 'Manage Staff Access'],
    adminAccount: ['ADMINISTRATION', 'Admin Account', 'ADMINISTRATION', 'Administrator Accounts'],
  }[view] || ['WORKSPACE', 'Point of Sale', 'INVENTORY', 'Available Products'];

  $('#pageEyebrow').textContent = details[0];
  $('#pageTitle').textContent = details[1];
  $('#catalogEyebrow').textContent = details[2];
  $('#catalogTitle').textContent = details[3];
  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.placeholder = view === 'customers'
      ? 'Search customer name, phone, or address...'
      : view === 'branches'
      ? 'Search branch name, type, or address...'
      : view === 'transfers'
      ? 'Search transfer, branch, product, or status...'
      : view === 'credits'
      ? 'Search customer, credit sale, or payment note...'
      : view === 'sales'
      ? 'Search receipt, customer, or payment type...'
      : view === 'inventoryReports'
      ? 'Search product name, SKU, or category...'
      : view === 'staffAccounts'
      ? 'Search staff name or username...'
      : 'Search product name, SKU, or category...';
  }

  const viewIcons = {
    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
    pos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    products: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>`,
    inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>`,
    branches: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 7h4M10 12h4M10 17h4"/></svg>`,
    customers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>`,
    credits: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
    sales: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    inventoryReports: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M14 2v4h4"/><path d="M9 12h6M9 16h6M9 20h4"/></svg>`,
    transfers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    staffAccounts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M19 8v6M22 11h-6"/></svg>`,
    adminAccount: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };

  const catalogIconWrap = $('#catalogIconWrap');
  if (catalogIconWrap && viewIcons[view]) {
    catalogIconWrap.innerHTML = viewIcons[view];
  }

  const isPos = view === 'pos';
  const isDashboard = view === 'dashboard';
  const dashboard = $('#dashboard');
  const catalog = $('#products');
  if (dashboard) dashboard.hidden = !isDashboard;
  if (catalog) catalog.hidden = isDashboard;
  const sectionActions = $('#sectionActions');
  if (sectionActions) sectionActions.style.display = isPos || view === 'credits' || view === 'sales' || view === 'inventoryReports' ? 'none' : 'flex';
  const addBtn = $('#addProductButton');
  if (addBtn) addBtn.hidden = view !== 'products';
  const addExistingProductBtn = $('#addExistingProductButton');
  if (addExistingProductBtn) addExistingProductBtn.hidden = view !== 'products';
  const stockBtn = $('#stockInButton');
  if (stockBtn) stockBtn.hidden = view !== 'inventory';
  const branchBtn = $('#addBranchButton');
  if (branchBtn) branchBtn.hidden = view !== 'branches';
  const customerBtn = $('#addCustomerButton');
  if (customerBtn) customerBtn.hidden = view !== 'customers';
  const transferBtn = $('#addTransferButton');
  if (transferBtn) transferBtn.hidden = view !== 'transfers';
  const staffBtn = $('#addStaffButton');
  if (staffBtn) staffBtn.hidden = view !== 'staffAccounts';
  const adminBtn = $('#addAdminButton');
  if (adminBtn) adminBtn.hidden = view !== 'adminAccount';
  const inventoryPdfBtn = $('#generateInventoryPdfButton');
  if (inventoryPdfBtn) inventoryPdfBtn.hidden = view !== 'inventoryReports';
  $('#pos').dataset.view = view;

  // Mobile cart button only visible on POS view
  const mobileCartToggle = $('#mobileCartToggle');
  if (mobileCartToggle) {
    mobileCartToggle.hidden = !isPos;
  }
  const salesDateRange = $('#salesDateRange');
  if (salesDateRange) salesDateRange.hidden = view !== 'sales';
  const profilePanel = $('#accountProfilePanel');
  if (profilePanel && view !== 'adminAccount') profilePanel.hidden = true;
  if (view === 'sales') {
    ensureSalesDateDefaults();
    updateSalesPrintPeriod();
  }

  // Reset mobile cart view state when navigating
  $('#pos').classList.remove('show-mobile-cart');
  const toggleBtn = $('#mobileCartToggle');
  if (toggleBtn) toggleBtn.classList.remove('active');

  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));

  if (!preserveSidebarOpen) {
    $('#sidebar').classList.remove('open');
    $('#sidebarBackdrop').classList.remove('active');
    localStorage.setItem(SIDEBAR_OPEN_KEY, 'false');
  }
  renderInventory();
  if (currentSession?.token && !currentSession.account?.mustChangePassword) refresh();
}

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */
// Settings Dialog
const settingsBtn = $('#settingsButton');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    $('#apiUrlInput').value = localStorage.getItem(endpointKey) || DEFAULT_API_URL;
    $('#settingsDialog').showModal();
  });
}

// Sidebar & Responsive Navigation
const SIDEBAR_COLLAPSED_KEY = 'fr-pos-sidebar-collapsed';
const SIDEBAR_OPEN_KEY = 'fr-pos-sidebar-open';
const appShell = $('.app-shell');
const menuToggle = $('#menuToggle');
const sidebar = $('#sidebar');
const backdrop = $('#sidebarBackdrop');
const sidebarCollapseBtn = $('#sidebarCollapseBtn');

function isMobileScreen() {
  return window.innerWidth <= 860;
}

function initSidebarState() {
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'false';
  const open = localStorage.getItem(SIDEBAR_OPEN_KEY) === 'true';
  appShell.classList.toggle('sidebar-collapsed', collapsed);
  if (isMobileScreen()) {
    sidebar.classList.toggle('open', open);
    if (backdrop) backdrop.classList.toggle('active', open);
  } else {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }
}

function handleMenuToggle() {
  if (isMobileScreen()) {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('active', sidebar.classList.contains('open'));
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebar.classList.contains('open')));
  } else {
    // Desktop / Tablet: uncollapse or toggle
    appShell.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, appShell.classList.contains('sidebar-collapsed'));
  }
}

function handleSidebarCollapse() {
  if (isMobileScreen()) {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
    localStorage.setItem(SIDEBAR_OPEN_KEY, 'false');
  } else {
    appShell.classList.add('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
  }
}

menuToggle.addEventListener('click', handleMenuToggle);
if (sidebarCollapseBtn) {
  sidebarCollapseBtn.addEventListener('click', handleSidebarCollapse);
}
backdrop.addEventListener('click', () => {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
  localStorage.setItem(SIDEBAR_OPEN_KEY, 'false');
});

window.addEventListener('resize', () => {
  initSidebarState();
  if (!isMobileScreen()) {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }
});

// Mobile Cart Toggle & Back Button
$('#mobileCartToggle').addEventListener('click', () => {
  const isPos = activeView === 'pos';
  if (!isPos) setView('pos');
  const showing = $('#pos').classList.toggle('show-mobile-cart');
  $('#mobileCartToggle').classList.toggle('active', showing);
});

const cartBackButton = $('#cartBackButton');
if (cartBackButton) {
  cartBackButton.addEventListener('click', () => {
    $('#pos').classList.remove('show-mobile-cart');
    const toggle = $('#mobileCartToggle');
    if (toggle) toggle.classList.remove('active');
  });
}

const cartScrollContainer = $('#cartItems');
if (cartScrollContainer) {
  cartScrollContainer.addEventListener('scroll', updateCartScrollFade, { passive: true });
}
const receiptScrollContainer = $('#receiptDialog .receipt-body');
if (receiptScrollContainer) {
  receiptScrollContainer.addEventListener('scroll', updateReceiptScrollFade, { passive: true });
}
window.addEventListener('resize', updateCartScrollFade, { passive: true });
window.addEventListener('resize', updateReceiptScrollFade, { passive: true });
window.addEventListener('resize', scheduleBadgeAlignment, { passive: true });

const inventoryTableElement = $('#inventoryTable');
if (inventoryTableElement) {
  const inventoryTableObserver = new MutationObserver(scheduleBadgeAlignment);
  inventoryTableObserver.observe(inventoryTableElement, { childList: true, subtree: true });
  scheduleBadgeAlignment();
}

document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => setView(link.dataset.view)));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  const dialogId = button.dataset.close;
  const dlg = $(`#${dialogId}`);
  if (dlg) dlg.close();
}));

const actionConfirmDialog = $('#actionConfirmDialog');
if (actionConfirmDialog) {
  actionConfirmDialog.addEventListener('close', () => {
    if (pendingActionConfirmResolver) {
      pendingActionConfirmResolver(false);
      pendingActionConfirmResolver = null;
    }
  });
}

const actionConfirmSubmitBtn = $('#actionConfirmSubmitBtn');
if (actionConfirmSubmitBtn) {
  actionConfirmSubmitBtn.addEventListener('click', () => {
    const resolver = pendingActionConfirmResolver;
    pendingActionConfirmResolver = null;
    const dialog = $('#actionConfirmDialog');
    if (dialog) dialog.close();
    if (resolver) resolver(true);
  });
}

// Settings Form submission with loading spinner
$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = $('#apiUrlInput').value.trim();
  if (!url) return;

  const submitBtn = $('#settingsSubmit');
  const originalText = submitBtn.querySelector('.button-text')?.textContent || 'Save and connect';

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span><span>Connecting...</span>`;

  try {
    localStorage.setItem(endpointKey, url);
    await refresh();
    $('#settingsDialog').close();
    showToast('API connected successfully.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="button-text">${originalText}</span>`;
  }
});

// Modal Form submission with loading spinner (User Rule)
$('#addProductButton').addEventListener('click', () => openForm('product'));
$('#addExistingProductButton').addEventListener('click', () => openForm('linkProduct'));
$('#stockInButton').addEventListener('click', () => openForm('stock'));
$('#addBranchButton').addEventListener('click', () => openForm('branch'));
$('#addCustomerButton').addEventListener('click', () => openForm('customer'));
$('#addTransferButton').addEventListener('click', () => openForm('transfer'));
$('#addStaffButton').addEventListener('click', () => openForm('staff'));
$('#addAdminButton').addEventListener('click', () => openForm('admin'));
$('#generateInventoryPdfButton').addEventListener('click', generateInventoryReportPdf);

$('#modalForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  if (!formEl.checkValidity()) {
    formEl.reportValidity();
    return;
  }
  const form = new FormData(formEl);
  if (activeForm === 'admin' && form.get('password') !== form.get('confirmPassword')) {
    showToast('Password and confirmation do not match.', 'error');
    return;
  }

  let confirmConfig = {
    title: 'Confirm Changes',
    eyebrow: 'CONFIRM ACTION',
    subtitle: 'Please review before saving',
    message: 'Are you sure you want to save these changes?',
    confirmText: 'Save',
    confirmType: 'primary'
  };

  if (activeForm === 'product') {
    const name = form.get('name') || 'product';
    confirmConfig = {
      title: 'Add New Product',
      eyebrow: 'PRODUCT REGISTRATION',
      subtitle: 'Register catalog item',
      message: `Are you sure you want to add <strong class="confirm-highlight-name">${escapeHtml(name)}</strong> into the product catalog?`,
      confirmText: 'Add Product',
      confirmType: 'primary'
    };
  } else if (activeForm === 'edit') {
    const name = form.get('name') || 'product';
    confirmConfig = {
      title: 'Save Product Changes',
      eyebrow: 'PRODUCT CATALOG',
      subtitle: 'Update item specification',
      message: `Are you sure you want to save changes to <strong class="confirm-highlight-name">${escapeHtml(name)}</strong>?`,
      confirmText: 'Save Changes',
      confirmType: 'primary'
    };
  } else if (activeForm === 'linkProduct') {
    const productId = form.get('productId');
    const prod = allProducts.find((p) => p.id === productId);
    const name = prod?.name || 'selected product';
    confirmConfig = {
      title: 'Link Product to Branch',
      eyebrow: 'BRANCH INVENTORY',
      subtitle: 'Add item to current branch inventory',
      message: `Are you sure you want to add <strong class="confirm-highlight-name">${escapeHtml(name)}</strong> to this branch?`,
      confirmText: 'Link Product',
      confirmType: 'primary'
    };
  } else if (activeForm === 'branch') {
    const name = form.get('name') || 'branch';
    confirmConfig = {
      title: 'Add New Branch',
      eyebrow: 'BRANCH OPERATIONS',
      subtitle: 'Register new location',
      message: `Are you sure you want to create branch <strong class="confirm-highlight-name">${escapeHtml(name)}</strong>?`,
      confirmText: 'Add Branch',
      confirmType: 'primary'
    };
  } else if (activeForm === 'editBranch') {
    const name = form.get('name') || 'branch';
    confirmConfig = {
      title: 'Save Branch Changes',
      eyebrow: 'BRANCH OPERATIONS',
      subtitle: 'Update location details',
      message: `Are you sure you want to save changes for branch <strong class="confirm-highlight-name">${escapeHtml(name)}</strong>?`,
      confirmText: 'Save Changes',
      confirmType: 'primary'
    };
  } else if (activeForm === 'customer') {
    const name = form.get('name') || 'customer';
    confirmConfig = {
      title: 'Add New Customer',
      eyebrow: 'CUSTOMER ACCOUNTS',
      subtitle: 'Register customer account',
      message: `Are you sure you want to add customer <strong class="confirm-highlight-name">${escapeHtml(displayCustomerName(name))}</strong>?`,
      confirmText: 'Add Customer',
      confirmType: 'primary'
    };
  } else if (activeForm === 'editCustomer') {
    const name = form.get('name') || 'customer';
    confirmConfig = {
      title: 'Save Customer Changes',
      eyebrow: 'CUSTOMER ACCOUNTS',
      subtitle: 'Update account profile',
      message: `Are you sure you want to save changes for customer <strong class="confirm-highlight-name">${escapeHtml(displayCustomerName(name))}</strong>?`,
      confirmText: 'Save Changes',
      confirmType: 'primary'
    };
  } else if (activeForm === 'staff' || activeForm === 'editStaff') {
    const name = form.get('fullName') || 'staff member';
    confirmConfig = {
      title: activeForm === 'staff' ? 'Create Staff Account' : 'Save Staff Changes',
      eyebrow: 'STAFF ACCOUNTS', subtitle: 'Confirm account access',
      message: `Are you sure you want to ${activeForm === 'staff' ? 'create an account for' : 'save changes for'} <strong class="confirm-highlight-name">${escapeHtml(name)}</strong>?`,
      warning: activeForm === 'staff' ? 'The staff member must change the temporary password after signing in.' : 'The selected branch and menus take effect immediately.',
      confirmText: activeForm === 'staff' ? 'Create Staff' : 'Save Changes', confirmType: 'primary'
    };
  } else if (activeForm === 'resetStaff') {
    const staff = staffAccounts.find((item) => item.id === editingProductId);
    confirmConfig = {
      title: 'Reset Staff Password',
      eyebrow: 'STAFF ACCOUNTS',
      subtitle: 'Temporary password confirmation',
      message: `Reset the temporary password for <strong class="confirm-highlight-name">${escapeHtml(staff?.fullName || 'this staff member')}</strong>?`,
      warning: 'All active sessions for this account will end immediately.',
      confirmText: 'Reset Password',
      confirmType: 'primary'
    };
  } else if (activeForm === 'admin' || activeForm === 'editAdmin') {
    const name = form.get('fullName') || 'administrator';
    confirmConfig = activeForm === 'admin'
      ? { title: 'Add Administrator', eyebrow: 'ADMINISTRATION', subtitle: 'Confirm full system access', message: `Are you sure you want to make <strong class="confirm-highlight-name">${escapeHtml(name)}</strong> an administrator?`, warning: 'This account will have access to all branches and all menus.', confirmText: 'Add Administrator', confirmType: 'primary' }
      : { title: 'Save Administrator Changes', eyebrow: 'ADMINISTRATION', subtitle: 'Confirm profile update', message: 'Are you sure you want to save your administrator profile changes?', confirmText: 'Save Changes', confirmType: 'primary' };
  } else if (activeForm === 'transfer') {
    const prodId = form.get('productId');
    const prod = products.find((p) => p.id === prodId);
    const qty = form.get('qty') || '0';
    const destId = form.get('destinationBranchId');
    const dest = branches.find((b) => b.id === destId);
    confirmConfig = {
      title: 'Create Stock Transfer',
      eyebrow: 'STOCK TRANSFERS',
      subtitle: 'Draft stock transfer',
      message: `Are you sure you want to transfer <strong>${escapeHtml(qty)} ${escapeHtml(prod?.unit || 'units')}</strong> of <strong class="confirm-highlight-name">${escapeHtml(prod?.name || 'product')}</strong> to <strong>${escapeHtml(dest?.name || 'destination branch')}</strong>?`,
      confirmText: 'Create Draft',
      confirmType: 'primary'
    };
  } else {
    const prod = products.find((p) => p.id === editingProductId);
    const qty = form.get('qty') || '0';
    confirmConfig = {
      title: 'Confirm Stock In',
      eyebrow: 'INVENTORY STOCK',
      subtitle: 'Add physical inventory stock',
      message: `Are you sure you want to add <strong>${escapeHtml(qty)} ${escapeHtml(prod?.unit || 'units')}</strong> to <strong class="confirm-highlight-name">${escapeHtml(prod?.name || 'item')}</strong>?`,
      confirmText: 'Update Stock',
      confirmType: 'primary'
    };
  }

  const confirmed = await askConfirmation(confirmConfig);
  if (!confirmed) return;

  const submitBtn = $('#formSubmit');
  const originalText = submitBtn.querySelector('.button-text')?.textContent || 'Save';

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span><span>Saving...</span>`;
  $('#formError').textContent = '';

  try {
    if (activeForm === 'product') {
      const payload = Object.fromEntries(form);
      if (!payload.status) payload.status = 'Active';
      await api('createProduct', { ...payload, branchId: activeBranchId });
      showToast('Product added successfully.', 'success');
    } else if (activeForm === 'edit') {
      const current = products.find((p) => p.id === editingProductId);
      const payload = { ...Object.fromEntries(form), productId: editingProductId };
      if (!payload.status) payload.status = current?.status || 'Active';
      await api('updateProduct', { ...payload, branchId: activeBranchId });
      showToast('Product updated successfully.', 'success');
    } else if (activeForm === 'linkProduct') {
      await api('addProductToBranch', { ...Object.fromEntries(form), branchId: activeBranchId });
      showToast('Product added to this branch.', 'success');
    } else if (activeForm === 'branch') {
      await api('createBranch', Object.fromEntries(form));
      showToast('Branch added successfully.', 'success');
    } else if (activeForm === 'editBranch') {
      await api('updateBranch', { ...Object.fromEntries(form), branchId: editingProductId });
      showToast('Branch updated successfully.', 'success');
    } else if (activeForm === 'customer') {
      await api('createCustomer', { ...Object.fromEntries(form), branchId: activeBranchId });
      showToast('Customer added successfully.', 'success');
    } else if (activeForm === 'editCustomer') {
      await api('updateCustomer', { ...Object.fromEntries(form), customerId: editingProductId, branchId: activeBranchId });
      showToast('Customer updated successfully.', 'success');
    } else if (activeForm === 'staff' || activeForm === 'editStaff') {
      const payload = Object.fromEntries(form);
      payload.permissions = form.getAll('permissions');
      if (!payload.permissions.length) throw new Error('Select at least one allowed sidebar menu.');
      await api(activeForm === 'staff' ? 'createStaffAccount' : 'updateStaffAccount', activeForm === 'staff' ? payload : { ...payload, staffId: editingProductId });
      showToast(activeForm === 'staff' ? 'Staff account created.' : 'Staff account updated.', 'success');
    } else if (activeForm === 'resetStaff') {
      const password = form.get('temporaryPassword');
      if (!password || password.length < 8) throw new Error('Temporary password must be at least 8 characters.');
      await api('resetStaffPassword', { staffId: editingProductId, temporaryPassword: password });
      showToast('Temporary password saved.', 'success');
    } else if (activeForm === 'admin') {
      await api('createAdminAccount', Object.fromEntries(form));
      showToast('Administrator account created.', 'success');
    } else if (activeForm === 'editAdmin') {
      const payload = Object.fromEntries(form);
      if (payload.newPassword !== payload.confirmPassword) throw new Error('New password and confirmation do not match.');
      const account = await api('updateAdminAccount', { adminId: editingProductId, fullName: payload.fullName, username: payload.username, newPassword: payload.newPassword });
      if (account.id === currentSession.account.id) {
        currentSession.account = { ...currentSession.account, ...account };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentSession));
      }
      showToast('Administrator profile updated.', 'success');
    } else if (activeForm === 'transfer') {
      await api('createTransfer', { ...Object.fromEntries(form), sourceBranchId: activeBranchId });
      showToast('Stock transfer draft created.', 'success');
    } else {
      await api('stockIn', { ...Object.fromEntries(form), branchId: activeBranchId });
      showToast('Stock updated successfully.', 'success');
    }
    $('#formDialog').close();
    await refresh();
  } catch (error) {
    const isDuplicateUsername = /username is already in use/i.test(error.message || '');
    $('#formError').textContent = isDuplicateUsername ? '' : error.message;
    showToast(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="button-text">${originalText}</span>`;
  }
});

$('#searchInput').addEventListener('input', renderInventory);
$('#salesDateFrom').addEventListener('change', () => {
  const dateFrom = $('#salesDateFrom');
  const dateTo = $('#salesDateTo');
  if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
    dateTo.value = dateFrom.value;
    syncCustomDatePicker(dateTo);
  }
  syncCustomDatePicker(dateFrom);
  updateSalesPrintPeriod();
  renderInventory();
});
$('#salesDateTo').addEventListener('change', () => {
  const dateFrom = $('#salesDateFrom');
  const dateTo = $('#salesDateTo');
  if (dateFrom.value && dateTo.value && dateTo.value < dateFrom.value) {
    dateFrom.value = dateTo.value;
    syncCustomDatePicker(dateFrom);
  }
  syncCustomDatePicker(dateTo);
  updateSalesPrintPeriod();
  renderInventory();
});
$('#generateSalesPdfButton').addEventListener('click', generateSalesPdf);

$('#branchSelector').addEventListener('change', (event) => {
  setActiveBranch(event.target.value).catch((error) => showToast(error.message, 'error'));
});

$('#clearCartButton').addEventListener('click', async () => {
  if (!cart.length) return;
  const confirmed = await askConfirmation({
    title: 'Clear Cart',
    eyebrow: 'POINT OF SALE',
    subtitle: 'Remove pending items',
    message: `Are you sure you want to clear <strong>${cart.length} item(s)</strong> from your cart?`,
    warning: 'All selected products and entered quantities will be removed.',
    confirmText: 'Clear Cart',
    confirmType: 'danger'
  });
  if (!confirmed) return;

  cart = [];
  renderCart();
  showToast('Cart cleared.', 'info');
});

$('#creditPaymentDialog').addEventListener('close', () => { pendingCreditAccount = null; });
$('#creditPaymentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingCreditAccount) return;
  const amount = Number($('#creditAmount').value);
  const error = $('#creditPaymentError');
  if (!Number.isFinite(amount) || amount <= 0) {
    error.textContent = 'Enter a payment amount greater than zero.';
    return;
  }
  if (amount > pendingCreditAccount.balance + 0.00001) {
    error.textContent = 'Payment cannot exceed the outstanding balance.';
    return;
  }
  error.textContent = '';
  const confirmed = await askConfirmation({
    title: 'Record Credit Payment',
    eyebrow: 'CREDIT PAYMENTS',
    subtitle: 'Confirm payment amount',
    message: `Record <strong class="confirm-highlight-name">${money(amount)}</strong> from ${escapeHtml(displayCustomerName(pendingCreditAccount.customerName))}?`,
    warning: `The remaining balance will be ${money(pendingCreditAccount.balance - amount)}.`,
    confirmText: 'Save Payment',
    confirmType: 'primary',
  });
  if (!confirmed) return;
  const submitBtn = $('#creditPaymentSubmit');
  const originalContent = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Saving payment...</span>';
  try {
    const payment = await api('recordCreditPayment', {
      branchId: activeBranchId,
      saleId: pendingCreditAccount.saleId,
      amount,
      notes: $('#creditNotes').value.trim(),
    });
    $('#creditPaymentDialog').close();
    await refresh();
    showToast(`Payment recorded. Remaining balance: ${money(payment.balance)}.`, 'success');
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalContent;
  }
});

function saleSubtotal() {
  return cart.reduce((total, item) => total + item.price * item.qty, 0);
}

function syncSaleCustomerOptions(paymentType) {
  const customerSelect = $('#saleCustomer');
  if (!customerSelect || customerSelect.dataset.paymentMode === paymentType) return;
  const selectedCustomerId = customerSelect.value;
  const activeCustomers = customers.filter((customer) => customer.status === 'Active');
  const placeholder = paymentType === 'credit'
    ? '<option value="" disabled>Select active customer</option>'
    : '<option value="">WALK-IN CUSTOMER</option>';
  customerSelect.innerHTML = `${placeholder}${activeCustomers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(displayCustomerName(customer.name))}${customer.phone ? ` - ${escapeHtml(customer.phone)}` : ''}</option>`).join('')}`;
  customerSelect.value = activeCustomers.some((customer) => customer.id === selectedCustomerId) ? selectedCustomerId : '';
  customerSelect.required = paymentType === 'credit';
  customerSelect.dataset.paymentMode = paymentType;
  updateCustomDropdown(customerSelect);
}

function updateSaleCheckoutValues() {
  const subtotal = saleSubtotal();
  const discountInput = $('#saleDiscount');
  const discount = Math.min(Math.max(Number(discountInput.value) || 0, 0), subtotal);
  const paymentType = document.querySelector('input[name="paymentType"]:checked')?.value || 'cash';
  syncSaleCustomerOptions(paymentType);
  const total = subtotal - discount;
  const tenderedInput = $('#saleCashTendered');
  const tendered = Number(tenderedInput.value) || 0;
  $('#saleSubtotal').value = subtotal.toFixed(2);
  $('#saleTotal').value = total.toFixed(2);
  $('#saleChange').value = Math.max(tendered - total, 0).toFixed(2);
  tenderedInput.disabled = paymentType === 'credit';
  $('#saleCashTenderedGroup').hidden = paymentType === 'credit';
  $('#saleChangeGroup').hidden = paymentType === 'credit';

  // Update elevated hero & summary elements
  const heroTotal = $('#saleHeroTotal');
  if (heroTotal) {
    heroTotal.textContent = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const subtotalDisp = $('#saleSubtotalDisplay');
  if (subtotalDisp) {
    subtotalDisp.textContent = money(subtotal);
  }
  const creditNotice = $('#saleCreditNotice');
  if (creditNotice) {
    creditNotice.hidden = paymentType !== 'credit';
  }
  const customerHint = $('#saleCustomerHint');
  if (customerHint) {
    if (paymentType === 'credit') {
      customerHint.textContent = 'Active customer account required for credit';
      customerHint.classList.add('warning-hint');
    } else {
      customerHint.textContent = 'Walk-in or select customer';
      customerHint.classList.remove('warning-hint');
    }
  }

  // Update dynamic change status banner
  const changeGroup = $('#saleChangeGroup');
  const heroChange = $('#saleHeroChange');
  const changeStatus = $('#saleChangeStatus');
  if (heroChange && changeGroup && changeStatus) {
    if (paymentType === 'cash') {
      const diff = Math.round((tendered - total) * 100) / 100;
      if (Math.abs(diff) < 0.005) {
        heroChange.textContent = 'PHP 0.00';
        changeStatus.textContent = 'Exact amount tendered';
        changeGroup.classList.remove('is-short');
        changeGroup.classList.add('is-exact');
      } else if (diff > 0) {
        heroChange.textContent = money(diff);
        changeStatus.textContent = 'Change to return to customer';
        changeGroup.classList.remove('is-short', 'is-exact');
      } else {
        heroChange.textContent = '-' + money(Math.abs(diff));
        changeStatus.textContent = `Short by ${money(Math.abs(diff))}`;
        changeGroup.classList.remove('is-exact');
        changeGroup.classList.add('is-short');
      }
    }
  }

  return { subtotal, discount, total, paymentType, tendered };
}

function openSaleCheckout() {
  if (!cart.length) {
    showToast('Please add items to cart before completing checkout.', 'error');
    return;
  }
  const customerSelect = $('#saleCustomer');
  customerSelect.dataset.paymentMode = '';
  customerSelect.value = '';
  $('#saleDiscount').value = '0';
  document.querySelector('input[name="paymentType"][value="cash"]').checked = true;
  $('#saleCashTendered').value = '0.00';
  $('#saleFormError').textContent = '';
  updateSaleCheckoutValues();
  $('#saleDialog').showModal();
  initCustomDropdowns($('#saleDialog'));
}

function showSaleReceipt({ sale, items, customerName }) {
  const branch = branches.find((item) => item.id === activeBranchId);
  const isCash = sale.paymentType === 'cash';
  $('#receiptBranch').textContent = branch?.name || 'Main Branch';
  $('#receiptSaleId').textContent = sale.saleId || 'N/A';
  $('#receiptDate').textContent = new Date(sale.date || Date.now()).toLocaleString('en-PH');
  $('#receiptCustomer').textContent = displayCustomerName(customerName || 'Walk-in customer');
  $('#receiptPayment').textContent = isCash ? 'Cash Payment' : 'Credit Account';

  const statusBadge = $('#receiptStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = isCash ? 'PAID CASH' : 'CREDIT CHARGED';
    statusBadge.className = `receipt-status-badge ${isCash ? 'is-cash' : 'is-credit'}`;
  }

  const totalTitle = $('#receiptTotalTitle');
  const totalSub = $('#receiptTotalSub');
  if (totalTitle) {
    totalTitle.textContent = isCash ? 'Total Paid' : 'Total Charged';
  }
  if (totalSub) {
    totalSub.textContent = isCash ? 'Settled in full' : 'Charged to customer ledger';
  }

  $('#receiptItems').innerHTML = items.map((item) => `
    <div class="receipt-item-card">
      <div class="receipt-item-main">
        <strong class="receipt-item-name">${escapeHtml(item.name)}</strong>
        <div class="receipt-item-meta">
          <span class="receipt-qty-badge">${escapeHtml(String(item.qty))} ${escapeHtml(item.unit || 'unit')}</span>
          <span class="receipt-rate-text">&times; ${money(item.price)}</span>
        </div>
      </div>
      <strong class="receipt-item-total">${money(item.qty * item.price)}</strong>
    </div>
  `).join('');

  $('#receiptSubtotal').textContent = money(sale.subtotal);
  $('#receiptDiscount').textContent = `- ${money(sale.discount)}`;
  $('#receiptDiscountRow').hidden = !Number(sale.discount);
  $('#receiptTotal').textContent = money(sale.total);

  const cashBreakdown = $('#receiptCashBreakdown');
  if (cashBreakdown) {
    cashBreakdown.hidden = !isCash;
  }
  $('#receiptTenderedRow').hidden = !isCash;
  $('#receiptChangeRow').hidden = !isCash;
  $('#receiptTendered').textContent = money(sale.cashTendered || 0);
  $('#receiptChange').textContent = money(sale.change || 0);
  $('#receiptDialog').showModal();
  requestAnimationFrame(updateReceiptScrollFade);
}

$('#receiptPrintBtn')?.addEventListener('click', () => {
  window.print();
});

$('#checkoutButton').addEventListener('click', openSaleCheckout);
$('#saleDiscount').addEventListener('input', updateSaleCheckoutValues);
$('#saleCashTendered').addEventListener('input', updateSaleCheckoutValues);
document.querySelectorAll('input[name="paymentType"]').forEach((input) => input.addEventListener('change', updateSaleCheckoutValues));

$('#saleExactBtn')?.addEventListener('click', () => {
  const subtotal = saleSubtotal();
  const discount = Math.min(Math.max(Number($('#saleDiscount').value) || 0, 0), subtotal);
  const total = subtotal - discount;
  $('#saleCashTendered').value = total.toFixed(2);
  updateSaleCheckoutValues();
});

document.querySelectorAll('.sale-preset-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    const addVal = Number(btn.dataset.add) || 0;
    const current = Number($('#saleCashTendered').value) || 0;
    $('#saleCashTendered').value = (current + addVal).toFixed(2);
    updateSaleCheckoutValues();
  });
});

$('#saleForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = updateSaleCheckoutValues();
  const customerId = $('#saleCustomer').value;
  const error = $('#saleFormError');
  if (values.paymentType === 'credit' && !customerId) {
    error.textContent = 'Select a customer for a credit sale.';
    return;
  }
  if (values.paymentType === 'cash' && values.tendered < values.total) {
    error.textContent = 'Cash tendered must cover the total due.';
    return;
  }

  error.textContent = '';
  const customerName = customers.find((customer) => customer.id === customerId)?.name || 'Walk-in customer';
  const confirmed = await askConfirmation({
    title: values.paymentType === 'credit' ? 'Complete Credit Sale' : 'Complete Cash Sale',
    eyebrow: 'POINT OF SALE',
    subtitle: 'Confirm payment and checkout',
    message: `Complete this ${values.paymentType} sale for <strong class="confirm-highlight-name">${money(values.total)}</strong> to ${escapeHtml(displayCustomerName(customerName))}?`,
    warning: values.paymentType === 'credit'
      ? "The amount will be added to this customer's credit balance and branch stock will be deducted."
      : `Cash tendered: ${money(values.tendered)}. Change: ${money(values.tendered - values.total)}.`,
    confirmText: 'Complete Sale',
    confirmType: 'primary',
  });
  if (!confirmed) return;
  const submitBtn = $('#saleSubmit');
  const originalContent = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Recording sale...</span>';
  try {
    const receiptItems = cart.map((item) => ({ ...item }));
    const sale = await api('recordSale', {
      branchId: activeBranchId,
      customerId,
      paymentType: values.paymentType,
      discount: values.discount,
      cashTendered: values.paymentType === 'cash' ? values.tendered : 0,
      items: cart.map((item) => ({ productId: item.id, qty: item.qty, price: item.price })),
    });
    $('#saleDialog').close();
    cart = [];
    showSaleReceipt({ sale, items: receiptItems, customerName });
    await refresh();
    showToast(`Sale #${sale.saleId || 'Completed'} recorded: ${money(sale.total)}`, 'success');
  } catch (error) {
    $('#saleFormError').textContent = error.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalContent;
  }
});

const ADMIN_SESSION_KEY = 'fr-pos-admin-session';

function renderAuthSkeletons() {
  const fields = $('#authFields');
  if (!fields) return;
  fields.innerHTML = `
    <div class="auth-skeleton-group">
      <div class="skeleton-shimmer auth-skeleton-label"></div>
      <div class="skeleton-shimmer auth-skeleton-input"></div>
    </div>
    <div class="auth-skeleton-group">
      <div class="skeleton-shimmer auth-skeleton-label"></div>
      <div class="skeleton-shimmer auth-skeleton-input"></div>
    </div>
  `;
}

function applySession(session, useRoleDefaultView = false) {
  currentSession = session;
  const account = session.account;
  const permittedViews = account.permissions || [];
  document.querySelectorAll('[data-view]').forEach((item) => {
    const allowed = item.dataset.view === 'dashboard' || permittedViews.includes('*') || permittedViews.includes(item.dataset.view);
    item.hidden = !allowed;
  });
  document.querySelectorAll('.side-nav .nav-label').forEach((label) => {
    let sibling = label.nextElementSibling;
    let hasVisibleMenu = false;
    while (sibling && !sibling.classList.contains('nav-label')) {
      if (sibling.matches('[data-view]') && !sibling.hidden) hasVisibleMenu = true;
      sibling = sibling.nextElementSibling;
    }
    label.hidden = !hasVisibleMenu;
  });
  if (account.role === 'staff') {
    activeBranchId = account.branchId;
    localStorage.setItem(ACTIVE_BRANCH_KEY, activeBranchId);
  }
  const requestedView = useRoleDefaultView
    ? account.role === 'admin' ? 'dashboard' : 'pos'
    : localStorage.getItem(ACTIVE_VIEW_KEY) || (account.role === 'admin' ? 'dashboard' : 'pos');
  setView(requestedView, true);
}

async function completeRequiredPasswordChange() {
  if (!currentSession?.account?.mustChangePassword) return true;
  const currentPassword = window.prompt('Enter your temporary password to continue:');
  const newPassword = window.prompt('Create a new password (minimum 8 characters):');
  if (!currentPassword || !newPassword) throw new Error('You must change your temporary password before continuing.');
  await api('changeOwnPassword', { currentPassword, newPassword });
  currentSession.account.mustChangePassword = false;
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentSession));
  showToast('Password updated. Your account is ready.', 'success');
  return true;
}

async function initAuth() {
  const overlay = $('#authOverlay');
  overlay.classList.add('session-loading');
  const savedSession = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  if (savedSession?.token) {
    let restoreError;
    try {
      let session;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          session = await api('restoreSession', { token: savedSession.token }, 'GET');
          break;
        } catch (error) {
          restoreError = error;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!session) throw restoreError || new Error('Unable to restore session.');
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      const requiresPasswordChange = session.account.mustChangePassword;
      applySession(session);
      await completeRequiredPasswordChange();
      overlay.hidden = true;
      if (requiresPasswordChange) await refresh();
      return;
    } catch (error) {
      const message = String(error?.message || '');
      const sessionInvalid = /session has expired|account is unavailable|sign in is required/i.test(message);
      if (sessionInvalid) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
      } else {
        currentSession = savedSession;
        applySession(savedSession);
        overlay.hidden = true;
        showToast('Connection is unstable. Your saved session is still active.', 'info');
        refresh(false);
        return;
      }
    }
  }
  renderAuthSkeletons();
  try {
    const status = await api('getSetupStatus', {}, 'GET');
    const setup = status.needsAdmin;
    $('#authEyebrow').textContent = setup ? 'FIRST-TIME SETUP' : 'ADMINISTRATION';
    $('#authTitle').textContent = setup ? 'Create administrator' : 'Sign in';
    $('#authCopy').textContent = setup ? 'Create the first administrator account for this POS.' : 'Use your administrator or staff account to continue.';
    $('#authSubmit').textContent = setup ? 'Create administrator' : 'Sign in';
    $('#authSubmit').hidden = false;
    $('#authFields').innerHTML = `
      ${setup ? `
        <label class="auth-field-group">
          <span class="auth-label-text">Full name</span>
          <div class="auth-input-wrap">
            <svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <input name="fullName" autocomplete="name" placeholder="Enter administrator full name" required>
          </div>
        </label>
      ` : ''}
      <label class="auth-field-group">
        <span class="auth-label-text">Username</span>
        <div class="auth-input-wrap">
          <svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <input name="username" autocomplete="username" placeholder="Enter administrator username" required spellcheck="false" autocapitalize="none">
        </div>
      </label>
      <label class="auth-field-group">
        <span class="auth-label-text">Password</span>
        <div class="auth-input-wrap">
          <svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input name="password" type="password" minlength="8" autocomplete="current-password" placeholder="Enter password (min. 8 characters)" required>
          <button type="button" class="auth-toggle-pwd" aria-label="Toggle password visibility" title="Show/Hide password" tabindex="-1">
            <svg class="pwd-eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="pwd-eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </button>
        </div>
      </label>
    `;
    $('#authForm').dataset.mode = setup ? 'setup' : 'login';
    overlay.classList.remove('session-loading');
  } catch (error) {
    overlay.classList.remove('session-loading');
    $('#authError').textContent = 'Update and deploy the latest Apps Script code before signing in.';
  }
}

$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form);
  const setup = event.currentTarget.dataset.mode === 'setup';
  const submit = $('#authSubmit');
  const label = setup ? 'Create administrator' : 'Sign in';
  const loadingLabel = setup ? 'Creating administrator...' : 'Signing in...';
  $('#authError').textContent = '';
  submit.disabled = true;
  submit.innerHTML = `<span class="btn-spinner"></span><span>${loadingLabel}</span>`;
  try {
    const session = await api(setup ? 'createFirstAdmin' : 'login', payload);
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    const requiresPasswordChange = session.account.mustChangePassword;
    applySession(session, true);
    await completeRequiredPasswordChange();
    $('#authOverlay').hidden = true;
    if (requiresPasswordChange) await refresh();
    showToast(`Welcome, ${session.account.fullName}.`, 'success');
  } catch (error) {
    $('#authError').textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

$('#authForm').addEventListener('click', (event) => {
  const toggleBtn = event.target.closest('.auth-toggle-pwd');
  if (!toggleBtn) return;
  const input = toggleBtn.parentElement.querySelector('input[name="password"]');
  if (!input) return;
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  const showIcon = toggleBtn.querySelector('.pwd-eye-show');
  const hideIcon = toggleBtn.querySelector('.pwd-eye-hide');
  if (showIcon) showIcon.style.display = isPwd ? 'none' : 'block';
  if (hideIcon) hideIcon.style.display = isPwd ? 'block' : 'none';
});

document.addEventListener('click', (event) => {
  const toggleBtn = event.target.closest('.password-toggle-btn');
  if (!toggleBtn) return;
  const wrap = toggleBtn.closest('.password-input-wrap');
  if (!wrap) return;
  const input = wrap.querySelector('input');
  if (!input) return;
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  const showIcon = toggleBtn.querySelector('.pwd-eye-show');
  const hideIcon = toggleBtn.querySelector('.pwd-eye-hide');
  if (showIcon) showIcon.style.display = isPwd ? 'none' : 'block';
  if (hideIcon) hideIcon.style.display = isPwd ? 'block' : 'none';
  const label = isPwd ? 'Hide password' : 'Show password';
  toggleBtn.setAttribute('aria-label', label);
  toggleBtn.setAttribute('title', label);
});

$('#logoutButton').addEventListener('click', async () => {
  const confirmed = await askConfirmation({
    title: 'Sign Out',
    eyebrow: 'ADMINISTRATION',
    subtitle: 'End secure admin session',
    message: 'Are you sure you want to sign out of the system?',
    warning: 'Any active cart items and temporary inputs will be cleared.',
    confirmText: 'Sign Out',
    confirmType: 'danger',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  });
  if (!confirmed) return;

  const session = currentSession || JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  if (session?.token) api('logout', { token: session.token }).catch(() => {});
  localStorage.removeItem(ADMIN_SESSION_KEY);
  currentSession = null;
  cart = [];
  renderCart();
  $('#authOverlay').hidden = false;
  initAuth();
  showToast('You have been logged out.', 'info');
});

// Initialize POS view and initial fetch
initSidebarState();
initCustomDropdowns();
initCustomDatePickers();
initSidebarBranchSwitcher();
renderSidebarBranchMenu();
setView(localStorage.getItem(ACTIVE_VIEW_KEY) || 'pos', true);
initAuth();
