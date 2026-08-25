import { proxyBackendRequest } from "@/lib/api/backend-route";

export async function POST(request: Request): Promise<Response> {
  return proxyBackendRequest(request, "/api/subscription/sync-cache");
}
