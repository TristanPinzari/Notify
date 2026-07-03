"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { avatarColor } from "@/lib/format";
import { ClassModal } from "@/components/class-modal";
import { TopicModal } from "@/components/topic-modal";
import { AccountSettingsModal } from "@/components/account-settings-modal";
import {
  PlusIcon,
  ChevIcon,
  SettingsIcon,
  BellIcon,
  HelpIcon,
  LogOutIcon,
  GearSvg,
} from "@/components/icons";
import useSWR from "swr";

const BADGE_COLORS = [
  "#c47918",
  "#3f7d52",
  "#3a5fa8",
  "#9e3b32",
  "#6b3fa0",
  "#2a7a8c",
];

import type { SidebarClass } from "@/server/queries/sidebar";
export type { SidebarClass } from "@/server/queries/sidebar";

type Props = {
  user: { name: string; email: string; image?: string | null };
  initialClasses: SidebarClass[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Sidebar({ user, initialClasses }: Props) {
  const { data: classes = [] } = useSWR<SidebarClass[]>(
    "/api/sidebar",
    fetcher,
    { fallbackData: initialClasses, revalidateOnFocus: true },
  );
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const [openClasses, setOpenClasses] = useState<Set<string>>(() => {
    const segments = pathname.split("/");
    const classId = segments[1] === "home" ? segments[2] : undefined;
    return classId ? new Set([classId]) : new Set();
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [topicModal, setTopicModal] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  function toggleClass(id: string) {
    setOpenClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function signOut() {
    setMenuOpen(false);
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <aside className="side">
      <div className="side-head">
        <span className="side-brand">
          <span className="mk">N</span>otify
        </span>
      </div>

      <div className="side-scroll">
        <div className="group-hd">
          <span className="group-hd-lbl">Your Classes</span>
          <button
            className="group-hd-btn"
            title="Join or create a class"
            onClick={() => setModalOpen(true)}
          >
            <PlusIcon />
          </button>
        </div>

        {classes.length === 0 && (
          <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-(--ink-faint) m-0">
            No classes yet.
          </p>
        )}

        {classes.map((cls, i) => {
          const isOpen = openClasses.has(cls.id);
          const isActive = pathname.startsWith(`/home/${cls.id}`);
          const seg = pathname.split("/")[3];
          const isSelected =
            isActive && (!seg || seg === "members" || seg === "settings");
          const color = BADGE_COLORS[i % BADGE_COLORS.length];
          return (
            <div
              key={cls.id}
              className={`class${isOpen ? " open" : ""}${isActive ? " active" : ""}${isSelected ? " selected" : ""}`}
            >
              <div className="class-row">
                <button
                  className="chev"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleClass(cls.id);
                  }}
                  aria-label="Toggle topics"
                >
                  <ChevIcon />
                </button>
                <Link
                  href={`/home/${cls.id}`}
                  className="class-row-link"
                  onClick={() => {
                    if (!openClasses.has(cls.id)) toggleClass(cls.id);
                  }}
                >
                  <div className="badge" style={{ background: color }}>
                    {cls.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="ctxt">{cls.name}</span>
                  <span className="count">{cls.topics.length}</span>
                </Link>
              </div>
              <div className="topics">
                <div className="topics-inner">
                  {cls.topics.map((topic) => {
                    const href = `/home/${cls.id}/${topic.id}`;
                    return (
                      <Link
                        key={topic.id}
                        href={href}
                        className={`topic ${pathname.startsWith(href) ? " active" : ""}`}
                      >
                        <span className="topic-dot" />
                        <span className="ttxt">{topic.name}</span>
                      </Link>
                    );
                  })}
                  <button
                    className="topic-add"
                    onClick={() => setTopicModal(cls.id)}
                  >
                    <span className="pl">
                      <PlusIcon />
                    </span>
                    New topic
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <button className="join-btn" onClick={() => setModalOpen(true)}>
          <span className="join-ic">
            <PlusIcon />
          </span>
          Join or create a class
        </button>
      </div>

      {modalOpen && <ClassModal onClose={() => setModalOpen(false)} />}
      {topicModal && (
        <TopicModal classId={topicModal} onClose={() => setTopicModal(null)} />
      )}
      {accountOpen && (
        <AccountSettingsModal
          user={user}
          onClose={() => setAccountOpen(false)}
        />
      )}

      <div className="side-user" ref={menuRef}>
        <div className={`side-menu${menuOpen ? " show" : ""}`}>
          <div className="menu-hd">
            <div className="menu-hd-name">{user.name}</div>
            <div className="menu-hd-email">{user.email}</div>
          </div>
          <button
            className="mi"
            onClick={() => {
              setMenuOpen(false);
              setAccountOpen(true);
            }}
          >
            <SettingsIcon />
            Account settings
          </button>
          <button className="mi">
            <BellIcon />
            Notifications
          </button>
          <button className="mi">
            <HelpIcon />
            Help &amp; feedback
          </button>
          <div className="menu-sep" />
          <button className="mi danger" onClick={signOut}>
            <LogOutIcon />
            Log out
          </button>
        </div>

        <button
          className={`user-btn${menuOpen ? " open" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <div
            className="avatar"
            style={user.image ? undefined : { background: avatarColor(user.name) }}
          >
            {user.image ? (
              <Image
                className="avatar-img"
                src={user.image}
                alt={user.name}
                width={38}
                height={38}
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="umeta">
            <div className="uname">{user.name}</div>
            <div className="umail">{user.email}</div>
          </div>
          <GearSvg />
        </button>
      </div>
    </aside>
  );
}
