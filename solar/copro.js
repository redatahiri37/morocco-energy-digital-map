/* Wattu — « immeuble » mode: a flat in a city building with a shared roof.
 *
 * The simulator assumes a house: one roof, one household, one meter. In a
 * Moroccan city building the roof terrace is shared by every flat, each flat
 * has its own meter, and the common areas (lift, stair lights, booster pump)
 * have one more. This mode:
 *   - asks how many storeys and flats per floor (storeys shared with the 3D
 *     view, so both show the same building),
 *   - limits the auto-sized system to the visitor's share of the roof
 *     (roof capacity ÷ number of flats), so the headline stays honest,
 *   - explains the three ways to equip a shared roof and who decides, from
 *     our reading of Law 18-00 on co-ownership (amended by Law 106-12) and
 *     Law 82-21 on self-generation. Explanatory: no legal advice, and the
 *     common-areas route has no figure (no public data on their use).
 *
 * Loaded before app.js; it reads app.js globals (LANG, View3D, Analytics,
 * fmtNum, fmtDec, bidi) at call time only. Builds its elements with
 * createElement / textContent, like app.js (CI forbids parsing HTML here).
 */

// Arabic: keep a number with a Latin unit left to right, on one line, inside RTL text.
const L2R = (s) => `\u2066${s.replace(/ /g, "\u00a0")}\u2069`;

