"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import {
  updateClassSettings,
  regenerateCode,
  deleteClass,
  getActivityLog,
} from "@/server/actions/classes";
import { changeTopicName, deleteTopic } from "@/server/actions/topics";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { timeAgo } from "@/lib/utils";
import type { Rank, ClassSettings } from "@/server/db/schema";
import {
  CheckIcon,
  CrownIcon,
  HistoryIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  MembersIcon,
  RecompileIcon,
  RetryIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
  UploadIcon,
  WarnIcon,
} from "@/components/icons";

/* ─── types ──────────────────────────────────────────────────────── */

type PermKey = keyof Omit<ClassSettings, "name" | "defaultRank">;

type ClsData = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  ownerName: string;
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
};

type TopicData = {
  id: string;
  name: string;
  createdAt: string;
  createdByName: string;
  createdByMe: boolean;
  canDelete: boolean;
};

type Props = {
  classId: string;
  cls: ClsData;
  topic?: TopicData;
  viewerRank: Rank;
};

/* ─── rank metadata ──────────────────────────────────────────────── */

const RANKS: Rank[] = ["viewer", "contributor", "admin", "owner"];

const RANK_META: Record<Rank, { label: string; Icon?: React.ComponentType }> = {
  viewer: { label: "Viewer" },
  contributor: { label: "Contributor" },
  admin: { label: "Admin", Icon: () => <ShieldIcon size={11} /> },
  owner: { label: "Owner", Icon: () => <CrownIcon size={11} /> },
};

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
    const m = RANK_META[value];
    return (
      <span className="rankval">
        {m.Icon && <m.Icon />}
        {m.label}
      </span>
    );
  }
  return (
    <div className="rankseg">
      {options.map((r) => {
        const m = RANK_META[r];
        return (
          <button
            key={r}
            className={value === r ? "on" : ""}
            onClick={() => onChange(r)}
          >
            {value === r && m.Icon && <m.Icon />}
            {m.label}
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
  createdAt: string;
  userName: string | null;
};

function ActivityLog({ classId }: { classId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  async function loadFirst() {
    setLoaded(true);
    setLoadingMore(true);
    const res = await getActivityLog(classId, 0);
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
      getActivityLog(classId, entries.length).then((res) => {
        setLoadingMore(false);
        if ("error" in res) return;
        setEntries((prev) => [...prev, ...res.entries]);
        setHasMore(res.hasMore);
      });
    }
  }

  if (!loaded) {
    return (
      <div className="sv-card">
        <div className="log-cta">
          <span className="lic">
            <HistoryIcon size={20} />
          </span>
          <p>
            See every upload, compile, role change, and settings edit in this
            class.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={loadFirst}>
            <HistoryIcon />
            Load activity log
          </button>
        </div>
      </div>
    );
  }

  const done = !hasMore;
  return (
    <div className="sv-card">
      <div className="logscroll" onScroll={onScroll}>
        {entries.length === 0 && !loadingMore && (
          <div className="log-end">No activity yet</div>
        )}
        {entries.map((e) => (
          <div className="log-row" key={e.id}>
            <div className="log-main">
              <div className="log-txt">
                {e.userName && <b>{e.userName}</b>}
                {e.userName ? " · " : ""}
                {e.action}
              </div>
              <div className="log-when">{timeAgo(e.createdAt)}</div>
            </div>
          </div>
        ))}
        {loadingMore && (
          <div className="log-foot">
            <span className="mini-spin" /> Loading…
          </div>
        )}
        {!loadingMore && done && entries.length > 0 && (
          <div className="log-end">· End of log ·</div>
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
      <div className="modal" style={{ maxWidth: 460 }}>
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
    setDeleting(false);
    if ("success" in res) {
      mutate("/api/sidebar");
      router.push("/home");
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={() => !deleting && onClose()} />
      <div className="modal" style={{ maxWidth: 460 }}>
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
          className="sv-input"
          style={
            text && text !== phrase ? { borderColor: "var(--danger-soft)" } : {}
          }
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
  const [code, setCode] = useState(cls.code);
  const [topicName, setTopicName] = useState(topic?.name ?? "");
  const [draft, setDraft] = useState<Record<PermKey, Rank>>(() => {
    const d = {} as Record<PermKey, Rank>;
    PERM_KEYS.forEach((k) => {
      d[k] = cls[k];
    });
    return d;
  });
  const [defaultRank, setDefaultRank] = useState<Rank>(cls.defaultRank);

  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delTopicOpen, setDelTopicOpen] = useState(false);

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
    router.refresh();
  }

  async function regen() {
    setRegenLoading(true);
    const res = await regenerateCode(classId);
    setRegenLoading(false);
    if ("success" in res && res.success) setCode(res.code!);
  }

  const canDeleteTopic = topic?.canDelete ?? false;
  const showDanger = canDeleteTopic || isOwner;

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
                disabled={
                  !topic.createdByMe &&
                  viewerRank !== "admin" &&
                  viewerRank !== "owner"
                }
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="Untitled topic"
              />
            </div>
            <div className="sv-meta">
              <InfoIcon />
              Created by{" "}
              <b style={{ color: "var(--ink-nav)", marginLeft: 3 }}>
                {topic.createdByName}
              </b>
              {topic.createdByMe && " (you)"}
              <span style={{ margin: "0 4px" }}>·</span>
              {timeAgo(topic.createdAt)}
            </div>
          </div>
        </div>
      )}

      {/* class section */}
      <div>
        <div className="section-label" style={topic ? {} : { marginTop: 0 }}>
          <span className="slead">
            <SettingsIcon />
            Class
          </span>
        </div>

        {!isOwner && (
          <div className="lowbanner" style={{ marginBottom: 12 }}>
            <LockIcon />
            <span>
              You&apos;re a <b>{RANK_META[viewerRank].label}</b> here. These are
              the class rules — you can see them, but only the <b>owner</b> can
              change them.
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
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
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
            Created by{" "}
            <b style={{ color: "var(--ink-nav)", marginLeft: 3 }}>
              {cls.ownerName}
            </b>
            <span style={{ margin: "0 4px" }}>·</span>
            {timeAgo(cls.createdAt)}
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
            Activity log
          </span>
        </div>
        <ActivityLog classId={classId} />
      </div>

      {/* danger zone */}
      {showDanger && (
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
                    <b style={{ color: "var(--ink-heading)" }}>{topic.name}</b>,
                    its collection, and every compiled document. Can&apos;t be
                    undone.
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
                  <div className="sv-st">Delete class</div>
                  <div className="sv-desc">
                    Permanently deletes{" "}
                    <b style={{ color: "var(--ink-heading)" }}>{cls.name} </b>—
                    every topic, collection, contribution, and master document —
                    for all members. This can&apos;t be undone.
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
      )}

      {/* save bar */}
      {dirty && (
        <div className="savebar">
          <span className="stxt">
            <b>Unsaved changes</b> · applies to everyone
          </span>
          <div className="sact">
            <button className="b-rev" onClick={revert} disabled={saving}>
              Revert
            </button>
            <button className="b-save" onClick={save} disabled={saving}>
              {saving ? (
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
    </div>
  );
}
