import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST - 批量添加视频
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos } = body as { videos: Array<{
      youtubeId: string;
      title: string;
      thumbnailUrl?: string;
      duration?: number;
      streamUrl?: string;
    }> };

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json(
        { success: false, error: "视频列表不能为空" },
        { status: 400 }
      );
    }

    // 获取当前最大优先级
    const maxPriority = await db.video.aggregate({
      _max: { priority: true }
    });
    let nextPriority = (maxPriority._max.priority || 0) + 1;

    const addedVideos = [];
    const skippedVideos = [];

    for (const video of videos) {
      if (!video.youtubeId || !video.title) {
        skippedVideos.push(video);
        continue;
      }

      // 检查是否已存在
      const existing = await db.video.findUnique({
        where: { youtubeId: video.youtubeId }
      });

      if (existing) {
        skippedVideos.push(video);
        continue;
      }

      const created = await db.video.create({
        data: {
          youtubeId: video.youtubeId,
          title: video.title,
          thumbnailUrl: video.thumbnailUrl || null,
          duration: video.duration || null,
          streamUrl: video.streamUrl || video.youtubeId,
          status: 'pending',
          priority: nextPriority++
        }
      });

      addedVideos.push({
        id: created.id,
        youtubeId: created.youtubeId,
        title: created.title,
        thumbnailUrl: created.thumbnailUrl,
        duration: created.duration,
        status: created.status,
        priority: created.priority
      });
    }

    return NextResponse.json({
      success: true,
      added: addedVideos.length,
      skipped: skippedVideos.length,
      data: addedVideos
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "批量添加视频失败" },
      { status: 500 }
    );
  }
}
