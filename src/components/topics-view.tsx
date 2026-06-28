"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { TopicModal } from "@/components/topic-modal";
import {
  CheckIcon,
  CollectionIcon,
  LayersIcon,
  LockIcon,
  MembersIcon,
  PlusIcon,
} from "@/components/icons";

type Topic = {
  id: string;
  name: string;
  createdAt: string;
  sources: number;
  contributors: number;
  yourContributions: number;
  status: "compiling" | "ready" | "failed" | "draft";
  uncompiled: number;
};

type Sort = "recent" | "activity" | "az";

type Props = {
  classId: string;
  className: string;
  topics: Topic[];
  canCreate: boolean;
};

function StatusBadge({ status }: { status: Topic["status"] }) {
  if (status === "compiling") {
    return (
      <span className="t-status compiling">
        <span className="t-pulse" />
        Compiling
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="t-status ready">
        <CheckIcon size={11} />
        Doc ready
      </span>
    );
  }
  return <span className="t-status draft">Not compiled</span>;
}

function TopicCard({ t, classId }: { t: Topic; classId: string }) {
  return (
    <Link href={`/home/${classId}/${t.id}`} className="tcard">
      <div className="t-top">
        <h3 className="t-name">{t.name}</h3>
        <StatusBadge status={t.status} />
      </div>
      <div className="t-foot">
        <div className="t-meta">
          <span className="t-stat">
            <CollectionIcon />
            <b>{t.sources}</b> {t.sources !== 1 ? "sources" : "source"}
          </span>
          <span className="t-stat">
            <MembersIcon />
            <b>{t.contributors}</b>{" "}
            {t.contributors !== 1 ? "contributors" : "contributor"}
          </span>
          {t.uncompiled > 0 && t.status !== "compiling" && (
            <span className="t-newpill">{t.uncompiled} uncompiled</span>
          )}
        </div>
      </div>
      {t.yourContributions > 0 ? (
        <div className="t-younote you">
          <CheckIcon size={12} />
          You added <b>{t.yourContributions}</b>{" "}
          {t.yourContributions !== 1 ? "sources" : "source"}
        </div>
      ) : (
        <div className="t-younote">
          <PlusIcon />
          You haven&apos;t added anything yet
        </div>
      )}
    </Link>
  );
}

export default function TopicsView({
  classId,
  className,
  topics: initialTopics,
  canCreate,
}: Props) {
  const [sort, setSort] = useState<Sort>("recent");
  const [showModal, setShowModal] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...initialTopics];
    if (sort === "az") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "activity") arr.sort((a, b) => b.sources - a.sources);
    return arr;
  }, [initialTopics, sort]);

  const isEmpty = initialTopics.length === 0;

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <div className="kicker">Topics</div>
          <h1 className="pane-title">{className}</h1>
          <p className="pane-desc">
            Each topic is its own workspace — a shared collection of notes that
            Notify compiles into one master document.
          </p>
        </div>
        {canCreate && !isEmpty && (
          <button
            className="btn btn-primary shrink-0 mt-1"
            onClick={() => setShowModal(true)}
          >
            <PlusIcon />
            New topic
          </button>
        )}
      </div>

      {!canCreate && (
        <div className="lowbanner">
          <LockIcon />
          <span>
            You&apos;re a <b>Viewer</b> here. You can open and read any topic;
            creating new ones requires contributor access or above.
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center text-center px-7 py-13.5 bg-(--paper-raised) border border-(--line) rounded-2xl">
          <span className="w-13.5 h-13.5 rounded-[14px] bg-(--paper-deep) text-(--ink-fainter) flex items-center justify-center mb-4">
            <LayersIcon />
          </span>
          <h4 className="text-[17px] font-semibold text-(--ink-heading) m-0 mb-1.5">
            No topics yet
          </h4>
          <p className="text-[13.5px] text-(--ink-faint) m-0 mb-5 max-w-85 leading-[1.55]">
            {canCreate
              ? "Topics organize a class by lecture, unit, or exam. Create the first one to start pooling notes."
              : "Once a contributor adds the first topic, it'll show up here for everyone."}
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              <PlusIcon />
              Create first topic
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <span className="tlabel">
              {initialTopics.length} topic
              {initialTopics.length !== 1 ? "s" : ""}
            </span>
            <span className="flex-1" />
            <div className="sortseg">
              {(
                [
                  ["recent", "Recent"],
                  ["activity", "Most sources"],
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
            {sorted.map((t) => (
              <TopicCard key={t.id} t={t} classId={classId} />
            ))}
            {canCreate && (
              <button
                className="tcard create"
                onClick={() => setShowModal(true)}
              >
                <span className="cic">
                  <PlusIcon />
                </span>
                <span className="ct">New topic</span>
              </button>
            )}
          </div>
        </>
      )}

      {showModal && (
        <TopicModal classId={classId} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
