/**
 * Runs before React hydrates. Reads the persisted language/theme choice from
 * localStorage and applies `lang`, `dir`, and the `dark` class synchronously
 * on <html> so there is no flash of the wrong language/direction/theme on
 * reload — see the i18n architecture notes in the master spec.
 */
export const noFlashScript = `
(function () {
  try {
    var lang = localStorage.getItem("shklet.lang");
    if (lang !== "ku" && lang !== "en") lang = "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ku" ? "rtl" : "ltr";

    var theme = localStorage.getItem("shklet.theme");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;
