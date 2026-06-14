"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { ClassModal } from "@/components/class-modal";

const BADGE_COLORS = [
  "#c47918",
  "#3f7d52",
  "#3a5fa8",
  "#9e3b32",
  "#6b3fa0",
  "#2a7a8c",
];

export type SidebarClass = {
  id: string;
  code: string;
  name: string;
  topics: { id: string; name: string }[];
};

type Props = {
  user: { name: string; email: string; image?: string | null };
  classes: SidebarClass[];
};

const PlusIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ChevIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ProfileIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const BellIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

const HelpIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

const LogOutIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

const GearSvg = () => (
  <svg
    className="gear"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export function Sidebar({ user, classes }: Props) {
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
          <p
            style={{
              padding: "6px 10px 4px",
              fontSize: 12,
              color: "var(--ink-faint)",
              margin: 0,
            }}
          >
            No classes yet.
          </p>
        )}

        {classes.map((cls, i) => {
          const isOpen = openClasses.has(cls.id);
          const isActive = pathname.startsWith(`/home/${cls.id}`);
          const color = BADGE_COLORS[i % BADGE_COLORS.length];
          return (
            <div
              key={cls.id}
              className={`class${isOpen ? " open" : ""}${isActive ? " active" : ""}`}
            >
              <button className="class-row" onClick={() => toggleClass(cls.id)}>
                <span className="chev">
                  <ChevIcon />
                </span>
                <div className="badge" style={{ background: color }}>
                  {cls.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="ctxt">{cls.name}</span>
                <span className="count">{cls.topics.length}</span>
              </button>
              <div className="topics">
                <div className="topics-inner">
                  {cls.topics.map((topic) => {
                    const href = `/home/${cls.id}/${topic.id}`;
                    return (
                      <Link
                        key={topic.id}
                        href={href}
                        className={`topic${pathname === href ? " active" : ""}`}
                      >
                        <span className="topic-dot" />
                        <span className="ttxt">{topic.name}</span>
                      </Link>
                    );
                  })}
                  <button className="topic-add">
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

      <div className="side-user" ref={menuRef}>
        <div className={`side-menu${menuOpen ? " show" : ""}`}>
          <div className="menu-hd">
            <div className="menu-hd-name">{user.name}</div>
            <div className="menu-hd-email">{user.email}</div>
          </div>
          <button className="mi">
            <ProfileIcon />
            Edit profile
          </button>
          <button className="mi">
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
          <div className="avatar">
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
