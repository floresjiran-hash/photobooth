import { POST as booth } from "../../booth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Old URL /api/keys/validate -> forwards to /api/booth?r=keys/validate
export async function POST(req: Request) {
  const url = new URL(req.url);
  url.searchParams.set("r", "keys/validate");
  const body = await req.text();
  return booth(new Request(url, { method: "POST", headers: req.headers, body }));
}