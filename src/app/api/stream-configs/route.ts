import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stream-configs - List all configs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeVideos = searchParams.get("includeVideos") === "true";

    const configs = await db.streamConfig.findMany({
      orderBy: { createdAt: "desc" },
      include: includeVideos
        ? {
            videos: {
              select: {
                id: true,
                youtubeId: true,
                title: true,
                thumbnailUrl: true,
                status: true,
              },
              orderBy: { priority: "desc" },
            },
            streamTasks: {
              where: { status: "running" },
              select: { id: true, status: true, startedAt: true },
            },
          }
        : {
            _count: {
              select: { videos: true, streamTasks: true },
            },
          },
    });

    return NextResponse.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    console.error("Error fetching stream configs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stream configs" },
      { status: 500 }
    );
  }
}

// POST /api/stream-configs - Create new config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, rtmpUrl, streamKey, platform, autoStart, loopCount } = body;

    if (!name || !rtmpUrl || !platform) {
      return NextResponse.json(
        { success: false, error: "name, rtmpUrl, and platform are required" },
        { status: 400 }
      );
    }

    const config = await db.streamConfig.create({
      data: {
        name,
        rtmpUrl,
        streamKey,
        platform,
        autoStart: autoStart ?? true,
        loopCount: loopCount ?? 10,
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: config,
      message: "Stream configuration created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating stream config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create stream config" },
      { status: 500 }
    );
  }
}
