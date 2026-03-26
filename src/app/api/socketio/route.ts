import { NextRequest, NextResponse } from "next/server";
import http from "http";

const STREAM_SERVICE_HOST = "127.0.0.1";
const STREAM_SERVICE_PORT = 3030;

async function proxyRequest(
  method: string,
  searchParams: URLSearchParams,
  body?: string
): Promise<{ status: number; body: string; contentType: string }> {
  const queryString = searchParams.toString();
  const path = queryString
    ? `/socket.io/?${queryString}`
    : "/socket.io/";

  console.log(`[Socket Proxy] ${method} ${path.replace(/sid=[^&]+/, "sid=***")}`);

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: STREAM_SERVICE_HOST,
      port: STREAM_SERVICE_PORT,
      path: path,
      method: method,
      headers: {
        Accept: "*/*",
        "Content-Type": body ? "text/plain" : "application/json",
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 500,
          body: data,
          contentType: res.headers["content-type"] || "application/json",
        });
      });
    });

    req.on("error", (err) => {
      console.error("[Socket Proxy] Error:", err.message);
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// Handle Socket.io polling requests - matches /api/socketio
export async function GET(request: NextRequest) {
  try {
    const result = await proxyRequest("GET", request.nextUrl.searchParams);

    return new NextResponse(result.body, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: unknown) {
    console.error("[Socket Proxy] GET error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Proxy error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const result = await proxyRequest(
      "POST",
      request.nextUrl.searchParams,
      body
    );

    return new NextResponse(result.body, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: unknown) {
    console.error("[Socket Proxy] POST error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Proxy error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
