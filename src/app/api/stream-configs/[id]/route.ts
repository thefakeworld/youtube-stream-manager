import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stream-configs/[id] - Get config details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const config = await db.streamConfig.findUnique({
      where: { id },
      include: {
        videos: {
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
        },
        streamTasks: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            currentVideo: {
              select: { id: true, title: true, youtubeId: true },
            },
          },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Stream configuration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Error fetching stream config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stream config" },
      { status: 500 }
    );
  }
}

// PUT /api/stream-configs/[id] - Update config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingConfig = await db.streamConfig.findUnique({
      where: { id },
    });

    if (!existingConfig) {
      return NextResponse.json(
        { success: false, error: "Stream configuration not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "name", "rtmpUrl", "streamKey", "platform", 
      "isActive", "autoStart", "loopCount"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const config = await db.streamConfig.update({
      where: { id },
      data: updateData,
      include: {
        videos: {
          select: {
            id: true,
            youtubeId: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: config,
      message: "Stream configuration updated successfully",
    });
  } catch (error) {
    console.error("Error updating stream config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update stream config" },
      { status: 500 }
    );
  }
}

// DELETE /api/stream-configs/[id] - Delete config
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingConfig = await db.streamConfig.findUnique({
      where: { id },
      include: {
        streamTasks: {
          where: { status: "running" },
        },
      },
    });

    if (!existingConfig) {
      return NextResponse.json(
        { success: false, error: "Stream configuration not found" },
        { status: 404 }
      );
    }

    // Check if there are running tasks
    if (existingConfig.streamTasks.length > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete configuration with running stream tasks" },
        { status: 409 }
      );
    }

    await db.streamConfig.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Stream configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting stream config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete stream config" },
      { status: 500 }
    );
  }
}
