"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { mutate } from "swr";
import {
  updateClassSettings,
  regenerateCode,
  deleteClass,
  leaveClass,
  setNextOwner,
  getMembersForTransfer,
  transferOwnership,
  getActivityLog,
} from "@/server/actions/classes";
import { changeTopicName, deleteTopic } from "@/server/actions/topics";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { timeAgo } from "@/lib/utils";
import type { MemberRef, TopicRef, ContribRef } from "@/lib/activity-log";
import type { Rank, ClassSettings } from "@/server/db/schema";
import {
  CheckIcon,
  HistoryIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  LogOutIcon,
  MembersIcon,
  RecompileIcon,
  RetryIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
  WarnIcon,
} from "@/components/icons";
import { toast } from "sonner";

/* ─── types ──────────────────────────────────────────────────────── */

type PermKey = keyof Omit<ClassSettings, "name" | "defaultRank">;

type ClsData = {
  id: string;
  name: string;
  code: string | null;
  createdAt: string;
  ownerName: string;
  ownerId: string;
  defaultRank: Rank;
  minRankCreateTopic: Rank;
  minRankDeleteTopic: Rank;
  minRankUploadContribution: Rank;
  minRankDeleteContribution: Rank;
  minRankTriggerCompilation: Rank;
  minRankEditCompilation: Rank;
  minRankInvite: Rank;
  minRankBanUsers: Rank;
  minRankKickUsers: Rank;
  minRankChangeRanks: Rank;
  minRankPinContribution: Rank;
  nextOwnerId: string | null;
  nextOwnerName: string | null;
};

type TopicData = {
  id: string;
  name: string;
  createdAt: string;
  createdByName: string;
  createdById: string;
  createdByMe: boolean;
  canDelete: boolean;
  canRename: boolean;
};

type Props = {
  classId: string;
  cls: ClsData;
  topic?: TopicData;
  viewerRank: Rank;
};

/* ─── rank metadata ──────────────────────────────────────────────── */

const RANKS: Rank[] = ["viewer", "contributor", "admin", "owner"];

const cap = (r: string) => r[0].toUpperCase() + r.slice(1);

/* ─── permission groups ───────────────────────────────────────────── */

const PERM_GROUPS: {
  group: string;
  Icon: React.ComponentType;
  items: { k: PermKey; title: string; desc: string }[];
}[] = [
  {
    group: "Topics",
    Icon: LayersIcon,
    items: [
      {
        k: "minRankCreateTopic",
        title: "Create topics",
        desc: "Who can add new topics to this class.",
      },
      {
        k: "minRankDeleteTopic",
        title: "Delete topics",
        desc: "Who can permanently remove a topic and its collection.",
      },
    ],
  },
  {
    group: "Contributions",
    Icon: UploadIcon,
    items: [
      {
        k: "minRankUploadContribution",
        title: "Upload contributions",
        desc: "Who can add sources to a topic's collection.",
      },
      {
        k: "minRankDeleteContribution",
        title: "Delete contributions",
        desc: "Who can remove sources others uploaded.",
      },
      {
        k: "minRankPinContribution",
        title: "Pin a source of truth",
        desc: "Who can pin a contribution the compiler always trusts.",
      },
    ],
  },
  {
    group: "Compilation",
    Icon: RecompileIcon,
    items: [
      {
        k: "minRankTriggerCompilation",
        title: "Run a compile",
        desc: "Who can trigger the AI to (re)build a master document.",
      },
      {
        k: "minRankEditCompilation",
        title: "Edit master documents",
        desc: "Who can hand-edit a compiled document.",
      },
    ],
  },
  {
    group: "People & roles",
    Icon: MembersIcon,
    items: [
      {
        k: "minRankInvite",
        title: "Invite members",
        desc: "Who can see the class code and share invite links.",
      },
      {
        k: "minRankKickUsers",
        title: "Remove members",
        desc: "Who can kick members from the class.",
      },
      {
        k: "minRankBanUsers",
        title: "Ban members",
        desc: "Who can ban members so they can't rejoin.",
      },
      {
        k: "minRankChangeRanks",
        title: "Change roles",
        desc: "Who can promote or demote other members.",
      },
    ],
  },
];

const PERM_KEYS = PERM_GROUPS.flatMap((g) => g.items.map((i) => i.k));

/* ─── sub-components ─────────────────────────────────────────────── */

