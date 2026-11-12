import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VIEWPORTS = [
  { name: "small-phone", width: 360, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
];

const SHARED_LANGUAGES = ["en", "ja", "ko", "zh", "es", "de", "fr", "pt", "ru", "ar", "hi", "it"];
const AEDOKO_LANGUAGES = ["ja", "ja-x-easy", "en", "zh-Hans", "zh-Hant", "ko", "pt", "es", "vi", "tl", "ne", "id", "th", "hi", "fr", "ru"];
const OTHER_ROUTES = ["/privacy.html", "/terms.html", "/rsvp/", "/a/", "/feedback/?lang=en", "/feedback/?lang=ja", "/feedback/admin/", "/app/daiboju/", "/app/daiboju/go.html?p=13&l=ja&lang=ja", "/app/daiboju/?drill=1&daiboju-mock=1", "/app/daiboju/go.html?e=layout&p=12&l=ja&daiboju-mock=1&lang=ja", "/app/daiboju/go.html?e=layout&p=12&l=en&daiboju-mock=1", "/app/daiboju/demo.html", "/app/daiboju/tour.html", "/app/daiboju/go.html?demo=tsunami&l=en&h=tsunami"];

// Daiboju's API is deployed separately on Cloud Run; tests never call the live service. Routes with `daiboju-mock` get populated fixtures so the
// connected sign-up form and the full guidance page are audited; other Daiboju routes see the API
// as unreachable and audit the fallback states.
const DAIBOJU_FIXTURES = {
  config: {
    vapidPublicKey: null, lineAddUrl: null, dryRun: false,
    channels: { webpush: true, email: true, line: true, sms: true, whatsapp: true },
    languages: { en: "English", ja: "日本語", zh: "中文(简体)", ko: "한국어", vi: "Tiếng Việt", pt: "Português", es: "Español" },
    templateLanguages: ["en", "ja", "zh", "ko", "vi", "pt", "es"],
    prefectures: [{ code: "12", ja: "千葉県", en: "Chiba" }, { code: "13", ja: "東京都", en: "Tokyo" }, { code: "46", ja: "鹿児島県", en: "Kagoshima" }],
  },
  guidance: {
    en: { title: "Near the coast or a river? Go to high ground now", summary: "If you are near the sea or a river mouth, go to high ground or the 3rd floor or higher of a sturdy concrete building now.", steps: ["If you are near the sea or a river mouth, go to high ground or the 3rd floor or higher of a sturdy concrete building now.", "Do not wait for the official tsunami forecast and do not go to look at the sea.", "If you are inland, check your building for damage and watch for aftershocks."], avoid: ["Do not drive unless you cannot walk.", "Do not return to the coast until the warning is lifted."] },
    ja: { title: "海や川の近くなら、今すぐ高い所へ", summary: "海岸や河口の近くにいる人は、今すぐ高台か頑丈な建物の3階以上へ避難してください。", steps: ["海岸や河口の近くにいる人は、今すぐ高台か頑丈な建物の3階以上へ避難してください。", "津波の発表を待たず、海を見に行かないでください。", "内陸にいる人は建物の被害を確認し、余震に注意してください。"], avoid: ["歩ける人は車を使わないでください。", "警報が解除されるまで海岸に戻らないでください。"] },
  },
};

function daibojuMock(route) {
  const pageUrl = route.request().frame()?.url() || "";
  if (!pageUrl.includes("daiboju-mock")) return route.abort();
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/api/config")) return route.fulfill({ json: DAIBOJU_FIXTURES.config });
  if (url.pathname.endsWith("/api/guidance")) {
    const lang = url.searchParams.get("l") === "ja" ? "ja" : "en";
    return route.fulfill({ json: {
      event: { id: "layout", hazard: "earthquake", drill: true, facts: { epicenter: "千葉県東方沖", magnitude: 7.4 } },
      pref: { code: "12", en: "Chiba", ja: "千葉県" },
      area: { prefCode: "12", scale: 50, intensity: "5+", tsunamiRisk: "Warning" },
      action: "coast_high_ground", showRoute: true, shelterLayer: "skhb05",
      guidance: DAIBOJU_FIXTURES.guidance[lang],
    } });
  }
  return route.abort();
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";

      const filePath = resolve(ROOT, `.${pathname}`);
      const pathFromRoot = relative(ROOT, filePath);
      if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === ".." || isAbsolute(pathFromRoot)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Not a file");

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine the layout-test server port."));
        return;
      }
      resolveServer({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())),
      });
    });
  });
}

