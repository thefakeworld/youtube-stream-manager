import { NextRequest, NextResponse } from "next/server";
import { killProcess } from "@/lib/stream-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pid } = body;

    if (typeof pid !== 'number') {
      return NextResponse.json(
        { success: false, error: "PID is required" },
        { status: 400 }
      );
    }

    const result = killProcess(pid);
    
    if (result.success) {
      return NextResponse.json({ success: true, message: `进程 ${pid} 已停止` });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to kill process" },
      { status: 500 }
    );
  }
}
