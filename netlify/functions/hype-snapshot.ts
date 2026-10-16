/**
 * Daily-ish price history for the hype tracker.
 * Scheduled functions stop at 30 seconds and only fire on published deploys,
 * so each run asks the Next route for one short batch. A cursor in Blobs
 * continues the walk on the next run. No environment variables are required.
 * Built-in URL / DEPLOY_PRIME_URL identify this deploy.
 */
const SCHEDULE = "15 */3 * * *";

function origin(): string {
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, "");
}

async function hypeSnapshot(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return Response.json({
      registered: true,
      schedule: SCHEDULE,
      detail:
        "Price snapshots run on published deploys. Each run stores a short batch so the 30 second limit holds.",
    });
  }

  const site = origin();
  if (!site) {
    return Response.json({
      registered: true,
      ran: false,
      schedule: SCHEDULE,
      detail: "This runtime has no site URL, so the snapshot batch was not started.",
    });
  }

  const res = await fetch(`${site}/api/tools/hype-snapshot`, { method: "POST" });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export default hypeSnapshot;

export const config = {
  schedule: SCHEDULE,
};