function expectedDocumentLanguage(language) {
  return language === "ja-x-easy" ? "ja" : language;
}

async function waitForStableText(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
      ]);
    }
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  });
}

async function auditLayout(page, scenario) {
  const result = await page.evaluate(({ route, language, viewport }) => {
    const isVisible = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      // A 1×1 px box is the standard visually-hidden (screen-reader-only) pattern, not visible text.
      const visuallyHidden = box.width <= 1 && box.height <= 1;
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && !visuallyHidden;
    };

    const lineOverlap = element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rectangles = [...range.getClientRects()]
        .filter(rectangle => rectangle.width > 1 && rectangle.height > 1)
        .sort((left, right) => left.top - right.top || left.left - right.left);
      const lines = [];

      for (const rectangle of rectangles) {
        const line = lines.find(candidate => Math.abs(candidate.top - rectangle.top) < 2);
        if (line) line.bottom = Math.max(line.bottom, rectangle.bottom);
        else lines.push({ top: rectangle.top, bottom: rectangle.bottom });
      }

      lines.sort((left, right) => left.top - right.top);
      let overlap = 0;
      for (let index = 1; index < lines.length; index += 1) {
        overlap = Math.max(overlap, lines[index - 1].bottom - lines[index].top);
      }
      return Math.max(0, Math.round(overlap));
    };

    const textSelector = "h1,h2,h3,h4,h5,h6,p,li,a,button,label,small,strong";
    const clipped = [...document.querySelectorAll(textSelector)]
      .filter(isVisible)
      .filter(element => {
        const style = getComputedStyle(element);
        const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        return (clipsY && element.scrollHeight > element.clientHeight + 2)
          || (clipsX && element.scrollWidth > element.clientWidth + 2);
      })
      .map(element => ({
        element: `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, ".")}`,
        text: (element.textContent ?? "").trim().slice(0, 100),
      }));

    const lineCollisions = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(isVisible)
      .map(element => ({
        element: `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, ".")}`,
        overlap: lineOverlap(element),
        text: (element.textContent ?? "").trim().slice(0, 100),
      }))
      .filter(item => item.overlap > 1);

    const headerPairs = [];
    const addHeaderPair = (leftSelector, rightSelector) => {
      const left = document.querySelector(leftSelector);
      const right = document.querySelector(rightSelector);
      if (!left || !right || !isVisible(left) || !isVisible(right)) return;
      const leftBox = left.getBoundingClientRect();
      const rightBox = right.getBoundingClientRect();
      const overlapX = Math.min(leftBox.right, rightBox.right) - Math.max(leftBox.left, rightBox.left);
      const overlapY = Math.min(leftBox.bottom, rightBox.bottom) - Math.max(leftBox.top, rightBox.top);
      if (overlapX > 1 && overlapY > 1) {
        headerPairs.push({ left: leftSelector, right: rightSelector, overlapX: Math.round(overlapX), overlapY: Math.round(overlapY) });
      }
    };

    if (route === "/") addHeaderPair(".nav__logo", ".nav__actions");
    if (route === "/app/") addHeaderPair(".brand", ".topbar__actions");
    if (route === "/app/aedoko/") addHeaderPair(".brand", ".language-button");
    if (route === "/a/") addHeaderPair(".brand", ".back");

    return {
      actualLanguage: document.documentElement.lang,
      clipped,
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      headerPairs,
      language,
      lineCollisions,
      route,
      viewport,
    };
  }, scenario);

  const problems = [];
  if (result.documentOverflow > 1) problems.push(`horizontal overflow: ${result.documentOverflow}px`);
  if (result.clipped.length) problems.push(`clipped text: ${JSON.stringify(result.clipped)}`);
  if (result.lineCollisions.length) problems.push(`line collisions: ${JSON.stringify(result.lineCollisions)}`);
  if (result.headerPairs.length) problems.push(`header collisions: ${JSON.stringify(result.headerPairs)}`);
  if (result.actualLanguage !== expectedDocumentLanguage(scenario.language)) {
    problems.push(`document language is ${result.actualLanguage || "missing"}`);
  }
  return problems;
}

