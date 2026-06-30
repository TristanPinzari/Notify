"use client";

import Image from "next/image";
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
} from "@/server/actions/classes";
import { RANK_VALUE } from "@/server/db/schema";
import { initials } from "@/lib/format";
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
  ChevIcon,
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
const AV_PALETTE = [
  "#a85718",
  "#3a5fa8",
  "#3f7d52",
  "#7a4b86",
  "#9e3b32",
  "#2f7050",
  "#b06a1e",
  "#4b6a8a",
];

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemberRow = {
  userId: string;
  name: string;
  image: string | null;
  rank: Rank;
  joinedAt: string;
  contributions: number;
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

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length]!;
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

function RankBadge({ rank }: { rank: Rank }) {
  const styles: Record<Rank, { bg: string; border: string; color: string }> = {
    viewer: {
      bg: "rgba(60,45,25,0.07)",
      border: "rgba(60,45,25,0.10)",
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
  const s = styles[rank];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.75 rounded-full shrink-0 capitalize"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
    >
      {rank === "owner" && <CrownIcon size={10} />}
      {rank === "admin" && <ShieldIcon size={10} />}
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const vIdx = RANK_VALUE[viewerRank];
  const tIdx = RANK_VALUE[member.rank];
  const outranks = tIdx < vIdx && member.rank !== "owner";

  const showChangeRank = canChangeRank && outranks;
  const showKick = canKick && outranks;
  const showBan = canBan && outranks;

  if (!showChangeRank && !showKick && !showBan)
    return <span className="w-8 shrink-0" />;

  const assignable = RANKS.filter((r) => RANK_VALUE[r] < vIdx);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title="Manage member"
      >
        <DotsVerticalIcon size={18} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] w-48 bg-(--paper-raised) border border-(--line-strong) rounded-[11px] shadow-[0_14px_34px_-12px_rgba(40,30,15,0.4)] p-1.5 z-30"
          style={{ animation: "pop 0.13s ease" }}
        >
          {showChangeRank && (
            <>
              <div className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-(--ink-fainter) px-2.5 pt-1.5 pb-1">
                Change rank
              </div>
              {assignable.map((r) => (
                <button
                  key={r}
                  className="w-full flex items-center justify-between gap-2 bg-transparent border-none text-left text-sm text-(--ink-body) px-2.5 py-2 rounded-[7px] hover:bg-[rgba(60,45,25,0.05)] cursor-pointer transition-colors"
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
              className="w-full flex items-center gap-2 bg-transparent border-none text-left text-sm text-(--ink-body) px-2.5 py-2 rounded-[7px] hover:bg-[rgba(60,45,25,0.05)] cursor-pointer transition-colors"
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
              className="w-full flex items-center gap-2 bg-transparent border-none text-left text-sm px-2.5 py-2 rounded-[7px] hover:bg-(--danger-bg) cursor-pointer transition-colors"
              style={{ color: "var(--danger)" }}
              onClick={() => {
                setOpen(false);
                onBan();
              }}
            >
              <BanIcon size={15} />
              Ban member
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({
  member,
  isSelf,
  isLast,
  viewerRank,
  canKick,
  canBan,
  canChangeRank,
  onChangeRank,
  onKick,
  onBan,
}: {
  member: MemberRow;
  isSelf: boolean;
  isLast: boolean;
  viewerRank: Rank;
  canKick: boolean;
  canBan: boolean;
  canChangeRank: boolean;
  onChangeRank: (rank: Rank) => void;
  onKick: () => void;
  onBan: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 px-4.5 py-3.25 hover:bg-[rgba(60,45,25,0.025)] transition-colors ${!isLast ? "border-b border-(--line-soft)" : ""}`}
    >
      <Avatar name={member.name} image={member.image} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[14.5px] font-semibold text-(--ink-heading)">
          <span>{member.name}</span>
          {isSelf && (
            <span className="text-[10px] font-semibold text-(--ink-nav) bg-(--paper-deep) border border-(--line) px-1.5 py-px rounded-full">
              You
            </span>
          )}
        </div>
        <div className="text-xs text-(--ink-faint) mt-0.5">
          Joined {timeAgo(member.joinedAt)} · {member.contributions}{" "}
          contribution
          {member.contributions !== 1 ? "s" : ""}
        </div>
      </div>
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
  isLast,
  busy,
  onUnban,
  onInfo,
}: {
  banned: BannedRow;
  isLast: boolean;
  busy: boolean;
  onUnban: () => void;
  onInfo: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 px-4.5 py-3.25 ${!isLast ? "border-b border-(--line-soft)" : ""}`}
    >
      <Avatar name={banned.name} image={banned.image} size={40} faded />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-(--ink-nav)">
          {banned.name}
        </div>
        <div
          className="text-[12.5px] italic mt-0.5"
          style={{
            color: banned.reason ? "var(--ink-faint)" : "var(--ink-fainter)",
          }}
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
          <span className="spin" style={{ width: 12, height: 12 }} />
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
  onCopy,
}: {
  code: string;
  className: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-250 bg-(--paper-raised) rounded-3xl px-18 py-15 pb-14 text-center shadow-[0_34px_90px_-22px_rgba(0,0,0,0.55)] max-w-195 w-[calc(100vw-60px)]"
        style={{ animation: "pop 0.2s ease" }}
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
        <div
          className="font-mono font-medium text-(--ink-heading) mb-10 break-all"
          style={{
            fontSize: "clamp(48px, 10vw, 104px)",
            lineHeight: 1,
            letterSpacing: "0.1em",
          }}
        >
          {code}
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-[15px] font-semibold px-5.5 py-3 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
            onClick={onCopy}
          >
            <CopyIcon />
            Copy code
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
            className="inwrap w-full resize-none"
            style={{ height: 80 }}
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
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[9px] text-sm font-semibold py-2.5 cursor-pointer transition-all disabled:opacity-50"
            style={{
              background: "var(--danger-bg)",
              border: "1px solid var(--danger-soft)",
              color: "var(--danger)",
            }}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <span className="spin" style={{ width: 14, height: 14 }} />
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
            className="text-sm leading-[1.55] italic"
            style={{
              color: target.reason ? "var(--ink-body)" : "var(--ink-fainter)",
            }}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function MembersView({
  classId,
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
  const [bannedOpen, setBannedOpen] = useState(true);
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

  const canViewBanned = initialBanned !== null;
  const canRegen = viewerRank === "owner";

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]),
    [members],
  );

  const highlightSet = useMemo(
    () => (highlightMembers ? new Set(highlightMembers) : null),
    [highlightMembers],
  );

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
    const res = await regenerateCode(classId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setCode(res.code);
      toast.info("New code generated. Old invite links no longer work.");
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(code).catch(() => {});
    toast.success("Code copied to clipboard.");
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
        {canInvite && (
          <button
            className="inline-flex items-center gap-1.5 bg-(--accent) text-(--on-accent) border border-transparent rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:bg-(--accent-text) transition-colors cursor-pointer shrink-0"
            onClick={() => setShowCodeModal(true)}
          >
            <ShareIcon size={14} />
            Invite
          </button>
        )}
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
            <span
              className="w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent-text)",
              }}
            >
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
                <div
                  className="font-mono font-medium text-(--ink-heading)"
                  style={{ fontSize: 18, letterSpacing: "0.22em" }}
                >
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
            {canRegen && (
              <button
                className="inline-flex items-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold px-3.75 py-2.25 hover:border-(--line-strong) hover:text-(--ink-heading) transition-all cursor-pointer"
                onClick={handleRegen}
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
        </div>
      )}

      {/* Active members */}
      <div className="section-label flex items-center gap-2">
        <span>
          Members ·{" "}
          <span className="text-(--ink-fainter)">{members.length}</span>
        </span>
      </div>
      {highlightMembers && (
        <ContextFilterBar
          noun="member"
          count={highlightMembers.length}
          total={members.length}
          filterReason={filterReason ?? ""}
          exists={members.filter((m) => highlightSet!.has(m.userId)).length}
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
        {sortedMembers.length === 0 ? (
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
          sortedMembers
            .filter((m) => !highlightSet || highlightSet.has(m.userId))
            .map((m, i, arr) => (
              <MemberItem
                key={m.userId}
                member={m}
                isSelf={m.userId === viewerId}
                isLast={i === arr.length - 1}
                viewerRank={viewerRank}
                canKick={canKick}
                canBan={canBan}
                canChangeRank={canChangeRank}
                onChangeRank={(rank) =>
                  setRankChangeTarget({ member: m, rank })
                }
                onKick={() => setKickTarget(m)}
                onBan={() => setBanTarget(m)}
              />
            ))
        )}
      </div>

      {/* Banned section */}
      {canViewBanned && (
        <>
          <button
            className="flex items-center gap-2.5 mt-8.5 mb-3 cursor-pointer select-none bg-transparent border-none p-0"
            onClick={() => setBannedOpen((o) => !o)}
          >
            <span
              className="text-(--ink-fainter) flex transition-transform duration-200"
              style={{ transform: bannedOpen ? "rotate(90deg)" : undefined }}
            >
              <ChevIcon />
            </span>
            <div className="section-label mb-0! flex items-center gap-2">
              Banned{" "}
              {banned.length > 0 && (
                <span className="text-(--ink-fainter)">· {banned.length}</span>
              )}
            </div>
          </button>
          {bannedOpen && (
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
                banned.map((b, i) => (
                  <BannedItem
                    key={b.userId}
                    banned={b}
                    isLast={i === banned.length - 1}
                    busy={unbanBusyId === b.userId}
                    onUnban={() => handleUnban(b)}
                    onInfo={() => setBanInfoTarget(b)}
                  />
                ))
              )}
            </div>
          )}
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
          onCopy={copyCode}
        />
      )}
    </div>
  );
}
