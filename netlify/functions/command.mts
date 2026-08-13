import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// 명령 상태 구조:
// { pending: "on" | "off" | null, issuedAt: number | null,
//   phoneLastSeen: number | null, phoneState: "on" | "off" | "unknown" }

const KEY = "state";

async function readState(store: any) {
  const raw = await store.get(KEY, { type: "json" });
  return (
    raw ?? {
      pending: null,
      issuedAt: null,
      phoneLastSeen: null,
      phoneState: "unknown",
    }
  );
}

export default async (req: Request, context: Context) => {
  const store = getStore("hotspot");
  const url = new URL(req.url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // GET /api/command            → 아이패드용: 전체 상태 조회
  // GET /api/command?role=phone → 폰(MacroDroid)용: 폴링 + 생존 신고
  if (req.method === "GET") {
    const state = await readState(store);
    if (url.searchParams.get("role") === "phone") {
      state.phoneLastSeen = Date.now();
      // 폰이 현재 핫스팟 상태를 같이 보고할 수 있음 (?hotspot=on|off)
      const hs = url.searchParams.get("hotspot");
      if (hs === "on" || hs === "off") state.phoneState = hs;
      const command = state.pending; // 전달 후 비움 (한 번만 실행되도록)
      state.pending = null;
      state.issuedAt = null;
      await store.setJSON(KEY, state);
      return json({ command: command ?? "none" });
    }
    return json(state);
  }

  // POST /api/command  body: {"action":"on"|"off"}  → 아이패드가 명령 등록
  if (req.method === "POST") {
    let action: string | undefined;
    try {
      action = (await req.json())?.action;
    } catch {
      /* fallthrough */
    }
    if (action !== "on" && action !== "off") {
      return json({ error: "action은 'on' 또는 'off'여야 합니다." }, 400);
    }
    const state = await readState(store);
    state.pending = action;
    state.issuedAt = Date.now();
    await store.setJSON(KEY, state);
    return json(state);
  }

  return json({ error: "지원하지 않는 메서드" }, 405);
};

export const config: Config = {
  path: "/api/command",
};
