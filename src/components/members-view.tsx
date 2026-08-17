"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ContextFilterBar } from "@/components/context-filter-bar";
import { toast } from "sonner";
import {
  kickFromClass,
  banFromClass,
  unbanFromClass,
  changeUserRank,
  regenerateCode,
  sendClassInvites,
} from "@/server/actions/classes";
import { RANK_VALUE } from "@/server/db/schema";
import { initials, avatarColor } from "@/lib/format";
import { MAX_INVITE_BATCH } from "@/lib/validation";
import type { Rank } from "@/server/db/schema";
import { timeAgo } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/use-escape-key";
import {
  ShareIcon,
  CopyIcon,
  RetryIcon,
  WarnIcon,
  InfoIcon,
  LockIcon,
  XIcon,
  CheckIcon,
  DotsVerticalIcon,
  BanIcon,
  UnbanIcon,
  CrownIcon,
  ShieldIcon,
  ExpandIcon,
  MembersIcon,
  MailIcon,
} from "@/components/icons";
import { ConfirmModal } from "@/components/confirm-modal";

// ─── Constants ───────────────────────────────────────────────────────────────

const RANKS: Rank[] = ["viewer", "contributor", "admin", "owner"];
const RANK_LABEL: Record<Rank, string> = {
  viewer: "Viewer",
  contributor: "Contributor",
  admin: "Admin",
  owner: "Owner",
};
const RANK_BADGE_STYLES: Record<
  Rank,
  { bg: string; border: string; color: string }
> = {
  viewer: {
    bg: "var(--line-soft)",
    border: "var(--line)",
    color: "var(--ink-nav)",
  },
  contributor: {
    bg: "rgba(58,95,168,0.1)",
    border: "rgba(58,95,168,0.2)",
    color: "#3a5fa8",
  },
  admin: {
    bg: "rgba(196,121,24,0.12)",
    border: "rgba(196,121,24,0.25)",
    color: "var(--accent-text)",
  },
  owner: {
    bg: "rgba(158,59,50,0.1)",
    border: "rgba(158,59,50,0.22)",
    color: "var(--danger)",
  },
};

// ─── Shared permission derivation ─────────────────────────────────────────────

function derivePermissions(
  viewerRank: Rank,
  memberRank: Rank,
  canChangeRank: boolean,
  canKick: boolean,
  canBan: boolean,
) {
  const vIdx = RANK_VALUE[viewerRank];
  const outranks = RANK_VALUE[memberRank] < vIdx && memberRank !== "owner";
  const showChangeRank = canChangeRank && outranks;
  const showKick = canKick && outranks;
  const showBan = canBan && outranks;
  return {
    vIdx,
    showChangeRank,
    showKick,
    showBan,
    showActions: showChangeRank || showKick || showBan,
    assignable: RANKS.filter((r) => RANK_VALUE[r] < vIdx),
  };
}
// ─── Types ───────────────────────────────────────────────────────────────────

export type MemberRow = {
  userId: string;
  name: string;
  image: string | null;
  email: string | null;
  rank: Rank;
  joinedAt: string;
  contributions: number;
  lastActive: string | null;
  sharedClasses: number;
};

export type BannedRow = {
  userId: string;
  name: string;
  image: string | null;
  reason: string | null;
  bannedAt: string;
  bannedById: string;
  bannedByName: string | null;
};

type Props = {
  classId: string;
  topicId?: string;
  className: string;
  classCode: string | null;
  viewerId: string;
  viewerRank: Rank;
  members: MemberRow[];
  banned: BannedRow[] | null;
  canInvite: boolean;
  canKick: boolean;
  canBan: boolean;
  canChangeRank: boolean;
  highlightMembers?: string[];
  filterReason?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function copyToClipboard(text: string, msg: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(msg))
    .catch(() => toast.error("Clipboard access denied."));
}

// ─── You pill ────────────────────────────────────────────────────────────────

