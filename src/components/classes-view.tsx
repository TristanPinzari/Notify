"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  ClockIcon,
  HomeIcon,
  LayersIcon,
  MembersIcon,
  PlusIcon,
} from "@/components/icons";
import { timeAgo } from "@/lib/utils";
import { ClassModal } from "@/components/class-modal";
import type { Rank } from "@/server/db/schema";

type ClassRow = {
  id: string;
  name: string;
  rank: Rank;
  topicCount: number;
  memberCount: number;
  yourContributions: number;
  lastActivity: string | null;
};

type Sort = "recent" | "activity" | "az";

const RANK_LABEL: Record<Rank, string> = {
  owner: "Owner",
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
};

function ClassCard({ c }: { c: ClassRow }) {
  const isViewer = c.rank === "viewer";
  return (
    <Link href={`/home/${c.id}`} className="tcard">
      <div className="t-top">
        <h3 className="t-name">{c.name}</h3>
        <span className={`c-rank${isViewer ? " viewer" : ""}`}>
          {RANK_LABEL[c.rank]}
        </span>
      </div>
      <div className="t-foot">
        <div className="t-meta">
          <span className="t-stat">
            <LayersIcon />
            <b>{c.topicCount}</b> {c.topicCount !== 1 ? "topics" : "topic"}
          </span>
          <span className="t-stat">
            <MembersIcon />
            <b>{c.memberCount}</b> {c.memberCount !== 1 ? "members" : "member"}
          </span>
          {c.lastActivity && (
            <span
              className="t-stat"
              title="Time since last upload or compilation"
            >
              <ClockIcon />
              {timeAgo(c.lastActivity)}
            </span>
          )}
        </div>
      </div>
      {c.yourContributions > 0 ? (
        <div className="t-younote you">
          <CheckIcon size={12} />
          You made <b>{c.yourContributions}</b>{" "}
          {c.yourContributions !== 1 ? "contributions" : "contribution"}
        </div>
      ) : (
        <div className="t-younote">
          <PlusIcon />
          You haven&apos;t made any contributions yet
        </div>
      )}
    </Link>
  );
}

export default function ClassesView({ classes }: { classes: ClassRow[] }) {
  const [sort, setSort] = useState<Sort>("recent");
  const [showModal, setShowModal] = useState(false);
  const isEmpty = classes.length === 0;

  const sorted = useMemo(() => {
    const arr = [...classes];
    if (sort === "az") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "activity")
      arr.sort((a, b) => b.memberCount - a.memberCount);
    return arr;
  }, [classes, sort]);

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <div className="kicker">Classes</div>
          <h1 className="pane-title">Your classes</h1>
          <p className="pane-desc">
            Each class is its own space — a collection of topics your group
            compiles into shared notes.
          </p>
        </div>
        {!isEmpty && (
          <button
            className="btn btn-primary shrink-0 mt-1"
            onClick={() => setShowModal(true)}
          >
            <PlusIcon />
            Add a class
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center text-center px-7 py-13.5 bg-(--paper-raised) border border-(--line) rounded-2xl">
          <span className="w-13.5 h-13.5 rounded-[14px] bg-(--paper-deep) text-(--ink-fainter) flex items-center justify-center mb-4">
            <HomeIcon />
          </span>
          <h4 className="text-[17px] font-semibold text-(--ink-heading) m-0 mb-1.5">
            No classes yet
          </h4>
          <p className="text-[13.5px] text-(--ink-faint) m-0 mb-5 max-w-85 leading-[1.55]">
            Join a class with an invite link or code, or create one to get
            started.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            <PlusIcon />
            Add a class
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <span className="tlabel">
              {classes.length} {classes.length !== 1 ? "classes" : "class"}
            </span>
            <span className="flex-1" />
            <div className="sortseg">
              {(
                [
                  ["recent", "Recent"],
                  ["activity", "Most members"],
                  ["az", "A–Z"],
                ] as [Sort, string][]
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
          <div className="topics-grid">
            {sorted.map((c) => (
              <ClassCard key={c.id} c={c} />
            ))}
            <button className="tcard create" onClick={() => setShowModal(true)}>
              <span className="cic">
                <PlusIcon />
              </span>
              <span className="ct">Add a class</span>
            </button>
          </div>
        </>
      )}

      {showModal && <ClassModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
