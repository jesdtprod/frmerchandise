const BRANCH_ID = 'MAIN';
const endpointKey = 'fr-pos-api-url';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyyYPXS315h-QMn1WRCAbbDh2BirtPyiF1729_k1reR3SSWLknom-cKPJQuMMsA_gfF/exec';
let products = [];
let cart = [];
let activeForm = '';
let activeView = 'pos';
let editingProductId = '';
let pendingDeleteProductId = null;
let toastTimer = null;

const PRODUCT_CATEGORIES = ['LPG', 'Softdrinks', 'Others'];
const PRODUCT_UNITS = ['pc', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'case', 'pack', 'box', 'bag', 'sack', 'tray', 'gallon', 'drum'];

const $ = (selector) => document.querySelector(selector);
const money = (value) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

/* ==========================================================================
   API CLIENT
   ========================================================================== */
async function api(action, payload = {}, method = 'POST') {
  const url = localStorage.getItem(endpointKey) || DEFAULT_API_URL;
  if (!url) throw new Error('Add your Apps Script Web App URL in settings first.');
  const options = method === 'GET' ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  };
  const target = method === 'GET' ? `${url}?${new URLSearchParams({ action, ...payload })}` : url;
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
    success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M7 10l2 2 4-4"/></svg>`,
    error: `<svg class="toast-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/></svg>`,
    info: `<svg class="toast-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6h.01"/></svg>`,
  };

  iconWrap.innerHTML = icons[type] || icons.info;
  messageEl.textContent = message;
  toast.className = `toast show ${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
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
    ? ['Product', 'Category', 'Selling price', 'Low stock', 'Status', 'Action']
    : activeView === 'inventory'
    ? ['Product', 'Category', 'Current stock', 'Stock warning', 'Status']
    : ['Product', 'Category', 'Selling price', 'Stock', 'Action'];

  const rows = Array.from({ length: 5 }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton-col">
        <div class="skeleton-shimmer skeleton-line title"></div>
        <div class="skeleton-shimmer skeleton-line meta"></div>
      </div>
      <div>
        <div class="skeleton-shimmer skeleton-line pill"></div>
      </div>
      <div>
        <div class="skeleton-shimmer skeleton-line price"></div>
      </div>
      <div>
        <div class="skeleton-shimmer skeleton-line pill"></div>
      </div>
      ${activeView === 'products' ? `<div><div class="skeleton-shimmer skeleton-line pill"></div></div>` : ''}
      <div>
        <div class="skeleton-shimmer skeleton-line btn"></div>
      </div>
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

    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    const initialText = selectedOption ? selectedOption.text : 'Select...';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="dropdown-selected-text">${escapeHtml(initialText)}</span>
      <svg class="dropdown-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 7.5L10 12.5L15 7.5"/>
      </svg>
    `;

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.setAttribute('role', 'listbox');

    Array.from(select.options).forEach((opt, idx) => {
      const optionEl = document.createElement('div');
      optionEl.className = `dropdown-option${opt.selected ? ' selected' : ''}${opt.disabled ? ' disabled' : ''}`;
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('data-value', opt.value);
      optionEl.innerHTML = `
        <span>${escapeHtml(opt.text)}</span>
        <svg class="opt-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M4 10l4 4 8-8"/>
        </svg>
      `;

      if (!opt.disabled) {
        optionEl.addEventListener('click', (e) => {
          e.stopPropagation();
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          trigger.querySelector('.dropdown-selected-text').textContent = opt.text;
          menu.querySelectorAll('.dropdown-option').forEach((o) => o.classList.remove('selected'));
          optionEl.classList.add('selected');
          closeDropdown(wrapper, trigger);
        });
      }

      menu.appendChild(optionEl);
    });

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

function openDropdown(wrapper, trigger) {
  wrapper.classList.add('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeDropdown(wrapper, trigger) {
  wrapper.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

// Global click-outside listener for smooth dropdowns
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
      closeDropdown(d, d.querySelector('.dropdown-trigger'));
    });
  }
});

// Escape key dismisses smooth dropdowns
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.custom-dropdown.open').forEach((d) => {
      closeDropdown(d, d.querySelector('.dropdown-trigger'));
    });
  }
});

/* ==========================================================================
   INVENTORY & TABLE RENDERING
   ========================================================================== */
