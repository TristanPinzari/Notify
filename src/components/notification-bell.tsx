"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BellIcon,
  ShieldIcon,
  DocIcon,
  XIcon,
  BanIcon,
  UnbanIcon,
  MailIcon,
  SettingsIcon,
} from "@/components/icons";
import {
  getNotifications,
  markNotificationsRead,
  getClassNotifPrefs,
} from "@/server/actions/notifications";
import type {
  NotificationRow,
  ClassNotifPrefs,
} from "@/server/actions/notifications";
import { updateClassNotification } from "@/server/actions/classes";
import { Toggle } from "@/components/toggle";
import { timeAgo } from "@/lib/utils";

type NotifPayload = {
  className?: string;
  oldRank?: string;
  newRank?: string;
  topicName?: string;
  inviterName?: string;
  actorName?: string;
  url?: string;
};

const CLASS_NOTIF_ROWS: {
  key: keyof ClassNotifPrefs;
  title: string;
  desc: string;
}[] = [
  {
    key: "notifyMasterDoc",
    title: "Master doc compiled",
    desc: "When a master document finishes compiling.",
  },
  {
    key: "notifyRankChange",
    title: "Role changed",
    desc: "When your role in this class changes.",
  },
  {
    key: "notifyDigest",
    title: "Weekly digest",
    desc: "A weekly summary of activity in this class.",
  },
];

function parsePayload(payload: string): NotifPayload {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case "rank_changed":
      return <ShieldIcon size={13} />;
    case "compilation_completed":
      return <DocIcon />;
    case "member_kicked":
      return <XIcon size={13} />;
    case "member_banned":
      return <BanIcon size={13} />;
    case "member_unbanned":
      return <UnbanIcon size={13} />;
    case "class_invitation":
      return <MailIcon size={13} />;
    default:
      return <BellIcon />;
  }
}

function notifText(type: string, p: NotifPayload): string {
  switch (type) {
    case "rank_changed":
      return `Your role in ${p.className} changed to ${p.newRank}`;
    case "compilation_completed":
      return `New master doc for ${p.topicName} in ${p.className}`;
    case "member_kicked":
      return `${p.actorName} removed you from ${p.className}`;
    case "member_banned":
      return `${p.actorName} banned you from ${p.className}`;
    case "member_unbanned":
      return `${p.actorName} lifted your ban in ${p.className}`;
    case "class_invitation":
      return `${p.inviterName} invited you to ${p.className}`;
    default:
      return "New notification";
  }
}

