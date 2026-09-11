import { test, after } from "node:test";
import assert from "node:assert/strict";
import { localWorker } from "./dev.mjs";
import { DEFAULT_EVENT, EVENTS } from "./events.mjs";
import { validateResponse } from "./worker/src/index.mjs";
import { inspectVideo } from "./worker/src/media.mjs";
const mf = await localWorker();
after(() => mf.dispose());
const data = () => ({
  id: crypto.randomUUID(),
  eventId: DEFAULT_EVENT,
  name: "Local test guest",
  email: "guest@example.invalid",
  consent: true,
  answers: { overall: "loved-it" },
});
const request = (path, method = "GET", body, headers = {}) =>
  mf.dispatchFetch(`http://localhost:8788/api/feedback${path}`, {
    method,
    headers: {
      Origin: "http://localhost:8788",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
test("required fields and allowed answers are enforced; optional answers can be omitted", () => {
  assert.equal(
    validateResponse(data(), EVENTS[DEFAULT_EVENT]).name,
    "Local test guest",
  );
  for (const patch of [
    { name: "" },
    { email: "", phone: "" },
    { consent: false },
    { answers: {} },
    { answers: { overall: "bad" } },
    { email: "invalid" },
    { phone: "123" },
  ])
    assert.throws(() =>
      validateResponse({ ...data(), ...patch }, EVENTS[DEFAULT_EVENT]),
    );
  assert.equal(
    validateResponse(
      { ...data(), email: "", phone: "+81 90 1234 5678" },
      EVENTS[DEFAULT_EVENT],
    ).email,
    "",
  );
});
test("written submissions are idempotent and reject changed payloads", async () => {
  const payload = data(),
    first = await request("/responses", "POST", payload);
  assert.equal(first.status, 200);
  const receipt = await first.json();
  assert.ok(receipt.uploadToken);
  assert.equal((await request("/responses", "POST", payload)).status, 200);
  assert.equal(
    (await request("/responses", "POST", { ...payload, name: "Changed" }))
      .status,
    409,
  );
  const db = await mf.getD1Database("FEEDBACK_DB");
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM responses WHERE id=?")
        .bind(payload.id)
        .first()
    ).n,
    1,
  );
});
test("origin, size and private dashboard boundaries", async () => {
  assert.equal(
    (
      await request("/responses", "POST", data(), {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/responses", "POST", " ".repeat(16001))).status,
    413,
  );
  assert.equal((await request("/admin/responses")).status, 401);
  const login = await request("/admin/login", "POST", {
    password: "local-development-host-password-do-not-deploy",
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(
    (
      await request("/admin/responses", "GET", null, {
        Cookie: cookie.split(";")[0],
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/responses/00000000-0000-4000-8000-000000000000/video"))
      .status,
    401,
  );
});
function box(type, ...parts) {
  const content = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8);
  header.write(type, 4);
  return Buffer.concat([header, content]);
}
function fixture(seconds) {
  const duration = Buffer.alloc(20);
  duration.writeUInt32BE(1000, 12);
  duration.writeUInt32BE(seconds * 1000, 16);
  const handler = Buffer.alloc(12);
  handler.write("vide", 8);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom0000")),
    box(
      "moov",
      box("mvhd", duration),
      box("trak", box("mdia", box("mdhd", duration), box("hdlr", handler))),
    ),
    box("mdat", Buffer.alloc(16)),
  ]);
}
test("server checks container duration and rejects fake/long files", async () => {
  const bucket = await mf.getR2Bucket("FEEDBACK_VIDEOS");
  for (const seconds of [1, 480]) {
    const bytes = fixture(seconds);
    await bucket.put("fixture", bytes);
    assert.equal(await inspectVideo(bucket, "fixture", bytes.length), seconds);
  }
  const bytes = fixture(481);
  await bucket.put("fixture", bytes);
  await assert.rejects(
    inspectVideo(bucket, "fixture", bytes.length),
    /8 minutes/,
  );
  await bucket.put("fake", Buffer.alloc(24));
  await assert.rejects(inspectVideo(bucket, "fake", 24));
});
test("multipart completes privately and rejected video preserves written response", async () => {
  for (const valid of [true, false]) {
    const payload = data(),
      receipt = await (await request("/responses", "POST", payload)).json(),
      headers = { Authorization: `Bearer ${receipt.uploadToken}` };
    const bytes = valid ? fixture(60) : Buffer.alloc(40);
    assert.equal(
      (
        await request(
          `/responses/${payload.id}/video`,
          "POST",
          { size: bytes.length, type: "video/mp4", duration: 60 },
          headers,
        )
      ).status,
      200,
    );
    const part = await mf.dispatchFetch(
      `http://localhost:8788/api/feedback/responses/${payload.id}/video/parts/1`,
      {
        method: "PUT",
        headers: { Origin: "http://localhost:8788", ...headers },
        body: bytes,
      },
    );
    assert.equal(part.status, 200);
    const complete = await request(
      `/responses/${payload.id}/video/complete`,
      "POST",
      null,
      headers,
    );
    assert.equal(complete.status, valid ? 200 : 400, await complete.text());
    const db = await mf.getD1Database("FEEDBACK_DB");
    assert.ok(
      await db
        .prepare("SELECT id FROM responses WHERE id=?")
        .bind(payload.id)
        .first(),
    );
    assert.equal((await request(`/admin/videos/${payload.id}`)).status, 401);
    if (valid)
      assert.equal(
        (
          await request(
            `/responses/${payload.id}/video/complete`,
            "POST",
            null,
            headers,
          )
        ).status,
        200,
      );
  }
});
test("upload limits, reservation and private range streaming", async () => {
  const payload = data(),
    receipt = await (await request("/responses", "POST", payload)).json(),
    auth = { Authorization: `Bearer ${receipt.uploadToken}` },
    path = `/responses/${payload.id}/video`;
  assert.equal(
    (
      await request(
        path,
        "POST",
        { size: 250000001, type: "video/mp4", duration: 60 },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        path,
        "POST",
        { size: 100, type: "video/mp4", duration: 481 },
        auth,
      )
    ).status,
    400,
  );
  const bytes = fixture(60);
  await request(
    path,
    "POST",
    { size: bytes.length, type: "video/mp4", duration: 60 },
    auth,
  );
  const part = (body) =>
    mf.dispatchFetch(`http://localhost:8788/api/feedback${path}/parts/1`, {
      method: "PUT",
      headers: { Origin: "http://localhost:8788", ...auth },
      body,
    });
  assert.equal((await part(Buffer.alloc(bytes.length + 1))).status, 413);
  assert.equal((await part(bytes.subarray(0, 10))).status, 400);
  assert.equal((await part(bytes)).status, 200);
  await request(`${path}/complete`, "POST", null, auth);
  const login = await request("/admin/login", "POST", {
      password: "local-development-host-password-do-not-deploy",
    }),
    cookie = login.headers.get("set-cookie").split(";")[0];
  const stream = await request(`/admin/videos/${payload.id}`, "GET", null, {
    Cookie: cookie,
    Range: "bytes=0-9",
  });
  assert.equal(stream.status, 206);
  assert.equal(
    stream.headers.get("content-range"),
    `bytes 0-9/${bytes.length}`,
  );
  assert.equal((await stream.arrayBuffer()).byteLength, 10);
});

test("production hosts cannot use the local verification bypass", async () => {
  const result = await mf.dispatchFetch(
    `https://sunveda.tech/api/feedback/events/${DEFAULT_EVENT}`,
  );
  const config = await result.json();
  assert.equal(config.dev, false);
  assert.equal(config.configured, false);
});

test("storage reservation rejects excess bytes and cleanup preserves ready videos", async () => {
  const db = await mf.getD1Database("FEEDBACK_DB");
  const bucket = await mf.getR2Bucket("FEEDBACK_VIDEOS");
  const first = data();
  await request("/responses", "POST", first);
  await db
    .prepare(
      "INSERT INTO uploads(response_id,object_key,file_bytes,content_type,status,created_at,expires_at) VALUES(?,?,250000000,'video/mp4','ready',1,1)",
    )
    .bind(first.id, "quota-fixture")
    .run();
  const payload = data();
  const receipt = await (await request("/responses", "POST", payload)).json();
  // An existing ready object alone can exceed a deliberately reduced test quota.
  const worker = (await import("./worker/src/index.mjs")).default;
  const env = {
    FEEDBACK_DB: db,
    FEEDBACK_VIDEOS: bucket,
    PUBLIC_ORIGIN: "http://localhost:8788",
    VIDEO_ENABLED: "true",
    DEV_MODE: "true",
    SESSION_SECRET: "local-development-session-secret-do-not-deploy",
    MAX_VIDEO_STORAGE_BYTES: "1",
  };
  const result = await worker.fetch(
    new Request(
      `http://localhost:8788/api/feedback/responses/${payload.id}/video`,
      {
        method: "POST",
        headers: {
          Origin: env.PUBLIC_ORIGIN,
          "Content-Type": "application/json",
          Authorization: `Bearer ${receipt.uploadToken}`,
        },
        body: JSON.stringify({ size: 100, type: "video/mp4", duration: 60 }),
      },
    ),
    env,
  );
  assert.equal(result.status, 409);
  await db
    .prepare(
      "INSERT INTO uploads(response_id,object_key,file_bytes,content_type,status,created_at,expires_at) VALUES(?,?,100,'video/mp4','creating',1,1)",
    )
    .bind(payload.id, "unfinished-fixture")
    .run();
  await bucket.put("unfinished-fixture", "incomplete");
  const { cleanup } = await import("./worker/src/index.mjs");
  await cleanup(env);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM uploads WHERE response_id=?")
        .bind(payload.id)
        .first()
    ).status,
    "expired",
  );
  assert.equal(await bucket.head("unfinished-fixture"), null);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM uploads WHERE response_id=?")
        .bind(first.id)
        .first()
    ).status,
    "ready",
  );
});

test("Japanese translation covers every event question and preserves canonical values", async () => {
  const { translate } = await import("./i18n.mjs");
  for (const event of Object.values(EVENTS)) {
    for (const question of event.questions) {
      assert.notEqual(translate(question.title, "ja"), question.title);
      if (question.hint)
        assert.notEqual(translate(question.hint, "ja"), question.hint);
      for (const option of question.options || [])
        assert.notEqual(translate(option, "ja"), option);
    }
  }
  assert.equal(
    translate(
      "  Please provide an email address or phone number.\n You can add both.  ",
      "ja",
    ).trim(),
    "メールアドレスか電話番号のどちらかをご入力ください。両方でも構いません。",
  );
  assert.equal(
    translate("Uploading video part 2 of 5…", "ja"),
    "動画をアップロードしています…（2 / 5）",
  );
  assert.equal(translate("Loved it", "en"), "Loved it");
});
