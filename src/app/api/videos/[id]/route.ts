import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/videos/[id] - Get video details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const video = await db.video.findUnique({
      where: { id },
      include: {
        streamConfig: {
          select: { id: true, name: true, platform: true, isActive: true },
        },
        logs: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: "Video not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: video,
    });
  } catch (error) {
    console.error("Error fetching video:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch video" },
      { status: 500 }
    );
  }
}

// PUT /api/videos/[id] - Update video
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingVideo = await db.video.findUnique({
      where: { id },
    });

    if (!existingVideo) {
      return NextResponse.json(
        { success: false, error: "Video not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "title", "description", "thumbnailUrl", "duration", 
      "viewCount", "channelTitle", "streamUrl", "status", 
      "priority", "streamConfigId", "errorMessage"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const video = await db.video.update({
      where: { id },
      data: updateData,
      include: {
        streamConfig: {
          select: { id: true, name: true, platform: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: video,
      message: "Video updated successfully",
    });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update video" },
      { status: 500 }
    );
  }
}

// DELETE /api/videos/[id] - Delete video
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingVideo = await db.video.findUnique({
      where: { id },
    });

    if (!existingVideo) {
      return NextResponse.json(
        { success: false, error: "Video not found" },
        { status: 404 }
      );
    }

    await db.video.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete video" },
      { status: 500 }
    );
  }
}
