const { badRequest } = require('./errors');

/** Validate `req[source]` against a zod schema and replace it with the parsed value. */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return next(badRequest(`${issue.path.join('.') || 'البيانات'}: ${issue.message}`, 'validation'));
    }
    if (source === 'query') req.validatedQuery = parsed.data;
    else req[source] = parsed.data;
    next();
  };
}

module.exports = { validate };
