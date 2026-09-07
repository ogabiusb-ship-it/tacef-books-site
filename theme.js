(function () {
  const preferenceKey = "tacef-theme-preference";

  function daylightTheme() {
    return new Date().getHours() < 12 ? "morning" : "afternoon";
  }

  function preferredMode() {
    const saved = localStorage.getItem(preferenceKey);
    return saved === "light" || saved === "night" ? saved : "auto";
  }

  function updateToggle(theme) {
    const isNight = theme === "night";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextLabel = isNight ? "Light" : "Night";
      const currentLabel = isNight ? "Night" : "Light";
      button.classList.toggle("is-night", isNight);
      button.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()} theme`);
      button.setAttribute("title", `Switch to ${nextLabel.toLowerCase()} theme`);
      const label = button.querySelector(".theme-toggle-label");
      if (label) label.textContent = currentLabel;
    });
  }

  function applyTimeTheme() {
    const hour = new Date().getHours();
    const automaticTheme = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "night";
    const mode = preferredMode();
    const theme = mode === "night" ? "night" : mode === "light" ? daylightTheme() : automaticTheme;
    document.body.dataset.timeTheme = theme;
    document.body.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
    const themeColors = { morning: "#fff8e7", afternoon: "#e7f1fa", night: "#070b35" };
    const captions = {
      morning: "Morning grace · Begin the day in God’s Word",
      afternoon: "Steady light · Grow through God’s Word",
      night: "Evening peace · Rest and reflect in God’s Word"
    };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
    const caption = document.getElementById("spiritualCaption");
    if (caption) caption.textContent = captions[theme];
    updateToggle(theme);
  }

  applyTimeTheme();
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    const nextMode = document.body.dataset.timeTheme === "night" ? "light" : "night";
    localStorage.setItem(preferenceKey, nextMode);
    applyTimeTheme();
  });
  window.setInterval(applyTimeTheme, 60000);
})();
