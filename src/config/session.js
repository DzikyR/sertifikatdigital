const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const config = require('./index');

// DATABASE_URL Prisma memakai ?schema=public yang tidak dikenali driver `pg`
function pgConnectionString(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('schema');
  return parsed.toString();
}

const pool = new Pool({ connectionString: pgConnectionString(config.databaseUrl), max: 5 });

function sessionMiddleware() {
  return session({
    name: 'sid',
    store: new PgSession({
      pool,
      tableName: 'session', // dibuat oleh Prisma migration (model Session)
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15,
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // 'lax' agar redirect balik dari Google OAuth tetap membawa cookie
      secure: config.isProd,
      maxAge: 1000 * 60 * 60 * 8, // 8 jam
    },
  });
}

module.exports = { sessionMiddleware, pool };