function renderInventory() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const rows = products.filter((product) => `${product.name} ${product.category} ${product.sku || ''}`.toLowerCase().includes(term));
  const table = $('#inventoryTable');
  if (!table) return;

  const headers = activeView === 'products'
    ? ['Product', 'Category', 'Selling price', 'Low stock', 'Status', 'Action']
    : activeView === 'inventory'
    ? ['Product', 'Category', 'Current stock', 'Stock warning', 'Status']
    : ['Product', 'Category', 'Selling price', 'Stock', 'Action'];

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
        <svg class="pill-alert-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v6M8 12h.01"/><path d="M14.5 13.5L8 2.5 1.5 13.5h13z"/></svg>
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

    const productRow = `
      ${productCell}
      ${categoryCell}
      ${priceCell}
      <span>${lowStockPill}</span>
      <span>${statusPill}</span>
      <span class="table-actions">
        <button class="icon-button" data-edit="${product.id}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit product">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 2.5a2.121 2.121 0 013 3L6 17l-4 1 1-4 11.5-11.5z"/></svg>
        </button>
        <button class="icon-button danger-icon" data-delete="${product.id}" aria-label="Delete ${escapeHtml(product.name)}" title="Delete product">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h14M8 5V3h4v2M5 5v11a2 2 0 002 2h6a2 2 0 002-2V5M8 9v6M12 9v6"/></svg>
        </button>
      </span>
    `;

    const stockRow = `
      ${productCell}
      ${categoryCell}
      ${stockBadge}
      <span style="color:var(--text-muted);font-size:12px;">Alert &le; ${product.lowStockLevel || 5}</span>
      <span>${statusPill}</span>
    `;

    const posRow = `
      ${productCell}
      ${categoryCell}
      ${priceCell}
      ${stockBadge}
      <span>
        <button class="button button-primary add-item" data-add="${product.id}" ${isOut || product.status !== 'Active' ? 'disabled' : ''}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:2px;"><path d="M8 3v10M3 8h10"/></svg>
          Add
        </button>
      </span>
    `;

    return `<div class="table-row">${activeView === 'products' ? productRow : activeView === 'inventory' ? stockRow : posRow}</div>`;
  }).join('');

  table.innerHTML = `
    <div class="table-row table-header">
      ${headers.map((header) => `<span>${header}</span>`).join('')}
    </div>
    ${content || '<div class="empty-state"><p>No products found</p><small>Try adjusting your search query</small></div>'}
  `;

  table.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.add)));
  table.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openForm('edit', button.dataset.edit)));
  table.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteProduct(button.dataset.delete)));
}

/* ==========================================================================
   CART & CASH CHECKOUT
   ========================================================================== */
