import { readFile } from 'node:fs/promises';

const files = {
  app: await readFile(new URL('../app.js', import.meta.url), 'utf8'),
  accountFunction: await readFile(new URL('../supabase/functions/manage-account/index.ts', import.meta.url), 'utf8'),
  branchLock: await readFile(new URL('../supabase/migrations/20260915193000_lock_staff_branch.sql', import.meta.url), 'utf8'),
  backupRestore: await readFile(new URL('../supabase/migrations/20260915194000_operational_backup_restore.sql', import.meta.url), 'utf8'),
  fifoSellingPrices: await readFile(new URL('../supabase/migrations/20260915198000_fifo_batch_selling_prices.sql', import.meta.url), 'utf8'),
  safeArchiving: await readFile(new URL('../supabase/migrations/20260915199000_safe_product_archiving.sql', import.meta.url), 'utf8'),
  transferSellingPrices: await readFile(new URL('../supabase/migrations/20260915200000_transfer_fifo_selling_prices.sql', import.meta.url), 'utf8'),
  openingCreditBalances: await readFile(new URL('../supabase/migrations/20260917001000_customer_opening_credit_balances.sql', import.meta.url), 'utf8'),
  bundles: await readFile(new URL('../supabase/migrations/20260918000000_bundles_returns_replacements.sql', import.meta.url), 'utf8'),
  multiLineTransfers: await readFile(new URL('../supabase/migrations/20260918003000_multi_line_bundle_transfers.sql', import.meta.url), 'utf8'),
  transferBatchActions: await readFile(new URL('../supabase/migrations/20260918004000_transfer_batch_actions.sql', import.meta.url), 'utf8'),
  salesReturns: await readFile(new URL('../supabase/migrations/20260918005000_complete_sales_return_workflow.sql', import.meta.url), 'utf8'),
  mixedSalesReturns: await readFile(new URL('../supabase/migrations/20260918007000_mixed_sales_return_actions.sql', import.meta.url), 'utf8'),
  sameItemReplacements: await readFile(new URL('../supabase/migrations/20260918008000_same_item_replacements.sql', import.meta.url), 'utf8'),
};

