import { MongoClient, ServerApiVersion } from "mongodb";

let client;
let db;

// Client is created lazily so process.env.MONGO_URI is read after dotenv.config()
// has run (ES module imports are hoisted above it in index.js).
export async function connectDB() {
  if (!db) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not set — check the backend .env file");
    }

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    db = client.db("radiatorDB");
    console.log("MongoDB Connected ✅");
  }
  return db;
}
