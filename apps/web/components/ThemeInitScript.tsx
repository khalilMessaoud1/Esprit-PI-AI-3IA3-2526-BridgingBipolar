import { fontStackForPreset, type FontFamilyPreset } from "../lib/fontOptions";

/** Applies saved theme attrs before first paint to avoid flash. */
function buildInitScript(): string {
  const stacks = {
    manrope: fontStackForPreset("manrope"),
    inter: fontStackForPreset("inter"),
    "open-sans": fontStackForPreset("open-sans"),
    lato: fontStackForPreset("lato"),
    merriweather: fontStackForPreset("merriweather"),
    nunito: fontStackForPreset("nunito"),
  };

  return `(function(){
    try {
      var root = document.documentElement;
      var theme = localStorage.getItem("bb_theme");
      if (theme === "dark") root.classList.add("dark");
      var cb = localStorage.getItem("bb_colorblind") || "normal";
      root.setAttribute("data-colorblind", cb);
      var fs = localStorage.getItem("bb_font_size") || "normal";
      root.setAttribute("data-font-size", fs);
      var ff = localStorage.getItem("bb_font_family") || "manrope";
      root.setAttribute("data-font-family", ff);
      var stacks = ${JSON.stringify(stacks)};
      root.style.setProperty("--app-font-family", stacks[ff] || stacks.manrope);
    } catch (e) {}
  })();`;
}

export default function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: buildInitScript() }} />;
}