function RankControl({
  value,
  onChange,
  editable,
  options = RANKS,
}: {
  value: Rank;
  onChange: (r: Rank) => void;
  editable: boolean;
  options?: Rank[];
}) {
  if (!editable) {
    return <span className="rankval">{cap(value)}</span>;
  }
  return (
    <div className="rankseg">
      {options.map((r) => {
        return (
          <button
            key={r}
            className={value === r ? "on" : ""}
            onClick={() => onChange(r)}
          >
            {cap(r)}
          </button>
        );
      })}
    </div>
  );
}

function PermRow({
  title,
  desc,
  value,
  onChange,
  editable,
}: {
  title: string;
  desc: string;
  value: Rank;
  onChange: (r: Rank) => void;
  editable: boolean;
}) {
  return (
    <div className="sv-row">
      <div className="sv-sl">
        <div className="sv-st">{title}</div>
        <div className="sv-desc">{desc}</div>
      </div>
      <RankControl value={value} onChange={onChange} editable={editable} />
    </div>
  );
}

type LogEntry = {
  id: string;
  action: string;
  metadata: string | null;
  topicId: string | null;
  userId: string | null;
  createdAt: string;
  userName: string | null;
};

type LogMeta = {
  target?: MemberRef;
  topic?: TopicRef;
  topicName?: string;
  contribution?: ContribRef;
  contributionName?: string;
  rank?: string;
  oldName?: string;
  newName?: string;
};

function renderLogLine(classId: string, entry: LogEntry): React.ReactNode {
  const meta: LogMeta = entry.metadata ? JSON.parse(entry.metadata) : {};

  const actor = entry.userId ? (
    <b>
      <Link href={`/home/${classId}/members?members=${entry.userId}`}>
        {entry.userName ?? "Deleted user"}
      </Link>
    </b>
  ) : (
    <b>{entry.userName ?? "Deleted user"}</b>
  );

  const ml = (ref: { id: string; name: string }) => (
    <b>
      <Link href={`/home/${classId}/members?members=${ref.id}`}>
        {ref.name}
      </Link>
    </b>
  );
  const tl = (ref: { id: string; name: string }) => (
    <b>
      <Link href={`/home/${classId}/${ref.id}`}>{ref.name}</Link>
    </b>
  );
  const cl = (ref: { id: string; name: string }, topicId: string) => (
    <b>
      <Link href={`/home/${classId}/${topicId}/collection?sources=${ref.id}`}>
        {ref.name}
      </Link>
    </b>
  );
  const cn = (ref: { name: string } | undefined) =>
    ref ? <b>{ref.name}</b> : <>a source</>;
  const poss = (name: string) => (name.endsWith("s") ? "'" : "'s");

  switch (entry.action) {
    case "member_joined":
      return <>{actor} joined the class</>;
    case "member_left":
      return <>{actor} left the class</>;
    case "member_kicked":
    case "member_banned":
    case "member_unbanned": {
      const verb = {
        member_kicked: "removed",
        member_banned: "banned",
        member_unbanned: "unbanned",
      }[entry.action];
      return (
        <>
          {actor} {verb} {meta.target ? ml(meta.target) : <>a member</>}
        </>
      );
    }
    case "rank_changed":
      return (
        <>
          {actor} changed{" "}
          {meta.target ? (
            <>
              {ml(meta.target)}
              {poss(meta.target.name)}
            </>
          ) : (
            <>a member&apos;s</>
          )}{" "}
          role to <b>{meta.rank}</b>
        </>
      );
    case "topic_created":
      return (
        <>
          {actor} created topic {meta.topic ? tl(meta.topic) : <>unknown</>}
        </>
      );
    case "topic_deleted":
      return (
        <>
          {actor} deleted topic <b>{meta.topicName}</b>
        </>
      );
    case "settings_changed":
      return <>{actor} updated class settings</>;
    case "code_regenerated":
      return <>{actor} regenerated the join code</>;
    case "topic_renamed":
      return (
        <>
          {actor} renamed the topic from <b>{meta.oldName}</b> to{" "}
          <b>{meta.newName}</b>
        </>
      );
    case "contribution_uploaded":
    case "contribution_edited":
    case "contribution_pinned":
    case "contribution_unpinned":
    case "contribution_reprocessed": {
      const verb = {
        contribution_uploaded: "uploaded",
        contribution_edited: "edited",
        contribution_pinned: "pinned",
        contribution_unpinned: "unpinned",
        contribution_reprocessed: "reprocessed",
      }[entry.action];
      return (
        <>
          {actor} {verb}{" "}
          {entry.topicId && meta.contribution
            ? cl(meta.contribution, entry.topicId)
            : cn(meta.contribution)}
        </>
      );
    }
    case "contribution_deleted":
      return (
        <>
          {actor} deleted <b>{meta.contributionName}</b>
        </>
      );
    case "compilation_triggered":
      return <>{actor} triggered a compilation</>;
    case "compilation_completed":
      return <>Compilation triggered by {actor} completed</>;
    case "compilation_failed":
      return <>Compilation triggered by {actor} failed</>;
    default:
      return <>Unknown activity</>;
  }
}

