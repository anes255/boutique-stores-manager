const { one, query } = require('../lib/db');
const { verifyAccessToken } = require('../lib/tokens');
const { unauthorized, forbidden, wrap } = require('../lib/errors');

/** Requires a valid access token and loads the live user row. */
const authenticate = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw unauthorized('لم تسجّل الدخول');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (_) {
    throw unauthorized('انتهت الجلسة، سجّل الدخول من جديد');
  }

  const user = await one(
    `SELECT id, store_id, full_name, email, role, is_active, must_change_password
       FROM users WHERE id = $1`,
    [payload.sub]
  );
  if (!user || !user.is_active) throw unauthorized('هذا الحساب معطّل');

  req.user = user;
  next();
});

/** Restricts a route to the given roles. */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden('ليست لديك صلاحية الدخول إلى هذا القسم'));
  next();
};

const adminOnly = requireRole('admin');

/**
 * Resolves which store the request targets and enforces tenancy.
 * - admin: may target any store via :storeId / ?store_id (or all stores when omitted)
 * - manager/staff: locked to their own store, any other value is rejected
 * Sets req.storeId (may be null for an admin looking at everything).
 */
function scopeStore(options = {}) {
  const { required = true } = options;
  return (req, _res, next) => {
    const asked =
      req.params.storeId || req.params.id_store || req.query.store_id || req.body?.store_id || null;

    if (req.user.role === 'admin') {
      if (required && !asked) return next(forbidden('يجب تحديد المحل'));
      req.storeId = asked || null;
      return next();
    }

    if (!req.user.store_id) return next(forbidden('لا يوجد محل مرتبط بهذا الحساب'));
    if (asked && asked !== req.user.store_id) {
      return next(forbidden('هذه البيانات تخص محلا آخر'));
    }
    req.storeId = req.user.store_id;
    next();
  };
}

/** Fire-and-forget audit trail. Never blocks the response. */
function audit(req, action, entity, entityId, meta) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  query(
    `INSERT INTO audit_logs (user_id, store_id, action, entity, entity_id, meta, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [req.user?.id || null, req.storeId || req.user?.store_id || null, action, entity || null,
     entityId ? String(entityId) : null, meta ? JSON.stringify(meta) : null, ip || null]
  ).catch((e) => console.warn('[audit]', e.message));
}

module.exports = { authenticate, requireRole, adminOnly, scopeStore, audit };
