// Fixed, shared color palette for Paintwall's brushes. Every painted pixel
// will store a 1-byte index into this list -- not an arbitrary RGB value --
// so the picker UI is restricted to these swatches instead of an open-ended
// color input. Suggested colors from TheColorAPI will get snapped to the
// nearest entry here before they're ever shown or made paintable.
//
// Uses PICO-8's 32-color palette (16 base colors + 16 "secret"/extended
// colors) -- a small, cohesive palette already designed for exactly this
// kind of pixel art, so it needs no additional design work of its own.
const PAINTWALL_PALETTE = [
  "#000000", "#1D2B53", "#7E2553", "#008751",
  "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
  "#FF004D", "#FFA300", "#FFEC27", "#00E436",
  "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA",
  "#291814", "#111D35", "#422136", "#125359",
  "#742F29", "#49333B", "#A28879", "#F3EF7D",
  "#BE1250", "#FF6C24", "#A8E72E", "#00B543",
  "#065AB5", "#754665", "#FF6E59", "#FF9D81",
];

const DEFAULT_PALETTE_INDEX = 12; // #29ADFF -- closest palette match to the old default blue

function buildColorSwatches(containerId, initialIndex = DEFAULT_PALETTE_INDEX) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  container.innerHTML = "";
  container.dataset.selectedIndex = String(initialIndex);

  PAINTWALL_PALETTE.forEach((hex, index) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.backgroundColor = hex;
    swatch.setAttribute("aria-pressed", String(index === initialIndex));
    swatch.setAttribute("aria-label", hex);
    swatch.dataset.paletteIndex = String(index);

    swatch.addEventListener("click", () => {
      container.querySelectorAll(".swatch").forEach((el) => el.setAttribute("aria-pressed", "false"));
      swatch.setAttribute("aria-pressed", "true");
      container.dataset.selectedIndex = String(index);
    });

    container.appendChild(swatch);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildColorSwatches("color-picker");
  buildColorSwatches("avatar-color-picker");
});