function ActivityLog({
  classId,
  topicId,
}: {
  classId: string;
  topicId: string | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  async function loadFirst() {
    setLoaded(true);
    setLoadingMore(true);
    const res = await getActivityLog(classId, topicId, 0);
    setLoadingMore(false);
    if ("error" in res) return;
    setEntries(res.entries);
    setHasMore(res.hasMore);
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      setLoadingMore(true);
      getActivityLog(classId, topicId, entries.length).then((res) => {
        setLoadingMore(false);
        if ("error" in res) return;
        setEntries((prev) => [...prev, ...res.entries]);
        setHasMore(res.hasMore);
      });
    }
  }

  const done = !hasMore;
  return (
    <div className="sv-card">
      <div className="logscroll" onScroll={loaded ? onScroll : undefined}>
        {!loaded ? (
          <div className="log-cta">
            <span className="lic">
              <HistoryIcon size={20} />
            </span>
            <p>
              {topicId
                ? "See every upload, edit, pin, and compilation for this topic."
                : "See every upload, compile, role change, and settings edit in this class."}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={loadFirst}>
              <HistoryIcon />
              Load activity log
            </button>
          </div>
        ) : (
          <>
            {entries.length === 0 && !loadingMore && (
              <div className="log-end h-full">No activity yet</div>
            )}
            {entries.map((e) => (
              <div className="log-row" key={e.id}>
                <div className="log-main">
                  <div className="log-txt">{renderLogLine(classId, e)}</div>
                  <div className="log-when">{timeAgo(e.createdAt)}</div>
                </div>
              </div>
            ))}
            {loadingMore && (
              <div className="log-foot h-full">
                <span className="mini-spin" /> Loading…
              </div>
            )}
            {!loadingMore && done && entries.length > 0 && (
              <div className="log-end">· End of log ·</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeleteTopicModal({
  classId,
  topic,
  onClose,
}: {
  classId: string;
  topic: TopicData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  useEscapeKey(() => !deleting && onClose());

  async function confirm() {
    setDeleting(true);
    const res = await deleteTopic(classId, topic.id);
    setDeleting(false);
    if ("success" in res) {
      mutate("/api/sidebar");
      router.push(`/home/${classId}`);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={() => !deleting && onClose()} />
      <div className="modal max-w-115">
        <div className="del-mhead">
          <span className="del-mic">
            <WarnIcon size={19} />
          </span>
          <h3>Delete this topic?</h3>
        </div>
        <p className="del-mbody">
          This permanently removes <b>{topic.name}</b>, its entire collection,
          and every compiled document. There is no recovery.
        </p>
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="btn-danger-solid"
            disabled={deleting}
            onClick={confirm}
          >
            {deleting ? (
              <>
                <span className="mini-spin" />
                Deleting…
              </>
            ) : (
              <>
                <TrashIcon />
                Delete topic
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function DeleteClassModal({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEscapeKey(() => !deleting && onClose());

  const phrase = `permanently delete ${className}`;

  async function confirm() {
    setDeleting(true);
    const res = await deleteClass(classId);
    if ("success" in res) {
      mutate("/api/sidebar");
      router.push("/home");
      toast.success(`Successfully deleted ${className}.`);
    } else if ("error" in res) {
      toast.error(res.error);
    }
    setDeleting(false);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={() => !deleting && onClose()} />
      <div className="modal max-w-115">
        <div className="del-mhead">
          <span className="del-mic">
            <WarnIcon size={19} />
          </span>
          <h3>Delete this class?</h3>
        </div>
        <p className="del-mbody">
          This permanently removes <b>{className}</b> and everything inside it
          for every member. There is no recovery.
        </p>
        <p className="del-hint">
          To confirm, type <code>{phrase}</code> below.
        </p>
        <input
          className={`sv-input${text && text !== phrase ? " border-(--danger-soft)" : ""}`}
          value={text}
          autoFocus
          placeholder={phrase}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text === phrase) confirm();
          }}
        />
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="btn-danger-solid"
            disabled={text !== phrase || deleting}
            onClick={confirm}
          >
            {deleting ? (
              <>
                <span className="mini-spin" />
                Deleting…
              </>
            ) : (
              <>
                <TrashIcon />
                Delete class
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function LeaveClassModal({
  classId,
  className,
  successorName,
  onClose,
}: {
  classId: string;
  className: string;
  successorName?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  useEscapeKey(() => !leaving && onClose());

  async function confirm() {
    setLeaving(true);
    const res = await leaveClass(classId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      toast.success("You've left the class.");
      mutate("/api/sidebar");
      router.push("/home");
    }
    setLeaving(false);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={() => !leaving && onClose()} />
      <div className="modal max-w-115">
        <div className="del-mhead">
          <span className="del-mic">
            <WarnIcon size={19} />
          </span>
          <h3>
            {successorName
              ? "Transfer ownership and leave?"
              : "Leave this class?"}
          </h3>
        </div>
        <p className="del-mbody">
          {successorName ? (
            <>
              Ownership of <b>{className}</b> will transfer to{" "}
              <b>{successorName}</b>. You will leave the class entirely — to
              rejoin you&apos;ll need an invite or the join code.
            </>
          ) : (
            <>
              You will lose access to <b>{className}</b> and all its topics. You
              can rejoin with an invite link or code if one is available.
            </>
          )}
        </p>
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={leaving}
          >
            Cancel
          </button>
          <button
            className="btn-danger-solid"
            disabled={leaving}
            onClick={confirm}
          >
            {leaving ? (
              <>
                <span className="mini-spin" />
                Leaving…
              </>
            ) : (
              <>
                <LogOutIcon />
                {successorName ? "Transfer and leave" : "Leave class"}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function TransferOwnershipModal({
  classId,
  currentSuccessorId,
  onSelect,
  onClose,
}: {
  classId: string;
  currentSuccessorId: string | null;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEscapeKey(() => saving === null && onClose());

  useEffect(() => {
    getMembersForTransfer(classId).then((res) => {
      if ("success" in res) setMembers(res.members);
    });
  }, [classId]);

  const filtered =
    members?.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  async function select(id: string, name: string) {
    setSaving(id);
    const res = await setNextOwner(classId, id);
    setSaving(null);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      onSelect(id, name);
    }
  }

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={() => saving === null && onClose()}
      />
      <div className="modal max-w-115">
        <div className="del-mhead">
          <span className="del-mic">
            <MembersIcon />
          </span>
          <h3>Choose a successor</h3>
        </div>
        <p className="del-mbody">
          Select a member to inherit ownership of this class when you leave.
        </p>
        <input
          className="sv-input"
          placeholder="Search members…"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
        {!members ? (
          <div className="py-6 text-center text-sm text-(--ink-faint)">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-(--ink-faint)">
            {search
              ? "No members match your search."
              : "No other members in this class."}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto mt-2 border border-(--line-soft) rounded-lg">
            {filtered.map((m) => (
              <button
                key={m.id}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-(--line-soft) last:border-b-0 hover:bg-[rgba(60,45,25,0.04)] transition-[background-color]${m.id === currentSuccessorId ? " bg-[rgba(196,121,24,0.04)]" : ""}`}
                onClick={() => select(m.id, m.name)}
                disabled={saving !== null}
              >
                <span className="flex-1 text-[13px] text-(--ink-heading)">
                  {m.name}
                </span>
                {m.id === currentSuccessorId && (
                  <span className="text-[11.5px] text-(--ink-faint)">
                    Current
                  </span>
                )}
                {saving === m.id && <span className="mini-spin" />}
              </button>
            ))}
          </div>
        )}
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={saving !== null}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function TransferNowModal({
  classId,
  successorName,
  defaultRank,
  onClose,
}: {
  classId: string;
  successorName: string;
  defaultRank: Rank;
  onClose: () => void;
}) {
  const router = useRouter();
  const [transferring, setTransferring] = useState(false);
  useEscapeKey(() => !transferring && onClose());

  async function confirm() {
    setTransferring(true);
    const res = await transferOwnership(classId);
    if ("error" in res) {
      toast.error(res.error);
      setTransferring(false);
    } else {
      toast.success("Ownership transferred.");
      mutate("/api/sidebar");
      router.refresh();
      onClose();
    }
  }

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={() => !transferring && onClose()}
      />
      <div className="modal max-w-115">
        <div className="del-mhead">
          <span className="del-mic">
            <MembersIcon />
          </span>
          <h3>Transfer ownership?</h3>
        </div>
        <p className="del-mbody">
          <b>{successorName}</b> will become the new owner. You will remain in
          the class as a <b>{cap(defaultRank)}</b>.
        </p>
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={transferring}
          >
            Cancel
          </button>
          <button
            className="btn-danger-solid"
            disabled={transferring}
            onClick={confirm}
          >
            {transferring ? (
              <>
                <span className="mini-spin" />
                Transferring…
              </>
            ) : (
              <>Transfer ownership</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── main component ─────────────────────────────────────────────── */

export default function SettingsView({
  classId,
  cls,
  topic,
  viewerRank,
}: Props) {
  const router = useRouter();
  const isOwner = viewerRank === "owner";

  const [name, setName] = useState(cls.name);
  const [code, setCode] = useState(cls.code ?? "");
  const [topicName, setTopicName] = useState(topic?.name ?? "");
  const [draft, setDraft] = useState<Record<PermKey, Rank>>(() => {
    const d = {} as Record<PermKey, Rank>;
    PERM_KEYS.forEach((k) => {
      d[k] = cls[k];
    });
    return d;
  });
  const [defaultRank, setDefaultRank] = useState<Rank>(cls.defaultRank);

  const [successor, setSuccessor] = useState<{
    id: string;
    name: string;
  } | null>(
    cls.nextOwnerId && cls.nextOwnerName
      ? { id: cls.nextOwnerId, name: cls.nextOwnerName }
      : null,
  );

  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [regenLoading, setRegenLoading] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delTopicOpen, setDelTopicOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferNowOpen, setTransferNowOpen] = useState(false);
  const [clearingSuccessor, setClearingSuccessor] = useState(false);

  async function clearSuccessor() {
    setClearingSuccessor(true);
    const res = await setNextOwner(classId, null);
    setClearingSuccessor(false);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setSuccessor(null);
    }
  }
  const dirty = useMemo(() => {
    if (name !== cls.name) return true;
    if (defaultRank !== cls.defaultRank) return true;
    if (topic && topicName !== topic.name) return true;
    return PERM_KEYS.some((k) => draft[k] !== cls[k]);
  }, [name, defaultRank, topicName, draft, cls, topic]);

  function revert() {
    setName(cls.name);
    setDefaultRank(cls.defaultRank);
    if (topic) setTopicName(topic.name);
    const d = {} as Record<PermKey, Rank>;
    PERM_KEYS.forEach((k) => {
      d[k] = cls[k];
    });
    setDraft(d);
  }

  async function save() {
    setSaving(true);
    const settingsUpdate: ClassSettings = {};
    if (name !== cls.name) settingsUpdate.name = name;
    if (defaultRank !== cls.defaultRank)
      settingsUpdate.defaultRank = defaultRank;
    PERM_KEYS.forEach((k) => {
      if (draft[k] !== cls[k]) settingsUpdate[k] = draft[k];
    });

    const tasks: Promise<unknown>[] = [];
    if (Object.keys(settingsUpdate).length > 0)
      tasks.push(updateClassSettings(classId, settingsUpdate));
    if (topic && topicName !== topic.name)
      tasks.push(changeTopicName(classId, topic.id, topicName));

    await Promise.all(tasks);
    setSaving(false);
    mutate("/api/sidebar");
    startTransition(() => router.refresh());
    toast.success("Successfully saved new settings.");
  }

  async function regen() {
    setRegenLoading(true);
    const res = await regenerateCode(classId);
    setRegenLoading(false);
    if ("success" in res && res.success) setCode(res.code!);
  }

  const canDeleteTopic = topic?.canDelete ?? false;

  return (
    <div className="pane flex flex-col gap-5">
      <div className="pane-head">
        <div>
          <div className="kicker">Settings</div>
          <h1 className="pane-title">{topic ? topic.name : cls.name}</h1>
          <p className="pane-desc">
            {topic
              ? "Settings for this topic, plus the class-wide rules it inherits."
              : "Class details and the permissions that govern who can do what. Everyone can view these; only the owner can change them."}
          </p>
        </div>
      </div>

      {/* topic section */}
      {topic && (
        <div>
          <div className="section-label">
            <span className="slead">
              <SettingsIcon />
              Topic
            </span>
          </div>
          <div className="sv-card">
            <div className="sv-row sv-stack">
              <label className="sv-lbl">Topic name</label>
              <input
                className="sv-input"
                value={topicName}
                disabled={!topic.canRename}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="Untitled topic"
              />
            </div>
            <div className="sv-meta">
              <InfoIcon />
              <span>
                Created by{" "}
                <Link
                  href={`/home/${classId}/${topic.id}/members?members=${topic.createdById}&reason=who+created+this+topic`}
                >
                  <b className="text-(--ink-nav)">{topic.createdByName}</b>
                </Link>
                {topic.createdByMe && " (you)"} · {timeAgo(topic.createdAt)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* class section */}
      <div>
        <div className={`section-label${!topic ? " mt-0" : ""}`}>
          <span className="slead">
            <SettingsIcon />
            Class
          </span>
        </div>

        {!isOwner && (
          <div className="lowbanner mb-3">
            <LockIcon />
            <span>
              You&apos;re a <b>{cap(viewerRank)}</b> here. These are the class
              rules — you can see them, but only the <b>owner</b> can change
              them.
            </span>
          </div>
        )}

        <div className="sv-card">
          <div className="sv-row sv-stack">
            <label className="sv-lbl">Class name</label>
            <input
              className="sv-input"
              value={name}
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
              placeholder="Class name"
            />
          </div>
          {cls.code && (
            <div className="sv-row">
              <div className="sv-sl">
                <div className="sv-st">Join code</div>
                <div className="sv-desc">
                  Members join with this code.{" "}
                  {isOwner
                    ? "Regenerating invalidates old invite links."
                    : "Only the owner can regenerate it."}
                </div>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                <span className="codebox">
                  <span className="ccode">{code}</span>
                </span>
                {isOwner && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={regen}
                    disabled={regenLoading}
                  >
                    {regenLoading ? (
                      <span className="mini-spin" />
                    ) : (
                      <RetryIcon />
                    )}
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="sv-row">
            <div className="sv-sl">
              <div className="sv-st">Default role for new members</div>
              <div className="sv-desc">
                The role anyone joining with the code receives.
              </div>
            </div>
            <RankControl
              value={defaultRank}
              onChange={setDefaultRank}
              editable={isOwner}
              options={["viewer", "contributor", "admin"]}
            />
          </div>
          <div className="sv-meta">
            <InfoIcon />
            <span>
              Created by{" "}
              <Link
                href={`/home/${classId}/members?members=${cls.ownerId}&reason=who+created+this+class`}
              >
                <b className="text-(--ink-nav)">{cls.ownerName}</b>
              </Link>
              {isOwner && " (you)"} · {timeAgo(cls.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* permission groups */}
      {PERM_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="section-label">
            <span className="slead">
              <g.Icon />
              {g.group} — minimum role
            </span>
          </div>
          <div className="sv-card">
            {g.items.map((it) => (
              <PermRow
                key={it.k}
                title={it.title}
                desc={it.desc}
                value={draft[it.k]}
                onChange={(v) => setDraft((d) => ({ ...d, [it.k]: v }))}
                editable={isOwner}
              />
            ))}
          </div>
        </div>
      ))}

      {/* activity log */}
      <div>
        <div className="section-label">
          <span className="slead">
            <HistoryIcon />
            {topic ? "Topic" : "Class"} Activity log
          </span>
        </div>
        <ActivityLog classId={classId} topicId={topic?.id} />
      </div>

      {/* danger zone */}
      <div>
        <div className="section-label danger">
          <span className="slead">
            <WarnIcon size={14} />
            Danger zone
          </span>
        </div>
        <div className="sv-card danger">
          {canDeleteTopic && topic && (
            <div className="sv-row">
              <div className="sv-sl">
                <div className="sv-st">Delete topic</div>
                <div className="sv-desc">
                  Permanently removes{" "}
                  <b className="text-(--ink-heading)">{topic.name}</b>, its
                  collection, and every compiled document. Can&apos;t be undone.
                </div>
              </div>
              <button
                className="btn-danger"
                onClick={() => setDelTopicOpen(true)}
              >
                <TrashIcon />
                Delete topic
              </button>
            </div>
          )}
          {isOwner && (
            <div className="sv-row">
              <div className="sv-sl">
                <div className="sv-st">Transfer ownership</div>
                <div className="sv-desc">
                  {successor ? (
                    <>
                      Ownership will transfer to{" "}
                      <b className="text-(--ink-heading)">{successor.name}</b>{" "}
                      when you leave.
                    </>
                  ) : (
                    "Designate a member to take ownership before you can leave."
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                {successor && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "9px 15px", fontSize: 13 }}
                    disabled={clearingSuccessor}
                    onClick={clearSuccessor}
                  >
                    {clearingSuccessor ? (
                      <span className="mini-spin" />
                    ) : (
                      "Clear"
                    )}
                  </button>
                )}
                {successor && (
                  <button
                    className="btn-danger-solid"
                    onClick={() => setTransferNowOpen(true)}
                  >
                    Transfer now
                  </button>
                )}
                <button
                  className="btn-danger"
                  onClick={() => setTransferOpen(true)}
                >
                  <MembersIcon />
                  {successor?.name ? "Change" : "Choose"}
                </button>
              </div>
            </div>
          )}
          <div className="sv-row">
            <div className="sv-sl">
              <div className="sv-st">Leave class</div>
              <div className="sv-desc">
                {isOwner ? (
                  successor ? (
                    <>
                      Leaving will transfer ownership to{" "}
                      <b className="text-(--ink-heading)">{successor.name}</b>.
                    </>
                  ) : (
                    "Designate a successor above before leaving."
                  )
                ) : (
                  "Remove yourself from this class. You can rejoin with an invite link or code."
                )}
              </div>
            </div>
            <button
              className="btn-danger"
              disabled={isOwner && !successor}
              onClick={() => setLeaveOpen(true)}
            >
              <LogOutIcon />
              Leave class
            </button>
          </div>
          {isOwner && (
            <div className="sv-row">
              <div className="sv-sl">
                <div className="sv-st">Delete class</div>
                <div className="sv-desc">
                  Permanently deletes{" "}
                  <b className="text-(--ink-heading)">{cls.name} </b>— every
                  topic, collection, contribution, and master document — for all
                  members. This can&apos;t be undone.
                </div>
              </div>
              <button className="btn-danger" onClick={() => setDelOpen(true)}>
                <TrashIcon />
                Delete class
              </button>
            </div>
          )}
        </div>
      </div>

      {/* save bar */}
      {dirty && (
        <div className="savebar">
          <span className="stxt">
            <b>Unsaved changes</b> · applies to everyone
          </span>
          <div className="sact">
            <button
              className="b-rev"
              onClick={revert}
              disabled={saving || isPending}
            >
              Revert
            </button>
            <button
              className="b-save"
              onClick={save}
              disabled={saving || isPending}
            >
              {saving || isPending ? (
                <>
                  <span className="mini-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckIcon size={13} />
                  Save changes
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* delete topic modal */}
      {delTopicOpen && topic && (
        <DeleteTopicModal
          classId={classId}
          topic={topic}
          onClose={() => setDelTopicOpen(false)}
        />
      )}

      {/* delete class modal */}
      {delOpen && (
        <DeleteClassModal
          classId={classId}
          className={cls.name}
          onClose={() => setDelOpen(false)}
        />
      )}

      {/* leave class modal */}
      {leaveOpen && (
        <LeaveClassModal
          classId={classId}
          className={cls.name}
          successorName={successor?.name}
          onClose={() => setLeaveOpen(false)}
        />
      )}

      {/* transfer now modal */}
      {transferNowOpen && successor && (
        <TransferNowModal
          classId={classId}
          successorName={successor.name}
          defaultRank={cls.defaultRank}
          onClose={() => setTransferNowOpen(false)}
        />
      )}

      {/* transfer ownership modal */}
      {transferOpen && (
        <TransferOwnershipModal
          classId={classId}
          currentSuccessorId={successor?.id ?? null}
          onSelect={(id, name) => {
            setSuccessor({ id, name });
            setTransferOpen(false);
          }}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </div>
  );
}
