import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedPermissions = new Set(['pos', 'products', 'inventory', 'transfers', 'customers', 'credits', 'sales', 'inventoryReports']);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return fail('Method not allowed.', 405);

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return fail('Sign in is required.', 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return fail('Your session has expired.', 401);
  const actorId = userData.user.id;
  const { data: actor } = await admin.from('profiles').select('*').eq('user_id', actorId).maybeSingle();
  if (!actor || actor.role !== 'admin' || actor.status !== 'Active') return fail('Administrator access is required.', 403);

  const body = await request.json().catch(() => null);
  if (!body?.action) return fail('Account action is required.');
  const action = body.action as string;
  const fullName = String(body.fullName || '').trim();
  const username = String(body.username || '').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || body.temporaryPassword || '');

  const audit = async (name: string, targetId: string, details = '') => {
    await admin.from('account_audit').insert({ actor_id: actorId, action: name, target_id: targetId, details });
  };
  const duplicateUsername = async (value: string, exceptUserId = '') => {
    const query = admin.from('profiles').select('user_id').eq('username', value);
    const { data } = exceptUserId ? await query.neq('user_id', exceptUserId) : await query;
    return Boolean(data?.length);
  };

  if (action === 'createStaffAccount' || action === 'createAdminAccount') {
    if (!fullName || !username || !email || password.length < 8) return fail('Full name, username, email, and a password of at least 8 characters are required.');
    if (await duplicateUsername(username)) return fail('That username is already in use.');
    const role = action === 'createAdminAccount' ? 'admin' : 'staff';
    const branchId = role === 'staff' ? String(body.branchId || '') : null;
    const permissions = role === 'admin' ? [...allowedPermissions] : (Array.isArray(body.permissions) ? body.permissions.filter((item) => allowedPermissions.has(item)) : []);
    if (role === 'staff' && (!branchId || !permissions.length)) return fail('Select an assigned branch and at least one allowed sidebar menu.');
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) return fail(createError?.message || 'Unable to create the sign-in account.');
    const { error: profileError } = await admin.from('profiles').insert({
      user_id: created.user.id, full_name: fullName, username, role, branch_id: branchId, permissions,
      status: 'Active', must_change_password: role === 'staff', password_reset_at: role === 'staff' ? new Date().toISOString() : null,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail(profileError.message);
    }
    await audit(role === 'staff' ? 'Created staff account' : 'Created administrator account', created.user.id, fullName);
    return json({ id: created.user.id, fullName, username, branchId: branchId || '', permissions, status: 'Active', mustChangePassword: role === 'staff' });
  }

  const targetId = String(body.staffId || body.adminId || '');
  if (!targetId) return fail('Account is required.');
  const { data: target, error: targetError } = await admin.from('profiles').select('*').eq('user_id', targetId).maybeSingle();
  if (targetError || !target) return fail('Account not found.', 404);

  if (action === 'updateStaffAccount') {
    const permissions = Array.isArray(body.permissions) ? body.permissions.filter((item) => allowedPermissions.has(item)) : [];
    if (target.role !== 'staff' || !fullName || !body.branchId || !permissions.length) return fail('Enter valid staff account details.');
    const { error } = await admin.from('profiles').update({ full_name: fullName, branch_id: body.branchId, permissions }).eq('user_id', targetId);
    if (error) return fail(error.message);
    await audit('Updated staff account', targetId, fullName);
    return json({ id: targetId, fullName, username: target.username, branchId: body.branchId, permissions, status: target.status });
  }

  if (action === 'resetStaffPassword') {
    if (target.role !== 'staff' || password.length < 8) return fail('Enter a temporary password of at least 8 characters.');
    const { error } = await admin.auth.admin.updateUserById(targetId, { password });
    if (error) return fail(error.message);
    await admin.from('profiles').update({ must_change_password: true, password_reset_at: new Date().toISOString() }).eq('user_id', targetId);
    await audit('Reset staff password', targetId, target.full_name);
    return json({ reset: true });
  }

  if (action === 'setStaffAccountStatus' || action === 'setAdminAccountStatus') {
    if ((action === 'setStaffAccountStatus' && target.role !== 'staff') || (action === 'setAdminAccountStatus' && target.role !== 'admin')) return fail('Account role does not match this action.');
    if (targetId === actorId && body.status === 'Inactive') return fail('You cannot deactivate your own account.');
    if (target.role === 'admin' && body.status === 'Inactive') {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'Active');
      if ((count || 0) <= 1) return fail('At least one administrator must remain active.');
    }
    const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
    const { error } = await admin.from('profiles').update({ status }).eq('user_id', targetId);
    if (error) return fail(error.message);
    await audit(status === 'Active' ? 'Reactivated account' : 'Deactivated account', targetId, target.full_name);
    return json({ id: targetId, status });
  }

  return fail('Unknown account action.');
});
