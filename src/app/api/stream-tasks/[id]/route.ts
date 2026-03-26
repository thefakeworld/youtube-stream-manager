import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stream-tasks/[id] - Get task details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const task = await db.streamTask.findUnique({
      where: { id },
      include: {
        streamConfig: {
          select: {
            id: true,
            name: true,
            platform: true,
            rtmpUrl: true,
            loopCount: true,
            isActive: true,
          },
        },
        currentVideo: {
          select: {
            id: true,
            youtubeId: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            status: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Stream task not found" },
        { status: 404 }
      );
    }

    // Get all videos in this stream config for context
    const videos = await db.video.findMany({
      where: { streamConfigId: task.streamConfigId },
      select: {
        id: true,
        youtubeId: true,
        title: true,
        thumbnailUrl: true,
        duration: true,
        status: true,
        priority: true,
      },
      orderBy: { priority: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        videos,
        progress: {
          current: task.currentIndex + 1,
          total: videos.length,
          loop: task.loopIteration + 1,
          maxLoops: task.streamConfig.loopCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching stream task:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stream task" },
      { status: 500 }
    );
  }
}

// PUT /api/stream-tasks/[id] - Update task (for sync with stream service)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingTask = await db.streamTask.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Stream task not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "status", "currentVideoId", "currentIndex", 
      "loopIteration", "errorMessage"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle status transitions
    if (body.status === "error" && body.errorMessage) {
      await db.streamLog.create({
        data: {
          videoId: existingTask.currentVideoId,
          action: "error",
          message: body.errorMessage,
        },
      });
    }

    const task = await db.streamTask.update({
      where: { id },
      data: updateData,
      include: {
        streamConfig: {
          select: { id: true, name: true, platform: true },
        },
        currentVideo: {
          select: { id: true, youtubeId: true, title: true },
        },
      },
    });

    // Handle video transition logging
    if (body.currentVideoId && body.currentVideoId !== existingTask.currentVideoId) {
      await db.streamLog.create({
        data: {
          videoId: body.currentVideoId,
          action: "complete",
          message: `Video completed, transitioning to next video`,
        },
      });

      // Update video stream count
      if (existingTask.currentVideoId) {
        await db.video.update({
          where: { id: existingTask.currentVideoId },
          data: {
            lastStreamedAt: new Date(),
            streamCount: { increment: 1 },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: task,
      message: "Stream task updated successfully",
    });
  } catch (error) {
    console.error("Error updating stream task:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update stream task" },
      { status: 500 }
    );
  }
}
