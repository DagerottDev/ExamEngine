import config from "../analytics-config.json" with { type: "json" };
import packageInfo from "../../package.json" with { type: "json" };
const { version } = packageInfo;

export const CONSENT_KEY = "exam-engine:analytics:consent";
export const IDENTIFIER_KEY = "exam-engine:analytics:browser";
const endpoint = "https://us.i.posthog.com/i/v0/e/";
const oneOf = (...values) => value => values.includes(value);
const count = value => Number.isInteger(value) && value > 0 && value <= 10000;
const kind = oneOf("exam", "study", "mock", "revision", "retest");
const screen = oneOf("home", "library", "study", "progress", "settings", "exam", "results");
const fields = {
  app_opened: { app_version: value => value === version, traffic: oneOf("Reddit", "X", "GitHub", "search", "direct", "other") },
  screen_viewed: { screen },
  session_started: { kind, question_count: count },
  session_resumed: { kind },
  session_completed: { kind, submission: oneOf("manual", "timer") },
  pack_imported: { source: oneOf("sample", "file"), result: oneOf("added", "deduplicated") },
  pack_published: { question_count: count },
  backup_exported: { encrypted: value => typeof value === "boolean" },
  backup_restored: { mode: oneOf("merge", "replace") },
  appearance_applied: { preset: oneOf("focused", "compact", "spacious") },
};

function trafficCategory(referrer, origin) {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "direct";
    const host = url.hostname;
    const matches = domain => host === domain || host.endsWith(`.${domain}`);
    if (matches("reddit.com")) return "Reddit";
    if (matches("x.com") || matches("twitter.com") || host === "t.co") return "X";
    if (matches("github.com")) return "GitHub";
    if (/^(www\.)?google\.[a-z.]+$/.test(host) || ["bing.com", "duckduckgo.com", "search.yahoo.com"].some(matches)) return "search";
  } catch { /* Malformed referrers are never transmitted. */ }
  return "other";
}

export function createUsageAnalytics(env = globalThis, settings = config) {
  let opened = false, currentScreen = "home", storageFailed = false, lastTimestamp = 0;
  const eligible = () => /^phc_[A-Za-z0-9_-]+$/.test(settings.publicToken) && env.location?.origin === settings.origin && settings.paths.includes(env.location.pathname);
  function readConsent() {
    try {
      const value = env.localStorage.getItem(CONSENT_KEY);
      return value === "allow" || value === "deny" ? value : null;
    } catch { return null; }
  }
  function track(event, properties = {}) {
    try {
      if (storageFailed || !eligible() || readConsent() !== "allow" || env.navigator?.onLine === false || !Object.hasOwn(fields, event)) return;
      let id = env.localStorage.getItem(IDENTIFIER_KEY);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
        id = env.crypto.randomUUID();
        env.localStorage.setItem(IDENTIFIER_KEY, id);
        if (env.localStorage.getItem(IDENTIFIER_KEY) !== id) return;
      }
      const allowed = {};
      for (const [key, valid] of Object.entries(fields[event])) if (Object.hasOwn(properties, key) && valid(properties[key])) allowed[key] = properties[key];
      // Fixed schema only: no ambient browser properties, workspace data, or URLs.
      // Preserve action order when concurrent requests arrive out of order.
      lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
      const body = JSON.stringify({ api_key: settings.publicToken, event, distinct_id: id, timestamp: new Date(lastTimestamp).toISOString(), properties: { ...allowed, $process_person_profile: false, $geoip_disable: true } });
      Promise.resolve(env.fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, credentials: "omit", referrerPolicy: "no-referrer", keepalive: true })).catch(() => {});
    } catch { /* Analytics must never interrupt study or saving. */ }
  }
  function activate() {
    if (!eligible() || readConsent() !== "allow") return;
    if (!opened) {
      opened = true;
      track("app_opened", { app_version: version, traffic: trafficCategory(env.document?.referrer, settings.origin) });
      track("screen_viewed", { screen: currentScreen });
    }
  }
  function viewScreen(next) {
    if (!screen(next) || next === currentScreen) return;
    currentScreen = next;
    track("screen_viewed", { screen: next });
  }
  function setConsent(choice) {
    if (!oneOf("allow", "deny")(choice)) return false;
    try {
      // Clear first on withdrawal; re-enabling gets a fresh browser identifier.
      if (choice === "deny") env.localStorage.removeItem(IDENTIFIER_KEY);
      env.localStorage.setItem(CONSENT_KEY, choice);
      if (readConsent() !== choice) return false;
    } catch { storageFailed = true; return false; }
    storageFailed = false;
    activate();
    return true;
  }
  return { track, viewScreen, readConsent, setConsent, eligible, activate };
}

export const usageAnalytics = createUsageAnalytics();
export const track = usageAnalytics.track;

export function initializeAnalyticsControls() {
  const description = "Optional usage events go to PostHog in the US with a random browser identifier. Questions, answers, scores, notes, attachments, and backups stay local. No recordings or automatic click tracking.";
  const buttons = `<div class="row wrap"><button data-analytics-consent="allow">Allow analytics</button><button data-analytics-consent="deny">Don’t allow</button></div>`;
  document.querySelector(".workspace-nav").insertAdjacentHTML("beforebegin", `<section id="analytics-notice" class="card" aria-labelledby="analytics-notice-heading" hidden><h2 id="analytics-notice-heading">Help improve ExamEngine?</h2><p>${description} You can change your choice in Settings → Privacy.</p>${buttons}<p id="analytics-notice-status" role="status"></p></section>`);
  document.getElementById("settings-panel").insertAdjacentHTML("beforeend", `<section class="card" aria-labelledby="privacy-heading"><h3 id="privacy-heading">Privacy</h3><h4>Usage analytics</h4><p>${description}</p><p id="analytics-status" role="status"></p>${buttons}</section>`);
  function render() {
    const eligible = usageAnalytics.eligible(), consent = usageAnalytics.readConsent();
    document.getElementById("analytics-notice").hidden = !eligible || consent !== null;
    document.getElementById("analytics-status").textContent = !eligible ? "Analytics is unavailable on this copy. Collection is limited to the configured production site." : consent === "allow" ? "Analytics allowed. Disabling removes this browser’s analytics identifier." : consent === "deny" ? "Analytics declined. No usage events are sent." : "Analytics is off until you allow it.";
    document.querySelectorAll("[data-analytics-consent]").forEach(button => {
      button.disabled = !eligible;
      button.setAttribute("aria-pressed", String(consent === button.dataset.analyticsConsent));
    });
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-analytics-consent]");
    if (!button) return;
    const saved = usageAnalytics.setConsent(button.dataset.analyticsConsent);
    render();
    for (const id of ["analytics-status", "analytics-notice-status"]) if (!saved) document.getElementById(id).textContent = "Could not save your privacy choice. Analytics stays off when browser storage is unavailable.";
  });
  window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== CONSENT_KEY && event.key !== IDENTIFIER_KEY) return;
    usageAnalytics.activate();
    render();
  });
  usageAnalytics.activate();
  render();
}
