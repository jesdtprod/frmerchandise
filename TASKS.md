# FR Merchandise POS Tasks

## Before Production Use

- [ ] Create and test a Supabase database backup and restore procedure.
- [ ] Create a second active administrator account and securely retain both recovery credentials.
- [ ] Reconcile imported inventory, sales totals, and outstanding credit balances against the source workbook.
- [ ] Test the deployed GitHub Pages application, including staff creation, password reset enforcement, transfers, and logout.

## Account Security

- [ ] Lock a staff account's assigned branch after account creation. Administrators must not be able to change it through account editing, preserving the branch association for historical records and access control.
- [ ] Add administrator account editing for permitted administrator profile details.
- [ ] Add an administrator password-reset workflow with the same required-password-change protection used for staff.

## Reliability And Delivery

- [ ] Add automated checks for the main POS workflows, account permissions, and password-reset enforcement.
- [ ] Adopt Supabase CLI migration deployment so SQL migrations are applied in order and cannot be accidentally skipped.
- [ ] Document release, rollback, backup, and restore steps for the administrator.