function YouPill({ bg = "var(--paper-deep)" }: { bg?: string }) {
  return (
    <span
      className="text-[10px] font-semibold text-(--ink-nav) border border-(--line) px-1.5 py-px rounded-full"
      style={{ background: bg }}
    >
      You
    </span>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({
  name,
  image,
  size = 40,
  faded = false,
}: {
  name: string;
  image: string | null;
  size?: number;
  faded?: boolean;
}) {
  if (image) {
    return (
      <div
        className="rounded-full overflow-hidden shrink-0"
        style={{ width: size, height: size, opacity: faded ? 0.7 : 1 }}
      >
        <Image
          src={image}
          alt={name}
          width={size}
          height={size}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center text-white font-semibold"
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        fontSize: Math.round(size * 0.35),
        opacity: faded ? 0.7 : 1,
        filter: faded ? "grayscale(0.5)" : undefined,
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Rank badge ──────────────────────────────────────────────────────────────

function RankBadge({ rank, lg }: { rank: Rank; lg?: boolean }) {
  const s = RANK_BADGE_STYLES[rank];
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full shrink-0 capitalize ${lg ? "text-[12.5px] px-3 py-1.25" : "text-[11px] px-2 py-0.75"}`}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
    >
      {rank === "owner" && <CrownIcon size={lg ? 12 : 10} />}
      {rank === "admin" && <ShieldIcon size={lg ? 12 : 10} />}
      {RANK_LABEL[rank]}
    </span>
  );
}

// ─── Action menu ─────────────────────────────────────────────────────────────

const RANK_DOT: Record<Rank, string> = {
  viewer: "#9a9182",
  contributor: "#3a5fa8",
  admin: "#c47918",
  owner: "#9e3b32",
};

function ActionMenu({
  member,
  viewerRank,
  canKick,
  canBan,
  canChangeRank,
  onChangeRank,
  onKick,
  onBan,
}: {
  member: MemberRow;
  viewerRank: Rank;
  canKick: boolean;
  canBan: boolean;
  canChangeRank: boolean;
  onChangeRank: (rank: Rank) => void;
  onKick: () => void;
  onBan: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const { showChangeRank, showKick, showBan, showActions, assignable } =
    derivePermissions(viewerRank, member.rank, canChangeRank, canKick, canBan);

  if (!showActions) return <span className="w-8 shrink-0" />;

  function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        className="icon-btn"
        onClick={handleOpen}
        title="Manage member"
      >
        <DotsVerticalIcon size={18} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed w-48 bg-(--paper-raised) border border-(--line-strong) rounded-[11px] shadow-[0_14px_34px_-12px_rgba(40,30,15,0.4)] p-1.5 z-200 animate-[pop_0.13s_ease]"
            style={{
              top: pos.top,
              right: pos.right,
            }}
          >
            {showChangeRank && (
              <>
                <div className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-(--ink-fainter) px-2.5 pt-1.5 pb-1">
                  Change rank
                </div>
                {assignable.map((r) => (
                  <button
                    key={r}
                    className="w-full flex items-center justify-between gap-2 bg-transparent border-none text-left text-sm text-(--ink-body) px-2.5 py-2 rounded-[7px] hover:bg-(--bg-hover) cursor-pointer transition-colors"
                    onClick={() => {
                      setOpen(false);
                      onChangeRank(r);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: RANK_DOT[r] }}
                      />
                      {RANK_LABEL[r]}
                    </span>
                    {r === member.rank && <CheckIcon size={13} />}
                  </button>
                ))}
              </>
            )}
            {showChangeRank && (showKick || showBan) && (
              <div className="h-px bg-(--line-soft) mx-1 my-1.5" />
            )}
            {showKick && (
              <button
                className="w-full flex items-center gap-2 bg-transparent border-none text-left text-sm text-(--ink-body) px-2.5 py-2 rounded-[7px] hover:bg-(--bg-hover) cursor-pointer transition-colors"
                onClick={() => {
                  setOpen(false);
                  onKick();
                }}
              >
                <LockIcon />
                Remove from class
              </button>
            )}
            {showBan && (
              <button
                className="w-full flex items-center gap-2 bg-transparent border-none text-left text-sm text-(--danger) px-2.5 py-2 rounded-[7px] hover:bg-(--danger-bg) cursor-pointer transition-colors"
                onClick={() => {
                  setOpen(false);
                  onBan();
                }}
              >
                <BanIcon size={15} />
                Ban member
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({
  member,
  isTopicView,
  isSelf,
  viewerRank,
  canKick,
  canBan,
  canChangeRank,
  onChangeRank,
  onKick,
  onBan,
  onOpenProfile,
}: {
  member: MemberRow;
  isTopicView: boolean;
  isSelf: boolean;
  viewerRank: Rank;
  canKick: boolean;
  canBan: boolean;
  canChangeRank: boolean;
  onChangeRank: (rank: Rank) => void;
  onKick: () => void;
  onBan: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4.5 py-3.25 hover:bg-(--bg-hover-soft) transition-[background-color] border-b border-(--line-soft) last:border-b-0">
      <button
        className="flex items-center gap-3.5 flex-1 min-w-0 bg-transparent border-none text-left p-0 cursor-pointer"
        onClick={onOpenProfile}
      >
        <Avatar name={member.name} image={member.image} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-(--ink-heading)">
            <span>{member.name}</span>
            {isSelf && <YouPill />}
          </div>
          <div className="text-xs text-(--ink-faint) mt-0.5">
            Joined {timeAgo(member.joinedAt)} · {member.contributions}{" "}
            {isTopicView ? "topic" : "class"} contribution
            {member.contributions !== 1 ? "s" : ""}
          </div>
        </div>
      </button>
      <RankBadge rank={member.rank} />
      <ActionMenu
        member={member}
        viewerRank={viewerRank}
        canKick={canKick}
        canBan={canBan}
        canChangeRank={canChangeRank}
        onChangeRank={onChangeRank}
        onKick={onKick}
        onBan={onBan}
      />
    </div>
  );
}

// ─── Banned row ───────────────────────────────────────────────────────────────

function BannedItem({
  banned,
  busy,
  onUnban,
  onInfo,
}: {
  banned: BannedRow;
  busy: boolean;
  onUnban: () => void;
  onInfo: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4.5 py-3.25 border-b border-(--line-soft) last:border-b-0">
      <Avatar name={banned.name} image={banned.image} size={40} faded />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-(--ink-nav)">
          {banned.name}
        </div>
        <div
          className={`text-[12.5px] italic mt-0.5 ${banned.reason ? "text-(--ink-faint)" : "text-(--ink-fainter)"}`}
        >
          {banned.reason ?? "No reason given"}
        </div>
      </div>
      <button className="ibtn ibtn-edit shrink-0" onClick={onInfo}>
        <InfoIcon />
        Details
      </button>
      <button
        className="ibtn ibtn-edit shrink-0"
        disabled={busy}
        onClick={onUnban}
      >
        {busy ? (
          <span className="spin w-3 h-3 border-t-(--accent)" />
        ) : (
          <UnbanIcon size={13} />
        )}
        Unban
      </button>
    </div>
  );
}

// ─── Code display modal ───────────────────────────────────────────────────────

function CodeModal({
  code,
  className,
  onClose,
}: {
  code: string;
  className: string;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-250 bg-(--paper-raised) border border-(--line-strong) rounded-3xl px-18 py-15 pb-14 text-center shadow-[0_34px_90px_-22px_rgba(0,0,0,0.55)] max-w-195 w-[calc(100vw-60px)] animate-[pop_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close absolute top-5 right-6"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon />
        </button>
        <div className="font-mono text-[13px] tracking-[0.16em] uppercase text-(--accent-text) mb-8">
          Join {className}
        </div>
        <div className="text-[17px] text-(--ink-faint) mb-2.5">Class code</div>
        <div className="font-mono font-medium text-(--ink-heading) mb-10 break-all text-[clamp(48px,10vw,104px)] leading-none tracking-widest">
          {code}
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-[15px] font-semibold px-5.5 py-3 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
            onClick={() => copyToClipboard(code, "Code copied to clipboard.")}
          >
            <CopyIcon />
            Copy code
          </button>
          <button
            className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-[15px] font-semibold px-5.5 py-3 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
            onClick={() =>
              copyToClipboard(
                `${window.location.origin}/home?code=${code}`,
                "Invite link copied to clipboard.",
              )
            }
          >
            <ShareIcon size={15} />
            Copy link
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Ban modal ────────────────────────────────────────────────────────────────

function BanModal({
  target,
  reason,
  pending,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  target: MemberRow;
  reason: string;
  pending: boolean;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Ban {target.name}?</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-sm text-(--ink-faint) mb-4 mt-0 leading-normal">
          {`This member will be removed from the class and won't be able to
          rejoin. You can unban them later.`}
        </p>
        <div className="field">
          <label className="label">Reason (optional)</label>
          <textarea
            className="inwrap w-full resize-none h-20"
            placeholder="e.g. Uploading irrelevant documents"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={500}
          />
        </div>
        {reason.length > 400 && (
          <div className="text-[11.5px] text-(--ink-fainter) text-right mt-1 mb-2">
            {reason.length}/500
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold py-2.5 hover:border-(--line-strong) transition-all cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[9px] text-sm font-semibold py-2.5 cursor-pointer transition-all disabled:opacity-50 bg-(--danger-bg) border border-(--danger-soft) text-(--danger)"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <span className="spin w-3.5 h-3.5 border-t-(--danger)" />
            ) : (
              <BanIcon size={14} />
            )}
            Ban member
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Ban info modal ───────────────────────────────────────────────────────────

function BanInfoModal({
  target,
  viewerId,
  onClose,
}: {
  target: BannedRow;
  viewerId: string;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Ban details</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={target.name} image={target.image} size={44} faded />
          <div>
            <div className="text-[15px] font-semibold text-(--ink-heading)">
              {target.name}
            </div>
            <div className="text-xs text-(--ink-faint) mt-0.5">
              Banned {timeAgo(target.bannedAt)}
              {(target.bannedById || target.bannedByName) && (
                <>
                  {" "}
                  · by{" "}
                  {target.bannedById === viewerId ? "you" : target.bannedByName}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="field">
          <label className="label">Reason</label>
          <div
            className={`text-sm leading-[1.55] italic ${target.reason ? "text-(--ink-body)" : "text-(--ink-fainter)"}`}
          >
            {target.reason ?? "No reason was provided."}
          </div>
        </div>
        <button
          className="mt-5 w-full inline-flex items-center justify-center bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold py-2.5 hover:border-(--line-strong) transition-all cursor-pointer"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
}

// ─── Profile modal ────────────────────────────────────────────────────────────

function ProfileModal({
  member,
  isSelf,
  isTopicView,
  viewerRank,
  canKick,
  canBan,
  canChangeRank,
  onClose,
  onKick,
  onBan,
  onChangeRank,
}: {
  member: MemberRow;
  isSelf: boolean;
  isTopicView: boolean;
  viewerRank: Rank;
  canKick: boolean;
  canBan: boolean;
  canChangeRank: boolean;
  onClose: () => void;
  onKick: () => void;
  onBan: () => void;
  onChangeRank: (rank: Rank) => void;
}) {
  useEscapeKey(onClose);

  const { showChangeRank, showKick, showBan, showActions, assignable } =
    derivePermissions(viewerRank, member.rank, canChangeRank, canKick, canBan);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-250 w-[calc(100vw-48px)] max-w-100 bg-(--paper-raised) border border-(--line-strong) rounded-[20px] shadow-[0_34px_90px_-22px_rgba(0,0,0,0.55)] overflow-hidden animate-[pop_0.18s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6.5 pt-7.5 pb-5 text-center bg-(--paper-deep) border-b border-(--line)">
          <button
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-[9px] flex items-center justify-center text-(--ink-fainter) hover:bg-(--line) hover:text-(--ink-nav) transition-all cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={17} />
          </button>
          <div className="flex justify-center mb-3.5">
            <Avatar name={member.name} image={member.image} size={68} />
          </div>
          <div className="flex items-center justify-center gap-2.5 font-semibold text-xl text-(--ink-heading) mb-2.5">
            <span>{member.name}</span>
            {isSelf && <YouPill bg="var(--paper-raised)" />}
          </div>
          <div className="flex justify-center mb-3">
            <RankBadge rank={member.rank} lg />
          </div>
          {(canKick || canBan) && member.email && (
            <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-(--ink-faint)">
              <MailIcon size={13} />
              {member.email}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2">
          <div className="bg-(--paper-raised) px-5 py-4 text-center border-r border-(--line-soft)">
            <div className="font-semibold text-[26px] text-(--ink-heading) leading-none mb-1.5">
              {member.contributions}
            </div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-(--ink-fainter)">
              {isTopicView ? "Topic contributions" : "Class contributions"}
            </div>
          </div>
          <div className="bg-(--paper-raised) px-5 py-4 text-center">
            <div className="font-semibold text-[26px] text-(--ink-heading) leading-none mb-1.5">
              {member.sharedClasses}
            </div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-(--ink-fainter)">
              {isSelf ? "Classes" : "Shared classes"}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6.5 py-5 flex flex-col gap-4">
          <div className="flex justify-between items-center text-[13px] pb-4 border-b border-(--line-soft)">
            <span className="text-(--ink-faint)">Joined</span>
            <span className="font-medium text-(--ink-heading)">
              {new Date(member.joinedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between items-center text-[13px]">
            <span
              className="text-(--ink-faint)"
              title="Based on contribution uploads, topic creations, and compilations triggered"
            >
              Last active
            </span>
            <span className="font-medium text-(--ink-heading)">
              {member.lastActive ? timeAgo(member.lastActive) : "—"}
            </span>
          </div>
          {(showActions || isSelf) && (
            <>
              <div className="border-t border-(--line-soft)" />
              {showChangeRank && (
                <div>
                  <div className="text-[11.5px] text-(--ink-faint) mb-2">
                    Change rank
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assignable.map((r) => (
                      <button
                        key={r}
                        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.75 py-1.5 rounded-full border transition-all cursor-pointer ${
                          r === member.rank
                            ? "bg-(--accent-soft) text-(--accent-text)"
                            : "bg-(--paper-deep) border-(--line) text-(--ink-nav) hover:border-(--line-strong)"
                        }`}
                        onClick={() => onChangeRank(r)}
                      >
                        <span
                          className="w-1.75 h-1.75 rounded-full shrink-0"
                          style={{ background: RANK_DOT[r] }}
                        />
                        {RANK_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(showKick || showBan) && (
                <div className="flex gap-2">
                  {showKick && (
                    <button
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold py-2.25 hover:border-(--line-strong) transition-all cursor-pointer"
                      onClick={onKick}
                    >
                      <LockIcon />
                      Remove
                    </button>
                  )}
                  {showBan && (
                    <button
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-(--danger-bg) border border-(--danger-soft) text-(--danger) rounded-[9px] text-sm font-semibold py-2.25 cursor-pointer transition-all"
                      onClick={onBan}
                    >
                      <BanIcon size={14} />
                      Ban
                    </button>
                  )}
                </div>
              )}
              {isSelf && (
                <p className="text-[12px] text-(--ink-fainter) text-center m-0">
                  This is you — manage your account from Settings.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MembersView({
  classId,
  topicId,
  className,
  classCode,
  viewerId,
  viewerRank,
  members: initialMembers,
  banned: initialBanned,
  canInvite,
  canKick,
  canBan,
  canChangeRank,
  highlightMembers,
  filterReason,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [members, setMembers] = useState(initialMembers);
  const [banned, setBanned] = useState<BannedRow[]>(initialBanned ?? []);
  const [code, setCode] = useState(classCode ?? "");
  const [unbanBusyId, setUnbanBusyId] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<MemberRow | null>(null);
  const [kickPending, setKickPending] = useState(false);
  const [rankChangeTarget, setRankChangeTarget] = useState<{
    member: MemberRow;
    rank: Rank;
  } | null>(null);
  const [rankChangePending, setRankChangePending] = useState(false);
  const [banTarget, setBanTarget] = useState<MemberRow | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banInfoTarget, setBanInfoTarget] = useState<BannedRow | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [banPending, setBanPending] = useState(false);
  const [regenPending, setRegenPending] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [profileMember, setProfileMember] = useState<MemberRow | null>(null);

  const canViewBanned = initialBanned !== null;
  const canRegen = viewerRank === "owner";

  const [sort, setSort] = useState<"rank" | "newest" | "oldest">("rank");

  const highlightSet = useMemo(
    () => (highlightMembers ? new Set(highlightMembers) : null),
    [highlightMembers],
  );

  const filteredMembers = useMemo(() => {
    const visible = highlightSet
      ? members.filter((m) => highlightSet.has(m.userId))
      : members;
    const copy = [...visible];
    if (sort === "rank")
      return copy.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const dir = sort === "newest" ? -1 : 1;
    return copy.sort((a, b) => dir * a.joinedAt.localeCompare(b.joinedAt));
  }, [members, highlightSet, sort]);

  async function handleKickConfirm() {
    if (!kickTarget) return;
    setKickPending(true);
    const res = await kickFromClass(classId, kickTarget.userId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setMembers((ms) => ms.filter((m) => m.userId !== kickTarget.userId));
      toast.success(`${kickTarget.name} was removed from the class.`);
      setKickTarget(null);
    }
    setKickPending(false);
  }

  async function handleBanConfirm() {
    if (!banTarget) return;
    setBanPending(true);
    const res = await banFromClass(
      classId,
      banTarget.userId,
      banReason.trim() || undefined,
    );
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setMembers((ms) => ms.filter((m) => m.userId !== banTarget.userId));
      setBanned((bs) => [
        {
          userId: banTarget.userId,
          name: banTarget.name,
          image: banTarget.image,
          reason: banReason.trim() || null,
          bannedAt: new Date().toISOString(),
          bannedById: viewerId,
          bannedByName: null,
        },
        ...bs,
      ]);
      toast.success(`${banTarget.name} has been banned.`);
      setBanTarget(null);
      setBanReason("");
    }
    setBanPending(false);
  }

  async function handleUnban(b: BannedRow) {
    setUnbanBusyId(b.userId);
    const res = await unbanFromClass(classId, b.userId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setBanned((bs) => bs.filter((x) => x.userId !== b.userId));
      toast.success(`${b.name} can now rejoin the class.`);
    }
    setUnbanBusyId(null);
  }

  async function handleRankChangeConfirm() {
    if (!rankChangeTarget) return;
    const { member, rank } = rankChangeTarget;
    setRankChangePending(true);
    const res = await changeUserRank(classId, member.userId, rank);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setMembers((ms) =>
        ms.map((m) => (m.userId === member.userId ? { ...m, rank } : m)),
      );
      toast.success(`${member.name} is now ${RANK_LABEL[rank]}.`);
      setRankChangeTarget(null);
    }
    setRankChangePending(false);
  }

  async function handleRegen() {
    if (regenPending) return;
    setRegenPending(true);
    const res = await regenerateCode(classId);
    setRegenPending(false);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setCode(res.code);
      toast.info("New code generated. Old invite links no longer work.");
    }
  }

  async function handleSendInvites() {
    const raw = emailInput
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (raw.length === 0) return;
    if (raw.length > MAX_INVITE_BATCH) {
      toast.error(
        `You can invite at most ${MAX_INVITE_BATCH} people at a time.`,
      );
      return;
    }
    setSending(true);
    const res = await sendClassInvites(classId, raw);
    setSending(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setEmailInput("");
    if (res.banned > 0)
      toast.error(
        `${res.banned} recipient${res.banned !== 1 ? "s are" : " is"} banned from this class.`,
      );
    if (res.sent === 0) {
      if (res.banned === 0) {
        toast.info(
          res.skipped > 0
            ? "All recipients are already members or were recently invited."
            : "No valid emails found.",
        );
      }
    } else {
      const s = (n: number) => (n !== 1 ? "s" : "");
      toast.success(
        `Invite${s(res.sent)} sent to ${res.sent} recipient${s(res.sent)}.${res.skipped > 0 ? ` ${res.skipped} skipped.` : ""}`,
      );
    }
  }

  function copyCode() {
    copyToClipboard(code, "Code copied to clipboard.");
  }

  function copyLink() {
    copyToClipboard(
      `${window.location.origin}/home?code=${code}`,
      "Invite link copied to clipboard.",
    );
  }

  return (
    <div className="pane">
      {/* Header */}
      <div className="pane-head">
        <div>
          <div className="kicker">Members</div>
          <h1 className="pane-title">{className}</h1>
          <p className="pane-desc">
            Everyone here can read and contribute to class collections. Roles
            control who can manage the class.
          </p>
        </div>
      </div>

      {/* Low rank banner */}
      {!canInvite && (
        <div className="flex items-start gap-3 bg-(--paper-raised) border border-dashed border-(--line-strong) rounded-xl p-4 mb-6 text-sm leading-normal text-(--ink-faint)">
          <span className="mt-px shrink-0 text-(--ink-fainter)">
            <LockIcon />
          </span>
          <span>
            You&apos;re a{" "}
            <strong className="text-(--ink-nav) font-semibold">
              {RANK_LABEL[viewerRank]}
            </strong>{" "}
            in this class. Inviting and managing members is handled by higher
            ranked members.
          </span>
        </div>
      )}

      {/* Invite card */}
      {canInvite && (
        <div className="bg-(--paper-raised) border border-(--line) rounded-[14px] p-5 mb-8">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 bg-(--accent-soft) text-(--accent-text)">
              <ShareIcon size={17} />
            </span>
            <div>
              <h3 className="text-[14.5px] font-semibold text-(--ink-heading) m-0">
                Invite classmates
              </h3>
              <div className="text-xs text-(--ink-faint) mt-0.5">
                Share the code with your classmates
              </div>
            </div>
          </div>
          <div className="flex items-stretch gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-(--paper-deep) border border-(--line) rounded-[10px] py-2 pl-3.5 pr-3">
              <div>
                <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-(--ink-fainter)">
                  Code
                </div>
                <div className="font-mono font-medium text-(--ink-heading) text-[18px] tracking-[0.22em]">
                  {code}
                </div>
              </div>
            </div>
            <button
              className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
              onClick={() => setShowCodeModal(true)}
            >
              <ExpandIcon size={14} />
              Display
            </button>
            <button
              className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
              onClick={copyCode}
            >
              <CopyIcon />
              Copy code
            </button>
            <button
              className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
              onClick={copyLink}
            >
              <ShareIcon size={14} />
              Copy link
            </button>
            {canRegen && (
              <button
                className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRegen}
                disabled={regenPending}
              >
                <RetryIcon />
                Regenerate
              </button>
            )}
          </div>
          <div className="flex items-start gap-1.5 text-[11.5px] text-(--ink-faint) mt-3 leading-[1.4]">
            {canRegen ? (
              <>
                <span className="mt-px shrink-0">
                  <WarnIcon size={13} />
                </span>
                <span>
                  Regenerating creates a new code and{" "}
                  <strong className="text-(--ink-nav) font-semibold">
                    invalidates all existing invite links.
                  </strong>
                </span>
              </>
            ) : (
              <>
                <span className="mt-px shrink-0">
                  <InfoIcon />
                </span>
                <span>
                  Only the class{" "}
                  <strong className="text-(--ink-nav) font-semibold">
                    owner
                  </strong>{" "}
                  can regenerate the code.
                </span>
              </>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-(--line-soft)">
            <div className="text-[12px] font-medium text-(--ink-faint) mb-2">
              Invite by email
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !sending && handleSendInvites()
                }
                placeholder="student@email.com, another@email.com"
                className="flex-1 bg-(--paper-deep) border border-(--line) rounded-[10px] py-2.25 px-3.5 text-[13.5px] text-(--ink-body) placeholder:text-(--ink-fainter) outline-none focus:border-(--accent)"
              />
              <button
                onClick={handleSendInvites}
                disabled={!emailInput.trim() || sending}
                className="inline-flex items-center gap-1.5 bg-(--accent) text-(--on-accent) border border-transparent rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:bg-(--accent-text) transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {sending ? <span className="mini-spin" /> : <MailIcon />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active members */}
      <div className="section-label flex items-center gap-2">
        <span>
          Members ·{" "}
          <span className="text-(--ink-fainter)">{members.length}</span>
        </span>
        <div className="sortseg ml-auto">
          {(
            [
              ["rank", "Rank"],
              ["newest", "Newest"],
              ["oldest", "Oldest"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={sort === key ? "on" : ""}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {highlightMembers && (
        <ContextFilterBar
          noun="member"
          count={highlightMembers.length}
          total={members.length}
          filterReason={filterReason ?? ""}
          exists={filteredMembers.length}
          onClear={() => {
            const p = new URLSearchParams(searchParams);
            p.delete("members");
            p.delete("reason");
            router.replace(pathname + (p.size ? `?${p}` : ""), {
              scroll: false,
            });
          }}
        />
      )}
      <div className="bg-(--paper-raised) border border-(--line) rounded-[14px] overflow-visible">
        {filteredMembers.length === 0 ? (
          <div className="py-10 px-7 text-center">
            <div className="w-11.5 h-11.5 rounded-xl bg-(--paper-deep) text-(--ink-fainter) flex items-center justify-center mx-auto mb-3.5">
              <MembersIcon />
            </div>
            <h4 className="text-[15px] font-semibold text-(--ink-heading) m-0 mb-1.5">
              It&apos;s just you so far
            </h4>
            <p className="text-sm text-(--ink-faint) m-0 max-w-75 mx-auto leading-normal">
              {canInvite
                ? "Share the invite code above to bring your classmates in."
                : "Classmates you study with will appear here once they join."}
            </p>
          </div>
        ) : (
          <div className="max-h-100 overflow-y-auto">
            {filteredMembers.map((m) => (
              <MemberItem
                key={m.userId}
                member={m}
                isTopicView={!!topicId}
                isSelf={m.userId === viewerId}
                viewerRank={viewerRank}
                canKick={canKick}
                canBan={canBan}
                canChangeRank={canChangeRank}
                onChangeRank={(rank) =>
                  setRankChangeTarget({ member: m, rank })
                }
                onKick={() => setKickTarget(m)}
                onBan={() => setBanTarget(m)}
                onOpenProfile={() => setProfileMember(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Banned section */}
      {canViewBanned && (
        <>
          <div className="section-label mt-8.5! mb-3 flex items-center gap-2">
            Banned{" "}
            {banned.length > 0 && (
              <span className="text-(--ink-fainter)">· {banned.length}</span>
            )}
          </div>
          <div className="bg-(--paper-raised) border border-(--line) rounded-[14px] overflow-hidden">
            {banned.length === 0 ? (
              <div className="py-10 px-7 text-center">
                <div className="w-11.5 h-11.5 rounded-xl bg-(--paper-deep) text-(--ink-fainter) flex items-center justify-center mx-auto mb-3.5">
                  <BanIcon size={22} />
                </div>
                <h4 className="text-[15px] font-semibold text-(--ink-heading) m-0 mb-1.5">
                  No one is banned
                </h4>
                <p className="text-sm text-(--ink-faint) m-0 max-w-75 mx-auto leading-normal">
                  Banned members can&apos;t rejoin, even with an invite code.
                </p>
              </div>
            ) : (
              <div className="max-h-100 overflow-y-auto">
                {banned.map((b) => (
                  <BannedItem
                    key={b.userId}
                    banned={b}
                    busy={unbanBusyId === b.userId}
                    onUnban={() => handleUnban(b)}
                    onInfo={() => setBanInfoTarget(b)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Kick confirm modal */}
      {kickTarget && (
        <ConfirmModal
          title={`Remove ${kickTarget.name}?`}
          description="This member will lose access to the class immediately. They can rejoin with an invite code."
          confirmLabel="Remove"
          confirmIcon={<LockIcon />}
          danger
          pending={kickPending}
          onConfirm={handleKickConfirm}
          onClose={() => setKickTarget(null)}
        />
      )}

      {/* Rank change confirm modal */}
      {rankChangeTarget && (
        <ConfirmModal
          title={`Change rank to ${RANK_LABEL[rankChangeTarget.rank]}?`}
          description={`${rankChangeTarget.member.name} will gain the permissions associated with ${RANK_LABEL[rankChangeTarget.rank]}.`}
          confirmLabel="Confirm"
          confirmIcon={<CheckIcon size={14} />}
          pending={rankChangePending}
          onConfirm={handleRankChangeConfirm}
          onClose={() => setRankChangeTarget(null)}
        />
      )}

      {/* Ban modal */}
      {banTarget && (
        <BanModal
          target={banTarget}
          reason={banReason}
          pending={banPending}
          onReasonChange={setBanReason}
          onConfirm={handleBanConfirm}
          onClose={() => {
            setBanTarget(null);
            setBanReason("");
          }}
        />
      )}

      {/* Ban info modal */}
      {banInfoTarget && (
        <BanInfoModal
          target={banInfoTarget}
          viewerId={viewerId}
          onClose={() => setBanInfoTarget(null)}
        />
      )}

      {/* Code display modal */}
      {showCodeModal && (
        <CodeModal
          code={code}
          className={className}
          onClose={() => setShowCodeModal(false)}
        />
      )}

      {/* Profile modal */}
      {profileMember && (
        <ProfileModal
          member={profileMember}
          isSelf={profileMember.userId === viewerId}
          isTopicView={!!topicId}
          viewerRank={viewerRank}
          canKick={canKick}
          canBan={canBan}
          canChangeRank={canChangeRank}
          onClose={() => setProfileMember(null)}
          onKick={() => {
            setKickTarget(profileMember);
            setProfileMember(null);
          }}
          onBan={() => {
            setBanTarget(profileMember);
            setProfileMember(null);
          }}
          onChangeRank={(rank) => {
            setRankChangeTarget({ member: profileMember, rank });
            setProfileMember(null);
          }}
        />
      )}
    </div>
  );
}
