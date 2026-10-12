import { getViewer } from "@/lib/auth/viewer";
import { pushIdentity } from "@/lib/onesignal";
import { getPushConfig } from "@/lib/notification-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getPushConfig();
  if (!config.configured || !config.policy.enabled)
    return Response.json({ configured: false }, { headers: { "Cache-Control": "private, no-store" } });
  const viewer = await getViewer();
  return Response.json(
    { configured: true, appId: config.appId, externalId: viewer ? pushIdentity(viewer.id) : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
