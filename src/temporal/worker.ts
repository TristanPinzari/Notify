import { Worker, NativeConnection } from "@temporalio/worker";
import { Client, Connection } from "@temporalio/client";
import {
  extractText,
  cleanOrphanedFiles,
  cleanStuckContributions,
  cleanStuckMasterDocuments,
  cleanOldLogs,
  runCompilation,
  generatePDF,
} from "./activities";
import { connectionOptions, NAMESPACE, TASK_QUEUE } from "./client";

async function main() {
  const connection = await NativeConnection.connect(connectionOptions());

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      extractText,
      cleanOrphanedFiles,
      cleanStuckContributions,
      cleanStuckMasterDocuments,
      cleanOldLogs,
      runCompilation,
      generatePDF,
    },
    taskQueue: TASK_QUEUE,
    namespace: NAMESPACE,
    connection,
  });

  const clientConnection = await Connection.connect(connectionOptions());
  const client = new Client({ connection: clientConnection, namespace: NAMESPACE });

  try {
    await client.schedule.create({
      scheduleId: "storage-reconcile",
      spec: { cronExpressions: ["0 */6 * * *"] },
      action: {
        type: "startWorkflow",
        workflowType: "reconcileStorage",
        taskQueue: TASK_QUEUE,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      // schedule persists across restarts, this is expected
    } else {
      console.error("ERROR: Failed to create reconcileStorage schedule: ", e);
    }
  }

  try {
    await client.schedule.create({
      scheduleId: "database-reconcile",
      spec: { cronExpressions: ["*/30 * * * *"] },
      action: {
        type: "startWorkflow",
        workflowType: "reconcileDatabase",
        taskQueue: TASK_QUEUE,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      // schedule persists across restarts, this is expected
    } else {
      console.error("ERROR: Failed to create reconcileDatabase schedule: ", e);
    }
  }

  try {
    await client.schedule.create({
      scheduleId: "master-documents-reconcile",
      spec: { cronExpressions: ["*/15 * * * *"] },
      action: {
        type: "startWorkflow",
        workflowType: "reconcileMasterDocuments",
        taskQueue: TASK_QUEUE,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      // schedule persists across restarts, this is expected
    } else {
      console.error(
        "ERROR: Failed to create reconcileMasterDocuments schedule: ",
        e,
      );
    }
  }

  try {
    await client.schedule.create({
      scheduleId: "purge-old-logs",
      spec: { cronExpressions: ["0 3 * * 0"] },
      action: {
        type: "startWorkflow",
        workflowType: "purgeOldLogs",
        taskQueue: TASK_QUEUE,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      // schedule persists across restarts, this is expected
    } else {
      console.error("ERROR: Failed to create purgeOldLogs schedule: ", e);
    }
  }

  await clientConnection.close();

  console.log(`Temporal worker started, listening on task queue: ${TASK_QUEUE}`);
  await worker.run();
}

main().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
