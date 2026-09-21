// Talks to Neon Postgres over its HTTPS SQL endpoint (no server needed).
const CONNECTION_STRING =
  'postgresql://neondb_owner:npg_QHR58jGPaANq@ep-jolly-darkness-ax9f47n3-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const host = CONNECTION_STRING.match(/@([^/?]+)/)[1];
const ENDPOINT = 'https://' + host.replace(/^[^.]+\./, 'api.') + '/sql';

const MESSAGES = {
  '23505': 'القيمة موجودة من قبل',
  '23503': 'لا يمكن الحذف لوجود عمليات مرتبطة',
  '23001': 'لا يمكن الحذف لوجود عمليات مرتبطة',
};

export async function sql(query, params = []) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': CONNECTION_STRING,
      },
      body: JSON.stringify({ query, params }),
    });
  } catch {
    throw new Error('تعذر الاتصال بالانترنت');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(MESSAGES[data.code] || data.message || 'خطأ في قاعدة البيانات');
    err.code = data.code;
    throw err;
  }
  return data.rows || [];
}

export async function one(query, params) {
  const rows = await sql(query, params);
  return rows[0] || null;
}
