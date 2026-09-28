import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

interface VoiceSyncMocks {
  fetches: Array<{ input: string; init?: RequestInit }>;
  redirects: string[];
  revalidations: string[];
}

declare global {
  var __elevenLabsVoiceSyncMocks: VoiceSyncMocks;
}

globalThis.__elevenLabsVoiceSyncMocks = createMocks();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return {getAll(){return [{name:'xueleai_admin_access',value:'token'}]}}}"
      };
    }
    if (specifier === "next/cache") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function revalidatePath(path){globalThis.__elevenLabsVoiceSyncMocks.revalidations.push(path)}"
      };
    }
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function redirect(path){globalThis.__elevenLabsVoiceSyncMocks.redirects.push(path);throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})}"
      };
    }
    return nextResolve(specifier, context);
  }
});

const audioAdminApi = await import("../src/lib/audio-admin-api.js");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.__elevenLabsVoiceSyncMocks = createMocks();
  globalThis.fetch = async (input, init) => {
    globalThis.__elevenLabsVoiceSyncMocks.fetches.push({ input: String(input), init });
    return Response.json({
      code: 0,
      message: "成功",
      data: { total: 32, created: 30, updated: 2, skipped: 0 }
    });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("后台同步动作只调用 ElevenLabs 默认音色接口并回传同步结果", async () => {
  await assert.rejects(audioAdminApi.syncElevenLabsDefaultVoicesAction(), (error: Error & { destination?: string }) => {
    assert.equal(
      error.destination,
      "/admin/audio/voices?elevenlabsSync=success&total=32&created=30&updated=2&skipped=0"
    );
    return true;
  });

  assert.equal(globalThis.__elevenLabsVoiceSyncMocks.fetches.length, 1);
  const request = globalThis.__elevenLabsVoiceSyncMocks.fetches[0];
  assert.equal(request.input, "http://localhost:3322/api/admin/audio/voices/sync-elevenlabs-defaults");
  assert.equal(request.init?.method, "POST");
  assert.equal(new Headers(request.init?.headers).get("Cookie"), "xueleai_admin_access=token");
  assert.deepEqual(globalThis.__elevenLabsVoiceSyncMocks.revalidations, [
    "/admin/audio/voices",
    "/dashboard/voices",
    "/voice",
    "/tools/text-to-speech"
  ]);
});

function createMocks(): VoiceSyncMocks {
  return {
    fetches: [],
    redirects: [],
    revalidations: []
  };
}