const checks = [
  ['staff branch selector is locked during editing', /type === 'editStaff'[\s\S]*branch is locked after account creation/i.test(files.app)],
  ['staff updates do not submit a branch ID', /updateStaffAccount[\s\S]*full_name: fullName, permissions/.test(files.accountFunction)],
  ['database trigger prevents staff branch changes', /prevent_staff_branch_change/.test(files.branchLock)],
  ['administrator edits use the protected account function', /action === 'updateAdminAccount'[\s\S]*functions\.invoke\('manage-account'/.test(files.app)],
  ['administrator password resets require a password change on next login', /Reset administrator password/.test(files.accountFunction)],
  ['administrator edit passwords reach the account function', /body\.newPassword/.test(files.accountFunction)],
  ['backup and restore actions require the administrator account function', /createOperationalBackup[\s\S]*restoreOperationalBackup/.test(files.accountFunction)],
  ['restore is transactional in the database', /restore_pos_backup/.test(files.backupRestore)],
  ['stock-in selling prices are stored as FIFO batches', /selling_price_input[\s\S]*inventory_cost_batches/.test(files.fifoSellingPrices)],
  ['checkout allocates each sale to FIFO batch prices', /sale_item_price_allocations[\s\S]*qty_remaining/.test(files.fifoSellingPrices)],
  ['cart renders mixed FIFO batch prices', /getCartPriceBreakdown[\s\S]*Batch Selling Price/.test(files.app)],
  ['catalog price follows the cart batch currently reached', /displayedSellingPrice[\s\S]*breakdown\[breakdown\.length - 1\]/.test(files.app)],
  ['used products are archived instead of deleting historical stock-ins', /stock_ins[\s\S]*Archived product/.test(files.safeArchiving)],
  ['transfers preserve each FIFO selling-price batch', /transfer_batch_allocations[\s\S]*selling_price[\s\S]*Received FIFO selling-price transfer/.test(files.transferSellingPrices)],
  ['customer migration balances use a separate audited credit account', /customer_credit_accounts[\s\S]*opening_balance[\s\S]*create_customer_with_opening_balance/.test(files.openingCreditBalances)],
  ['opening balance payments cannot be mistaken for sales', /credit_payments_one_credit_source[\s\S]*record_credit_payment/.test(files.openingCreditBalances)],
  ['operational backups include opening credit accounts', /customerCreditAccounts/.test(files.accountFunction)],
  ['bundle recipes accept only individual component products', /Bundle components must be active individual products/.test(files.bundles)],
  ['bundle availability is calculated from component stock', /get_branch_bundle_availability[\s\S]*floor\(coalesce\(inventory\.qty/.test(files.bundles)],
  ['product form saves bundle price and component recipes', /save_bundle_components[\s\S]*bundleComponents/.test(files.app)],
  ['virtual bundles cannot be stocked in directly', /filter\(\(item\) => item\.productType !== 'bundle'\)/.test(files.app)],
  ['multi-line transfers validate combined component demand before drafting', /create_transfer_batch[\s\S]*required_components[\s\S]*Insufficient source stock/.test(files.multiLineTransfers)],
  ['bundle transfers enable the destination bundle automatically', /branch_products[\s\S]*destination_branch_id_input[\s\S]*product_row\.bundle_price/.test(files.multiLineTransfers)],
  ['transfer form accepts multiple individual products and bundles', /readTransferLines_[\s\S]*createTransferBatch/.test(files.app)],
  ['transfer batches dispatch, receive, and cancel all component lines atomically', /process_transfer_batch[\s\S]*dispatch_transfer[\s\S]*receive_transfer[\s\S]*cancel_transfer/.test(files.transferBatchActions)],
  ['sales returns enter quarantine before inventory disposition', /receive_sale_return[\s\S]*inventory_return_lots[\s\S]*quarantine/.test(files.salesReturns)],
  ['sales-return restocks create FIFO batches from quarantine lots', /resolve_return_item[\s\S]*inventory_cost_batches[\s\S]*lot\.unit_cost/.test(files.salesReturns)],
  ['replacement releases use FIFO inventory allocation', /release_sale_replacement[\s\S]*inventory_cost_batches[\s\S]*qty_remaining/.test(files.salesReturns)],
  ['sales history exposes return, refund, and replacement actions', /data-manage-sale-return/.test(files.app) && /receiveSaleReturn/.test(files.app) && /releaseSaleReplacement/.test(files.app)],
  ['sales report separates gross sales, refunds, and net sales', /Refunds Completed[\s\S]*Net Sales[\s\S]*totalRefunds/.test(files.app)],
  ['sales report includes return and replacement activity', /Return & Replacement Activity[\s\S]*returnOutcomes/.test(files.app)],
  ['sales return report itemizes each returned line', /returnsInPeriod\.flatMap[\s\S]*Returned Item[\s\S]*line\.actionType[\s\S]*line\.condition/.test(files.app)],
  ['a single return visit supports per-item refund, replacement, and return-only actions', /action_type[\s\S]*refund[\s\S]*replacement[\s\S]*return/.test(files.mixedSalesReturns) && /data-return-action[\s\S]*data-refund-amount[\s\S]*data-replacement-field/.test(files.app)],
  ['cumulative refunds cannot exceed the original sale', /prior_refunds[\s\S]*remaining refundable amount/.test(files.mixedSalesReturns)],
  ['replacements are restricted to the original item and returned quantity', /replacement_product_id_value is distinct from sale_item_row\.product_id[\s\S]*replacement_qty_value <> qty_value/.test(files.sameItemReplacements) && /Same item:[\s\S]*data-replacement-product[\s\S]*type="hidden"/.test(files.app)],
  ['only refund lines submit a refund amount', /action === 'refund'[\s\S]*refundInput\.value[\s\S]*actionType === 'refund' \? Number\(document\.querySelector\(`\[data-refund-amount=/.test(files.app)],
  ['quarantine disposition actions are labeled buttons', /resolve-btn-text">Restock[\s\S]*resolve-btn-text">Supplier Return[\s\S]*resolve-btn-text">Dispose/.test(files.app)],
  ['dashboard operational lists are limited to five ordered records', /topProducts[\s\S]*slice\(0, 5\)[\s\S]*attentionStock[\s\S]*slice\(0, 5\)[\s\S]*pendingTransfers[\s\S]*slice\(0, 5\)[\s\S]*recentSales[\s\S]*slice\(0, 5\)/.test(files.app)],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`POS checks failed: ${failures.join('; ')}`);
  process.exit(1);
}

console.log(`POS checks passed: ${checks.length}`);