const COPRO_I18N = {
  fr: {
    modeAria: "Type de logement",
    house: "Maison", flat: "Appartement en immeuble",
    heroNote: (share, total, n) => `Mode immeuble : installation limitée à votre part du toit, ${share} sur ${total} pour ${n} logements.`,
    heroNoteNoRoof: "Mode immeuble : placez le toit de l'immeuble sur la carte pour limiter l'installation à votre part.",
    title: "Copropriété : un toit pour tout l'immeuble",
    sub: "Ce que le toit peut faire pour chaque logement, et qui décide",
    storeys: "Étages", perFloor: "Logements par étage",
    less: "un de moins", more: "un de plus",
    units: (n) => `= ${n} logements`,
    srcOsm: "d'après OpenStreetMap", srcAssumed: "supposé",
    statRoof: "Toit entier", statShare: "Votre part", statCover: "Couverture",
    shareSub: (kwh) => `≈ ${kwh} kWh par an`,
    coverSub: "de votre consommation annuelle",
    noRoof: "Placez ou dessinez le toit de l'immeuble sur la carte pour calculer la part de chaque logement.",
    tooSmall: "Votre part n'atteint pas 1 kWc : l'installation affichée la dépasse. Dans cet immeuble, le toit sert mieux les parties communes (voie 1).",
    capNote: "Capacité maximale, avant la cage d'escalier, les réservoirs, les chauffe-eau solaires et les paraboles qui prennent leur place sur la terrasse : comptez moins en pratique.",
    stripTitle: "Votre part selon la hauteur de l'immeuble",
    stripCaption: (pf) => `Même toit, ${pf} logements par étage : le toit ne grandit pas avec les étages, la part de chacun fond.`,
    level: (s) => s === 1 ? "RDC" : `R+${s - 1}`,
    routesTitle: "Trois façons d'équiper le toit",
    decision: "Décision",
    routes: [
      ["Les parties communes",
       "Une installation sur le compteur des services généraux : ascenseur, éclairage des escaliers, pompe de surpression. Elle réduit les charges de tous.",
       "Ajout d'un équipement : majorité des trois quarts des voix en assemblée générale (loi 18-00, art. 21).",
       "La plus simple : un compteur, un dossier, une simple déclaration sous 11 kW. La consommation de jour des parties communes fixe la bonne taille."],
      ["Une installation par appartement",
       "Chacun pose ses panneaux sur sa part du toit et descend un câble jusqu'à son propre compteur.",
       "Travaux d'un copropriétaire, à ses frais, sur une partie commune : autorisation de l'assemblée générale à la majorité des voix des présents et représentés (art. 20), sans atteinte à la destination de l'immeuble.",
       "Le passage des câbles (gaine technique, façade) et le partage équitable du toit se règlent avant le vote."],
      ["Une centrale pour tous",
       "Une seule installation dont la production serait répartie entre les compteurs des appartements.",
       "Pas de cadre à ce jour : nous n'avons trouvé ni dans la loi 82-21 ni dans son décret de partage de la production entre plusieurs compteurs (ce que la France appelle autoconsommation collective).",
       "Au-delà de 11 kW, l'installation sort de la simple déclaration et demande un accord de raccordement."],
    ],
    stepsTitle: "Avant l'assemblée générale",
    steps: [
      ["Lisez le règlement de copropriété", "La terrasse est une partie commune, sauf si le règlement en réserve l'usage à un copropriétaire : c'est lui qu'il faut convaincre d'abord."],
      ["Demandez au syndic d'inscrire le projet à l'ordre du jour", "Avec cette estimation et, mieux, un devis : l'assemblée vote sur un projet chiffré."],
      ["Votez à la bonne majorité", "Une résolution votée à une majorité insuffisante peut être annulée. Quorum en première réunion : la moitié des voix."],
      ["Déclarez l'installation", "Sous 11 kW, une simple déclaration suffit (loi 82-21)."],
    ],
    legal: "Notre lecture de la loi 18-00 sur la copropriété (modifiée par la loi 106-12) et de la loi 82-21 sur l'autoproduction. Information, pas un avis juridique : votre syndic ou un notaire confirme pour votre immeuble.",
  },

  ar: {
    modeAria: "نوع السكن",
    house: "دار", flat: "شقة فعمارة",
    heroNote: (share, total, n) => `وضع العمارة: التركيب محدود فالحصة ديالك من السطح، ${share} من ${total} لـ ${n} شقة.`,
    heroNoteNoRoof: "وضع العمارة: حط سطح العمارة فالخريطة باش نحدّو التركيب فالحصة ديالك.",
    title: "الملكية المشتركة: سطح واحد للعمارة كاملة",
    sub: "شنو يقدر يعطي السطح لكل شقة، وشكون كيقرر",
    storeys: "الطوابق", perFloor: "شقق فكل طابق",
    less: "واحد قل", more: "واحد كثر",
    units: (n) => `= ${n} شقة`,
    srcOsm: "حسب OpenStreetMap", srcAssumed: "مفترض",
    statRoof: "السطح كامل", statShare: "الحصة ديالك", statCover: "التغطية",
    shareSub: (kwh) => `≈ ${L2R(kwh + " kWh")} فالعام`,
    coverSub: "من الاستهلاك السنوي ديالك",
    noRoof: "حط ولا رسم سطح العمارة فالخريطة باش نحسبو الحصة ديال كل شقة.",
    tooSmall: `الحصة ديالك ما كتوصلش لـ ${L2R("1 kWc")}: التركيب اللي باين كيفوتها. فهاد العمارة، السطح كينفع أكثر للأجزاء المشتركة (الطريقة 1).`,
    capNote: "هادي القدرة القصوى، قبل قفص الدروج والخزانات وسخانات الماء الشمسية والپارابولات اللي كتاخد بلاصتها فالسطح: احسب أقل فالواقع.",
    stripTitle: "الحصة ديالك حسب علو العمارة",
    stripCaption: (pf) => `نفس السطح، ${pf} شقق فكل طابق: السطح ما كيكبرش مع الطوابق، والحصة ديال كل واحد كتصغار.`,
    level: (s) => s === 1 ? "أرضي" : L2R(`R+${s - 1}`),
    routesTitle: "ثلاث طرق باش تجهزو السطح",
    decision: "القرار",
    routes: [
      ["الأجزاء المشتركة",
       "تركيب واحد على عداد الخدمات العامة: المصعد، ضو الدروج، مضخة الضغط. كينقص التكاليف المشتركة على الجميع.",
       "إضافة تجهيز: أغلبية ثلاثة أرباع الأصوات فالجمع العام (القانون 18.00، المادة 21).",
       `الأسهل: عداد واحد، ملف واحد، تصريح بسيط تحت ${L2R("11 kW")}. الاستهلاك ديال النهار ديال الأجزاء المشتركة هو اللي كيحدد الحجم المناسب.`],
      ["تركيب لكل شقة",
       "كل واحد كيحط البلاكات ديالو فالحصة ديالو من السطح وكينزّل كابل حتى للعداد ديالو.",
       "أشغال كيديرها مالك على حسابو فجزء مشترك: إذن من الجمع العام بأغلبية أصوات الحاضرين والممثلين (المادة 20)، بلا مساس بتخصيص العمارة.",
       "مرور الكابلات (الغاين التقنية، الواجهة) وتقسيم السطح بالعدل كيتفاهمو عليهم قبل التصويت."],
      ["محطة وحدة للجميع",
       "تركيب واحد والإنتاج ديالو يتقسم على العدادات ديال الشقق.",
       "ما كاين حتى إطار لحد الآن: ما لقيناش فالقانون 82.21 ولا فالمرسوم ديالو تقسيم الإنتاج على بزاف ديال العدادات (اللي كتسميه فرنسا الاستهلاك الذاتي الجماعي).",
       `فوق ${L2R("11 kW")}، التركيب كيخرج من التصريح البسيط وكيحتاج موافقة على الربط.`],
    ],
    stepsTitle: "قبل الجمع العام",
    steps: [
      ["قرا نظام الملكية المشتركة", "السطح جزء مشترك، إلا إذا النظام خلّى الانتفاع بيه لشي مالك: هو اللي خاصك تقنع الأول."],
      ["طلب من السانديك يدخل المشروع فجدول الأعمال", "مع هاد التقدير، والأحسن مع دوفي: الجمع العام كيصوت على مشروع بالأرقام."],
      ["صوتو بالأغلبية الصحيحة", "قرار تصوت بأغلبية ناقصة يقدر يتلغى. النصاب فالاجتماع الأول: نص الأصوات."],
      ["صرحو بالتركيب", `تحت ${L2R("11 kW")}، تصريح بسيط كيكفي (القانون 82.21).`],
    ],
    legal: "هادي قراءتنا للقانون 18.00 المتعلق بالملكية المشتركة (كما تغير بالقانون 106.12) والقانون 82.21 المتعلق بالإنتاج الذاتي. معلومة، ماشي استشارة قانونية: السانديك ولا الموثق هو اللي كيأكد لعمارتك.",
  },

  en: {
    modeAria: "Type of home",
    house: "House", flat: "Flat in a building",
    heroNote: (share, total, n) => `Building mode: system limited to your share of the roof, ${share} of ${total} for ${n} homes.`,
    heroNoteNoRoof: "Building mode: place the building's roof on the map to limit the system to your share.",
    title: "Co-ownership: one roof for the whole building",
    sub: "What the roof can do for each home, and who decides",
    storeys: "Storeys", perFloor: "Homes per floor",
    less: "one fewer", more: "one more",
    units: (n) => `= ${n} homes`,
    srcOsm: "from OpenStreetMap", srcAssumed: "assumed",
    statRoof: "Whole roof", statShare: "Your share", statCover: "Coverage",
    shareSub: (kwh) => `≈ ${kwh} kWh a year`,
    coverSub: "of your yearly use",
    noRoof: "Place or draw the building's roof on the map to work out each home's share.",
    tooSmall: "Your share does not reach 1 kWc: the system shown exceeds it. In this building the roof serves the common areas better (route 1).",
    capNote: "Maximum capacity, before the stairwell, water tanks, solar water heaters and satellite dishes take their place on the roof: expect less in practice.",
    stripTitle: "Your share by building height",
    stripCaption: (pf) => `Same roof, ${pf} homes per floor: the roof does not grow with the storeys, so each share shrinks.`,
    level: (s) => s === 1 ? "Ground" : `G+${s - 1}`,
    routesTitle: "Three ways to equip the roof",
    decision: "Decision",
    routes: [
      ["The common areas",
       "One system on the common-services meter: lift, stair lighting, booster pump. It lowers everyone's service charges.",
       "Adding equipment: three quarters of the votes at the general meeting (Law 18-00, art. 21).",
       "The simplest: one meter, one file, a simple declaration below 11 kW. The common areas' daytime use sets the right size."],
      ["One system per flat",
       "Each owner puts panels on their share of the roof and runs a cable down to their own meter.",
       "Work by one owner, at their own cost, on a common part: the general meeting's consent, by a majority of the votes present or represented (art. 20), as long as the building's purpose is not affected.",
       "Cable routes (service shaft, façade) and a fair split of the roof are settled before the vote."],
      ["One plant for all",
       "A single system whose output would be shared among the flats' meters.",
       "No framework yet: we found no sharing of output among several meters in Law 82-21 or its decree (what France calls collective self-consumption).",
       "Above 11 kW the system leaves the simple-declaration regime and needs a connection agreement."],
    ],
    stepsTitle: "Before the general meeting",
    steps: [
      ["Read the co-ownership rules", "The roof terrace is a common part, unless the rules reserve its use for one owner: that owner is the first to convince."],
      ["Ask the syndic to put the project on the agenda", "With this estimate and, better, a quote: the meeting votes on a costed project."],
      ["Vote by the right majority", "A resolution passed by too small a majority can be annulled. Quorum at the first meeting: half the votes."],
      ["Declare the system", "Below 11 kW a simple declaration is enough (Law 82-21)."],
    ],
    legal: "Our reading of Law 18-00 on co-ownership (amended by Law 106-12) and Law 82-21 on self-generation. Information, not legal advice: your syndic or a notary confirms for your building.",
  },
};
// Tamazight: shown in French until a native speaker writes this card; a
// draft of legal wording in Tifinagh would read worse than no translation.
COPRO_I18N.zgh = COPRO_I18N.fr;

