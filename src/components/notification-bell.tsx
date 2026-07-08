"use client";

import { BellIcon } from "@/components/icons";

export function NotificationBell({
  classId: _classId,
  topicId: _topicId,
}: {
  classId?: string;
  topicId?: string;
}) {
  return (
    <button className="icon-btn relative" title="Notifications">
      <BellIcon />
      <span className="absolute top-1.25 right-1.5 w-1.75 h-1.75 rounded-full bg-(--accent) border-[1.5px] border-(--paper)" />
    </button>
  );
}
