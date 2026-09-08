const BRANCH_ID = 'MAIN';
const endpointKey = 'fr-pos-api-url';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyyYPXS315h-QMn1WRCAbbDh2BirtPyiF1729_k1reR3SSWLknom-cKPJQuMMsA_gfF/exec';
let products = [];
let cart = [];
let activeForm = '';
let activeView = 'pos';
const PRODUCT_CATEGORIES = ['LPG', 'Softdrinks', 'Others'];
const PRODUCT_UNITS = ['pc', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'case', 'pack', 'box', 'bag', 'sack', 'tray', 'gallon', 'drum'];

const $ = (selector) => document.querySelector(selector);
const money = (value) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(action, payload = {}, method = 'POST') {
  const url = localStorage.getItem(endpointKey) || DEFAULT_API_URL;
  if (!url) throw new Error('Add your Apps Script Web App URL in settings first.');
  const options = method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }) };
  const target = method === 'GET' ? `${url}?${new URLSearchParams({ action, ...payload })}` : url;
  const response = await fetch(target, options);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'The API request failed.');
  return result.data;
}

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
function renderInventory() {
  const term = $('#searchInput').value.trim().toLowerCase();
  const rows = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(term));
  const table = $('#inventoryTable');
  const headers = activeView === 'products' ? ['Product', 'Category', 'Cost price', 'Selling price', ''] : activeView === 'inventory' ? ['Product', 'Category', 'Current stock', '', ''] : ['Product', 'Category', 'Selling price', 'Stock', ''];
  const content = rows.map((product) => {
    const productRow = `<span><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.unit)}</small></span><span>${escapeHtml(product.category || '-')}</span><span>${money(product.costPrice || 0)}</span><span>${money(product.price)}</span><span></span>`;
    const stockRow = `<span><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.unit)}</small></span><span>${escapeHtml(product.category || '-')}</span><span class="${product.qty <= 5 ? 'stock-low' : ''}">${product.qty}</span><span></span><span></span>`;
    const posRow = `<span><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.unit)}</small></span><span>${escapeHtml(product.category || '-')}</span><span>${money(product.price)}</span><span class="${product.qty <= 5 ? 'stock-low' : ''}">${product.qty}</span><span><button class="button add-item" data-add="${product.id}" ${product.qty <= 0 ? 'disabled' : ''}>Add</button></span>`;
    return `<div class="table-row">${activeView === 'products' ? productRow : activeView === 'inventory' ? stockRow : posRow}</div>`;
  }).join('');
  table.innerHTML = `<div class="table-row table-header">${headers.map((header) => `<span>${header}</span>`).join('')}</div>${content || '<div class="empty-state">No products found.</div>'}`;
  table.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.add)));
}
function renderCart() {
  const container = $('#cartItems');
  container.innerHTML = cart.length ? cart.map((item) => `<div class="cart-row"><span><strong>${escapeHtml(item.name)}</strong><br><small>Cost: ${money(item.costPrice)}</small></span><input aria-label="Quantity for ${escapeHtml(item.name)}" type="number" min="1" max="${item.stock}" value="${item.qty}" data-qty="${item.id}"><input aria-label="Selling price for ${escapeHtml(item.name)}" type="number" min="0" step="0.01" value="${item.price}" data-price="${item.id}"><strong>${money(item.qty * item.price)}</strong><button class="text-button remove" aria-label="Remove ${escapeHtml(item.name)}" data-remove="${item.id}">&times;</button></div>`).join('') : '<div class="empty-state">Select items from inventory.</div>';
  $('#cartTotal').textContent = money(cart.reduce((total, item) => total + item.qty * item.price, 0));
  container.querySelectorAll('[data-qty]').forEach((input) => input.addEventListener('change', () => updateQty(input.dataset.qty, input.value)));
  container.querySelectorAll('[data-price]').forEach((input) => input.addEventListener('change', () => updatePrice(input.dataset.price, input.value)));
  container.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { cart = cart.filter((item) => item.id !== button.dataset.remove); renderCart(); }));
}
function addToCart(id) { const product = products.find((item) => item.id === id); const existing = cart.find((item) => item.id === id); if (existing) { if (existing.qty < product.qty) existing.qty += 1; } else cart.push({ ...product, stock: product.qty, qty: 1 }); renderCart(); }
function updateQty(id, value) { const item = cart.find((entry) => entry.id === id); item.qty = Math.min(item.stock, Math.max(1, Number(value) || 1)); renderCart(); }
function updatePrice(id, value) { const item = cart.find((entry) => entry.id === id); item.price = Math.max(0, Number(value) || 0); renderCart(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
async function refresh() { products = await api('getInventory', { branchId: BRANCH_ID }, 'GET'); renderInventory(); renderCart(); }

function openForm(type) {
  activeForm = type; $('#formError').textContent = '';
  $('#dialogTitle').textContent = type === 'product' ? 'Add product' : 'Stock in';
  $('#formSubmit').textContent = type === 'product' ? 'Add product' : 'Save stock';
  $('#formFields').innerHTML = type === 'product' ? `<label>Product name<input name="name" required></label><label>Category<select name="category" required>${PRODUCT_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}</select></label><label>Unit<select name="unit" required>${PRODUCT_UNITS.map((unit) => `<option value="${unit}">${unit}</option>`).join('')}</select></label><label>Cost price<input name="costPrice" type="number" min="0" step="0.01" required></label><label>Selling price<input name="price" type="number" min="0" step="0.01" required></label>` : `<label>Product<select name="productId" required>${products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('')}</select></label><label>Quantity<input name="qty" type="number" min="0.01" step="0.01" required></label>`;
  $('#formDialog').showModal();
}

function setView(view) {
  activeView = view;
  const details = {
    pos: ['WORKSPACE', 'Point of Sale', 'INVENTORY', 'Available products'],
    products: ['CATALOG', 'Product Registration', 'PRODUCT CATALOG', 'Registered products'],
    inventory: ['BRANCH INVENTORY', 'Inventory Stock', 'STOCK CONTROL', 'Main Branch stock'],
  }[view];
  $('#pageEyebrow').textContent = details[0]; $('#pageTitle').textContent = details[1];
  $('#catalogEyebrow').textContent = details[2]; $('#catalogTitle').textContent = details[3];
  $('#addProductButton').hidden = view !== 'products'; $('#stockInButton').hidden = view !== 'inventory';
  $('#pos').dataset.view = view;
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#sidebar').classList.remove('open');
  renderInventory();
}

$('#settingsButton').addEventListener('click', () => { $('#apiUrlInput').value = localStorage.getItem(endpointKey) || DEFAULT_API_URL; $('#settingsDialog').showModal(); });
$('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => setView(link.dataset.view)));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
$('#settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); const url = $('#apiUrlInput').value.trim(); if (!url) return; localStorage.setItem(endpointKey, url); $('#settingsDialog').close(); try { await refresh(); showToast('API connected.'); } catch (error) { showToast(error.message); } });
$('#addProductButton').addEventListener('click', () => openForm('product')); $('#stockInButton').addEventListener('click', () => openForm('stock'));
$('#modalForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { if (activeForm === 'product') await api('createProduct', Object.fromEntries(form)); else await api('stockIn', { ...Object.fromEntries(form), branchId: BRANCH_ID }); $('#formDialog').close(); await refresh(); showToast(activeForm === 'product' ? 'Product added.' : 'Stock updated.'); } catch (error) { $('#formError').textContent = error.message; } });
$('#searchInput').addEventListener('input', renderInventory); $('#clearCartButton').addEventListener('click', () => { cart = []; renderCart(); });
$('#checkoutButton').addEventListener('click', async () => { if (!cart.length) return showToast('Add an item before checkout.'); try { const sale = await api('recordSale', { branchId: BRANCH_ID, items: cart.map((item) => ({ productId: item.id, qty: item.qty, price: item.price })) }); cart = []; await refresh(); showToast(`Sale ${sale.saleId} recorded: ${money(sale.total)}`); } catch (error) { showToast(error.message); } });
setView('pos');
refresh().catch((error) => showToast(error.message));
