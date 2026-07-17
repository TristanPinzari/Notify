import { Connection, Client } from "@temporalio/client";

export const NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
export const TASK_QUEUE = "main";

let client: Client | null = null;

export function connectionOptions() {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const isCloud = !address.startsWith("localhost");
  return {
    address,
    ...(isCloud && {
      tls: true,
      ...(process.env.TEMPORAL_API_KEY && { apiKey: process.env.TEMPORAL_API_KEY }),
    }),
  };
}

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect(connectionOptions());
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
