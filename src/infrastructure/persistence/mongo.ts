import { MongoClient } from "mongodb";
import { logger } from "@/infrastructure/observability/logger";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set");
}

declare global {
  // Preserve connection across Next.js hot reloads in dev
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

const client = new MongoClient(uri);

function connectWithLog(): Promise<MongoClient> {
  return logger.time("infra", "mongo connect", () => client.connect());
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = connectWithLog();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = connectWithLog();
}

export default clientPromise;
