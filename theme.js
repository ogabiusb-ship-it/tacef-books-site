(function () {
  const preferenceKey = "tacef-theme-preference";
  const standaloneMode = window.matchMedia("(display-mode: standalone)");
  let safeAreaFrame = 0;

  function isStandalone() {
    return standaloneMode.matches || window.navigator.standalone === true || Boolean(document.fullscreenElement);
  }

  function updateSystemSafeArea() {
    window.cancelAnimationFrame(safeAreaFrame);
    safeAreaFrame = window.requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width || window.innerWidth;
      const compactScreen = viewportWidth <= 820;
      const reportedOffset = compactScreen ? Math.max(0, Math.min(48, Math.round(viewport?.offsetTop || 0))) : 0;
      const installedFallback = compactScreen && isStandalone() && reportedOffset < 8
        ? (viewportWidth <= 600 ? 28 : 24)
        : 0;
      const runtimeSafeTop = Math.max(reportedOffset, installedFallback);

      document.documentElement.style.setProperty("--runtime-safe-top", `${runtimeSafeTop}px`);
      document.documentElement.classList.toggle("system-ui-overlay", runtimeSafeTop > 0);
    });
  }

  function daylightTheme() {
    return new Date().getHours() < 12 ? "morning" : "afternoon";
  }

  function preferredMode() {
    let saved = null;
    try { saved = localStorage.getItem(preferenceKey); }
    catch (_) { /* Use the automatic theme when storage is unavailable. */ }
    return saved === "light" || saved === "night" ? saved : "auto";
  }

  function saveMode(mode) {
    try { localStorage.setItem(preferenceKey, mode); }
    catch (_) { /* The selected theme still applies for this session. */ }
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
    const pageThemeColors = { morning: "#fff8e7", afternoon: "#e7f1fa", night: "#070b35" };
    const systemThemeColors = { morning: "#07123f", afternoon: "#08164d", night: "#030723" };
    const captions = {
      morning: "Morning grace · Begin the day in God’s Word",
      afternoon: "Steady light · Grow through God’s Word",
      night: "Evening peace · Rest and reflect in God’s Word"
    };
    const compactScreen = (window.visualViewport?.width || window.innerWidth) <= 820;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", (compactScreen ? systemThemeColors : pageThemeColors)[theme]);
    const caption = document.getElementById("spiritualCaption");
    if (caption) caption.textContent = captions[theme];
    updateToggle(theme);
  }

  applyTimeTheme();
  updateSystemSafeArea();
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    const nextMode = document.body.dataset.timeTheme === "night" ? "light" : "night";
    saveMode(nextMode);
    applyTimeTheme();
  });
  window.addEventListener("resize", () => { updateSystemSafeArea(); applyTimeTheme(); }, { passive: true });
  window.addEventListener("orientationchange", updateSystemSafeArea, { passive: true });
  document.addEventListener("fullscreenchange", updateSystemSafeArea);
  window.visualViewport?.addEventListener("resize", updateSystemSafeArea, { passive: true });
  window.visualViewport?.addEventListener("scroll", updateSystemSafeArea, { passive: true });
  if (typeof standaloneMode.addEventListener === "function") standaloneMode.addEventListener("change", updateSystemSafeArea);
  else if (typeof standaloneMode.addListener === "function") standaloneMode.addListener(updateSystemSafeArea);
  window.setInterval(applyTimeTheme, 60000);
})();
