"use server";

import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { extractVideoId } from "@/lib/youtube";

interface YoutubeVideoItem {
  id: string;
  snippet: { title: string };
  contentDetails: { duration: string };
}

interface YoutubePlaylistItem {
  snippet: {
    title: string;
    channelTitle: string;
    resourceId: { videoId: string };
  };
}


function extractPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = Number(match?.[1] ?? 0);
  const m = Number(match?.[2] ?? 0);
  const s = Number(match?.[3] ?? 0);
  const totalMin = h * 60 + m;
  return `${totalMin}:${String(s).padStart(2, "0")}`;
}

export async function getVideoInfo(url: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  const videoId = extractVideoId(url);
  if (!videoId) return { error: "Invalid YouTube URL." };

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`,
  );
  if (!res.ok) return { error: "Failed to fetch video info." };

  const data = (await res.json()) as { items: YoutubeVideoItem[] };
  const video = data.items?.[0];
  if (!video) return { error: "Video not found." };

  return {
    title: video.snippet.title,
    duration: parseDuration(video.contentDetails.duration),
    url,
  };
}

export async function getPlaylistInfo(url: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  const playlistId = extractPlaylistId(url);
  if (!playlistId) return { error: "Invalid playlist URL." };

  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${playlistId}&part=snippet&maxResults=50&key=${process.env.YOUTUBE_API_KEY}`,
  );
  if (!itemsRes.ok) {
    const body = await itemsRes.json();
    return { error: body.error?.message || "Failed to fetch playlist." };
  }
  const itemsData = (await itemsRes.json()) as {
    items: YoutubePlaylistItem[];
  };

  const videoIds = itemsData.items.map(
    (item) => item.snippet.resourceId.videoId,
  );
  if (videoIds.length === 0) return { error: "Playlist is empty." };

  const videosRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(",")}&part=contentDetails&key=${process.env.YOUTUBE_API_KEY}`,
  );
  if (!videosRes.ok)
    return { error: "Failed to fetch playlist's videos' data." };
  const videosData = (await videosRes.json()) as {
    items: { id: string; contentDetails: { duration: string } }[];
  };
  const durationById = new Map(
    videosData.items.map((v) => [
      v.id,
      parseDuration(v.contentDetails.duration),
    ]),
  );

  return {
    name: itemsData.items[0]?.snippet.channelTitle ?? "Playlist",
    videos: itemsData.items.map((item) => ({
      title: item.snippet.title,
      dur: durationById.get(item.snippet.resourceId.videoId) ?? "0:00",
      url: `https://youtu.be/${item.snippet.resourceId.videoId}`,
    })),
  };
}
