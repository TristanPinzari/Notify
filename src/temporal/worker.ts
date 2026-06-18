import { Worker, NativeConnection } from "@temporalio/worker";
import { Client, Connection } from "@temporalio/client";
import { extractText, cleanOrphanedFiles } from "./activities";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { extractText, cleanOrphanedFiles },
    taskQueue: "extraction",
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    connection,
  });

  const clientConnection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({
    connection: clientConnection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });

  try {
    await client.schedule.create({
      scheduleId: "storage-reconcile",
      spec: { cronExpressions: ["0 */6 * * *"] },
      action: {
        type: "startWorkflow",
        workflowType: "reconcileStorage",
        taskQueue: "extraction",
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      // schedule persists across restarts, this is expected
    } else {
      console.error("ERROR: Failed to create reconcileStorage schedule: ", e);
    }
  }

  console.log("Temporal worker started, listening on task queue: extraction");
  await worker.run();
}

main().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
