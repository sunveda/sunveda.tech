import { EVENTS, DEFAULT_EVENT, RATINGS, VIDEO } from "../../events.mjs";
import { inspectVideo } from "./media.mjs";

const PREFIX = "/api/feedback";
const DAY = 86_400_000;
const encoder = new TextEncoder();
const json = (body, status = 200, extra = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const requireThat = (test, status, message) => {
  if (!test) throw new HttpError(status, message);
};
const trim = (value, max = 2000) => {
  requireThat(
    value === undefined || typeof value === "string",
    400,
    "Invalid text field.",
  );
  const s = (value || "").trim();
  requireThat(
    s.length <= max,
    400,
    `Please shorten your answer to ${max} characters.`,
  );
  return s;
};
const uuid = (value) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value || "",
  );
const base64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function digest(value) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function sign(env, value) {
  requireThat(
    env.SESSION_SECRET?.length >= 32,
    503,
    "Feedback is not configured yet.",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function equal(a, b) {
  const x = await digest(a || ""),
    y = await digest(b || "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function token(env, purpose, id, expires) {
  const value = `${purpose}.${id}.${expires}`;
  return `${value}.${await sign(env, value)}`;
}
async function validToken(env, value, purpose, id) {
  if (!value) return false;
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== purpose ||
    parts[1] !== id ||
    !/^\d+$/.test(parts[2]) ||
    Number(parts[2]) <= Date.now()
  )
    return false;
  return equal(parts[3], await sign(env, parts.slice(0, 3).join(".")));
}
async function limitedBody(request, max) {
  requireThat(
    Number(request.headers.get("content-length") || 0) <= max,
    413,
    "The upload is too large.",
  );
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "The upload is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}
async function bodyJson(request) {
  requireThat(
    request.headers.get("content-type")?.startsWith("application/json"),
    415,
    "Send JSON data.",
  );
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await limitedBody(request, 16000)),
    );
    requireThat(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Invalid form data.",
    );
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid form data.");
  }
}
const db = (env) => {
  requireThat(env.FEEDBACK_DB, 503, "Feedback is not configured yet.");
  return env.FEEDBACK_DB;
};
const query = (env, sql, ...args) =>
  db(env)
    .prepare(sql)
    .bind(...args);