function renderCart() {
  const container = $('#cartItems');
  const badge = $('#mobileCartBadge');
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  if (badge) badge.textContent = totalCount;

  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.6 11h10.8l2-8H6.5"/></svg>
        <p>Cart is empty</p>
        <small>Select items from the catalog</small>
      </div>
    `;
    $('#cartTotal').textContent = money(0);
    return;
  }

  container.innerHTML = `
    <div class="cart-items-count-badge">
      <span>Current Order Items</span>
      <span>${cart.length} item${cart.length > 1 ? 's' : ''}</span>
    </div>
    ${cart.map((item) => `
      <div class="cart-card">
        <div class="cart-card-header">
          <div class="cart-item-info">
            <strong class="cart-item-title">${escapeHtml(item.name)}</strong>
            <span class="cart-item-meta">${escapeHtml(item.unit || 'unit')} &bull; Base: ${money(item.price)}</span>
          </div>
          <button class="remove cart-remove-btn" aria-label="Remove ${escapeHtml(item.name)}" data-remove="${item.id}" title="Remove item">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5L5 15"/></svg>
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
async function refresh() {
  renderSkeletonTable();
  try {
    products = await api('getInventory', { branchId: BRANCH_ID }, 'GET');
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
  editingProductId = productId;

  const formMeta = {
    product: {
      title: 'Add product',
      eyebrow: 'CATALOG REGISTRATION',
      subtitle: 'Register a new merchandise item into the catalog.',
      submit: 'Add product',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 4v12M4 10h12"/></svg>`,
    },
    edit: {
      title: 'Edit product',
      eyebrow: 'CATALOG SPECIFICATION',
      subtitle: 'Modify product specifications and stock alerts.',
      submit: 'Save changes',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 2.5a2.121 2.121 0 013 3L6 17l-4 1 1-4 11.5-11.5z"/></svg>`,
    },
    stock: {
      title: 'Stock in replenishment',
      eyebrow: 'INVENTORY RESTOCK',
      subtitle: 'Receive inbound stock shipments.',
      submit: 'Save stock',
      icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3v10M5 8l5 5 5-5M3 17h14"/></svg>`,
    },
  }[type] || {
    title: 'Product form',
    eyebrow: 'MERCHANDISE',
    subtitle: 'Manage catalog and store inventory.',
    submit: 'Save',
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 2L3 6v8l7 4 7-4V6l-7-4z"/></svg>`,
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

  const productFields = `
    <div class="form-field-group full-field">
      <label for="modalProdName">
        <span class="label-text">Product Name <span class="required">*</span></span>
      </label>
      <div class="input-with-icon">
        <svg class="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 11V5a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2M9 7h4M9 11h4M9 15h2"/></svg>
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
        <svg class="input-icon warning-accent" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3L2 17h16L10 3zM10 8v4M10 14h.01"/></svg>
        <input id="modalProdLowStock" name="lowStockLevel" type="number" min="0" step="1" value="${product?.lowStockLevel ?? 5}" required />
        <div class="stepper-buttons">
          <button type="button" class="stepper-btn" data-step-target="modalProdLowStock" data-step-dir="1" aria-label="Increase warning level" title="Increase">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2.5 7.5L6 4l3.5 3.5"/></svg>
          </button>
          <button type="button" class="stepper-btn" data-step-target="modalProdLowStock" data-step-dir="-1" aria-label="Decrease warning level" title="Decrease">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>
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
        <svg class="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3v10M5 8l5 5 5-5M3 17h14"/></svg>
        <input id="modalStockQty" name="qty" type="number" min="1" step="1" placeholder="Enter quantity received" required />
        <div class="stepper-buttons">
          <button type="button" class="stepper-btn" data-step-target="modalStockQty" data-step-dir="1" aria-label="Increase quantity" title="Increase">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2.5 7.5L6 4l3.5 3.5"/></svg>
          </button>
          <button type="button" class="stepper-btn" data-step-target="modalStockQty" data-step-dir="-1" aria-label="Decrease quantity" title="Decrease">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const container = $('#formFields');
  container.innerHTML = type === 'product' || type === 'edit' ? productFields : stockFields;

  // Initialize smooth dropdowns for newly injected selects
  initCustomDropdowns(container);

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
}

function promptDeleteProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  pendingDeleteProductId = productId;
  const nameEl = $('#confirmProductName');
  if (nameEl) nameEl.textContent = product.name;
  $('#confirmDialog').showModal();
}

function deleteProduct(productId) {
  promptDeleteProduct(productId);
}

/* ==========================================================================
   NAVIGATION & VIEWS
   ========================================================================== */
function setView(view) {
  activeView = view;
  const details = {
    pos: ['WORKSPACE', 'Point of Sale', 'INVENTORY', 'Available products'],
    products: ['CATALOG', 'Product Registration', 'PRODUCT CATALOG', 'Registered products'],
    inventory: ['BRANCH INVENTORY', 'Inventory Stock', 'STOCK CONTROL', 'Main Branch stock'],
  }[view] || ['WORKSPACE', 'Point of Sale', 'INVENTORY', 'Available products'];

  $('#pageEyebrow').textContent = details[0];
  $('#pageTitle').textContent = details[1];
  $('#catalogEyebrow').textContent = details[2];
  $('#catalogTitle').textContent = details[3];

  const viewIcons = {
    pos: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3h2l2 10h9l2-7H6"/><circle cx="8" cy="16" r="1.5"/><circle cx="15" cy="16" r="1.5"/></svg>`,
    products: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>`,
    inventory: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 2L3 6v8l7 4 7-4V6l-7-4z"/><path d="M10 10l7-4M10 10v8M10 10L3 6"/></svg>`,
  };

  const catalogIconWrap = $('#catalogIconWrap');
  if (catalogIconWrap && viewIcons[view]) {
    catalogIconWrap.innerHTML = viewIcons[view];
  }

  const isPos = view === 'pos';
  const sectionActions = $('#sectionActions');
  if (sectionActions) sectionActions.style.display = isPos ? 'none' : 'flex';
  const addBtn = $('#addProductButton');
  if (addBtn) addBtn.hidden = view !== 'products';
  const stockBtn = $('#stockInButton');
  if (stockBtn) stockBtn.hidden = view !== 'inventory';
  $('#pos').dataset.view = view;

  // Reset mobile cart view state when navigating
  $('#pos').classList.remove('show-mobile-cart');

  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));

  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('active');
  renderInventory();
}

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */
// Settings Dialog
$('#settingsButton').addEventListener('click', () => {
  $('#apiUrlInput').value = localStorage.getItem(endpointKey) || DEFAULT_API_URL;
  $('#settingsDialog').showModal();
});

