import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/logs - Get recent logs with pagination
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const action = searchParams.get("action");
    const videoId = searchParams.get("videoId");

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (action) {
      where.action = action;
    }
    if (videoId) {
      where.videoId = videoId;
    }

    const [logs, total] = await Promise.all([
      db.streamLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          video: {
            select: {
              id: true,
              youtubeId: true,
              title: true,
              thumbnailUrl: true,
            },
          },
        },
      }),
      db.streamLog.count({ where }),
    ]);

    // Get action summary
    const actionSummary = await db.streamLog.groupBy({
      by: ["action"],
      _count: true,
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: actionSummary.reduce((acc, item) => {
        acc[item.action] = item._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
