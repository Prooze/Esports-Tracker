const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { checkPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendError } = require('../../utils/errors');

const router = express.Router();

const VALID_PERMISSIONS = [
  'manage_games',
  'manage_tournaments',
  'manage_upcoming',
  'manage_branding',
  'manage_integrations',
  'manage_accounts',
];

const BCRYPT_ROUNDS = 12;
const ACCOUNT_FIELDS = 'id, username, permissions, is_superadmin, created_at, last_login';

const formatAccount = (row) => ({
  ...row,
  permissions: JSON.parse(row.permissions || '[]'),
  is_superadmin: row.is_superadmin === 1,
});

const getAccount = (id) =>
  db.prepare(`SELECT ${ACCOUNT_FIELDS} FROM admins WHERE id = ?`).get(id);

/**
 * Filter a permissions list down to those (a) recognised and (b) the editor
 * is themselves allowed to grant. Non-superadmins can only delegate
 * permissions they hold.
 */
function safePermissions(requested, editor) {
  const grantable = editor.is_superadmin
    ? VALID_PERMISSIONS
    : (Array.isArray(editor.permissions) ? editor.permissions : []);
  return Array.isArray(requested)
    ? requested.filter((p) => VALID_PERMISSIONS.includes(p) && grantable.includes(p))
    : [];
}

/** GET /api/admin/accounts — list every admin (open to any logged-in admin). */
router.get('/', (_req, res, next) => {
  try {
    const rows = db.prepare(
      `SELECT ${ACCOUNT_FIELDS} FROM admins ORDER BY created_at ASC`
    ).all();
    res.json(rows.map(formatAccount));
  } catch (err) { next(err); }
});

/** POST /api/admin/accounts — create a new admin. Requires manage_accounts. */
router.post('/', checkPermission('manage_accounts'), asyncHandler(async (req, res) => {
  const { username, password, permissions = [] } = req.body;
  if (!username?.trim() || !password) {
    return sendError(res, 400, 'Username and password required');
  }

  const taken = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.trim());
  if (taken) return sendError(res, 409, 'Username already taken');

  const safePerms = safePermissions(permissions, req.admin);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO admins (username, password_hash, permissions) VALUES (?, ?, ?)'
  ).run(username.trim(), hash, JSON.stringify(safePerms));

  res.status(201).json(formatAccount(getAccount(result.lastInsertRowid)));
}));

/**
 * PUT /api/admin/accounts/:id — update an account.
 * Without `manage_accounts` you can only change your own password.
 * Permissions on superadmin accounts can never be changed via API.
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isSelf = String(req.admin.id) === String(id);
  const hasManageAccounts = req.admin.is_superadmin ||
    (Array.isArray(req.admin.permissions) && req.admin.permissions.includes('manage_accounts'));

  if (!isSelf && !hasManageAccounts) {
    return sendError(res, 403, "You don't have permission to edit other accounts.");
  }

  const account = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!account) return sendError(res, 404, 'Account not found');

  const { username, password, permissions } = req.body;

  if (!hasManageAccounts && (username !== undefined || permissions !== undefined)) {
    return sendError(res, 403, 'You can only change your own password.');
  }

  if (hasManageAccounts && username !== undefined) {
    if (!username.trim()) return sendError(res, 400, 'Username cannot be empty');
    const taken = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?')
      .get(username.trim(), id);
    if (taken) return sendError(res, 409, 'Username already taken');
    db.prepare('UPDATE admins SET username = ? WHERE id = ?').run(username.trim(), id);
  }

  if (hasManageAccounts && permissions !== undefined && !account.is_superadmin) {
    const safePerms = safePermissions(permissions, req.admin);
    db.prepare('UPDATE admins SET permissions = ? WHERE id = ?')
      .run(JSON.stringify(safePerms), id);
  }

  if (password) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  res.json(formatAccount(getAccount(id)));
}));

/** DELETE /api/admin/accounts/:id — refuses to delete self or the last admin. */
router.delete('/:id', checkPermission('manage_accounts'), (req, res, next) => {
  try {
    const { id } = req.params;

    if (String(req.admin.id) === String(id)) {
      return sendError(res, 400, 'You cannot delete your own account');
    }

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
    if (count <= 1) {
      return sendError(res, 400, 'Cannot delete the last admin account');
    }

    db.prepare('DELETE FROM admins WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
