const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, one } = require('./db');

const ACCESS_TTL = process.env.ACCESS_TTL || '30m';
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS || 30);

function requireSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 24) {
    throw new Error(`${name} must be set to a long random string (>= 24 chars)`);
  }
  return value;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, store_id: user.store_id || null },
    requireSecret('JWT_SECRET'),
    { expiresIn: ACCESS_TTL, issuer: 'stores-manager' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, requireSecret('JWT_SECRET'), { issuer: 'stores-manager' });
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/** Issues an opaque refresh token; only its hash is stored. */
async function issueRefreshToken(userId, userAgent) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86400_000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [userId, sha256(raw), expiresAt, (userAgent || '').slice(0, 200)]
  );
  return raw;
}

async function consumeRefreshToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const row = await one(
    `SELECT rt.*, u.id AS uid, u.role, u.store_id, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1`,
    [sha256(raw)]
  );
  if (!row) return null;
  if (row.revoked_at || new Date(row.expires_at) < new Date() || !row.is_active) return null;
  // Rotation: a refresh token is single-use.
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
  return { id: row.uid, role: row.role, store_id: row.store_id };
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(raw)]);
}

async function revokeAllForUser(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
