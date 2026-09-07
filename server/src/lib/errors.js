class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

const badRequest = (m, c) => new ApiError(400, m || 'طلب غير صالح', c);
const unauthorized = (m) => new ApiError(401, m || 'لم تسجّل الدخول', 'unauthorized');
const forbidden = (m) => new ApiError(403, m || 'غير مسموح', 'forbidden');
const notFound = (m) => new ApiError(404, m || 'غير موجود', 'not_found');
const conflict = (m) => new ApiError(409, m || 'تعارض في البيانات', 'conflict');

/** Wraps async route handlers so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, badRequest, unauthorized, forbidden, notFound, conflict, wrap };
