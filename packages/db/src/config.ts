export interface MongoConfig {
  uri: string;
  dbName: string;
}

// scheme, optional "user[:pass]@", then hosts and the rest. Not parsed with URL():
// replica-set host lists ("h1:27017,h2:27017") aren't valid WHATWG URLs.
const MONGO_URI = /^(mongodb(?:\+srv)?:\/\/)(?:([^@/]*)@)?([^@]+)$/;

/**
 * Builds the connection string from MONGO_DB_URL, optionally injecting
 * MONGO_DB_USER / MONGO_DB_PASSWORD so credentials can live separately
 * from the cluster address. Separate credentials replace any in the URL.
 */
export function getMongoConfig(env: NodeJS.ProcessEnv = process.env): MongoConfig {
  const raw = env.MONGO_DB_URL?.trim();
  if (!raw) throw new Error("MONGO_DB_URL is not set");

  const m = MONGO_URI.exec(raw);
  if (!m) throw new Error("MONGO_DB_URL must start with mongodb:// or mongodb+srv://");
  const [, scheme, existingAuth, rest] = m as unknown as [
    string,
    string,
    string | undefined,
    string,
  ];

  const user = env.MONGO_DB_USER;
  const password = env.MONGO_DB_PASSWORD;
  const auth = user
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}`
    : existingAuth;

  return {
    uri: `${scheme}${auth ? `${auth}@` : ""}${rest}`,
    dbName: env.MONGO_DB_NAME || "ai-news-curator",
  };
}