async function checkMobileMenu(page, scenario) {
  if (scenario.route !== "/") return [];

  const toggle = page.locator("[data-nav-toggle]");
  if (!(await toggle.isVisible())) return ["navigation toggle is not visible"];

  await toggle.click();
  const state = await page.locator("[data-nav-mobile-menu]").evaluate(element => {
    const box = element.getBoundingClientRect();
    return {
      display: getComputedStyle(element).display,
      overflow: Math.max(0, element.scrollWidth - element.clientWidth),
      viewportWidth: document.documentElement.clientWidth,
      width: box.width,
    };
  });
  await toggle.click();

  const problems = [];
  if (state.display === "none") problems.push("navigation menu did not open");
  if (state.width > state.viewportWidth + 1) problems.push(`navigation menu is ${Math.round(state.width - state.viewportWidth)}px wider than the viewport`);
  if (state.overflow > 1) problems.push(`navigation menu has ${state.overflow}px horizontal overflow`);
  return problems;
}

async function checkAppsNavigation(page, scenario) {
  if (scenario.route !== "/" || scenario.language !== "en") return [];

  const links = page.locator('[data-i18n="nav.apps"]');
  const hrefs = await links.evaluateAll(elements => elements.map(element => element.getAttribute("href")));
  const problems = hrefs.length === 2 && hrefs.every(href => href === "#showcase")
    ? []
    : [`Apps navigation targets are ${JSON.stringify(hrefs)}`];

  const desktopLink = page.locator('.nav__link[data-i18n="nav.apps"]');
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    await page.locator("[data-nav-toggle]").click();
    await page.locator('.nav__mobile-link[data-i18n="nav.apps"]').click();
  }

  try {
    await page.waitForFunction(() => {
      const section = document.querySelector("#showcase");
      if (!section || window.location.hash !== "#showcase") return false;
      const sectionTop = section.getBoundingClientRect().top;
      const scrollPadding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      return Math.abs(sectionTop - scrollPadding) <= 2;
    }, { timeout: 5_000 });
  } catch {
    problems.push("Apps navigation did not scroll to Built in Practice");
  }

  return problems;
}

async function testScenario(page, origin, scenario) {
  const query = scenario.route === "/app/aedoko/"
    ? `?lang=${encodeURIComponent(scenario.language)}&layout-test=1`
    : "?layout-test=1";
  await page.goto(`${origin}${scenario.route}${scenario.route.includes("?") ? query.replace("?", "&") : query}`, { waitUntil: "load", timeout: 30_000 });

  if (scenario.route === "/" || scenario.route === "/app/") {
    const selector = scenario.route === "/" ? ".lang-switch__select" : ".language select";
    await page.locator(selector).selectOption(scenario.language);
  }

  await waitForStableText(page);
  return [
    ...(await auditLayout(page, scenario)),
    ...(await checkMobileMenu(page, scenario)),
    ...(await checkAppsNavigation(page, scenario)),
  ];
}

async function runViewport(browser, origin, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("aedoko-public-data-notice-v1", "acknowledged");
    if (location.href.includes("daiboju-mock")) window.DAIBOJU_SIGNUP_OPEN = true;
  });
  await page.route(/googletagmanager|goatcounter|unpkg\.com/, route => route.abort());
  await page.route(/\/api\/(config|guidance|drill|subscribe)(\?|$)/, daibojuMock);

  const scenarios = [
    ...SHARED_LANGUAGES.flatMap(language => [
      { route: "/", language, viewport: viewport.name },
      { route: "/app/", language, viewport: viewport.name },
    ]),
    ...AEDOKO_LANGUAGES.map(language => ({ route: "/app/aedoko/", language, viewport: viewport.name })),
    ...OTHER_ROUTES.map(route => ({ route, language: route.includes("lang=ja") ? "ja" : "en", viewport: viewport.name })),
  ];

  const failures = [];
  for (const scenario of scenarios) {
    try {
      const problems = await testScenario(page, origin, scenario);
      if (problems.length) failures.push({ ...scenario, problems });
    } catch (error) {
      failures.push({ ...scenario, problems: [error instanceof Error ? error.message : String(error)] });
    }
  }

  await context.close();
  return { checks: scenarios.length, failures };
}

const staticServer = await startStaticServer();
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const results = await Promise.all(VIEWPORTS.map(viewport => runViewport(browser, staticServer.origin, viewport)));
  const checks = results.reduce((total, result) => total + result.checks, 0);
  const failures = results.flatMap(result => result.failures);

  if (failures.length) {
    console.error(`\n${failures.length} of ${checks} multilingual layout checks failed:\n`);
    for (const failure of failures) {
      console.error(`- ${failure.viewport} ${failure.route} [${failure.language}]`);
      for (const problem of failure.problems) console.error(`  ${problem}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`All ${checks} multilingual layout checks passed across ${VIEWPORTS.length} viewports.`);
  }
} finally {
  if (browser) await browser.close();
  await staticServer.close();
}
