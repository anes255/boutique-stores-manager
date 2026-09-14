const { one, query } = require('../lib/db');
const { verifyAccessToken } = require('../lib/tokens');
const { unauthorized, forbidden, notFound, wrap } = require('../lib/errors');

/**
 * الأدوار:
 *  - admin   = المستخدم الرئيسي: يملك فروعه ومنتجاته، ولا يرى فروع غيره.
 *  - manager = المستخدم الفرعي: مربوط بفرع واحد فقط.
 */

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
  if (!roles.includes(req.user.role)) return next(forbidden('هذا القسم للمستخدم الرئيسي فقط'));
  next();
};

const adminOnly = requireRole('admin');

/** هل يستطيع هذا المستخدم العمل على هذا الفرع؟ */
async function canUseStore(user, storeId) {
  if (!storeId) return false;
  if (user.role === 'admin') {
    return !!(await one('SELECT 1 FROM stores WHERE id = $1 AND owner_id = $2', [storeId, user.id]));
  }
  return user.store_id === storeId;
}

/** يجلب فرعا يملكه المستخدم الرئيسي، أو 404. */
async function ownedStore(req, storeId) {
  const store = await one('SELECT * FROM stores WHERE id = $1 AND owner_id = $2', [storeId, req.user.id]);
  if (!store) throw notFound('الفرع غير موجود');
  req.storeId = store.id;
  return store;
}

/**
 * يحدد الفرع المطلوب ويفرض الصلاحيات، ويضع:
 *  - req.storeId: الفرع (أو null للمستخدم الرئيسي عندما يطلب كل فروعه)
 *  - req.ownerId: المستخدم الرئيسي صاحب البيانات (للمستخدم الفرعي: صاحب فرعه)
 */
function scopeStore(options = {}) {
  const { required = true } = options;
  return wrap(async (req, _res, next) => {
    const asked = req.params.storeId || req.query.store_id || req.body?.store_id || null;

    if (req.user.role === 'admin') {
      req.ownerId = req.user.id;
      if (!asked) {
        if (required) throw forbidden('يجب تحديد الفرع');
        req.storeId = null;
        return next();
      }
      if (!(await canUseStore(req.user, asked))) throw notFound('الفرع غير موجود');
      req.storeId = asked;
      return next();
    }

    if (!req.user.store_id) throw forbidden('لا يوجد فرع مرتبط بهذا الحساب');
    if (asked && asked !== req.user.store_id) throw forbidden('هذه البيانات تخص فرعا آخر');
    const store = await one('SELECT owner_id FROM stores WHERE id = $1', [req.user.store_id]);
    if (!store) throw forbidden('لا يوجد فرع مرتبط بهذا الحساب');
    req.storeId = req.user.store_id;
    req.ownerId = store.owner_id;
    next();
  });
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

module.exports = { authenticate, requireRole, adminOnly, canUseStore, ownedStore, scopeStore, audit };
