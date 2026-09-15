# FR Merchandise POS Tasks

## Completed In Code

- [x] Lock a staff account's assigned branch after account creation. Administrators cannot change it through account editing, and a database trigger rejects direct changes.
- [x] Allow administrators to edit permitted administrator profile details.
- [x] Allow an administrator to reset another administrator's password and require a new password at the next sign-in.
- [x] Add a repeatable source-contract check: `node scripts/check-pos.mjs`.
- [x] Document release, backup, restore, and Supabase CLI migration procedures in `docs/OPERATIONS.md`.

## Before Production Use

- [ ] Create and test a Supabase database backup and restore procedure.
- [ ] Create a second active administrator account and securely retain both recovery credentials.
- [ ] Reconcile imported inventory, sales totals, and outstanding credit balances against the source workbook.
- [ ] Test the deployed GitHub Pages application, including staff creation, password reset enforcement, transfers, and logout.

## Follow-Up

- [ ] Configure Supabase CLI access and run the documented migration deployment on a future release.
- [ ] Expand source-contract checks into live Supabase integration tests when a non-production project is available.
