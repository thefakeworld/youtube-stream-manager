import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stream-tasks - Get current task status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const streamConfigId = searchParams.get("streamConfigId");

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (streamConfigId) {
      where.streamConfigId = streamConfigId;
    }

    const tasks = await db.streamTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        streamConfig: {
          select: {
            id: true,
            name: true,
            platform: true,
            rtmpUrl: true,
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
          },
        },
      },
    });

    // Get summary stats
    const stats = await db.streamTask.groupBy({
      by: ["status"],
      _count: true,
    });

    return NextResponse.json({
      success: true,
      data: tasks,
      stats: stats.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error("Error fetching stream tasks:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stream tasks" },
      { status: 500 }
    );
  }
}

// POST /api/stream-tasks - Start/stop/pause stream task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, streamConfigId, taskId } = body;

    // Handle different actions
    switch (action) {
      case "start": {
        if (!streamConfigId) {
          return NextResponse.json(
            { success: false, error: "streamConfigId is required for start action" },
            { status: 400 }
          );
        }

        // Check if config exists and has videos
        const config = await db.streamConfig.findUnique({
          where: { id: streamConfigId },
          include: {
            videos: {
              where: { status: { in: ["ready", "pending"] } },
              orderBy: { priority: "desc" },
              take: 1,
            },
            streamTasks: {
              where: { status: "running" },
            },
          },
        });

        if (!config) {
          return NextResponse.json(
            { success: false, error: "Stream configuration not found" },
            { status: 404 }
          );
        }

        if (config.streamTasks.length > 0) {
          return NextResponse.json(
            { success: false, error: "A stream task is already running for this configuration" },
            { status: 409 }
          );
        }

        if (config.videos.length === 0) {
          return NextResponse.json(
            { success: false, error: "No videos available for streaming" },
            { status: 400 }
          );
        }

        // Create new stream task
        const task = await db.streamTask.create({
          data: {
            streamConfigId,
            status: "running",
            currentVideoId: config.videos[0].id,
            currentIndex: 0,
            loopIteration: 0,
            startedAt: new Date(),
          },
          include: {
            streamConfig: {
              select: { id: true, name: true, platform: true },
            },
            currentVideo: {
              select: { id: true, youtubeId: true, title: true },
            },
          },
        });

        // Update config to active
        await db.streamConfig.update({
          where: { id: streamConfigId },
          data: { isActive: true },
        });

        // Create log entry
        await db.streamLog.create({
          data: {
            videoId: config.videos[0].id,
            action: "start",
            message: `Started streaming: ${config.videos[0].title}`,
          },
        });

        return NextResponse.json({
          success: true,
          data: task,
          message: "Stream task started successfully",
        }, { status: 201 });
      }

      case "stop": {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: "taskId is required for stop action" },
            { status: 400 }
          );
        }

        const task = await db.streamTask.findUnique({
          where: { id: taskId },
          include: { streamConfig: true },
        });

        if (!task) {
          return NextResponse.json(
            { success: false, error: "Stream task not found" },
            { status: 404 }
          );
        }

        const updatedTask = await db.streamTask.update({
          where: { id: taskId },
          data: {
            status: "stopped",
            stoppedAt: new Date(),
          },
        });

        // Update config to inactive
        await db.streamConfig.update({
          where: { id: task.streamConfigId },
          data: { isActive: false },
        });

        // Create log entry
        await db.streamLog.create({
          data: {
            videoId: task.currentVideoId,
            action: "stop",
            message: "Stream task stopped",
          },
        });

        return NextResponse.json({
          success: true,
          data: updatedTask,
          message: "Stream task stopped successfully",
        });
      }

      case "pause": {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: "taskId is required for pause action" },
            { status: 400 }
          );
        }

        const task = await db.streamTask.findUnique({
          where: { id: taskId },
        });

        if (!task) {
          return NextResponse.json(
            { success: false, error: "Stream task not found" },
            { status: 404 }
          );
        }

        if (task.status !== "running") {
          return NextResponse.json(
            { success: false, error: "Can only pause running tasks" },
            { status: 400 }
          );
        }

        const updatedTask = await db.streamTask.update({
          where: { id: taskId },
          data: { status: "paused" },
        });

        // Create log entry
        await db.streamLog.create({
          data: {
            videoId: task.currentVideoId,
            action: "pause",
            message: "Stream task paused",
          },
        });

        return NextResponse.json({
          success: true,
          data: updatedTask,
          message: "Stream task paused successfully",
        });
      }

      case "resume": {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: "taskId is required for resume action" },
            { status: 400 }
          );
        }

        const task = await db.streamTask.findUnique({
          where: { id: taskId },
        });

        if (!task) {
          return NextResponse.json(
            { success: false, error: "Stream task not found" },
            { status: 404 }
          );
        }

        if (task.status !== "paused") {
          return NextResponse.json(
            { success: false, error: "Can only resume paused tasks" },
            { status: 400 }
          );
        }

        const updatedTask = await db.streamTask.update({
          where: { id: taskId },
          data: { status: "running" },
        });

        // Create log entry
        await db.streamLog.create({
          data: {
            videoId: task.currentVideoId,
            action: "resume",
            message: "Stream task resumed",
          },
        });

        return NextResponse.json({
          success: true,
          data: updatedTask,
          message: "Stream task resumed successfully",
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action. Use: start, stop, pause, or resume" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error managing stream task:", error);
    return NextResponse.json(
      { success: false, error: "Failed to manage stream task" },
      { status: 500 }
    );
  }
}