// Sidebar & Mobile Navigation
const menuToggle = $('#menuToggle');
const sidebar = $('#sidebar');
const backdrop = $('#sidebarBackdrop');

function toggleSidebar() {
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('active', sidebar.classList.contains('open'));
}

menuToggle.addEventListener('click', toggleSidebar);
backdrop.addEventListener('click', () => {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
});

// Mobile Cart Toggle
$('#mobileCartToggle').addEventListener('click', () => {
  const isPos = activeView === 'pos';
  if (!isPos) setView('pos');
  $('#pos').classList.toggle('show-mobile-cart');
});

document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => setView(link.dataset.view)));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  const dialogId = button.dataset.close;
  const dlg = $(`#${dialogId}`);
  if (dlg) dlg.close();
  if (dialogId === 'confirmDialog') pendingDeleteProductId = null;
}));

// Delete Confirmation Action (User Rule: Always use loading spinner on add and save within modal)
const confirmDeleteBtn = $('#confirmDeleteButton');
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!pendingDeleteProductId) return;
    const originalContent = confirmDeleteBtn.innerHTML;
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = `<span class="btn-spinner"></span><span>Deleting...</span>`;

    try {
      await api('deleteProduct', { productId: pendingDeleteProductId });
      $('#confirmDialog').close();
      pendingDeleteProductId = null;
      await refresh();
      showToast('Product deleted successfully.', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to delete product.', 'error');
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = originalContent;
    }
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
$('#stockInButton').addEventListener('click', () => openForm('stock'));

$('#modalForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const submitBtn = $('#formSubmit');
  const originalText = submitBtn.querySelector('.button-text')?.textContent || 'Save';

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span><span>Saving...</span>`;
  $('#formError').textContent = '';

  try {
    if (activeForm === 'product') {
      const payload = Object.fromEntries(form);
      if (payload.beginningStock === undefined) payload.beginningStock = 0;
      if (!payload.status) payload.status = 'Active';
      await api('createProduct', payload);
      showToast('Product added successfully.', 'success');
    } else if (activeForm === 'edit') {
      const current = products.find((p) => p.id === editingProductId);
      const payload = { ...Object.fromEntries(form), productId: editingProductId };
      if (!payload.status) payload.status = current?.status || 'Active';
      await api('updateProduct', payload);
      showToast('Product updated successfully.', 'success');
    } else {
      await api('stockIn', { ...Object.fromEntries(form), branchId: BRANCH_ID });
      showToast('Stock updated successfully.', 'success');
    }
    $('#formDialog').close();
    await refresh();
  } catch (error) {
    $('#formError').textContent = error.message;
    showToast(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="button-text">${originalText}</span>`;
  }
});

$('#searchInput').addEventListener('input', renderInventory);

$('#clearCartButton').addEventListener('click', () => {
  if (!cart.length) return;
  cart = [];
  renderCart();
  showToast('Cart cleared.', 'info');
});

// Checkout submission with loading spinner
$('#checkoutButton').addEventListener('click', async () => {
  if (!cart.length) {
    showToast('Please add items to cart before completing checkout.', 'error');
    return;
  }

  const checkoutBtn = $('#checkoutButton');
  checkoutBtn.disabled = true;
  checkoutBtn.innerHTML = `<span class="btn-spinner"></span><span>Recording sale...</span>`;

  try {
    const sale = await api('recordSale', {
      branchId: BRANCH_ID,
      items: cart.map((item) => ({ productId: item.id, qty: item.qty, price: item.price })),
    });
    cart = [];
    await refresh();
    showToast(`Sale #${sale.saleId || 'Completed'} recorded: ${money(sale.total)}`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10l4 4 8-8"/></svg>
      <span>Complete cash sale</span>
    `;
  }
});

// Initialize POS view and initial fetch
setView('pos');
refresh().catch((error) => showToast(error.message, 'error'));
