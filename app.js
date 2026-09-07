(function () {
  const books = window.TACEF_CATALOG || [];
  const schedule = window.TACEF_STUDY_SCHEDULE;
  const today = new Date();
  const currentStudy = schedule?.getCurrentStudy(today, "english") || { week: 1, page: 73, title: "Becoming a Trusted Soldier in the Lord’s Army", dates: "31 August – 6 September 2026" };
  const readerNameKey = "tacef-reader-name";
  const welcomeSeenKey = "tacef-welcome-seen";
  const grid = document.getElementById("bookGrid");
  const toast = document.getElementById("toast");
  const installDialog = document.getElementById("installDialog");
  const installInstructions = document.getElementById("installInstructions");
  const welcomeOverlay = document.getElementById("welcomeOverlay");
  const nameStep = document.getElementById("nameStep");
  const homeBook = document.getElementById("homeBook");
  const homePages = [...homeBook.querySelectorAll(":scope > .home-book-page")];
  const installButtons = [document.getElementById("installButton")].filter(Boolean);
  const manualCacheName = "tacef-manuals-v1";
  let deferredInstallPrompt = null;
  let homePageIndex = 0;

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const studyForBook = (book) => schedule?.getCurrentStudy(today, book.id) || { ...currentStudy, page: 1 };
  const bookHref = (book) => `./reader.html?book=${encodeURIComponent(book.id)}&page=${studyForBook(book).page}`;

  function renderCurrentStudy() {
    document.getElementById("currentStudyWeek").textContent = `This week · Week ${currentStudy.week}`;
    document.getElementById("currentStudyTitle").textContent = currentStudy.title;
    document.getElementById("currentStudyDates").textContent = currentStudy.dates;
    document.getElementById("currentStudyNumber").textContent = String(currentStudy.week).padStart(2, "0");
    const progressRing = document.getElementById("currentStudyProgress");
    if (progressRing) {
      const week = Math.max(1, Math.min(52, Number(currentStudy.week) || 1));
      progressRing.style.strokeDasharray = "0 52";
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        progressRing.style.strokeDasharray = `${week} ${52 - week}`;
      }));
    }
    document.getElementById("currentStudyLink").href = `./reader.html?book=english&page=${currentStudy.page}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function updateNetworkStatus() {
    const status = document.getElementById("networkStatus");
    if (!status) return;
    status.classList.toggle("offline", !navigator.onLine);
    status.querySelector("span").textContent = navigator.onLine ? "Online" : "Offline";
  }

  function cleanReaderName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
  }

  function updateReaderIdentity(name) {
    const displayName = cleanReaderName(name) || "Reader";
    document.getElementById("profileName").textContent = displayName;
    document.getElementById("profileInitial").textContent = displayName.charAt(0).toLocaleUpperCase();
    return displayName;
  }

  function showNameStep() {
    nameStep.hidden = false;
    const savedName = localStorage.getItem(readerNameKey) || "";
    document.getElementById("readerName").value = savedName;
    window.setTimeout(() => document.getElementById("readerName").focus(), 420);
  }

  function openWelcome() {
    welcomeOverlay.hidden = false;
    document.body.classList.add("welcome-open");
    showNameStep();
    requestAnimationFrame(() => welcomeOverlay.classList.add("visible"));
  }

  function closeWelcome({ arriveHome = false } = {}) {
    localStorage.setItem(welcomeSeenKey, "1");
    welcomeOverlay.classList.remove("visible");
    document.body.classList.remove("welcome-open");
    window.setTimeout(() => {
      welcomeOverlay.hidden = true;
      if (arriveHome) {
        goHomePage(0, false);
        document.body.classList.add("home-arrival");
        window.setTimeout(() => document.body.classList.remove("home-arrival"), 1100);
      }
    }, 360);
  }

  function updateHomePageControls() {
    document.getElementById("homePreviousPage").disabled = homePageIndex === 0;
    document.getElementById("homeNextPage").disabled = homePageIndex === homePages.length - 1;
    const position = document.getElementById("homePagePosition");
    position.querySelector("b").textContent = String(homePageIndex + 1);
    position.querySelector("small").textContent = String(homePages.length);
    position.setAttribute("aria-label", `Home page ${homePageIndex + 1} of ${homePages.length}`);
    document.body.dataset.homePage = String(homePageIndex);
  }

  function animateHomePage(pageElement) {
    if (!pageElement || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pageElement.classList.remove("page-entering");
    void pageElement.offsetWidth;
    pageElement.classList.add("page-entering");
    window.clearTimeout(animateHomePage.timer);
    animateHomePage.timer = window.setTimeout(() => pageElement.classList.remove("page-entering"), 760);
  }

  function goHomePage(index, smooth = true) {
    const previousIndex = homePageIndex;
    homePageIndex = Math.max(0, Math.min(homePages.length - 1, Number(index) || 0));
    if (homePageIndex !== previousIndex) homePages[homePageIndex]?.scrollTo({ top: 0, behavior: "auto" });
    homeBook.scrollTo({ left: homePageIndex * homeBook.clientWidth, behavior: smooth ? "smooth" : "auto" });
    if (homePageIndex !== previousIndex) animateHomePage(homePages[homePageIndex]);
    updateHomePageControls();
  }

  function initHomeBook() {
    let homeTouchStart = null;
    document.getElementById("homePreviousPage").addEventListener("click", () => goHomePage(homePageIndex - 1));
    document.getElementById("homeNextPage").addEventListener("click", () => goHomePage(homePageIndex + 1));
    document.getElementById("homePagePosition").addEventListener("click", () => goHomePage(homePageIndex === 0 ? 1 : 0));
    document.getElementById("browseLibraryButton").addEventListener("click", () => goHomePage(1));
    document.querySelector('.header-actions a[href="#library"]')?.addEventListener("click", (event) => { event.preventDefault(); goHomePage(1); });
    homeBook.addEventListener("scroll", () => {
      window.clearTimeout(initHomeBook.scrollTimer);
      initHomeBook.scrollTimer = window.setTimeout(() => {
        const nextIndex = Math.round(homeBook.scrollLeft / Math.max(1, homeBook.clientWidth));
        if (nextIndex !== homePageIndex) animateHomePage(homePages[nextIndex]);
        homePageIndex = nextIndex;
        updateHomePageControls();
      }, 70);
    }, { passive: true });
    homeBook.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
    }, { passive: false });
    homeBook.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1 || !welcomeOverlay.hidden || document.querySelector("dialog[open]")) return;
      const touch = event.touches[0];
      homeTouchStart = { x: touch.clientX, y: touch.clientY, at: Date.now(), target: event.target };
    }, { passive: true });
    homeBook.addEventListener("touchend", (event) => {
      if (!homeTouchStart || event.changedTouches.length !== 1) { homeTouchStart = null; return; }
      const touch = event.changedTouches[0];
      const distanceX = touch.clientX - homeTouchStart.x;
      const distanceY = touch.clientY - homeTouchStart.y;
      const elapsed = Date.now() - homeTouchStart.at;
      const touchedGrid = homeTouchStart.target.closest?.(".book-grid");
      homeTouchStart = null;
      if (elapsed > 1200 || Math.abs(distanceX) < 42 || Math.abs(distanceX) < Math.abs(distanceY) * 1.1) return;
      if (touchedGrid && distanceX > 0 && touchedGrid.scrollLeft > 8) return;
      goHomePage(homePageIndex + (distanceX < 0 ? 1 : -1));
    }, { passive: true });
    homeBook.addEventListener("touchcancel", () => { homeTouchStart = null; }, { passive: true });
    window.addEventListener("resize", () => goHomePage(homePageIndex, false));
    window.addEventListener("keydown", (event) => {
      if (!welcomeOverlay.hidden || document.querySelector("dialog[open]") || event.target.closest?.("input, textarea, button, a")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); goHomePage(0); }
      if (event.key === "ArrowRight") { event.preventDefault(); goHomePage(1); }
    });
    updateHomePageControls();
  }

  function renderBooks() {
    grid.innerHTML = books.map((book, index) => {
      const study = studyForBook(book);
      return `
      <article class="book-card accent-${book.accent}" data-book-id="${book.id}">
        <a class="book-cover" href="${bookHref(book)}" aria-label="Read ${book.title}">
          <img src="${book.cover}" alt="Cover of ${book.title}" loading="lazy" />
          <span class="volume-index">Volume ${String(index + 1).padStart(2, "0")}</span>
          <span class="current-week-tag">Week ${study.week} · Page ${study.page}</span>
        </a>
        <div class="book-details">
          <div class="book-kicker"><span>${book.language}</span><span>${book.pages} pages</span></div>
          <div class="book-copy"><h3>${book.shortTitle}</h3><p>${book.description}</p></div>
          <div class="book-actions">
            <a class="button button-primary" href="${bookHref(book)}"><span>Open Week ${study.week}</span><b aria-hidden="true">→</b></a>
            <button class="button button-secondary offline-save-button" type="button" data-save-offline="${book.id}"><span>Save offline</span><b aria-hidden="true">↓</b></button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  async function updateOfflineButton(button, book) {
    if (!("caches" in window)) {
      button.disabled = true;
      button.querySelector("span").textContent = "Unavailable";
      return;
    }
    const cache = await caches.open(manualCacheName);
    const saved = Boolean(await cache.match(new URL(book.file, window.location.href).href));
    button.classList.toggle("saved", saved);
    button.querySelector("span").textContent = saved ? "Available offline" : "Save offline";
    button.querySelector("b").textContent = saved ? "✓" : "↓";
  }

  async function saveManualOffline(button, book) {
    if (!("caches" in window)) return showToast("Offline storage is not supported by this browser.");
    if (!navigator.onLine) return showToast("Connect to the internet once to save this manual.");
    const label = button.querySelector("span");
    button.disabled = true;
    button.classList.add("saving");
    label.textContent = "Saving…";
    try {
      await navigator.storage?.persist?.();
      const url = new URL(book.file, window.location.href).href;
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const cache = await caches.open(manualCacheName);
      await cache.put(url, response.clone());
      button.classList.add("saved");
      label.textContent = "Available offline";
      button.querySelector("b").textContent = "✓";
      showToast(`${book.shortTitle} is ready to read offline.`);
    } catch (error) {
      label.textContent = "Try again";
      showToast("The manual could not be saved. Check your connection and storage space.");
    } finally {
      button.disabled = false;
      button.classList.remove("saving");
    }
  }

  function initOfflineControls() {
    grid.querySelectorAll("[data-save-offline]").forEach((button) => {
      const book = books.find((item) => item.id === button.dataset.saveOffline);
      if (!book) return;
      updateOfflineButton(button, book).catch(() => {});
      button.addEventListener("click", () => {
        if (button.classList.contains("saved")) {
          showToast(`${book.shortTitle} is already available offline.`);
          return;
        }
        saveManualOffline(button, book);
      });
    });
  }

  function renderContinueReading() {
    const progress = JSON.parse(localStorage.getItem("tacef-progress") || "{}");
    const recent = Object.entries(progress).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))[0];
    const panel = document.getElementById("continuePanel");
    if (!recent) { panel.classList.add("hidden"); return; }
    const book = books.find((item) => item.id === recent[0]);
    if (!book) { panel.classList.add("hidden"); return; }
    document.getElementById("continueTitle").textContent = book.shortTitle;
    document.getElementById("continueMeta").textContent = `Continue from page ${recent[1].page || 1} of ${book.pages}`;
    document.getElementById("continueLink").href = `./reader.html?book=${encodeURIComponent(book.id)}&page=${recent[1].page || 1}`;
    panel.classList.remove("hidden");
  }

  function showInstallDialog() {
    if (isStandalone()) {
      installInstructions.innerHTML = "<p>TACEF Books is already installed on this device and ready for full-screen reading.</p>";
      document.getElementById("dialogInstallButton").hidden = true;
    } else if (isIOS()) {
      installInstructions.innerHTML = `<div class="install-steps">
        <div><b>1</b><span>Open this page in <strong>Safari</strong></span></div>
        <div><b>2</b><span>Tap the <strong>Share</strong> button <i aria-hidden="true">⇧</i></span></div>
        <div><b>3</b><span>Choose <strong>Add to Home Screen</strong>, then tap Add</span></div>
      </div>`;
      document.getElementById("dialogInstallButton").hidden = true;
    } else if (!deferredInstallPrompt) {
      installInstructions.innerHTML = "<p>Open your browser menu and choose <strong>Install TACEF Books</strong> or <strong>Add to Home screen</strong>.</p>";
      document.getElementById("dialogInstallButton").hidden = true;
    } else {
      installInstructions.innerHTML = "<p>Install the app for a full-screen reading experience and quick access from your home screen or desktop.</p>";
      document.getElementById("dialogInstallButton").hidden = false;
    }
    installDialog.showModal();
  }

  async function handleInstallClick() {
    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      deferredInstallPrompt = null;
      return;
    }
    showInstallDialog();
  }

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; showToast("TACEF Books has been installed."); installDialog.close(); });
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  installButtons.forEach((button) => button.addEventListener("click", handleInstallClick));
  document.getElementById("dialogInstallButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; await deferredInstallPrompt.prompt(); deferredInstallPrompt = null; });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

  document.getElementById("nameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = cleanReaderName(document.getElementById("readerName").value);
    if (!name) return;
    localStorage.setItem(readerNameKey, name);
    localStorage.setItem(welcomeSeenKey, "1");
    updateReaderIdentity(name);
    closeWelcome({ arriveHome: true });
  });
  document.getElementById("continueAsGuest").addEventListener("click", () => {
    localStorage.setItem(welcomeSeenKey, "1");
    updateReaderIdentity("Reader");
    closeWelcome({ arriveHome: true });
  });
  document.getElementById("profileButton").addEventListener("click", openWelcome);
  document.getElementById("welcomeCloseButton").addEventListener("click", closeWelcome);
  welcomeOverlay.addEventListener("click", (event) => { if (event.target === welcomeOverlay) closeWelcome(); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !welcomeOverlay.hidden) closeWelcome(); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  updateReaderIdentity(localStorage.getItem(readerNameKey));
  document.getElementById("footerYear").textContent = new Date().getFullYear();
  renderCurrentStudy();
  updateNetworkStatus();
  renderBooks();
  initOfflineControls();
  renderContinueReading();
  initHomeBook();
  if (window.location.hash === "#library") goHomePage(1, false);
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#library") goHomePage(1, false);
  });
  const returningReader = Boolean(cleanReaderName(localStorage.getItem(readerNameKey))) || localStorage.getItem(welcomeSeenKey) === "1";
  if (!returningReader) window.setTimeout(openWelcome, 260);
})();
