import { Connection, Client } from "@temporalio/client";

const NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
export const TASK_QUEUE = "main";

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  client = new Client({ connection, namespace: NAMESPACE });

  return client;
}

export async function checkTemporalReady(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const c = await getTemporalClient();
    const { pollers } = await c.workflowService.describeTaskQueue({
      namespace: NAMESPACE,
      taskQueue: { name: TASK_QUEUE, kind: 1 },
      taskQueueType: 1,
    });
    if (!pollers?.length) return { ok: false, reason: "no workers polling" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "Temporal unreachable" };
  }
}
