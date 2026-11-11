import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('async function fetchAllRows_('), source.indexOf('async function getAppData_('));
const context = vm.createContext({});
vm.runInContext(helper, context);
const items = Array.from({ length: 1203 }, (_, id) => ({ id }));
for (const cap of [500, 200]) {
  const result = await context.fetchAllRows_(() => ({
    range: async (start, end) => ({ data: items.slice(start, Math.min(end + 1, start + cap)), error: null }),
  }));
  assert.deepEqual(Array.from(result.data), items);
}
const error = { message: 'Access denied' };
assert.equal((await context.fetchAllRows_(() => ({ range: async () => ({ error }) }))).error, error);

const report = source.slice(source.indexOf('function buildSalesPdfReport_('), source.indexOf('function generateSalesPdf('));
Object.assign(context, {
  ensureSalesDateDefaults() {}, updateSalesPrintPeriod() {},
  $: () => null, branches: [{ id: 'main', name: 'Main' }], activeBranchId: 'main',
  salesHistory: [{ saleId: 'SAL-NEW', date: '2026-11-10T13:20:00Z', total: 2900,
    customerName: 'Walk-in customer', paymentType: 'cash',
    items: [{ name: 'Purchased LPG', qty: 2, price: 1450, unit: 'pcs' }] }],
  saleReturns: [], saleReturnItems: [], dailyExpenses: [], dailySpotCash: [],
  saleDateKey: (value) => String(value || '').slice(0, 10),
  escapeHtml: String, displayCustomerName: String, money: (value) => `PHP ${value}`,
  renderReportRunningHeader: () => '', renderReportPageFooter: () => '',
});
vm.runInContext(report, context);
const html = context.buildSalesPdfReport_().renderedPagesHtml;
assert.ok(html.includes('Purchased LPG'));
assert.ok(html.includes('PHP 1450'));
assert.ok(html.includes('PHP 2900'));
assert.ok(html.includes('1 item (2 units)'));
assert.ok(!html.includes('No line items detailed'));
console.log('Sales item pagination, error handling, and itemized report checks passed.');
