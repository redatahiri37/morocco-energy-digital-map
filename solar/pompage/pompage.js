/* Wattu — solar pumping simulator (pompage/index.html), for the farmer.
 *
 * Reads engine.js (CONFIG, PV, inMorocco) and pumping.js (Pumping, CROPS,
 * PUMP_CONFIG). Two calls to our Worker: /pvcalc (PVGIS, ground-mounted,
 * 20°) and /et0 (the field's evapotranspiration). Both fall back so the page
 * always answers: PV to the nearest-city yields, ET₀ to the farmer's own
 * volume (shaped by the PV months).
 *
 * French and Moroccan Arabic (Darija), switched in the page; the Darija is
 * a first draft awaiting a native speaker's review, like the Tamazight
 * simulator. Elements are built with textContent / createElement only.
 * The answer lives in the URL hash so it can be sent on WhatsApp.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Local runs: the dev server answers /api/pvcalc and /api/et0 itself.
  const API = LOCAL ? location.origin + "/api" : CONFIG.PVGIS_WORKER_URL.replace(/\/pvcalc$/, "");

  // ── Texts ────────────────────────────────────────────────────────────
  const I18N = {
    fr: {
      product: "Pompage",
      u_dh: "DH", u_m: "m", u_m3: "m³", u_m3h: "m³/h", u_cv: "CV",
      kicker: "Pompage solaire agricole",
      title: "Le soleil peut-il pomper l'eau de votre puits ?",
      lede: "Quatre questions sur votre champ et votre puits. Vous saurez combien de panneaux il faut, quelle pompe, le prix, et en combien d'années cela remplace le butane ou le gasoil.",
      q1: "Où est votre champ ?", geo: "Utiliser ma position", or: "ou", city_label: "Ville la plus proche",
      city_pick: "Ville la plus proche…", geo_wait: "Recherche de votre position…",
      geo_ok: "Votre position (à environ 1 km près)", geo_fail: "Position introuvable : choisissez la ville la plus proche.",
      geo_out: "Cette position n'est pas au Maroc : choisissez une ville.", near: "Près de {city}",
      q2: "Qu'est-ce que vous arrosez ?", ha_label: "Surface arrosée", ha_unit: "hectares",
      method_label: "Comment vous arrosez", months_label: "Les mois où vous arrosez",
      to_volume: "Je connais déjà la quantité d'eau que je pompe", to_crop: "Calculer plutôt avec ma culture",
      m3_label: "Eau pompée par jour en plein été", m3_unit: "m³ / jour",
      m3_hint: "Un repère : votre pompe actuelle débite tant de m³ par heure, multiplié par les heures où elle tourne.",
      q3: "Votre puits", depth_label: "À quelle profondeur est l'eau quand la pompe tourne ?", m_unit: "mètres",
      depth_hint: "Si vous pompez dans un oued ou un bassin, mettez 2 m.", outlet_label: "Où va l'eau ?",
      more: "Je connais le débit de mon puits", well_label: "Débit maximum du puits (essai de pompage)", m3h_unit: "m³ / heure",
      q4: "Aujourd'hui, vous pompez avec…", go: "Calculer", working: "Calcul en cours…",
      crops: { olive: "Oliviers", citrus: "Agrumes", date_palm: "Palmiers", almond: "Amandiers, pommiers", alfalfa: "Luzerne", vegetable: "Maraîchage", cereal: "Céréales" },
      methods: { drip: "Goutte-à-goutte", sprinkler: "Aspersion", surface: "Seguia, à la raie" },
      outlets: { basin: "Dans un bassin", drip: "Direct dans le goutte-à-goutte" },
      sources: { butane: "Butane", diesel: "Gasoil", grid: "Électricité ONEE", none: "Pas encore de pompe" },
      months: ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"],
      months_long: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
      own_butane: "Bouteilles de 12 kg par semaine en été", own_butane_unit: "bouteilles",
      own_diesel: "Litres de gasoil par semaine en été", own_diesel_unit: "litres",
      own_grid: "Facture d'électricité du puits en été", own_grid_unit: "DH / mois",
      own_hint: "Facultatif. Si vous le savez, le calcul part de vos vrais chiffres.",
      own_grid_hint: "Nécessaire : nous n'avons pas de tarif agricole ONEE publié à utiliser.",
      own_none_hint: "Nous comparons avec une pompe au butane, le cas le plus courant.",
      err_place: "Choisissez d'abord où est votre champ (question 1).",
      err_months: "Choisissez au moins un mois d'arrosage.",
      err_grid: "Indiquez votre facture d'électricité d'été (question 4).",
      err_num: "Vérifiez les chiffres : surface, volume et profondeur doivent être positifs.",
      err_et0: "Le calcul de l'eau de votre culture est indisponible pour le moment. Indiquez votre volume d'eau par jour.",
      r_kicker: "Ce qu'il vous faut",
      r_head: "{panels} panneaux solaires et une pompe de {cv} CV",
      r_sub: "{kwp} kWc · environ {m2} m² au sol · bassin conseillé : {basin} m³",
      r_approx: "PVGIS ne répond pas : la production vient de la ville la plus proche ({city}). Résultat approximatif.",
      s_price: "Prix installé", s_save: "Économie par an", s_payback: "Remboursé en",
      price_aid: "Aide FDA possible : −{aid} DH",
      save_bottles: "≈ {n} bouteilles de butane", save_litres: "≈ {n} litres de gasoil", save_bill: "sur votre facture ONEE",
      save_est: " (estimation)",
      years: "{n} ans", year1: "moins d'un an", never: "jamais",
      payback_aid: "{n} avec l'aide FDA", payback_aid_never: "même avec l'aide, non rentable",
      unsub: "Si la bouteille passe à son prix sans subvention (≈ {price} DH), l'économie monte à {save} DH par an et les panneaux sont remboursés en {years}.",
      pocket_title: "Dans la poche, chaque mois",
      pocket_fuel: { butane: "Butane en {month}", diesel: "Gasoil en {month}", grid: "Facture ONEE en {month}", none: "Butane en {month} (pompe au butane)" },
      pocket_loan: "Crédit pour les panneaux (après l'aide)",
      pocket_hint: "Crédit indicatif : {rate} % sur {years} ans. Demandez les conditions à votre banque (Crédit Agricole, Tamwil El Fellah…).",
      chart_title: "L'eau, mois par mois", chart_need: "Besoin du champ (m³/jour)", chart_cap: "Les panneaux peuvent pomper (m³/jour)",
      chart_sub: "Barres : l'eau dont votre champ a besoin. Ligne : ce que les panneaux peuvent pomper.",
      water_title: "L'eau d'abord",
      w_volume: "Votre champ demande environ {m3} m³ d'eau par an ({perha} m³ par hectare). Les panneaux sont calculés pour ce besoin, pas pour vider le puits.",
      w_drip: "Au goutte-à-goutte, la même parcelle demanderait {saved} m³ de moins par an, et {panels} panneaux au lieu de {now}.",
      w_well: "Attention : en plein soleil la pompe débitera environ {flow} m³/h, plus que votre puits ({well} m³/h). Réduisez la surface, passez au goutte-à-goutte ou faites vérifier le puits.",
      w_well_ok: "En plein soleil la pompe débitera environ {flow} m³/h : votre puits ({well} m³/h) suit.",
      w_well_unknown: "En plein soleil la pompe débitera environ {flow} m³/h. Vérifiez par un essai de pompage que votre puits les donne.",
      w_free: "Avec le soleil, chaque m³ ne coûte presque plus rien : il est tentant de pomper plus. Mais la nappe ne se remplit pas plus vite, et une plante trop arrosée ne donne pas plus.",
      w_law: "Un puits ou un forage doit être autorisé par l'Agence de bassin hydraulique (loi 36-15 sur l'eau). L'aide du FDA exige un compteur d'eau.",
      quote_title: "Vous avez un devis ?", quote_label: "Prix du devis, installation comprise",
      quote_hint: "Le calcul se refait avec votre prix.",
      sheet_title: "À montrer à l'installateur",
      sh_head: "Hauteur manométrique totale", sh_flow: "Débit en plein soleil", sh_volume: "Eau par jour en {month}",
      sh_pv: "Panneaux", sh_pump: "Pompe", sh_basin: "Bassin conseillé", sh_place: "Lieu",
      share_wa: "Envoyer par WhatsApp", share_copy: "Copier le lien", copied: "Lien copié",
      wa_text: "Pompage solaire pour mon champ ({place}) : {panels} panneaux ({kwp} kWc), pompe {cv} CV, eau à {depth} m, {vol} m³/jour en {month}. Estimation Wattu : {url}",
      next_title: "Et maintenant ?",
      next_1: "Faites un essai de pompage : il dit combien d'eau votre puits donne vraiment.",
      next_2: "Demandez deux ou trois devis avec la fiche ci-dessus. Comparez le nombre de panneaux et la pompe, pas seulement le prix.",
      next_3: "Pour l'aide du FDA, renseignez-vous à la Direction provinciale de l'agriculture avant d'acheter : un compteur d'eau est exigé.",
      method_title: "Méthode et sources",
      method: [
        "Besoin en eau : ET₀ × Kc × surface ÷ efficience d'arrosage. ET₀ calculée pour votre champ avec la formule FAO-56 Penman-Monteith, à partir de l'année météo type de PVGIS (2005-2020). Kc : FAO-56, tableau 12 (valeur de pleine saison, la même chaque mois arrosé). Efficience : goutte-à-goutte 90 %, aspersion 75 %, seguia 60 % (FAO, manuel n° 4). La pluie n'est pas déduite : choisissez seulement les mois où vous arrosez vraiment.",
        "Hauteur : profondeur de l'eau + 3 m vers le bassin (ou 10 m de pression pour le goutte-à-goutte), plus 10 % de pertes dans les tuyaux.",
        "Panneaux : production PVGIS (Commission européenne) pour votre point, au sol, inclinés à 20° plein sud, 14 % de pertes. Calculés pour le mois le plus exigeant. Pompe : rendement moyen au champ de 50 %, et 10 % d'heures de soleil trop faible perdues ; puissance des panneaux ≈ 1,3 × celle de la pompe.",
        "Butane et gasoil : critères de performance des stations de pompage du Nebraska (Université de Géorgie, bulletin 837), à 76 %, la moyenne mesurée au champ. Les petits moteurs usés consomment souvent plus : sans vos chiffres, l'économie affichée est plutôt basse. Prix : bouteille de 12 kg à 50 DH (subvention de l'État ≈ 78 DH par bouteille en avril 2026), gasoil ≈ 16,90 DH/L (novembre 2026).",
        "Prix des kits : courbe tirée de trois prix catalogue d'un vendeur marocain (novembre 2026, installation comprise, sans forage ni bassin). Entretien : 1 % du prix par an. Remplacement de la pompe non compté.",
        "Aide FDA : jusqu'à 30 % de l'achat et de l'installation, plafonnée à 30 000 DH par projet (programme annoncé en 2024 ; conditions : avoir pompé au butane, poser un compteur d'eau). Vérifiez auprès de la DPA.",
        "Réseau ONEE : seulement à partir de votre facture ; aucun tarif agricole n'est supposé.",
      ],
      disclaimer: "Estimation gratuite, pas un devis. Votre position n'est envoyée qu'arrondie (à environ 1 km) à notre serveur, qui interroge PVGIS (Commission européenne).",
    },
    ar: {
      product: "الضخ بالشمس",
      u_dh: "درهم", u_m: "متر", u_m3: "م³", u_m3h: "م³/ساعة", u_cv: "شوفو",
      kicker: "الضخ بالطاقة الشمسية للفلاحة",
      title: "واش الشمس تقدر تجبد الما من البير ديالك؟",
      lede: "ربعة د الأسئلة على الفدان والبير ديالك. غادي تعرف شحال خاصك من بلاكة، أشمن بومبة، الثمن، وفشحال من عام غادي تعوض البوطة ولا الگازوال.",
      q1: "فين كاين الفدان ديالك؟", geo: "ستعمل البلاصة ديالي", or: "ولا", city_label: "أقرب مدينة",
      city_pick: "أقرب مدينة…", geo_wait: "كنقلبو على البلاصة ديالك…",
      geo_ok: "البلاصة ديالك (تقريبا ب 1 كلم)", geo_fail: "ما لقيناش البلاصة: ختار أقرب مدينة.",
      geo_out: "هاد البلاصة ماشي فالمغرب: ختار مدينة.", near: "قريب من {city}",
      q2: "شنو كتسقي؟", ha_label: "المساحة لي كتسقي", ha_unit: "هكتار",
      method_label: "كيفاش كتسقي", months_label: "الشهور لي كتسقي فيهم",
      to_volume: "كنعرف شحال د الما كنجبد", to_crop: "حسب بالزريعة ديالي",
      m3_label: "الما لي كتجبد فالنهار فعز الصيف", m3_unit: "م³ / نهار",
      m3_hint: "باش تحسب: شحال د م³ كتعطي البومبة فالساعة، ضرب عدد الساعات لي كتخدم.",
      q3: "البير ديالك", depth_label: "على شحال د المتر كاين الما ملي كتخدم البومبة؟", m_unit: "متر",
      depth_hint: "إلا كتجبد من واد ولا صهريج، دير 2 متر.", outlet_label: "فين كيمشي الما؟",
      more: "كنعرف الصبيب ديال البير", well_label: "أكبر صبيب ديال البير (تجربة الضخ)", m3h_unit: "م³ / ساعة",
      q4: "دابا، كتجبد الما ب…", go: "حسب", working: "كنحسبو…",
      crops: { olive: "الزيتون", citrus: "الحوامض", date_palm: "النخل", almond: "اللوز والتفاح", alfalfa: "الفصة", vegetable: "الخضرة", cereal: "الزرع" },
      methods: { drip: "التنقيط (گوت أ گوت)", sprinkler: "الرشاش", surface: "الساگية" },
      outlets: { basin: "فالصهريج", drip: "نيشان للتنقيط" },
      sources: { butane: "البوطة", diesel: "الگازوال", grid: "الضو ديال ONEE", none: "ما زال ما عنديش بومبة" },
      months: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "غشت", "شتن", "أكت", "نون", "دجن"],
      months_long: ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"],
      own_butane: "شحال د البوطة (12 كيلو) فالسيمانة فالصيف", own_butane_unit: "بوطة",
      own_diesel: "شحال د الليترو د الگازوال فالسيمانة فالصيف", own_diesel_unit: "ليترو",
      own_grid: "فاتورة الضو ديال البير فالصيف", own_grid_unit: "درهم / شهر",
      own_hint: "ماشي ضروري. إلا كتعرفها، الحساب غادي يبدا من الأرقام ديالك.",
      own_grid_hint: "ضروري: ما عندناش تعريفة فلاحية ديال ONEE منشورة.",
      own_none_hint: "كنقارنو مع بومبة بالبوطة، هادي هي لي كاينة بزاف.",
      err_place: "ختار اللول فين كاين الفدان (السؤال 1).",
      err_months: "ختار على الأقل شهر واحد ديال السقي.",
      err_grid: "كتب فاتورة الضو ديال الصيف (السؤال 4).",
      err_num: "شوف الأرقام: المساحة، الما والعمق خاصهم يكونو أكبر من صفر.",
      err_et0: "حساب الما ديال الزريعة ما خدامش دابا. كتب شحال د الما كتجبد فالنهار.",
      r_kicker: "شنو خاصك",
      r_head: "{panels} بلاكة شمسية وبومبة ديال {cv} شوفو",
      r_sub: "{kwp} كيلوواط ذروة · تقريبا {m2} م² فالأرض · صهريج مزيان: {basin} م³",
      r_approx: "PVGIS ما جاوبش: الإنتاج جا من أقرب مدينة ({city}). النتيجة تقريبية.",
      s_price: "الثمن مع التركيب", s_save: "شحال كتربح فالعام", s_payback: "كترجع فلوسك ف",
      price_aid: "دعم FDA ممكن: −{aid} درهم",
      save_bottles: "≈ {n} بوطة", save_litres: "≈ {n} ليترو د الگازوال", save_bill: "من فاتورة ONEE",
      save_est: " (تقدير)",
      years: "{n} سنين", year1: "أقل من عام", never: "عمرها",
      payback_aid: "{n} مع دعم FDA", payback_aid_never: "حتى مع الدعم، ما كتربحش",
      unsub: "إلا وصلات البوطة للثمن ديالها بلا دعم (≈ {price} درهم)، الربح كيطلع ل {save} درهم فالعام والبلاكات كيترجعو ف {years}.",
      pocket_title: "فالجيب، كل شهر",
      pocket_fuel: { butane: "البوطة ف {month}", diesel: "الگازوال ف {month}", grid: "فاتورة ONEE ف {month}", none: "البوطة ف {month} (بومبة بالبوطة)" },
      pocket_loan: "الكريدي ديال البلاكات (من بعد الدعم)",
      pocket_hint: "كريدي تقريبي: {rate} % على {years} سنين. سول البنك ديالك على الشروط (القرض الفلاحي، تمويل الفلاح…).",
      chart_title: "الما، شهر بشهر", chart_need: "الما لي خاص الفدان (م³/نهار)", chart_cap: "شحال تقدر تجبد البلاكات (م³/نهار)",
      chart_sub: "الأعمدة: الما لي خاص الفدان. الخط: شحال تقدر تجبد البلاكات.",
      water_title: "الما قبل كلشي",
      w_volume: "الفدان ديالك خاصو تقريبا {m3} م³ د الما فالعام ({perha} م³ للهكتار). البلاكات محسوبين على هاد الحاجة، ماشي باش تخوي البير.",
      w_drip: "بالتنقيط، نفس الفدان غادي يحتاج {saved} م³ قل فالعام، و {panels} بلاكة فبلاصت {now}.",
      w_well: "رد البال: فعز الشمس البومبة غادي تجبد تقريبا {flow} م³/ساعة، كثر من البير ديالك ({well} م³/ساعة). نقص المساحة، دوز للتنقيط ولا شوف البير.",
      w_well_ok: "فعز الشمس البومبة غادي تجبد تقريبا {flow} م³/ساعة: البير ديالك ({well} م³/ساعة) كيقدّ.",
      w_well_unknown: "فعز الشمس البومبة غادي تجبد تقريبا {flow} م³/ساعة. تأكد بتجربة الضخ بلي البير كيعطيهم.",
      w_free: "مع الشمس، كل م³ تقريبا بلا فلوس: كيجي الخاطر تجبد كثر. ولكن الفرشة ما كتعمرش بالزربة، والنبتة لي كتسقى بزاف ما كتعطيش كثر.",
      w_law: "البير ولا الأتقاب خاصو رخصة من وكالة الحوض المائي (قانون الما 36-15). دعم FDA كيطلب كونتور ديال الما.",
      quote_title: "عندك دوفي؟", quote_label: "ثمن الدوفي مع التركيب",
      quote_hint: "الحساب كيتعاود بالثمن ديالك.",
      sheet_title: "وريها للمركّب",
      sh_head: "العلو المانومتري الكلي", sh_flow: "الصبيب فعز الشمس", sh_volume: "الما فالنهار ف {month}",
      sh_pv: "البلاكات", sh_pump: "البومبة", sh_basin: "الصهريج", sh_place: "البلاصة",
      share_wa: "صيفط ف واتساب", share_copy: "نسخ الرابط", copied: "تنسخ الرابط",
      wa_text: "الضخ بالشمس للفدان ديالي ({place}): {panels} بلاكة ({kwp} كيلوواط ذروة)، بومبة {cv} شوفو، الما على {depth} متر، {vol} م³/نهار ف {month}. تقدير Wattu: {url}",
      next_title: "ودابا؟",
      next_1: "دير تجربة الضخ: كتقول ليك شحال د الما كيعطي البير بصح.",
      next_2: "طلب جوج ولا تلاتة د الدوفيات بهاد الورقة. قارن عدد البلاكات والبومبة، ماشي غير الثمن.",
      next_3: "على دعم FDA، سول فالمديرية الإقليمية للفلاحة قبل ما تشري: كيطلبو كونتور ديال الما.",
      method_title: "الطريقة والمصادر",
      method: [
        "الما: ET₀ × Kc × المساحة ÷ فعالية السقي. ET₀ محسوبة للفدان ديالك بمعادلة FAO-56 Penman-Monteith، من العام المناخي النموذجي ديال PVGIS (2005-2020). Kc: FAO-56، الجدول 12. الفعالية: التنقيط 90 %، الرشاش 75 %، الساگية 60 % (FAO). الشتا ما محسوباش: ختار غير الشهور لي كتسقي فيهم بصح.",
        "العلو: عمق الما + 3 متر للصهريج (ولا 10 متر ديال الضغط للتنقيط)، زايد 10 % ديال الضياع فالتيوات.",
        "البلاكات: إنتاج PVGIS (المفوضية الأوروبية) للبلاصة ديالك، فالأرض، مايلين ب 20° للجنوب، 14 % ضياع. محسوبين على الشهر لي خاصو كثر. البومبة: مردود 50 %، و 10 % ديال الساعات لي الشمس فيها ضعيفة؛ قوة البلاكات ≈ 1,3 مرة قوة البومبة.",
        "البوطة والگازوال: معايير محطات الضخ ديال نبراسكا (جامعة جورجيا، النشرة 837)، ب 76 %، المعدل لي تقاس فالفلاحة. الموطورات الصغار والقدام كياكلو كثر: بلا الأرقام ديالك، الربح لي كيبان شوية قليل. الأثمنة: البوطة 12 كيلو ب 50 درهم (الدولة كتدعم ≈ 78 درهم للبوطة فأبريل 2026)، الگازوال ≈ 16,90 درهم للتر (نونبر 2026).",
        "ثمن الكيت: منحنى من تلاتة د الأثمنة ديال بياع مغربي (نونبر 2026، مع التركيب، بلا الأتقاب وبلا الصهريج). الصيانة: 1 % من الثمن فالعام. تبديل البومبة ما محسوبش.",
        "دعم FDA: حتى ل 30 % من الشرا والتركيب، ما يفوتش 30 000 درهم للمشروع (برنامج 2024؛ الشروط: تكون كنتي كتجبد بالبوطة، وتركب كونتور ديال الما). تأكد فالمديرية الإقليمية للفلاحة.",
        "الضو ديال ONEE: غير من الفاتورة ديالك؛ ما كنفترضو حتى تعريفة فلاحية.",
      ],
      disclaimer: "تقدير بالمجان، ماشي دوفي. البلاصة ديالك كتمشي للسيرفور ديالنا غير مقربة (تقريبا 1 كلم)، وهو كيسول PVGIS (المفوضية الأوروبية).",
    },
  };

  let lang = "fr";
  const T = () => I18N[lang];
  const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ""));
  const NF0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const n0 = (v) => NF0.format(v);
  const n1 = (v) => NF1.format(v);
  const round = (v, step) => Math.round(v / step) * step;
  const mad = (v, step = 100) => n0(round(v, step)) + "\u00a0" + T().u_dh;
  const yearsText = (y) => (!Number.isFinite(y) ? T().never : y < 1 ? T().year1 : fill(T().years, { n: n1(y) }));

  // ── State ───────────────────────────────────────────────────────────
  const state = {
    lat: null, lon: null, place: "", placeKind: "",  // "geo" | city slug
    mode: "crop", crop: "olive", ha: 2, method: "drip",
    months: CROPS.olive.months.slice(), m3: 50,
    depth: 40, outlet: "basin", well: null,
    source: "butane", own: null, quote: null,
  };
  let cities = [];
  let last = null;      // the last computed answer, for the quote box and sharing
  let chart = null;
  let runSeq = 0;

  // ── Building blocks ─────────────────────────────────────────────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function chipGroup(container, items, current, onPick) {
    container.replaceChildren();
    for (const [key, label] of items) {
      const b = el("button", "chip-btn", label);
      b.type = "button";
      b.dataset.key = key;
      b.setAttribute("aria-pressed", String(key === current));
      b.addEventListener("click", () => {
        for (const o of container.children) o.setAttribute("aria-pressed", String(o === b));
        onPick(key);
      });
      container.appendChild(b);
    }
  }

  function monthToggles(container) {
    container.replaceChildren();
    T().months.forEach((label, i) => {
      const m = i + 1;
      const b = el("button", "month-btn", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.months.includes(m)));
      b.setAttribute("aria-label", T().months_long[i]);
      b.addEventListener("click", () => {
        const on = state.months.includes(m);
        state.months = on ? state.months.filter((x) => x !== m) : [...state.months, m].sort((a, b2) => a - b2);
        syncMonths();
      });
      container.appendChild(b);
    });
  }
  function syncMonths() {
    for (const c of [$("months"), $("months-volume")]) {
      [...c.children].forEach((b, i) => b.setAttribute("aria-pressed", String(state.months.includes(i + 1))));
    }
  }

  function renderChoices() {
    const t = T();
    chipGroup($("crop-chips"), Object.keys(CROPS).map((k) => [k, t.crops[k]]), state.crop, (k) => {
      state.crop = k;
      state.months = CROPS[k].months.slice();
      syncMonths();
    });
    chipGroup($("method-chips"), Object.keys(IRRIGATION_EFF).map((k) => [k, t.methods[k]]), state.method, (k) => { state.method = k; });
    chipGroup($("outlet-chips"), [["basin", t.outlets.basin], ["drip", t.outlets.drip]], state.outlet, (k) => { state.outlet = k; });
    chipGroup($("source-chips"), Object.keys(t.sources).map((k) => [k, t.sources[k]]), state.source, (k) => {
      state.source = k;
      state.own = null;
      $("own").value = "";
      renderOwn();
    });
    monthToggles($("months"));
    monthToggles($("months-volume"));
    renderOwn();
    renderCities();
  }

  function renderOwn() {
    const t = T(), s = state.source;
    $("own-field").hidden = s === "none";
    $("own-hint").textContent = s === "grid" ? t.own_grid_hint : s === "none" ? t.own_none_hint : t.own_hint;
    if (s === "none") { $("own-field").hidden = false; $("own").parentElement.hidden = true; $("own-label").textContent = ""; return; }
    $("own").parentElement.hidden = false;
    $("own-label").textContent = t["own_" + s];
    $("own-unit").textContent = t["own_" + s + "_unit"];
  }

  function renderCities() {
    const sel = $("city");
    sel.replaceChildren();
    const first = el("option", null, T().city_pick);
    first.value = "";
    sel.appendChild(first);
    const name = (c) => (lang === "ar" ? c.name_ar : c.name);
    for (const c of [...cities].sort((a, b) => name(a).localeCompare(name(b), lang))) {
      const o = el("option", null, name(c));
      o.value = c.slug;
      sel.appendChild(o);
    }
    sel.value = state.placeKind && state.placeKind !== "geo" ? state.placeKind : "";
    renderPlace();
  }

  function renderPlace() {
    const t = T();
    let text = "";
    if (state.placeKind === "geo") text = t.geo_ok;
    else if (state.placeKind) {
      const c = cities.find((x) => x.slug === state.placeKind);
      if (c) text = fill(t.near, { city: lang === "ar" ? c.name_ar : c.name });
    }
    $("place-label").textContent = text;
    state.place = text;
  }

  function applyLang(next) {
    lang = I18N[next] ? next : "fr";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    for (const b of document.querySelectorAll(".pump-lang")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    const t = T();
    for (const node of document.querySelectorAll("[data-i18n]")) {
      const v = t[node.dataset.i18n];
      if (typeof v === "string") node.textContent = v;
    }
    const list = $("method-list");
    list.replaceChildren(...t.method.map((m) => el("li", null, m)));
    renderChoices();
    if (last) renderResult();
  }

  // ── Inputs ──────────────────────────────────────────────────────────
  function bindSteppers() {
    for (const b of document.querySelectorAll(".stp")) {
      b.addEventListener("click", () => {
        const input = $(b.dataset.for);
        const step = Number(b.dataset.step);
        const min = Number(input.min) || 0, max = Number(input.max) || Infinity;
        const v = Math.min(max, Math.max(min, round((Number(input.value) || 0) + step, Math.abs(step) < 1 ? 0.1 : 1)));
        input.value = String(+v.toFixed(1));
        input.dispatchEvent(new Event("input"));
      });
    }
  }

  function num(id) {
    const raw = $(id).value.trim().replace(",", ".");
    if (raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : NaN;
  }

  function readForm() {
    state.ha = num("ha");
    state.m3 = num("m3");
    state.depth = num("depth");
    state.well = num("well");
    state.own = state.source === "none" ? null : num("own");
  }

  function validate() {
    const t = T();
    if (state.lat == null) return t.err_place;
    if (!state.months.length) return t.err_months;
    const vol = state.mode === "crop" ? state.ha : state.m3;
    if (!(vol > 0) || !(state.depth > 0)) return t.err_num;
    if (state.source === "grid" && !(state.own > 0)) return t.err_grid;
    if (Number.isNaN(state.own) || Number.isNaN(state.well)) return t.err_num;
    return null;
  }

  // ── Data ────────────────────────────────────────────────────────────
  const pvCache = new Map(), et0Cache = new Map();

  async function getJson(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function fetchPv(lat, lon) {
    const key = lat.toFixed(2) + "," + lon.toFixed(2);
    if (pvCache.has(key)) return pvCache.get(key);
    const q = new URLSearchParams({
      lat: lat.toFixed(4), lon: lon.toFixed(4), peakpower: "1", loss: String(CONFIG.PVGIS_LOSS),
      angle: String(PUMP_CONFIG.PVGIS_ANGLE), aspect: "0", mountingplace: PUMP_CONFIG.PVGIS_MOUNTING, outputformat: "json",
    });
    let out;
    try {
      const j = await getJson(API + "/pvcalc?" + q);
      const monthly = j.outputs.monthly.fixed.map((m) => m.E_m);
      if (monthly.length !== 12 || !monthly.every((v) => v > 0)) throw new Error("bad PVGIS");
      out = { monthlyPerKw: monthly };
    } catch (e) {
      out = PV.fallbackPerKw(lat, lon);
    }
    pvCache.set(key, out);
    return out;
  }

  async function fetchEt0(lat, lon) {
    const key = lat.toFixed(2) + "," + lon.toFixed(2);
    if (et0Cache.has(key)) return et0Cache.get(key);
    try {
      const j = await getJson(API + "/et0?lat=" + lat.toFixed(2) + "&lon=" + lon.toFixed(2));
      if (!Array.isArray(j.et0_mm_day) || j.et0_mm_day.length !== 12) throw new Error("bad et0");
      et0Cache.set(key, j.et0_mm_day);
      return j.et0_mm_day;
    } catch (e) {
      return null;
    }
  }

  // ── Compute ─────────────────────────────────────────────────────────
  async function run() {
    readForm();
    const err = validate();
    $("form-error").hidden = !err;
    $("form-error").textContent = err || "";
    if (err) { $("form-error").scrollIntoView({ behavior: "smooth", block: "center" }); return; }

    const seq = ++runSeq;
    const go = $("go");
    go.disabled = true;
    go.textContent = T().working;
    try {
      const [pv, et0] = await Promise.all([fetchPv(state.lat, state.lon), fetchEt0(state.lat, state.lon)]);
      if (seq !== runSeq) return;
      if (!et0 && state.mode === "crop") {
        // No ET₀: ask for the farmer's own volume rather than guess the crop's.
        setMode("volume");
        $("form-error").hidden = false;
        $("form-error").textContent = T().err_et0;
        return;
      }
      // Without ET₀, the PV months give the volume its shape (both follow the sun).
      const shape = et0 || pv.monthlyPerKw.map((v, i) => v / DAYS_IN_MONTH[i]);
      last = compute(pv, shape);
      renderResult();
      writeHash();
      const res = $("result");
      res.hidden = false;
      res.focus({ preventScroll: true });
      res.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      if (seq === runSeq) { go.disabled = false; go.textContent = T().go; }
    }
  }

  function compute(pv, et0) {
    const head = Pumping.headM({ depthM: state.depth, outlet: state.outlet, liftM: state.outlet === "basin" ? 3 : 0 });
    const needDay = state.mode === "crop"
      ? Pumping.needFromCrop({ et0, crop: state.crop, ha: state.ha, method: state.method, months: state.months })
      : Pumping.needFromVolume({ et0, m3PeakDay: state.m3, months: state.months });
    const size = Pumping.size({ needDay, pvPerKw: pv.monthlyPerKw, headM: head });
    const catalogue = Pumping.kitPriceMAD(size.pumpKw);
    const price = state.quote > 0 ? state.quote : catalogue;
    const source = state.source;
    const base = Pumping.baseline({ source, needDay, headM: head, own: state.own });
    const peakDays = Pumping.peakDaysEquivalent(needDay);
    const eco = Pumping.economics({ priceMAD: price, baselineMAD: base.mad, peakDays });
    const ecoUnsub = base.madUnsubsidised
      ? Pumping.economics({ priceMAD: price, baselineMAD: base.madUnsubsidised, peakDays }) : null;
    const yearly = Pumping.yearly(needDay, head);

    // Same field, drip instead of what the farmer uses now
    let drip = null;
    if (state.mode === "crop" && state.method !== "drip") {
      const dNeed = Pumping.needFromCrop({ et0, crop: state.crop, ha: state.ha, method: "drip", months: state.months });
      const dHead = Pumping.headM({ depthM: state.depth, outlet: state.outlet, liftM: state.outlet === "basin" ? 3 : 0 });
      drip = {
        saved: yearly.m3 - Pumping.yearly(dNeed, dHead).m3,
        panels: Pumping.size({ needDay: dNeed, pvPerKw: pv.monthlyPerKw, headM: dHead }).panels,
      };
    }
    return { pv, et0Shape: et0, head, needDay, size, catalogue, price, base, eco, ecoUnsub, yearly, drip, peakDays };
  }

  // ── Render ──────────────────────────────────────────────────────────
  function renderResult() {
    const t = T(), r = last, s = r.size;
    const month = t.months_long[s.peakMonth] || "";
    $("r-head").textContent = fill(t.r_head, { panels: s.panels, cv: n1(s.pumpCv) });
    $("r-sub").textContent = fill(t.r_sub, { kwp: n1(s.kwp), m2: n0(round(s.groundM2, 10)), basin: n0(Math.ceil(s.basinM3)) });
    $("r-approx").hidden = !r.pv.approximate;
    if (r.pv.approximate) $("r-approx").textContent = fill(t.r_approx, { city: r.pv.referenceCity });

    $("s-price").textContent = mad(r.price);
    $("s-price-aid").textContent = fill(t.price_aid, { aid: n0(round(r.eco.aidMAD, 100)) });

    $("s-save").textContent = mad(Math.max(0, r.eco.netSavingsMAD));
    const est = r.base.estimated ? t.save_est : "";
    $("s-save-sub").textContent =
      (r.base.bottles != null ? fill(t.save_bottles, { n: n0(r.base.bottles) })
        : r.base.litres != null ? fill(t.save_litres, { n: n0(round(r.base.litres, 10)) })
          : t.save_bill) + est;

    $("s-payback").textContent = yearsText(r.eco.paybackYr);
    $("s-payback-aid").textContent = Number.isFinite(r.eco.paybackAidYr)
      ? fill(t.payback_aid, { n: yearsText(r.eco.paybackAidYr) }) : t.payback_aid_never;

    $("r-unsub").hidden = !r.ecoUnsub;
    if (r.ecoUnsub) {
      $("r-unsub").textContent = fill(t.unsub, {
        price: n0(PUMP_CONFIG.BUTANE_BOTTLE_UNSUBSIDISED_MAD),
        save: n0(round(r.ecoUnsub.netSavingsMAD, 100)),
        years: yearsText(r.ecoUnsub.paybackYr),
      });
    }

    $("pocket-fuel-k").textContent = fill(t.pocket_fuel[state.source], { month });
    $("pocket-fuel").textContent = mad(r.eco.fuelPeakMonthMAD, 10);
    $("pocket-loan").textContent = mad(r.eco.loanMonthlyMAD, 10);
    $("pocket-hint").textContent = fill(t.pocket_hint, { rate: n1(CONFIG.LOAN_APR * 100), years: CONFIG.LOAN_YEARS });

    renderWater();
    renderSheet();
    renderChart();
    $("quote").placeholder = n0(r.catalogue);
  }

  function renderWater() {
    const t = T(), r = last, s = r.size, list = $("water-list");
    const items = [];
    const ha = state.mode === "crop" ? state.ha : null;
    let vol = fill(t.w_volume, { m3: n0(round(r.yearly.m3, 100)), perha: ha ? n0(round(r.yearly.m3 / ha, 100)) : "" });
    if (!ha) vol = vol.replace(/ \([^)]*\)/, "");  // own volume: no area to divide by
    items.push([vol]);
    if (r.drip) items.push([fill(t.w_drip, { saved: n0(round(r.drip.saved, 100)), panels: r.drip.panels, now: s.panels })]);
    const flow = n1(s.peakFlowM3h);
    if (state.well > 0) {
      const over = s.peakFlowM3h > state.well;
      items.push([fill(over ? t.w_well : t.w_well_ok, { flow, well: n1(state.well) }), over]);
    } else items.push([fill(t.w_well_unknown, { flow })]);
    items.push([t.w_free], [t.w_law]);
    list.replaceChildren(...items.map(([x, warn]) => el("li", warn ? "warn" : null, x)));
  }

  function renderSheet() {
    const t = T(), r = last, s = r.size;
    const month = t.months_long[s.peakMonth] || "";
    const rows = [
      [t.sh_place, state.place],
      [t.sh_head, n0(r.head) + " " + t.u_m],
      [fill(t.sh_volume, { month }), n0(r.needDay[s.peakMonth]) + " " + t.u_m3],
      [t.sh_flow, n1(s.peakFlowM3h) + " " + t.u_m3h],
      [t.sh_pv, s.panels + " × 500 Wc = " + n1(s.kwp) + " kWc"],
      [t.sh_pump, n1(s.pumpCv) + " " + t.u_cv + " (" + n1(s.pumpKw) + " kW)"],
      [t.sh_basin, n0(Math.ceil(s.basinM3)) + " " + t.u_m3],
    ];
    $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)]));
    const url = location.href;
    $("share-wa").href = "https://wa.me/?text=" + encodeURIComponent(fill(t.wa_text, {
      place: state.place, panels: s.panels, kwp: n1(s.kwp), cv: n1(s.pumpCv), depth: n0(state.depth),
      vol: n0(r.needDay[s.peakMonth]), month, url,
    }));
  }

  function renderChart() {
    if (typeof Chart === "undefined") return;
    const t = T(), r = last;
    const data = {
      labels: t.months,
      datasets: [
        { type: "bar", label: t.chart_need, data: r.needDay.map((v) => +v.toFixed(1)), backgroundColor: "#22A6C7", borderRadius: 4, order: 2 },
        { type: "line", label: t.chart_cap, data: r.size.capacityDay.map((v) => +v.toFixed(1)), borderColor: "#FF6B35", backgroundColor: "#FF6B35", pointRadius: 2, tension: 0.3, order: 1 },
      ],
    };
    const options = {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: "bottom", rtl: lang === "ar", labels: { boxWidth: 12 } } },
      scales: {
        x: { reverse: lang === "ar", grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, font: { size: 10 } } },
        y: { beginAtZero: true, position: lang === "ar" ? "right" : "left", title: { display: true, text: t.u_m3 + " / 24 h" } },
      },
    };
    if (chart) chart.destroy();
    chart = new Chart($("chart"), { data, options });
  }

  // ── Location ────────────────────────────────────────────────────────
  function setPlace(lat, lon, kind) {
    state.lat = lat;
    state.lon = lon;
    state.placeKind = kind;
    if (kind === "geo") $("city").value = "";
    renderPlace();
  }

  function geolocate() {
    const t = T();
    if (!navigator.geolocation) { $("place-label").textContent = t.geo_fail; return; }
    $("place-label").textContent = t.geo_wait;
    navigator.geolocation.getCurrentPosition((p) => {
      const lat = +p.coords.latitude.toFixed(2), lon = +p.coords.longitude.toFixed(2);
      if (!inMorocco(lat, lon)) { $("place-label").textContent = t.geo_out; return; }
      setPlace(lat, lon, "geo");
    }, () => { $("place-label").textContent = t.geo_fail; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  }

  // ── Modes ───────────────────────────────────────────────────────────
  function setMode(m) {
    state.mode = m;
    $("mode-crop").hidden = m !== "crop";
    $("mode-volume").hidden = m !== "volume";
  }

  // ── Hash (share, bookmark, Back) ────────────────────────────────────
  // #lat=30.47&lon=-8.88&p=taroudant&c=olive&ha=2&i=drip&mo=4-10…
  function writeHash() {
    const q = new URLSearchParams();
    q.set("lat", state.lat.toFixed(2));
    q.set("lon", state.lon.toFixed(2));
    if (state.placeKind && state.placeKind !== "geo") q.set("p", state.placeKind);
    if (state.mode === "crop") { q.set("c", state.crop); q.set("ha", String(state.ha)); q.set("i", state.method); }
    else q.set("m3", String(state.m3));
    q.set("mo", state.months.join("."));
    q.set("d", String(state.depth));
    q.set("o", state.outlet);
    if (state.well > 0) q.set("w", String(state.well));
    q.set("s", state.source);
    if (state.own > 0) q.set("own", String(state.own));
    if (state.quote > 0) q.set("q", String(state.quote));
    if (lang !== "fr") q.set("l", lang);
    history.replaceState(null, "", "#" + q.toString());
  }

  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    const f = (k) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : null; };
    if (I18N[q.get("l")]) lang = q.get("l");    // also on its own: the Arabic simulator links to #l=ar
    const lat = f("lat"), lon = f("lon");
    if (lat == null || lon == null || !inMorocco(lat, lon)) return q.has("l");
    const p = q.get("p");
    state.lat = lat; state.lon = lon;
    state.placeKind = p && cities.some((c) => c.slug === p) ? p : "geo";
    if (q.has("m3")) { state.mode = "volume"; state.m3 = f("m3") || 50; }
    if (CROPS[q.get("c")]) state.crop = q.get("c");
    if (f("ha") > 0) state.ha = f("ha");
    if (IRRIGATION_EFF[q.get("i")]) state.method = q.get("i");
    const mo = (q.get("mo") || "").split(".").map(Number).filter((m) => m >= 1 && m <= 12);
    state.months = mo.length ? [...new Set(mo)].sort((a, b) => a - b) : CROPS[state.crop].months.slice();
    if (f("d") > 0) state.depth = f("d");
    if (["basin", "drip"].includes(q.get("o"))) state.outlet = q.get("o");
    if (f("w") > 0) state.well = f("w");
    if (I18N.fr.sources[q.get("s")]) state.source = q.get("s");
    if (f("own") > 0) state.own = f("own");
    if (f("q") > 0) state.quote = f("q");
    return true;
  }

  function writeForm() {
    $("ha").value = String(state.ha);
    $("m3").value = String(state.m3);
    $("depth").value = String(state.depth);
    $("well").value = state.well > 0 ? String(state.well) : "";
    $("own").value = state.own > 0 ? String(state.own) : "";
    $("quote").value = state.quote > 0 ? String(state.quote) : "";
    setMode(state.mode);
  }

  // ── Boot ────────────────────────────────────────────────────────────
  async function boot() {
    try {
      const j = await getJson("../data/cities.json");
      cities = Array.isArray(j.cities) ? j.cities : [];
    } catch (e) { cities = []; }

    const fromLink = readHash();
    if (!fromLink && /^ar\b/i.test(navigator.language || "")) lang = "ar";
    writeForm();
    applyLang(lang);

    for (const b of document.querySelectorAll(".pump-lang")) {
      b.addEventListener("click", () => { applyLang(b.dataset.lang); if (last) writeHash(); });
    }
    $("geo-btn").addEventListener("click", geolocate);
    $("city").addEventListener("change", (e) => {
      const c = cities.find((x) => x.slug === e.target.value);
      if (c) setPlace(c.lat, c.lon, c.slug);
    });
    $("to-volume").addEventListener("click", () => setMode("volume"));
    $("to-crop").addEventListener("click", () => setMode("crop"));
    bindSteppers();
    $("pump-form").addEventListener("submit", (e) => { e.preventDefault(); run(); });

    let quoteTimer = null;
    $("quote").addEventListener("input", () => {
      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(() => {
        const v = num("quote");
        state.quote = v > 0 ? v : null;
        if (!last) return;
        last = compute(last.pv, last.et0Shape);
        renderResult();
        writeHash();
      }, 400);
    });

    $("share-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        $("share-copy").textContent = T().copied;
        setTimeout(() => { $("share-copy").textContent = T().share_copy; }, 2000);
      } catch (e) { /* no clipboard: the address bar still has the link */ }
    });

    if (fromLink && state.lat != null) run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
