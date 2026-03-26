import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET - 获取所有视频
export async function GET() {
  try {
    const videos = await db.video.findMany({
      orderBy: { priority: 'asc' }
    });
    
    return NextResponse.json({
      success: true,
      data: videos.map(v => ({
        id: v.id,
        youtubeId: v.youtubeId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        duration: v.duration,
        status: v.status,
        priority: v.priority,
        streamUrl: v.streamUrl,
        createdAt: v.createdAt
      }))
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "获取视频列表失败" },
      { status: 500 }
    );
  }
}

// POST - 添加视频
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeId, title, thumbnailUrl, duration, streamUrl, priority } = body;

    if (!youtubeId || !title) {
      return NextResponse.json(
        { success: false, error: "视频ID和标题是必需的" },
        { status: 400 }
      );
    }

    // 检查是否已存在
    const existing = await db.video.findUnique({
      where: { youtubeId }
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "视频已存在" },
        { status: 400 }
      );
    }

    // 获取当前最大优先级
    const maxPriority = await db.video.aggregate({
      _max: { priority: true }
    });
    const nextPriority = (maxPriority._max.priority || 0) + 1;

    const video = await db.video.create({
      data: {
        youtubeId,
        title,
        thumbnailUrl: thumbnailUrl || null,
        duration: duration || null,
        streamUrl: streamUrl || youtubeId, // 如果没有streamUrl，使用youtubeId作为URL
        status: 'pending',
        priority: priority ?? nextPriority
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: video.id,
        youtubeId: video.youtubeId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        status: video.status,
        priority: video.priority
      }
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "添加视频失败" },
      { status: 500 }
    );
  }
}

// DELETE - 删除视频
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: "视频ID是必需的" },
        { status: 400 }
      );
    }

    await db.video.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: "视频已删除" });
  } catch {
    return NextResponse.json(
      { success: false, error: "删除视频失败" },
      { status: 500 }
    );
  }
}

// PUT - 更新视频顺序
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos } = body as { videos: { id: string; priority: number }[] };

    if (!videos || !Array.isArray(videos)) {
      return NextResponse.json(
        { success: false, error: "无效的视频列表" },
        { status: 400 }
      );
    }

    // 批量更新优先级
    for (const v of videos) {
      await db.video.update({
        where: { id: v.id },
        data: { priority: v.priority }
      });
    }

    return NextResponse.json({ success: true, message: "顺序已更新" });
  } catch {
    return NextResponse.json(
      { success: false, error: "更新顺序失败" },
      { status: 500 }
    );
  }
}