export function NotificationBell({ classId }: { classId?: string }) {
  const [notifs, setNotifs] = useState<NotificationRow[] | null>(null);
  const [classPrefs, setClassPrefs] = useState<
    (ClassNotifPrefs & { className: string }) | null
  >(null);
  const [view, setView] = useState<"notifs" | "settings">("notifs");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function close() {
    setOpen(false);
    setView("notifs");
  }

  useEffect(() => {
    getNotifications().then(setNotifs);
  }, []);

  useEffect(() => {
    if (open && classId && classPrefs === null) {
      getClassNotifPrefs(classId).then(setClassPrefs);
    }
  }, [open, classId, classPrefs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setView("notifs");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleOpen() {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      const hasUnread = notifs?.some((n) => !n.readAt) ?? false;
      setNotifs(
        (n) =>
          n?.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })) ?? null,
      );
      if (hasUnread) markNotificationsRead().catch(() => {});
    } else {
      close();
    }
  }

  function handleClick(n: NotificationRow) {
    const p = parsePayload(n.payload);
    setOpen(false);
    setView("notifs");
    if (p.url) router.push(p.url);
  }

  async function toggleClassPref(key: keyof ClassNotifPrefs, value: boolean) {
    if (!classId) return;
    setClassPrefs((p) => (p ? { ...p, [key]: value } : p));
    await updateClassNotification(classId, key, value);
  }

  const hasUnread = notifs?.some((n) => !n.readAt) ?? false;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="icon-btn relative"
        title="Notifications"
        onClick={handleOpen}
      >
        <BellIcon />
        {hasUnread && (
          <span className="absolute top-1.25 right-1.5 w-1.75 h-1.75 rounded-full bg-(--accent) border-[1.5px] border-(--paper)" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-80 bg-(--paper-raised) border border-(--line-strong) rounded-[13px] shadow-[0_14px_34px_-12px_rgba(40,30,15,0.4)] overflow-hidden z-50"
          style={{ animation: "pop 0.13s ease" }}
        >
          {/* header */}
          <div className="flex items-center px-4 py-2.5 border-b border-(--line-soft) gap-2">
            <span className="text-[13px] font-semibold text-(--ink-heading) flex-1">
              Notifications
            </span>
            {classId && (
              <div className="flex items-center gap-0.5 bg-(--paper) border border-(--line-soft) rounded-lg p-0.5">
                <button
                  onClick={() => setView("notifs")}
                  className={`flex items-center gap-1.25 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-[background-color] ${view === "notifs" ? "bg-(--paper-raised) text-(--ink-heading) shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-(--ink-faint) hover:text-(--ink-nav)"}`}
                >
                  <BellIcon />
                  Feed
                </button>
                <button
                  onClick={() => setView("settings")}
                  className={`flex items-center gap-1.25 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-[background-color] ${view === "settings" ? "bg-(--paper-raised) text-(--ink-heading) shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-(--ink-faint) hover:text-(--ink-nav)"}`}
                >
                  <SettingsIcon />
                  Settings
                </button>
              </div>
            )}
          </div>

          {/* notifications feed */}
          {view === "notifs" &&
            (!notifs || notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-(--ink-faint)">
                No notifications yet
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {notifs.map((n) => {
                  const p = parsePayload(n.payload);
                  const unread = !n.readAt;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-(--line-soft) last:border-b-0 hover:bg-[rgba(60,45,25,0.04)] transition-[background-color] cursor-pointer${unread ? " bg-[rgba(196,121,24,0.04)]" : ""}`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 flex ${unread ? "text-(--accent)" : "text-(--ink-faint)"}`}
                      >
                        <NotifIcon type={n.type} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[13px] leading-snug m-0 ${unread ? "font-medium text-(--ink-heading)" : "text-(--ink-nav)"}`}
                        >
                          {notifText(n.type, p)}
                        </p>
                        <p className="text-[11.5px] text-(--ink-faint) m-0 mt-0.5">
                          {timeAgo(
                            n.createdAt instanceof Date
                              ? n.createdAt.toISOString()
                              : String(n.createdAt),
                          )}
                        </p>
                      </div>
                      {unread && (
                        <span className="mt-1.5 w-1.75 h-1.75 rounded-full bg-(--accent) shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

          {/* class notification settings */}
          {view === "settings" && classId && (
            <div className="max-h-96 overflow-y-auto">
              {!classPrefs ? (
                <div className="py-10 text-center text-sm text-(--ink-faint)">
                  Loading…
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-(--line-soft) bg-(--paper)">
                    <p className="text-[11.5px] text-(--ink-faint) m-0 leading-snug">
                      Email overrides for{" "}
                      <span className="font-medium text-(--ink-nav)">
                        {classPrefs.className}
                      </span>
                      . In-app notifications always appear regardless of these
                      settings.
                    </p>
                  </div>
                  {CLASS_NOTIF_ROWS.map(({ key, title, desc }) => (
                    <div
                      key={key}
                      className="flex items-center gap-3 px-4 py-3 border-b border-(--line-soft) last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-(--ink-heading) m-0 leading-snug">
                          {title}
                        </p>
                        <p className="text-[11.5px] text-(--ink-faint) m-0 mt-0.5">
                          {desc}
                        </p>
                      </div>
                      <Toggle
                        checked={classPrefs[key]}
                        onChange={(v) => toggleClassPref(key, v)}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
