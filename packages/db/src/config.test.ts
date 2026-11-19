import { describe, expect, it } from "vitest";
import { getMongoConfig } from "./config.js";

describe("getMongoConfig", () => {
  it("injects and encodes separate credentials", () => {
    const { uri, dbName } = getMongoConfig({
      MONGO_DB_URL: "mongodb+srv://placeholder:placeholder@cluster0.example.mongodb.net",
      MONGO_DB_USER: "app",
      MONGO_DB_PASSWORD: "p@ss:w/rd",
    });
    expect(uri).toBe("mongodb+srv://app:p%40ss%3Aw%2Frd@cluster0.example.mongodb.net");
    expect(dbName).toBe("ai-news-curator");
  });

  it("keeps a URL that already has credentials", () => {
    const { uri } = getMongoConfig({ MONGO_DB_URL: "mongodb://u:p@localhost:27017/?tls=false" });
    expect(uri).toBe("mongodb://u:p@localhost:27017/?tls=false");
  });

  it("supports replica-set host lists", () => {
    const { uri } = getMongoConfig({ MONGO_DB_URL: "mongodb://h1:27017,h2:27017/?replicaSet=rs0" });
    expect(uri).toBe("mongodb://h1:27017,h2:27017/?replicaSet=rs0");
  });

  it("rejects missing or non-mongo URLs", () => {
    expect(() => getMongoConfig({})).toThrow("MONGO_DB_URL is not set");
    expect(() => getMongoConfig({ MONGO_DB_URL: "https://x" })).toThrow("must start with");
  });
});