const Copro = {
  DEFAULT_STOREYS: 4,   // R+3: a common city building when OpenStreetMap is silent
  MAX_PER_FLOOR: 8,
  STRIP_STOREYS: 10,
  on: false,
  perFloor: 2,
  linkStoreys: null,   // storeys set in a shared link, kept when its address loads
  T: COPRO_I18N.fr,
  onChange: () => {},
  els: {},

  init(onChange) {
    this.T = COPRO_I18N[LANG] || COPRO_I18N.fr;
    this.onChange = onChange;
    document.querySelectorAll(".mode-switch").forEach(el => this.buildSwitch(el));
    this.buildCard();
    const note = document.createElement("p");
    note.id = "copro-hero-note";
    note.className = "copro-hero-note";
    note.hidden = true;
    document.getElementById("hero-approx").before(note);
    this.els.heroNote = note;
  },

  // ── state ──
  set(on) {
    if (this.on === on) return;
    this.on = on;
    Analytics.once("param_change:building_mode", "param_change", { field: "building_mode" });
    this.syncSwitches();
    this.onChange();
  },
  storeys() { return View3D.storeysNow(); },
  storeysKnown() { return !!(View3D.storeys || (State.roof && State.roof.levels)); },
  units() { return this.storeys() * this.perFloor; },
  // The auto-sizing ceiling in this mode: the visitor's share of the roof.
  capKw(roofInfo) {
    if (!this.on || !roofInfo) return Infinity;
    return Math.floor(roofInfo.capacityKw / this.units() * 2) / 2;
  },

  toUrl(q) {
    if (!this.on) return;
    q.set("m", "i");
    q.set("u", String(this.perFloor));
    if (View3D.storeys) q.set("e", String(View3D.storeys));
  },
  fromUrl(q) {
    this.on = q.get("m") === "i";
    const u = parseInt(q.get("u"), 10), e = parseInt(q.get("e"), 10);
    if (u >= 1 && u <= this.MAX_PER_FLOOR) this.perFloor = u;
    this.linkStoreys = e >= 1 && e <= CONFIG.MAX_STOREYS ? e : null;
    this.syncSwitches();
  },

  // ── DOM helpers ──
  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  },

  buildSwitch(box) {
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", this.T.modeAria);
    box.classList.add("seg");
    for (const [key, label] of [["house", this.T.house], ["flat", this.T.flat]]) {
      const b = this.el("button", "seg-btn", label);
      b.type = "button";
      b.dataset.mode = key;
      b.addEventListener("click", () => this.set(key === "flat"));
      box.appendChild(b);
    }
    this.syncSwitches();
  },
  syncSwitches() {
    document.querySelectorAll(".mode-switch .seg-btn").forEach(b => {
      const active = (b.dataset.mode === "flat") === this.on;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  },

  stepper(label, onStep) {
    const row = this.el("div", "copro-step");
    row.appendChild(this.el("span", "copro-step-k", label));
    const minus = this.el("button", "step-btn", "−");
    const val = this.el("span", "pval");
    const plus = this.el("button", "step-btn", "+");
    minus.type = plus.type = "button";
    minus.setAttribute("aria-label", `${label} : ${this.T.less}`);
    plus.setAttribute("aria-label", `${label} : ${this.T.more}`);
    minus.addEventListener("click", () => onStep(-1));
    plus.addEventListener("click", () => onStep(1));
    const note = this.el("span", "sun-note");
    row.append(minus, val, plus, note);
    return { row, minus, val, plus, note };
  },

  buildCard() {
    const T = this.T, card = document.getElementById("copro-card");
    const head = this.el("div", "chart-header");
    head.append(this.el("h3", null, T.title), this.el("span", "chart-sub", T.sub));
    card.appendChild(head);

    const controls = this.el("div", "copro-controls");
    const storeys = this.stepper(T.storeys, (dn) => {
      Analytics.once("param_change:storeys", "param_change", { field: "storeys" });
      View3D.storeys = Math.max(1, Math.min(CONFIG.MAX_STOREYS, this.storeys() + dn));
      View3D.update();
      this.onChange();
    });
    const perFloor = this.stepper(T.perFloor, (dn) => {
      Analytics.once("param_change:per_floor", "param_change", { field: "per_floor" });
      this.perFloor = Math.max(1, Math.min(this.MAX_PER_FLOOR, this.perFloor + dn));
      this.onChange();
    });
    const units = this.el("span", "copro-units");
    controls.append(storeys.row, perFloor.row, units);
    card.appendChild(controls);

    const noRoof = this.el("p", "copro-noroof", T.noRoof);
    card.appendChild(noRoof);

    const figures = this.el("div", "copro-figures");
    const stats = this.el("div", "roof-stats copro-stats");
    const stat = (k, accent) => {
      const s = this.el("div", "stat" + (accent ? " accent" : ""));
      const v = this.el("span", "v"), sub = this.el("span", "s");
      s.append(this.el("span", "k", k), v, sub);
      stats.appendChild(s);
      return { v, sub };
    };
    const sRoof = stat(T.statRoof), sShare = stat(T.statShare, true), sCover = stat(T.statCover);
    const warn = this.el("p", "copro-warn");
    const cap = this.el("p", "copro-cap", T.capNote);
    const stripTitle = this.el("h4", "copro-h4", T.stripTitle);
    const strip = this.el("div", "copro-strip");
    strip.setAttribute("role", "list");
    const bars = [];
    for (let s = 1; s <= this.STRIP_STOREYS; s++) {
      const col = this.el("div", "copro-col");
      col.setAttribute("role", "listitem");
      const pct = this.el("span", "copro-pct");
      const track = this.el("div", "copro-track");
      const fill = this.el("i");
      track.appendChild(fill);
      col.append(pct, track, this.el("span", "copro-lvl", T.level(s)));
      strip.appendChild(col);
      bars.push({ col, pct, fill });
    }
    const stripCaption = this.el("p", "copro-cap");
    figures.append(stats, warn, cap, stripTitle, strip, stripCaption);
    card.appendChild(figures);

    card.appendChild(this.el("h4", "copro-h4", T.routesTitle));
    const routes = this.el("ol", "copro-routes");
    T.routes.forEach(([t, d, law, note], i) => {
      const li = this.el("li", "copro-route");
      li.append(this.el("span", "how-n", String(i + 1).padStart(2, "0")), this.el("b", null, t), this.el("p", null, d));
      const dec = this.el("p", "copro-law");
      dec.append(this.el("span", "copro-law-k", T.decision), document.createTextNode(" " + law));
      li.append(dec, this.el("p", "copro-route-note", note));
      routes.appendChild(li);
    });
    card.appendChild(routes);

    card.appendChild(this.el("h4", "copro-h4", T.stepsTitle));
    const steps = this.el("ol", "next-steps copro-steps");
    for (const [b, s] of T.steps) {
      const li = this.el("li");
      li.append(this.el("b", null, b), this.el("span", null, s));
      steps.appendChild(li);
    }
    card.appendChild(steps);
    card.appendChild(this.el("p", "copro-legal", T.legal));

    this.els = { ...this.els, card, storeys, perFloor, units, noRoof, figures, sRoof, sShare, sCover, warn, bars, stripCaption };
  },

  // ── render, called by UI.recalc() with the figures it already has ──
  render({ roofInfo, yieldPerKw, monthlyKwh, peakpower }) {
    const E = this.els, T = this.T;
    E.card.hidden = !this.on;
    E.heroNote.hidden = !this.on;
    if (!this.on) return;

    const n = this.storeys(), units = this.units();
    E.storeys.val.textContent = String(n);
    E.storeys.minus.disabled = n <= 1;
    E.storeys.plus.disabled = n >= CONFIG.MAX_STOREYS;
    E.storeys.note.textContent = View3D.storeys ? "" : (State.roof && State.roof.levels ? T.srcOsm : T.srcAssumed);
    E.perFloor.val.textContent = String(this.perFloor);
    E.perFloor.minus.disabled = this.perFloor <= 1;
    E.perFloor.plus.disabled = this.perFloor >= this.MAX_PER_FLOOR;
    E.units.textContent = T.units(units);

    E.noRoof.hidden = !!roofInfo;
    E.figures.hidden = !roofInfo;
    if (!roofInfo) { E.heroNote.textContent = T.heroNoteNoRoof; return; }

    const kw = (x) => bidi(`${fmtDec(x, { trim: true })} ${STR.kwc}`);
    const yearKwh = Math.max(1, monthlyKwh * 12);
    const share = roofInfo.capacityKw / units;
    const shareKwh = share * yieldPerKw;
    const coverPct = (kwp) => Math.min(100, Math.round(100 * kwp * yieldPerKw / yearKwh));

    E.heroNote.textContent = T.heroNote(kw(peakpower), kw(roofInfo.capacityKw), units);
    E.sRoof.v.textContent = kw(roofInfo.capacityKw) + (roofInfo.capped ? "+" : "");
    E.sRoof.sub.textContent = STR.panels(roofInfo.panels.length, roofInfo.capped ? "+" : "");
    E.sShare.v.textContent = kw(Math.round(share * 10) / 10);
    E.sShare.sub.textContent = T.shareSub(fmtNum(shareKwh));
    E.sCover.v.textContent = bidi(`${coverPct(share)} %`);
    E.sCover.sub.textContent = T.coverSub;
    E.warn.textContent = share < 1 ? T.tooSmall : "";
    E.warn.hidden = share >= 1;

    E.bars.forEach(({ col, pct, fill }, i) => {
      const s = i + 1, v = coverPct(roofInfo.capacityKw / (s * this.perFloor));
      pct.textContent = bidi(`${v} %`);
      fill.style.height = Math.max(2, v) + "%";
      col.classList.toggle("current", s === n);
      col.setAttribute("aria-label", `${T.level(s)} : ${v} %`);
    });
    E.stripCaption.textContent = T.stripCaption(this.perFloor);
  },
};
