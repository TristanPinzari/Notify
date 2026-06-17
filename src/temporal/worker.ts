import { Worker, NativeConnection } from "@temporalio/worker";
import { extractText } from "./activities";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { extractText },
    taskQueue: "extraction",
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    connection,
  });

  console.log("Temporal worker started, listening on task queue: extraction");
  await worker.run();
}

main().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