const localhost = (url) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
function originCheck(request, env, url) {
  if (["GET", "HEAD"].includes(request.method)) return;
  const expected = env.PUBLIC_ORIGIN;
  requireThat(
    expected && request.headers.get("origin") === expected,
    403,
    "Please submit from the feedback page.",
  );
  requireThat(
    url.origin === expected || (env.DEV_MODE === "true" && localhost(url)),
    403,
    "Invalid feedback origin.",
  );
}
async function rateLimit(request, env, scope, limit, window = 3600000) {
  const now = Date.now(),
    slot = Math.floor(now / window);
  const identity = request.headers.get("CF-Connecting-IP") || "local";
  const key = await sign(env, `rate:${scope}:${identity}:${slot}`);
  const row = await query(
    env,
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    key,
    (slot + 1) * window,
  ).first();
  requireThat(
    row.count <= limit,
    429,
    "Too many attempts. Please try again later.",
  );
}
async function verifyHuman(request, env, data, url) {
  if (env.DEV_MODE === "true" && localhost(url)) return;
  requireThat(
    env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY,
    503,
    "Feedback is not configured yet.",
  );
  requireThat(
    typeof data.turnstileToken === "string" &&
      data.turnstileToken.length > 0 &&
      data.turnstileToken.length <= 2048,
    400,
    "Please complete the verification and try again.",
  );
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: data.turnstileToken,
      }),
    },
  );
  const result = await response.json();
  requireThat(
    result.success === true &&
      result.hostname === new URL(env.PUBLIC_ORIGIN).hostname &&
      result.action === "feedback",
    400,
    "Verification expired. Please try again.",
  );
}
export function validateResponse(data, event) {
  const name = trim(data.name, 120),
    email = trim(data.email, 254),
    phone = trim(data.phone, 40);
  requireThat(name, 400, "Please enter your name.");
  requireThat(
    email || phone,
    400,
    "Please enter an email address or phone number.",
  );
  requireThat(
    !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    400,
    "Please enter a valid email address.",
  );
  requireThat(
    !phone ||
      (/^[+\d\s().-]+$/.test(phone) &&
        phone.replace(/\D/g, "").length >= 7 &&
        phone.replace(/\D/g, "").length <= 15),
    400,
    "Please enter a valid phone number.",
  );
  requireThat(
    data.answers &&
      typeof data.answers === "object" &&
      !Array.isArray(data.answers),
    400,
    "Please answer the overall experience question.",
  );
  requireThat(
    data.consent === true,
    400,
    "Please acknowledge how your feedback will be used.",
  );
  const answers = {};
  for (const question of event.questions) {
    const value = trim(
      data.answers[question.id],
      question.type === "text" ? 2000 : 100,
    );
    requireThat(
      !question.required || value,
      400,
      "Please answer the overall experience question.",
    );
    const options =
      question.type === "rating"
        ? RATINGS.map((r) => r.value)
        : question.options;
    requireThat(
      !value || !options || options.includes(value),
      400,
      "Please choose one of the available answers.",
    );
    if (value) answers[question.id] = value;
    if (question.comment) {
      const comment = trim(data.answers[`${question.id}Comment`]);
      if (comment) answers[`${question.id}Comment`] = comment;
    }
  }
  return { name, email, phone, answers };
}
async function createResponse(request, env, url) {
  const data = await bodyJson(request);
  requireThat(uuid(data.id), 400, "Please refresh the feedback page.");
  const event = EVENTS[data.eventId];
  requireThat(event, 404, "This event was not found.");
  const clean = validateResponse(data, event);
  const hash = await digest(JSON.stringify({ eventId: event.id, ...clean }));
  const existing = await query(
    env,
    "SELECT id,payload_hash,created_at FROM responses WHERE id=?",
    data.id,
  ).first();
  if (existing) {
    requireThat(
      existing.payload_hash === hash,
      409,
      "This submission was already saved with different answers. Refresh to start a new response.",
    );
    return receipt(env, existing.id, existing.created_at);
  }
  requireThat(event.accepting, 409, "Feedback for this event is closed.");
  await rateLimit(request, env, "response", 10);
  await verifyHuman(request, env, data, url);
  const now = Date.now();
  const result = await query(
    env,
    `INSERT OR IGNORE INTO responses(id,event_id,event_version,event_snapshot,payload_hash,name,email,phone,answers,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM responses WHERE event_id=?) < ?`,
    data.id,
    event.id,
    event.version,
    JSON.stringify(event),
    hash,
    clean.name,
    clean.email,
    clean.phone,
    JSON.stringify(clean.answers),
    now,
    event.id,
    Number(env.MAX_RESPONSES || 1000),
  ).run();
  if (!result.meta.changes) {
    const raced = await query(
      env,
      "SELECT id,payload_hash,created_at FROM responses WHERE id=?",
      data.id,
    ).first();
    if (raced?.payload_hash === hash)
      return receipt(env, raced.id, raced.created_at);
    throw new HttpError(
      409,
      "Feedback capacity has been reached. Please contact the host.",
    );
  }
  return receipt(env, data.id, now);
}
async function receipt(env, id, created) {
  return json({
    ok: true,
    id,
    uploadToken: await token(env, "upload", id, created + DAY),
    uploadExpires: created + DAY,
  });
}
async function authorizeUpload(request, env, id) {
  requireThat(
    uuid(id) &&
      (await validToken(
        env,
        request.headers.get("authorization")?.replace(/^Bearer /, ""),
        "upload",
        id,
      )),
    401,
    "Your upload session expired. Your written feedback is still saved.",
  );
  const response = await query(
    env,
    "SELECT id FROM responses WHERE id=?",
    id,
  ).first();
  requireThat(response, 404, "Feedback was not found.");
}
async function uploadRecord(env, id) {
  return query(env, "SELECT * FROM uploads WHERE response_id=?", id).first();
}
async function uploadStatus(env, row) {
  const parts = row
    ? (
        await query(
          env,
          "SELECT part_number AS partNumber,etag FROM upload_parts WHERE response_id=? ORDER BY part_number",
          row.response_id,
        ).all()
      ).results
    : [];
  return json({
    status: row?.status || "none",
    fileBytes: row?.file_bytes,
    contentType: row?.content_type,
    parts,
    chunkBytes: VIDEO.chunkBytes,
  });
}
async function beginUpload(request, env, id) {
  requireThat(
    env.VIDEO_ENABLED === "true" && env.FEEDBACK_VIDEOS,
    503,
    "Video uploads are not available. Your written feedback is saved.",
  );
  const data = await bodyJson(request);
  requireThat(
    Number.isInteger(data.size) &&
      data.size > 0 &&
      data.size <= VIDEO.maxBytes &&
      VIDEO.types.includes(data.type),
    400,
    "Choose an MP4 or MOV video up to 250 MB.",
  );
  requireThat(
    Number.isFinite(data.duration) &&
      data.duration > 0 &&
      data.duration <= VIDEO.maxSeconds,
    400,
    "Choose a video no longer than 8 minutes.",
  );
  const existing = await uploadRecord(env, id);
  if (existing) {
    requireThat(
      existing.file_bytes === data.size && existing.content_type === data.type,
      409,
      "Choose the original video to resume this upload.",
    );
    return uploadStatus(env, existing);
  }
  const now = Date.now(),
    key = `feedback/${id}/${crypto.randomUUID()}`;
  const result = await query(
    env,
    `INSERT OR IGNORE INTO uploads(response_id,object_key,file_bytes,content_type,status,created_at,expires_at)
    SELECT ?,?,?,?,'creating',?,? WHERE (SELECT COALESCE(SUM(file_bytes),0) FROM uploads WHERE status NOT IN ('rejected','expired')) + ? <= ?`,
    id,
    key,
    data.size,
    data.type,
    now,
    now + DAY,
    data.size,
    Number(env.MAX_VIDEO_STORAGE_BYTES || 8_000_000_000),
  ).run();
  if (!result.meta.changes) {
    const raced = await uploadRecord(env, id);
    if (raced) return uploadStatus(env, raced);
    throw new HttpError(
      409,
      "Video storage is full. Your written feedback is saved.",
    );
  }
  try {
    const multipart = await env.FEEDBACK_VIDEOS.createMultipartUpload(key, {
      httpMetadata: { contentType: data.type },
    });
    await query(
      env,
      "UPDATE uploads SET multipart_id=?,status='uploading' WHERE response_id=?",
      multipart.uploadId,
      id,
    ).run();
  } catch {
    throw new HttpError(
      503,
      "Could not start the video upload. Your written feedback is saved. Please contact the host if retrying does not help.",
    );
  }
  return uploadStatus(env, await uploadRecord(env, id));
}
async function withUploadLease(env, id, work) {
  const now = Date.now();
  const row = await query(
    env,
    "UPDATE uploads SET lease_until=? WHERE response_id=? AND lease_until < ? AND expires_at > ? AND status IN ('uploading','verifying') RETURNING *",
    now + 120000,
    id,
    now,
    now,
  ).first();
  requireThat(
    row,
    409,
    "The video is busy, expired, or already completed. Please refresh its status.",
  );
  try {
    return await work(row);
  } finally {
    await query(
      env,
      "UPDATE uploads SET lease_until=0 WHERE response_id=?",
      id,
    ).run();
  }
}
async function putPart(request, env, id, number) {
  return withUploadLease(env, id, async (row) => {
    requireThat(
      row.status === "uploading",
      409,
      "The video is being verified.",
    );
    const total = Math.ceil(row.file_bytes / VIDEO.chunkBytes);
    requireThat(
      Number.isInteger(number) && number >= 1 && number <= total,
      400,
      "Invalid video part.",
    );
    const expected =
      number === total
        ? row.file_bytes - (number - 1) * VIDEO.chunkBytes
        : VIDEO.chunkBytes;
    const bytes = await limitedBody(request, expected);
    requireThat(
      bytes.byteLength === expected,
      400,
      "Incomplete video part. Please retry.",
    );
    const uploaded = await env.FEEDBACK_VIDEOS.resumeMultipartUpload(
      row.object_key,
      row.multipart_id,
    ).uploadPart(number, bytes);
    await query(
      env,
      "INSERT INTO upload_parts(response_id,part_number,etag) VALUES(?,?,?) ON CONFLICT(response_id,part_number) DO UPDATE SET etag=excluded.etag",
      id,
      number,
      uploaded.etag,
    ).run();
    return json({ partNumber: number, etag: uploaded.etag });
  });
}
async function finishUpload(env, id) {
  const current = await uploadRecord(env, id);
  if (current?.status === "ready") return json({ ok: true, status: "ready" });
  return withUploadLease(env, id, async (row) => {
    const parts = (
      await query(
        env,
        "SELECT part_number AS partNumber,etag FROM upload_parts WHERE response_id=? ORDER BY part_number",
        id,
      ).all()
    ).results;
    requireThat(
      parts.length === Math.ceil(row.file_bytes / VIDEO.chunkBytes) &&
        parts.every((part, i) => part.partNumber === i + 1),
      400,
      "The video is incomplete. Please retry the upload.",
    );
    await query(
      env,
      "UPDATE uploads SET status='verifying' WHERE response_id=?",
      id,
    ).run();
    let object = await env.FEEDBACK_VIDEOS.head(row.object_key);
    if (!object)
      object = await env.FEEDBACK_VIDEOS.resumeMultipartUpload(
        row.object_key,
        row.multipart_id,
      ).complete(parts);
    try {
      requireThat(
        object.size === row.file_bytes,
        400,
        "Video size did not match.",
      );
      const duration = await inspectVideo(
        env.FEEDBACK_VIDEOS,
        row.object_key,
        object.size,
      );
      await query(
        env,
        "UPDATE uploads SET status='ready',duration=? WHERE response_id=?",
        duration,
        id,
      ).run();
      return json({ ok: true, status: "ready" });
    } catch (error) {
      // Release reserved bytes only after the rejected object has actually been removed.
      await env.FEEDBACK_VIDEOS.delete(row.object_key);
      await query(
        env,
        "UPDATE uploads SET status='rejected' WHERE response_id=?",
        id,
      ).run();
      throw new HttpError(
        400,
        error.message ||
          "This video could not be verified. Written feedback remains saved.",
      );
    }
  });
}
async function admin(request, env, url, path) {
  requireThat(
    env.ADMIN_PASSWORD?.length >= 32,
    503,
    "The host dashboard is not configured.",
  );
  const local = env.DEV_MODE === "true" && localhost(url);
  const cookieName = local ? "feedback_admin_dev" : "__Secure-feedback_admin";
  const cookieOptions = `Path=${PREFIX}/admin; HttpOnly; SameSite=Strict${local ? "" : "; Secure"}`;
  if (path === "/admin/login" && request.method === "POST") {
    await rateLimit(request, env, "admin", 5, 60000);
    const data = await bodyJson(request);
    requireThat(
      typeof data.password === "string" &&
        (await equal(data.password, env.ADMIN_PASSWORD)),
      401,
      "Invalid host password.",
    );
    return json({ ok: true }, 200, {
      "Set-Cookie": `${cookieName}=${await token(env, "admin", "host", Date.now() + 3600000)}; ${cookieOptions}; Max-Age=3600`,
    });
  }
  if (path === "/admin/logout" && request.method === "POST")
    return json({ ok: true }, 200, {
      "Set-Cookie": `${cookieName}=; ${cookieOptions}; Max-Age=0`,
    });
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  requireThat(
    await validToken(env, cookie, "admin", "host"),
    401,
    "Please sign in to view feedback.",
  );
  if (path === "/admin/responses" && request.method === "GET") {
    const event = url.searchParams.get("event") || DEFAULT_EVENT;
    requireThat(EVENTS[event], 404, "Event not found.");
    const before = Number(
      url.searchParams.get("before") || Number.MAX_SAFE_INTEGER,
    );
    const afterId = url.searchParams.get("afterId") || "";
    requireThat(
      Number.isSafeInteger(before) && before > 0,
      400,
      "Invalid page.",
    );
    const result = await query(
      env,
      `SELECT r.*,u.status AS video_status,u.duration AS video_duration FROM responses r LEFT JOIN uploads u ON u.response_id=r.id
      WHERE r.event_id=? AND (r.created_at < ? OR (r.created_at=? AND r.id > ?)) ORDER BY r.created_at DESC,r.id ASC LIMIT 51`,
      event,
      before,
      before,
      afterId,
    ).all();
    const rows = result.results
      .slice(0, 50)
      .map((row) => ({
        ...row,
        answers: JSON.parse(row.answers),
        event_snapshot: JSON.parse(row.event_snapshot),
        payload_hash: undefined,
      }));
    const last = rows.at(-1);
    return json({
      rows,
      next:
        result.results.length > 50
          ? { before: last.created_at, afterId: last.id }
          : null,
    });
  }
  const video = path.match(/^\/admin\/videos\/([a-f0-9-]+)$/i);
  if (video && request.method === "GET") {
    const row = await uploadRecord(env, video[1]);
    requireThat(row?.status === "ready", 404, "Video not found.");
    const range = request.headers.get("range");
    let requestedRange;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      requireThat(match && (match[1] || match[2]), 416, "Invalid range.");
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, row.file_bytes - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), row.file_bytes - 1)
          : row.file_bytes - 1;
      requireThat(
        Number.isSafeInteger(start) &&
          Number.isSafeInteger(end) &&
          start >= 0 &&
          end >= start &&
          start < row.file_bytes,
        416,
        "Invalid range.",
      );
      requestedRange = { offset: start, length: end - start + 1 };
    }
    const object = await env.FEEDBACK_VIDEOS.get(
      row.object_key,
      requestedRange ? { range: requestedRange } : {},
    );
    requireThat(object, 404, "Video not found.");
    const headers = new Headers({
      "Content-Type": row.content_type,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="feedback-${row.response_id}.${row.content_type === "video/mp4" ? "mp4" : "mov"}"`,
    });
    if (object.range) {
      const offset = object.range.offset ?? object.size - object.range.suffix;
      const length = object.range.length ?? object.range.suffix;
      headers.set(
        "Content-Range",
        `bytes ${offset}-${offset + length - 1}/${object.size}`,
      );
      headers.set("Content-Length", String(length));
    } else headers.set("Content-Length", String(object.size));
    return new Response(object.body, {
      status: object.range ? 206 : 200,
      headers,
    });
  }
  throw new HttpError(404, "Not found.");
}
export async function cleanup(env) {
  const now = Date.now();
  const rows = (
    await query(
      env,
      "SELECT * FROM uploads WHERE status IN ('creating','uploading','verifying') AND expires_at < ? AND lease_until < ? LIMIT 25",
      now,
      now,
    ).all()
  ).results;
  for (const row of rows) {
    try {
      if (row.multipart_id) {
        const exists = await env.FEEDBACK_VIDEOS.head(row.object_key);
        if (!exists)
          await env.FEEDBACK_VIDEOS.resumeMultipartUpload(
            row.object_key,
            row.multipart_id,
          ).abort();
      }
      await env.FEEDBACK_VIDEOS.delete(row.object_key);
      await query(
        env,
        "UPDATE uploads SET status='expired' WHERE response_id=?",
        row.response_id,
      ).run();
    } catch {
      console.error("An unfinished feedback upload needs cleanup.");
    }
  }
  await query(env, "DELETE FROM rate_limits WHERE expires_at < ?", now).run();
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url),
        path = url.pathname.slice(PREFIX.length);
      requireThat(url.pathname.startsWith(`${PREFIX}/`), 404, "Not found.");
      originCheck(request, env, url);
      const config = path.match(/^\/events\/([a-z0-9-]+)$/);
      if (config && request.method === "GET") {
        const event = EVENTS[config[1]];
        requireThat(event, 404, "This event was not found.");
        const local = env.DEV_MODE === "true" && localhost(url);
        const configured = Boolean(
          env.FEEDBACK_DB &&
          env.SESSION_SECRET?.length >= 32 &&
          (local || (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET)),
        );
        return json({
          event,
          configured,
          dev: local,
          turnstileSiteKey: local ? "" : env.TURNSTILE_SITE_KEY || "",
          video: {
            ...VIDEO,
            enabled:
              env.VIDEO_ENABLED === "true" && Boolean(env.FEEDBACK_VIDEOS),
          },
        });
      }
      if (path.startsWith("/admin/"))
        return await admin(request, env, url, path);
      if (path === "/responses" && request.method === "POST")
        return await createResponse(request, env, url);
      const upload = path.match(
        /^\/responses\/([a-f0-9-]+)\/video(?:\/(parts\/(\d+)|complete))?$/i,
      );
      if (upload) {
        const id = upload[1];
        await authorizeUpload(request, env, id);
        if (!upload[2] && request.method === "GET")
          return uploadStatus(env, await uploadRecord(env, id));
        if (!upload[2] && request.method === "POST")
          return await beginUpload(request, env, id);
        requireThat(
          env.FEEDBACK_VIDEOS && env.VIDEO_ENABLED === "true",
          503,
          "Video uploads are unavailable.",
        );
        if (upload[3] && request.method === "PUT")
          return await putPart(request, env, id, Number(upload[3]));
        if (upload[2] === "complete" && request.method === "POST")
          return await finishUpload(env, id);
      }
      throw new HttpError(404, "Not found.");
    } catch (error) {
      if (!(error instanceof HttpError))
        console.error("Feedback request failed.");
      return json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Something went wrong. Please retry; already-saved feedback will not be duplicated.",
        },
        error instanceof HttpError ? error.status : 500,
      );
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};
