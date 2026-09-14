const crypto = require('crypto');

// بدون 0/O و 1/I حتى لا يخطئ أحد في قراءة الرمز
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 32 حرفا تقسم 256 بالتساوي، فالرمز عشوائي بلا انحياز. 6 خانات ≈ مليار احتمال. */
function randomCode(length = 6) {
  let out = '';
  for (const b of crypto.randomBytes(length)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * رمز الفرع الذي يكتبه المستخدم الفرعي عند إنشاء حسابه.
 * `q` هو أي كائن فيه query (المجمّع أو عميل داخل معاملة).
 */
async function freshJoinCode(q) {
  for (let i = 0; i < 10; i += 1) {
    const code = randomCode();
    const { rows } = await q.query('SELECT 1 FROM stores WHERE upper(join_code) = $1', [code]);
    if (!rows.length) return code;
  }
  throw new Error('could not generate a unique join code');
}

module.exports = { randomCode, freshJoinCode };
