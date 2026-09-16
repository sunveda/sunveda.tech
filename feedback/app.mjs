import { setupLanguage, getLanguage } from "./i18n.mjs?v=2";
setupLanguage();
import { DEFAULT_EVENT, EVENTS, RATINGS, VIDEO } from "./events.mjs";
const errorText = (error) =>
  error instanceof TypeError || error.name === "TimeoutError"
    ? "Network error. Please check your connection and retry."
    : error.message;
const $ = (id) => document.getElementById(id);
const eventId =
  new URLSearchParams(location.search).get("event") || DEFAULT_EVENT;
let event = EVENTS[eventId],
  configured = false,
  verification = "",
  videoEnabled = false,
  selected,
  duration,
  receipt,
  controller;
const filePicker = document.createElement("label");
filePicker.className = "file-picker";
const filePickerText = document.createElement("span");
filePickerText.textContent = "Choose video";
$("video-file").before(filePicker);
filePicker.append(filePickerText, $("video-file"));
const id = crypto.randomUUID();
const storageKey = `feedback-receipt:${eventId}`;
const message = (id, text) => {
  $(id).textContent = text;
  $(id).hidden = !text;
};
async function api(path, options = {}) {
  const response = await fetch(`/api/feedback${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(60000),
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.error ||
        "Feedback is temporarily unavailable. Please try again later.",
    );
  return body;
}
function element(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  return node;
}
function render() {
  if (!event) {
    message("service-status", "This event was not found.");
    return;
  }
  $("event-label").textContent = event.title;
  $("intro").textContent = event.intro;
  for (const q of event.questions) {
    const field = element("fieldset", "", { class: "question" });
    field.append(element("legend", `${q.title}${q.required ? " *" : ""}`));
    if (q.hint) field.append(element("p", q.hint, { class: "hint" }));
    if (q.type === "text")
      field.append(
        element("textarea", "", {
          name: q.id,
          rows: 3,
          maxlength: 2000,
          "aria-label": q.title,
        }),
      );
    else {
      const choices = element("div", "", { class: "choices" });
      for (const option of q.type === "rating"
        ? RATINGS
        : q.options.map((value) => ({ value, label: value }))) {
        const label = element("label", "", { class: "choice" });
        const input = element("input", "", {
          type: "radio",
          name: q.id,
          value: option.value,
          ...(q.required ? { required: "" } : {}),
        });
        label.append(input, element("span", option.label));
        choices.append(label);
      }
      field.append(choices);
      if (!q.required) {
        const clear = element("button", "Clear answer", {
          type: "button",
          class: "clear-choice",
        });
        clear.onclick = () =>
          field.querySelectorAll("input").forEach((input) => {
            input.checked = false;
          });
        field.append(clear);
      }
    }
    if (q.comment) {
      const label = element("label", "Anything you’d like to add? (optional)", {
        class: "comment-label",
      });
      label.append(
        element("textarea", "", {
          name: `${q.id}Comment`,
          rows: 2,
          maxlength: 2000,
        }),
      );
      field.append(label);
    }
    $(q.id === "biryani" ? "biryani-question" : "questions").append(field);
  }
}
function remember() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(receipt));
  } catch {
    /* Receipt still works in this tab. */
  }
}
function showReceipt() {
  $("receipt").hidden = false;
  $("receipt-reference").textContent = receipt.id;
  const panel = document.querySelector(".upload-panel");
  $("receipt").append(panel);
  $("feedback-form").hidden = true;
  $("receipt").focus();
  if (receipt.done) {
    panel.hidden = true;
    message("upload-message", "Your video is saved too. Thank you!");
    $("upload-progress-wrap").hidden = false;
  } else if (videoEnabled) {
    panel.hidden = false;
    $("upload-progress-wrap").hidden = false;
    $("retry-video").hidden = false;
    $("retry-video").disabled = !selected;
    message(
      "video-status",
      "Your written feedback is saved. You can add your video in this tab within 24 hours.",
    );
  } else {
    panel.hidden = true;
    $("upload-progress-wrap").hidden = true;
    message(
      "receipt-video-status",
      "Your written feedback is saved. Video uploads are not available yet.",
    );
  }
}
$("video-file").onchange = async () => {
  selected = undefined;
  $("retry-video").disabled = true;
  const file = $("video-file").files[0];
  if ($("video-preview").src) URL.revokeObjectURL($("video-preview").src);
  $("video-preview").hidden = true;
  if (!file) return;
  try {
    if (
      !VIDEO.types.includes(file.type) ||
      file.size > VIDEO.maxBytes ||
      !file.size
    )
      throw new Error("Choose an MP4 or MOV video up to 250 MB.");
    const preview = $("video-preview");
    preview.src = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      preview.onloadedmetadata = resolve;
      preview.onerror = () =>
        reject(
          new Error(
            "This browser could not read the video. Try an MP4 export.",
          ),
        );
    });
    duration = preview.duration;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > VIDEO.maxSeconds
    )
      throw new Error("Choose a video no longer than 8 minutes.");
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    if (receipt?.fingerprint && receipt.fingerprint !== fingerprint)
      throw new Error("Choose the same original file to resume the upload.");
    selected = file;
    preview.hidden = false;
    $("remove-video").hidden = false;
    $("retry-video").disabled = false;
    message(
      "video-status",
      `${file.name} · ${(file.size / 1000000).toFixed(1)} MB · ${Math.ceil(duration)} seconds`,
    );
  } catch (error) {
    $("video-file").value = "";
    message("video-status", errorText(error));
  }
};
$("remove-video").onclick = () => {
  selected = undefined;
  $("video-file").value = "";
  $("video-preview").pause();
  URL.revokeObjectURL($("video-preview").src);
  $("video-preview").removeAttribute("src");
  $("video-preview").hidden = true;
  $("remove-video").hidden = true;
  message("video-status", "No video selected.");
};
async function upload() {
  if (!selected || !receipt || receipt.done) return;
  const file = selected;
  controller = new AbortController();
  $("retry-video").hidden = true;
  $("skip-video").hidden = false;
  $("upload-progress-wrap").hidden = false;
  $("video-file").disabled = true;
  $("remove-video").disabled = true;
  receipt.fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  remember();
  const path = `/responses/${receipt.id}/video`,
    headers = { Authorization: `Bearer ${receipt.uploadToken}` };
  const request = (suffix, options = {}) =>
    api(path + suffix, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
    });
  try {
    let status = await request("", {
      method: "POST",
      body: JSON.stringify({ size: file.size, type: file.type, duration }),
    });
    if (["rejected", "expired", "creating"].includes(status.status))
      throw new Error(
        "This upload cannot resume. Your written feedback is safe; please contact the host about your video.",
      );
    if (status.status === "uploading") {
      const completed = new Set(status.parts.map((part) => part.partNumber)),
        total = Math.ceil(file.size / VIDEO.chunkBytes);
      for (let number = 1; number <= total; number++) {
        message(
          "upload-message",
          `Uploading video part ${number} of ${total}…`,
        );
        if (!completed.has(number)) {
          for (let attempt = 0; ; attempt++) {
            try {
              await request(`/parts/${number}`, {
                method: "PUT",
                body: file.slice(
                  (number - 1) * VIDEO.chunkBytes,
                  number * VIDEO.chunkBytes,
                ),
              });
              break;
            } catch (error) {
              if (attempt >= 2 || controller.signal.aborted) throw error;
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (attempt + 1)),
              );
            }
          }
        }
        $("upload-progress").value = (number / total) * 100;
      }
    }
    message("upload-message", "Checking your video…");
    await request("/complete", { method: "POST" });
    receipt.done = true;
    delete receipt.uploadToken;
    remember();
    $("upload-progress").value = 100;
    message("upload-message", "Your video is saved too. Thank you!");
    document.querySelector(".upload-panel").hidden = true;
  } catch (error) {
    message(
      "upload-message",
      controller.signal.aborted
        ? "Video upload paused. Your written feedback is saved."
        : `${errorText(error)} Your written feedback is saved.`,
    );
    $("retry-video").textContent = "Retry video upload";
    $("retry-video").hidden = false;
  } finally {
    $("skip-video").hidden = true;
    $("video-file").disabled = false;
    $("remove-video").disabled = false;
  }
}
$("retry-video").onclick = upload;
$("skip-video").onclick = () => controller?.abort();
$("feedback-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!configured) return;
  const form = $("feedback-form");
  for (const input of form.querySelectorAll("input,textarea"))
    input.setCustomValidity("");
  const invalid = !$("guest-name").value.trim()
    ? [$("guest-name"), "Please enter your name."]
    : $("guest-email").validity.typeMismatch
      ? [$("guest-email"), "Please enter a valid email address."]
      : !form.querySelector('input[name="overall"]:checked')
        ? [
            form.querySelector('input[name="overall"]'),
            "Please answer the overall experience question.",
          ]
        : !$("consent").checked
          ? [$("consent"), "Please acknowledge how your feedback will be used."]
          : null;
  if (invalid) {
    message("form-error", invalid[1]);
    invalid[0].focus();
    return;
  }
  if (!form.reportValidity()) return;
  if (!$("guest-email").value.trim() && !$("guest-phone").value.trim()) {
    message("form-error", "Please enter an email address or phone number.");
    $("guest-email").focus();
    return;
  }
  const data = new FormData(form),
    answers = {};
  for (const q of event.questions) {
    answers[q.id] = data.get(q.id) || "";
    if (q.comment) answers[`${q.id}Comment`] = data.get(`${q.id}Comment`) || "";
  }
  $("submit-button").disabled = true;
  message("form-error", "");
  try {
    receipt = await api("/responses", {
      method: "POST",
      body: JSON.stringify({
        id,
        eventId,
        name: $("guest-name").value,
        email: $("guest-email").value,
        phone: $("guest-phone").value,
        consent: $("consent").checked,
        answers,
        turnstileToken: verification,
      }),
    });
    remember();
    showReceipt();
    if (selected) await upload();
  } catch (error) {
    message("form-error", errorText(error));
    window.turnstile?.reset();
  } finally {
    $("submit-button").disabled = false;
  }
};
render();
try {
  const config = await api(`/events/${eventId}`);
  configured = config.configured && config.event.accepting;
  videoEnabled = config.video.enabled;
  message(
    "service-status",
    configured
      ? config.dev
        ? "Local preview — submissions stay on this computer."
        : ""
      : "Feedback is not open yet. Please check back soon.",
  );
  $("submit-button").disabled = !configured;
  if (!videoEnabled) {
    $("video-file").disabled = true;
    message(
      "video-status",
      "Video uploads are not available yet. You can still send written feedback.",
    );
  }
  if (configured && config.turnstileSiteKey) {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    let widget;
    const renderVerification = () => {
      if (widget !== undefined) window.turnstile.remove(widget);
      widget = window.turnstile.render("#verification", {
        sitekey: config.turnstileSiteKey,
        action: "feedback",
        language: getLanguage(),
        callback: (value) => {
          verification = value;
        },
        "expired-callback": () => {
          verification = "";
        },
      });
    };
    script.onload = renderVerification;
    window.addEventListener("feedback-language-change", () => {
      verification = "";
      if (window.turnstile) renderVerification();
    });
    script.onerror = () =>
      message(
        "service-status",
        "Verification could not load. Please reload before submitting.",
      );
    document.head.append(script);
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.id && saved.uploadExpires > Date.now()) {
      receipt = saved;
      showReceipt();
    }
  } catch {
    /* No saved receipt. */
  }
} catch (error) {
  message("service-status", errorText(error));
}
