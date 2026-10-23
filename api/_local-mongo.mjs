// Local dev only: in-memory single-node replica set on a fixed port.
// The outbox transaction needs a replica set; a standalone mongod would make
// the API refuse to boot.
import { MongoMemoryReplSet } from "mongodb-memory-server";
const rs = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27019 }],
});
console.log("MONGO_READY", rs.getUri());
const stop = async () => { await rs.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
