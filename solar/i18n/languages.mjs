/* The site's languages and the drop-down that switches between them.
 * Used by scripts/build-solar-i18n.mjs (simulator) and
 * scripts/build-solar-cities.mjs (city pages, guides, indexes). The French
 * simulator, solar/index.html, holds langMenu("fr", SIMULATORS) verbatim;
 * the i18n build stops if the two drift apart.
 *
 * A <details> menu: it opens and closes without JavaScript, so it works
 * under the site's CSP on every page, and each language is a plain link.
 */
export const LANGS = [
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "zgh", label: "ⵜⴰⵎⴰⵣⵉⵖⵜ" },
];

// Where each language's simulator lives.
export const SIMULATORS = { fr: "/", ar: "/ar/", en: "/en/", zgh: "/zgh/" };

const MENU_NAME = { fr: "Langue", ar: "اللغة", en: "Language", zgh: "ⵜⵓⵜⵍⴰⵢⵜ" };

// hrefs: { lang: path } for every language that has this page (or the
// nearest equivalent). The current language is marked, not linked away.
export function langMenu(current, hrefs) {
  const cur = LANGS.find(l => l.code === current);
  const items = LANGS.filter(l => hrefs[l.code]).map(l =>
    `        <li><a href="${hrefs[l.code]}" lang="${l.code}" hreflang="${l.code}"${l.code === current ? ' aria-current="true"' : ""}>${l.label}</a></li>`
  ).join("\n");
  return `<details class="lang-menu">
      <summary aria-label="${MENU_NAME[current]}"><span lang="${current}">${cur.label}</span></summary>
      <ul>
${items}
      </ul>
    </details>`;
}
