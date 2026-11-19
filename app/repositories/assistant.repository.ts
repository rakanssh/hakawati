import { enqueueLocalOperation } from "@/lib/local-write-queue";
import { getDb } from "@/services/db";
import { withTransaction } from "@/services/db/transaction";
import type {
  AssistantMessage,
  AssistantMessageStatus,
  AssistantThread,
} from "@/types/assistant.type";

type ThreadRow = {
  id: string;
  tale_id: string | null;
  title: string;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  thread_id: string;
  seq: number;
  role: string;
  content: string;
  thinking: string | null;
  turn_json: string | null;
  activity_json: string | null;
  changes_json: string | null;
  status: string | null;
  created_at: number;
};

function threadFromRow(row: ThreadRow): AssistantThread {
  return {
    id: row.id,
    taleId: row.tale_id,
    title: row.title,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function messageFromRow(row: MessageRow): AssistantMessage {
  const turn = parseJson<AssistantMessage["turn"]>(row.turn_json);
  const activity = parseJson<AssistantMessage["activity"]>(row.activity_json);
  const changes = parseJson<AssistantMessage["changes"]>(row.changes_json);
  return {
    id: row.id,
    threadId: row.thread_id,
    seq: Number(row.seq),
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    ...(row.thinking ? { thinking: row.thinking } : {}),
    ...(turn ? { turn } : {}),
    ...(activity?.length ? { activity } : {}),
    ...(changes?.length ? { changes } : {}),
    ...(row.status === "stopped" || row.status === "failed"
      ? { status: row.status as AssistantMessageStatus }
      : {}),
    createdAt: Number(row.created_at),
  };
}

const json = (value: unknown[] | undefined) =>
  value?.length ? JSON.stringify(value) : null;

export async function listAssistantThreads(
  limit = 50,
): Promise<AssistantThread[]> {
  const db = await getDb();
  const rows = await db.select<ThreadRow[]>(
    `SELECT * FROM assistant_threads ORDER BY updated_at DESC, id LIMIT ?`,
    [limit],
  );
  return rows.map(threadFromRow);
}

export async function getLatestAssistantThread(
  taleId?: string,
): Promise<AssistantThread | null> {
  const db = await getDb();
  const rows = await db.select<ThreadRow[]>(
    taleId === undefined
      ? `SELECT * FROM assistant_threads ORDER BY updated_at DESC, id LIMIT 1`
      : `SELECT * FROM assistant_threads WHERE tale_id = ?
         ORDER BY updated_at DESC, id LIMIT 1`,
    taleId === undefined ? [] : [taleId],
  );
  return rows[0] ? threadFromRow(rows[0]) : null;
}

export async function createAssistantThread(
  thread: AssistantThread,
): Promise<void> {
  await enqueueLocalOperation(async () => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO assistant_threads (id, tale_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        thread.id,
        thread.taleId,
        thread.title,
        thread.createdAt,
        thread.updatedAt,
      ],
    );
  });
}

export async function deleteAssistantThread(id: string): Promise<void> {
  await enqueueLocalOperation(async () => {
    const db = await getDb();
    await db.execute(`DELETE FROM assistant_threads WHERE id = ?`, [id]);
  });
}

export async function listAssistantMessages(
  threadId: string,
): Promise<AssistantMessage[]> {
  const db = await getDb();
  const rows = await db.select<MessageRow[]>(
    `SELECT * FROM assistant_messages WHERE thread_id = ? ORDER BY seq`,
    [threadId],
  );
  return rows.map(messageFromRow);
}

export async function updateAssistantMessageChanges(
  id: string,
  changes: AssistantMessage["changes"],
): Promise<void> {
  await enqueueLocalOperation(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE assistant_messages SET changes_json = ? WHERE id = ?`,
      [json(changes), id],
    );
  });
}

/** Appends a message after the thread's last one and returns it with its position. */
export async function appendAssistantMessage(
  message: Omit<AssistantMessage, "seq">,
): Promise<AssistantMessage> {
  return enqueueLocalOperation(async () => {
    const db = await getDb();
    return withTransaction(db, async (tx) => {
      const [last] = await tx.select<Array<{ seq: number | null }>>(
        `SELECT MAX(seq) AS seq FROM assistant_messages WHERE thread_id = ?`,
        [message.threadId],
      );
      const seq = Number(last?.seq ?? 0) + 1;
      await tx.execute(
        `INSERT INTO assistant_messages (
           id, thread_id, seq, role, content, thinking,
           turn_json, activity_json, changes_json, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.threadId,
          seq,
          message.role,
          message.content,
          message.thinking ?? null,
          json(message.turn),
          json(message.activity),
          json(message.changes),
          message.status ?? null,
          message.createdAt,
        ],
      );
      await tx.execute(
        `UPDATE assistant_threads SET updated_at = ? WHERE id = ?`,
        [message.createdAt, message.threadId],
      );
      return { ...message, seq };
    });
  });
}
