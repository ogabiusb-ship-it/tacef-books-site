(function () {
  function applyTimeTheme() {
    const hour = new Date().getHours();
    const theme = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "night";
    document.body.dataset.timeTheme = theme;
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
  }

  applyTimeTheme();
  window.setInterval(applyTimeTheme, 60000);
})();
