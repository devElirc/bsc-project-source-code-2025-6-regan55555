/** Used by drizzle-kit when run via scripts/run-push.mjs (env already loaded). */
module.exports = {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
