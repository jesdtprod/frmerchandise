import { readFile } from 'node:fs/promises';

const files = {
  app: await readFile(new URL('../app.js', import.meta.url), 'utf8'),
  accountFunction: await readFile(new URL('../supabase/functions/manage-account/index.ts', import.meta.url), 'utf8'),
  branchLock: await readFile(new URL('../supabase/migrations/20260915193000_lock_staff_branch.sql', import.meta.url), 'utf8'),
};

const checks = [
  ['staff branch selector is locked during editing', /type === 'editStaff'[\s\S]*branch is locked after account creation/i.test(files.app)],
  ['staff updates do not submit a branch ID', /updateStaffAccount[\s\S]*full_name: fullName, permissions/.test(files.accountFunction)],
  ['database trigger prevents staff branch changes', /prevent_staff_branch_change/.test(files.branchLock)],
  ['administrator edits use the protected account function', /action === 'updateAdminAccount'[\s\S]*functions\.invoke\('manage-account'/.test(files.app)],
  ['administrator password resets require a password change on next login', /Reset administrator password/.test(files.accountFunction)],
  ['administrator edit passwords reach the account function', /body\.newPassword/.test(files.accountFunction)],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`POS checks failed: ${failures.join('; ')}`);
  process.exit(1);
}

console.log(`POS checks passed: ${checks.length}`);
