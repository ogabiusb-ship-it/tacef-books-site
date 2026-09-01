(function () {
  function applyTimeTheme() {
    const hour = new Date().getHours();
    const theme = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "night";
    document.body.dataset.timeTheme = theme;
    document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
    const themeColors = { morning: "#253b82", afternoon: "#1c4a93", night: "#070b35" };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
  }

  applyTimeTheme();
  window.setInterval(applyTimeTheme, 60000);
})();
