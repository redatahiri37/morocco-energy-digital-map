/* Atlas Solar — usage analytics (cookieless, no PII, self-hosted)
 * ---------------------------------------------------------------
 * Why this exists: until now the tool had zero visibility into whether
 * anyone uses it, where they drop off, or which estimates they actually
 * see. Without that there is no learning loop — only opinion.
 *
 * Privacy contract (matches solar/PROMPT.md "coarse aggregate only"):
 *   - No cookies. No localStorage. No cross-site identifier.
 *   - The session id is a random value in sessionStorage. It dies with the
 *     tab, exists only to stitch a funnel together, and is never linked to
 *     a person.
 *   - The address the visitor types is NEVER sent. Only coordinates
 *     rounded to 0.1 degrees (~11 km — city scale in Morocco).
 *   - Honours navigator.doNotTrack and globalPrivacyControl.
 *   - Events go to our own Cloudflare Worker. No third party.
 *
 * Transport: events are queued and flushed with sendBeacon as text/plain,
 * which is a CORS "simple request" — no preflight, no blocking, and it
 * survives the page being closed.
 */
const Analytics = {
  ENDPOINT: "https://solar-pvgis.redatahiri.workers.dev/e",
  FLUSH_MS: 4000,
  MAX_QUEUE: 20,

  _queue: [],
  _timer: null,
  _enabled: false,
  _sid: null,
  _t0: 0,
  _step: 1,
  _seen: new Set(),

  init() {
    if (this._optedOut()) return;
    this._enabled = true;
    this._t0 = Date.now();
    this._sid = this._sessionId();

    this.track("view", {
      ref: this._referrerHost(),
      dev: this._device(),
      w: window.innerWidth,
      lang: (navigator.language || "").slice(0, 5),
    });

    // One flush point that fires reliably on mobile, where "unload" does not.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.track("exit", { step: this._step, dur: this._elapsed() });
        this.flush();
      }
    });
    addEventListener("pagehide", () => this.flush());
  },

  // A visitor who has asked not to be tracked is not tracked. No exceptions.
  _optedOut() {
    return navigator.doNotTrack === "1" ||
           window.doNotTrack === "1" ||
           navigator.globalPrivacyControl === true;
  },

  _sessionId() {
    try {
      let s = sessionStorage.getItem("as_sid");
      if (!s) {
        s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        sessionStorage.setItem("as_sid", s);
      }
      return s;
    } catch (e) {
      // Private mode / storage blocked: still countable, just not stitchable.
      return "nostore";
    }
  },

  _referrerHost() {
    try {
      if (!document.referrer) return "direct";
      const h = new URL(document.referrer).hostname;
      return h === location.hostname ? "self" : h.replace(/^www\./, "");
    } catch (e) { return "unknown"; }
  },

  _device() {
    const w = window.innerWidth;
    return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  },

  _elapsed() { return Math.round((Date.now() - this._t0) / 1000); },

  /** Record the furthest step reached, so "exit" reports real drop-off. */
  setStep(n) { if (n > this._step) this._step = n; },

  /** Fire an event at most once per session, deduped on `key`.
   *  `key` is separate from `name` so several distinct milestones can share
   *  one event name (e.g. every param_change:<field> dedupes independently
   *  while still arriving as the whitelisted event "param_change"). */
  once(key, name, data) {
    if (this._seen.has(key)) return;
    this._seen.add(key);
    this.track(name, data);
  },

  track(name, data = {}) {
    if (!this._enabled) return;
    this._queue.push({ e: name, t: this._elapsed(), ...data });
    if (this._queue.length >= this.MAX_QUEUE) return this.flush();
    if (!this._timer) this._timer = setTimeout(() => this.flush(), this.FLUSH_MS);
  },

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this._enabled || !this._queue.length) return;
    const body = JSON.stringify({ sid: this._sid, ev: this._queue.splice(0) });
    try {
      // text/plain keeps this a simple request (no preflight).
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (!navigator.sendBeacon || !navigator.sendBeacon(this.ENDPOINT, blob)) {
        fetch(this.ENDPOINT, { method: "POST", body, keepalive: true, mode: "cors" })
          .catch(() => {});
      }
    } catch (e) { /* analytics must never break the product */ }
  },

  /** Coordinates are only ever reported at ~11 km resolution. */
  coarse(v) { return Math.round(v * 10) / 10; },
};

window.Analytics = Analytics;
