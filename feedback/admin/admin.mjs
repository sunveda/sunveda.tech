import { EVENTS, RATINGS } from "../events.mjs";
const $ = (id) => document.getElementById(id);
let rows = [],
  cursor;
for (const event of Object.values(EVENTS)) {
  const option = document.createElement("option");
  option.value = event.id;
  option.textContent = event.title;
  $("event").append(option);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/feedback/admin${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    $("dashboard").hidden = true;
    $("login").hidden = false;
    $("responses").replaceChildren();
    rows = [];
  }
  if (!response.ok)
    throw new Error(data.error || "The dashboard is unavailable.");
  return data;
}
function append(tag, text, parent) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}
function render(row) {
  const card = document.createElement("article");
  append("h2", row.name, card);
  append(
    "p",
    `${new Date(row.created_at).toLocaleString()} · ${[row.email, row.phone].filter(Boolean).join(" · ")}`,
    card,
  );
  const list = append("dl", "", card);
  for (const q of row.event_snapshot.questions) {
    if (row.answers[q.id]) {
      append("dt", q.title, list);
      append(
        "dd",
        RATINGS.find((rating) => rating.value === row.answers[q.id])?.label ||
          row.answers[q.id],
        list,
      );
    }
    if (row.answers[`${q.id}Comment`])
      append("dd", row.answers[`${q.id}Comment`], list);
  }
  if (row.video_status === "ready") {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "none";
    video.src = `/api/feedback/admin/videos/${encodeURIComponent(row.id)}`;
    card.append(video);
    const link = append("a", "Download private video", card);
    link.href = `${video.src}?download`;
    link.download = "";
  } else if (row.video_status) append("p", `Video: ${row.video_status}`, card);
  $("responses").append(card);
}
async function load(reset = true) {
  $("status").textContent = "Loading…";
  $("more").disabled = true;
  try {
    const query = new URLSearchParams({
      event: $("event").value,
      ...(!reset && cursor ? cursor : {}),
    });
    const result = await api(`/responses?${query}`);
    if (reset) {
      rows = [];
      $("responses").replaceChildren();
    }
    rows.push(...result.rows);
    result.rows.forEach(render);
    cursor = result.next;
    $("login").hidden = true;
    $("dashboard").hidden = false;
    $("more").hidden = !cursor;
    $("count").textContent =
      `${rows.length} responses loaded${cursor ? " — more available" : ""}.`;
    $("status").textContent = rows.length ? "" : "No responses yet.";
  } catch (error) {
    $("status").textContent = error.message;
  } finally {
    $("more").disabled = false;
  }
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/login", {
      method: "POST",
      body: JSON.stringify({ password: $("password").value }),
    });
    $("password").value = "";
    await load();
  } catch (error) {
    $("status").textContent = error.message;
  }
};
$("logout").onclick = async () => {
  try {
    await api("/logout", { method: "POST" });
    $("dashboard").hidden = true;
    $("login").hidden = false;
    $("responses").replaceChildren();
    rows = [];
    $("status").textContent = "Signed out.";
  } catch (error) {
    $("status").textContent = error.message;
  }
};
$("more").onclick = () => load(false);
$("refresh").onclick = () => load();
$("event").onchange = () => load();
$("export").onclick = () => {
  const cell = (value) =>
    `"${String(value ?? "")
      .replace(/^[\s]*[=+@-]/, (match) => `'${match}`)
      .replaceAll('"', '""')}"`;
  const columns = [
    "id",
    "name",
    "email",
    "phone",
    "created_at",
    "answers",
    "video_status",
  ];
  const csv = [
    columns,
    ...rows.map((row) =>
      columns.map((key) =>
        key === "answers" ? JSON.stringify(row.answers) : row[key],
      ),
    ),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `feedback-${$("event").value}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
await load();
