import { readFile } from 'node:fs/promises';

const files = {
  app: await readFile(new URL('../app.js', import.meta.url), 'utf8'),
  accountFunction: await readFile(new URL('../supabase/functions/manage-account/index.ts', import.meta.url), 'utf8'),
  branchLock: await readFile(new URL('../supabase/migrations/20260915193000_lock_staff_branch.sql', import.meta.url), 'utf8'),
  backupRestore: await readFile(new URL('../supabase/migrations/20260915194000_operational_backup_restore.sql', import.meta.url), 'utf8'),
  fifoSellingPrices: await readFile(new URL('../supabase/migrations/20260915198000_fifo_batch_selling_prices.sql', import.meta.url), 'utf8'),
  safeArchiving: await readFile(new URL('../supabase/migrations/20260915199000_safe_product_archiving.sql', import.meta.url), 'utf8'),
  transferSellingPrices: await readFile(new URL('../supabase/migrations/20260915200000_transfer_fifo_selling_prices.sql', import.meta.url), 'utf8'),
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
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`POS checks failed: ${failures.join('; ')}`);
  process.exit(1);
}

console.log(`POS checks passed: ${checks.length}`);
