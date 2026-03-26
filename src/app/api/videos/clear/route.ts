import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST - 清空所有视频
export async function POST() {
  try {
    await db.video.deleteMany({});
    return NextResponse.json({ success: true, message: "视频队列已清空" });
  } catch {
    return NextResponse.json(
      { success: false, error: "清空视频队列失败" },
      { status: 500 }
    );
  }
}
