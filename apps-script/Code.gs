const SPREADSHEET_ID = '1HYt8MOZJ0JchXLCpAp5V5ypQ3-MRUMpmKlPWMlVVvPg';

const SHEETS = {
  Branches: ['branch_id', 'name', 'type', 'address'],
  Products: ['product_id', 'name', 'unit', 'price', 'category', 'cost_price', 'sku', 'low_stock_level', 'status'],
  Inventory: ['branch_id', 'product_id', 'qty'],
  Sales: ['sale_id', 'branch_id', 'date', 'customer_id', 'total', 'payment_type', 'status'],
  SaleItems: ['sale_id', 'product_id', 'qty', 'price'],
};

function doGet(e) {
  return respond_(route_(e.parameter.action, e.parameter));
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  return respond_(route_(payload.action, payload));
}

function setupSheets() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(SHEETS).forEach((name) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    ensureHeaders_(sheet, SHEETS[name]);
  });

  const branches = spreadsheet.getSheetByName('Branches');
  if (branches.getLastRow() === 1) branches.appendRow(['MAIN', 'Main Branch', 'main', '']);
  return 'Sheets are ready.';
}

function route_(action, data) {
  try {
    switch (action) {
      case 'getProducts': return { ok: true, data: getProducts_() };
      case 'getInventory': return { ok: true, data: getInventory_(data.branchId || 'MAIN') };
      case 'createProduct': return { ok: true, data: createProduct_(data) };
      case 'stockIn': return { ok: true, data: stockIn_(data) };
      case 'recordSale': return { ok: true, data: recordSale_(data) };
      default: throw new Error('Unknown action.');
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function getProducts_() {
  return rows_('Products').map((row) => ({
    id: row.product_id, sku: row.sku || row.product_id, name: row.name, unit: row.unit, price: Number(row.price), category: row.category,
    costPrice: Number(row.cost_price || 0), lowStockLevel: Number(row.low_stock_level || 5), status: row.status || 'Active',
  }));
}

function getInventory_(branchId) {
  const products = getProducts_();
  const quantities = {};
  rows_('Inventory').filter((row) => row.branch_id === branchId).forEach((row) => {
    quantities[row.product_id] = Number(row.qty);
  });
  return products.map((product) => ({ ...product, qty: quantities[product.id] || 0 }));
}

function createProduct_(data) {
  require_(data.name, 'Product name is required.');
  require_(data.category, 'Category is required.');
  require_(data.unit, 'Unit of measure is required.');
  const price = Number(data.price);
  const costPrice = Number(data.costPrice);
  const beginningStock = Number(data.beginningStock);
  const lowStockLevel = Number(data.lowStockLevel);
  const status = data.status || 'Active';
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0) throw new Error('Enter valid cost and selling prices.');
  if (!Number.isFinite(beginningStock) || beginningStock < 0 || !Number.isFinite(lowStockLevel) || lowStockLevel < 0) throw new Error('Enter valid beginning stock and low-stock level.');
  if (!['Active', 'Inactive'].includes(status)) throw new Error('Choose a valid product status.');
  const product = { id: id_('PRD'), sku: sku_(), name: data.name.trim(), unit: data.unit, price, category: data.category, costPrice, lowStockLevel, status };
  getSpreadsheet_().getSheetByName('Products').appendRow([product.id, product.name, product.unit, product.price, product.category, product.costPrice, product.sku, product.lowStockLevel, product.status]);
  if (beginningStock > 0) adjustInventory_('MAIN', product.id, beginningStock);
  return product;
}

function stockIn_(data) {
  require_(data.productId, 'Product is required.');
  const qty = Number(data.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  adjustInventory_(data.branchId || 'MAIN', data.productId, qty);
  return { productId: data.productId, qty };
}

function recordSale_(data) {
  const branchId = data.branchId || 'MAIN';
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new Error('The sale has no items.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const inventory = getInventory_(branchId);
    const byId = Object.fromEntries(inventory.map((item) => [item.id, item]));
    items.forEach((item) => {
      const qty = Number(item.qty);
      if (!byId[item.productId] || byId[item.productId].status !== 'Active' || !Number.isFinite(qty) || qty <= 0 || byId[item.productId].qty < qty) {
        throw new Error('Insufficient stock for one or more items.');
      }
    });

    const saleId = id_('SAL');
    const saleItems = items.map((item) => {
      const price = item.price === undefined ? byId[item.productId].price : Number(item.price);
      if (!Number.isFinite(price) || price < 0) throw new Error('Enter a valid selling price for every item.');
      return { ...byId[item.productId], qty: Number(item.qty), price };
    });
    const total = saleItems.reduce((sum, item) => sum + item.qty * item.price, 0);
    const now = new Date();
    getSpreadsheet_().getSheetByName('Sales').appendRow([saleId, branchId, now, '', total, 'cash', 'completed']);
    const itemRows = saleItems.map((item) => [saleId, item.id, item.qty, item.price]);
    getSpreadsheet_().getSheetByName('SaleItems').getRange(getSpreadsheet_().getSheetByName('SaleItems').getLastRow() + 1, 1, itemRows.length, 4).setValues(itemRows);
    saleItems.forEach((item) => adjustInventory_(branchId, item.id, -item.qty));
    return { saleId, total, date: now };
  } finally {
    lock.releaseLock();
  }
}

function adjustInventory_(branchId, productId, change) {
  const sheet = getSpreadsheet_().getSheetByName('Inventory');
  const values = sheet.getDataRange().getValues();
  const row = values.findIndex((entry, index) => index > 0 && entry[0] === branchId && entry[1] === productId);
  if (row === -1) sheet.appendRow([branchId, productId, change]);
  else sheet.getRange(row + 1, 3).setValue(Number(values[row][2]) + change);
}

function rows_(sheetName) {
  const values = getSpreadsheet_().getSheetByName(sheetName).getDataRange().getValues();
  const [headers, ...records] = values;
  return records.filter((record) => record[0] !== '').map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index]])));
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = headers.filter((header) => !currentHeaders.includes(header));
  if (missing.length) sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function id_(prefix) { return `${prefix}-${Utilities.getUuid().slice(0, 8).toUpperCase()}`; }
function sku_() { return `SKU-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd')}-${Utilities.getUuid().slice(0, 5).toUpperCase()}`; }
function require_(value, message) { if (!value) throw new Error(message); }
function respond_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
