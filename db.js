const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");

dotenv.config();
// const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@signal.eykiv6q.mongodb.net/?appName=signal`;

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@signal.eykiv6q.mongodb.net/main_db?appName=signal`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function connectDB() {
  if (!db) {
    try {
      await client.connect();
      db = client.db("main_db");
      console.log("MongoDB connected");
    } catch (err) {
      console.error("MongoDB connection error:", err);
    }
  }
  return db;
}

async function getCollection(collectionName) {
  const database = await connectDB();
  return database.collection(collectionName);
}

module.exports = { getCollection };
