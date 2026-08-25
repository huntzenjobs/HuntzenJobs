import { proxyBackendRequest } from "@/lib/api/backend-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return proxyBackendRequest(request, "/api/subscription/current");
}
