(function () {
  const books = window.TACEF_CATALOG || [];
  const manualCacheName = "tacef-manuals-v1";
  const grid = document.getElementById("bookGrid");
  const toast = document.getElementById("toast");
  const installDialog = document.getElementById("installDialog");
  const installInstructions = document.getElementById("installInstructions");
  const installButtons = [document.getElementById("installButton"), document.getElementById("heroInstallButton"), document.getElementById("installGuideButton")].filter(Boolean);
  let deferredInstallPrompt = null;
  let searchTimer = null;

  const absolute = (path) => new URL(path, window.location.href).href;
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

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

  async function isBookCached(book) {
    if (!("caches" in window)) return false;
    const cache = await caches.open(manualCacheName);
    return Boolean(await cache.match(absolute(book.file)));
  }

  async function renderBooks() {
    grid.innerHTML = books.map((book) => `
      <article class="book-card accent-${book.accent}" data-book-id="${book.id}">
        <a class="book-cover" href="./reader.html?book=${encodeURIComponent(book.id)}" aria-label="Read ${book.title}">
          <img src="${book.cover}" alt="Cover of ${book.title}" loading="lazy" />
          <span class="offline-tag" hidden>Available offline</span>
        </a>
        <div class="book-details">
          <div class="book-kicker"><span>${book.language}</span><span>${book.pages} pages</span></div>
          <h3>${book.shortTitle}</h3><p>${book.description}</p>
          <div class="book-actions">
            <a class="button button-primary" href="./reader.html?book=${encodeURIComponent(book.id)}">Read manual</a>
            <button class="button button-secondary download-button" data-download="${book.id}" type="button">Save offline</button>
          </div>
          <small class="download-meta">${book.size} · Progress and bookmarks stay on this device</small>
        </div>
      </article>`).join("");

    await Promise.all(books.map(refreshBookStatus));
    grid.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", () => toggleOffline(button.dataset.download)));
  }

  async function refreshBookStatus(book) {
    const card = grid.querySelector(`[data-book-id="${book.id}"]`);
    if (!card) return;
    const cached = await isBookCached(book);
    const button = card.querySelector("[data-download]");
    button.textContent = cached ? "Remove offline copy" : "Save offline";
    button.classList.toggle("is-saved", cached);
    card.querySelector(".offline-tag").hidden = !cached;
  }

  async function toggleOffline(bookId) {
    const book = books.find((item) => item.id === bookId);
    const button = grid.querySelector(`[data-download="${bookId}"]`);
    if (!book || !button || !("caches" in window)) return;
    button.disabled = true;
    const cache = await caches.open(manualCacheName);
    const cached = await cache.match(absolute(book.file));
    try {
      if (cached) {
        await Promise.all([cache.delete(absolute(book.file)), cache.delete(absolute(book.index))]);
        showToast(`${book.shortTitle} removed from offline storage.`);
      } else {
        if (!navigator.onLine) throw new Error("Connect to the internet before downloading this manual.");
        button.textContent = "Saving…";
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        const [pdfResponse, indexResponse] = await Promise.all([fetch(book.file), fetch(book.index)]);
        if (!pdfResponse.ok || !indexResponse.ok) throw new Error("The manual could not be downloaded.");
        await Promise.all([cache.put(absolute(book.file), pdfResponse), cache.put(absolute(book.index), indexResponse)]);
        showToast(`${book.shortTitle} is now available offline.`);
      }
    } catch (error) {
      showToast(error.message || "The offline copy could not be updated.");
    } finally {
      button.disabled = false;
      await refreshBookStatus(book);
      updateStorageNote();
    }
  }

  function renderContinueReading() {
    const progress = JSON.parse(localStorage.getItem("tacef-progress") || "{}");
    const recent = Object.entries(progress).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))[0];
    if (!recent) return;
    const book = books.find((item) => item.id === recent[0]);
    if (!book) return;
    const panel = document.getElementById("continuePanel");
    document.getElementById("continueTitle").textContent = book.shortTitle;
    document.getElementById("continueMeta").textContent = `Continue from page ${recent[1].page || 1} of ${book.pages}`;
    document.getElementById("continueLink").href = `./reader.html?book=${encodeURIComponent(book.id)}&page=${recent[1].page || 1}`;
    panel.classList.remove("hidden");
  }

  async function updateStorageNote() {
    const note = document.getElementById("storageNote");
    if (!navigator.storage || !navigator.storage.estimate) return;
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ? `${(estimate.usage / 1048576).toFixed(1)} MB used on this device` : "Offline storage is ready";
    note.textContent = used;
  }

  function normalise(value) {
    return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function makeSnippet(text, rawQuery) {
    const clean = text.replace(/\s+/g, " ").trim();
    const at = normalise(clean).indexOf(normalise(rawQuery));
    const start = Math.max(0, at - 90);
    const end = Math.min(clean.length, Math.max(at + rawQuery.length + 110, 210));
    return `${start ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
  }

  async function searchLibrary(query) {
    const status = document.getElementById("searchStatus");
    const results = document.getElementById("searchResults");
    if (query.trim().length < 2) { status.textContent = "Enter at least two characters to search."; results.innerHTML = ""; return; }
    status.textContent = "Searching the manuals…";
    results.innerHTML = '<div class="result-skeleton"></div><div class="result-skeleton"></div>';
    try {
      const indexes = (await Promise.all(books.map(async (book) => {
        try { return { book, pages: await fetch(book.index).then((r) => { if (!r.ok) throw new Error(); return r.json(); }) }; }
        catch (_) { return null; }
      }))).filter(Boolean);
      if (!indexes.length) throw new Error();
      const needle = normalise(query.trim());
      const matches = [];
      for (const { book, pages } of indexes) {
        for (const page of pages) {
          if (normalise(page.text).includes(needle)) matches.push({ book, page: page.page, snippet: makeSnippet(page.text, query) });
          if (matches.length >= 36) break;
        }
      }
      status.textContent = matches.length ? `${matches.length}${matches.length === 36 ? "+" : ""} matching pages` : `No pages found for “${query}”.`;
      results.innerHTML = matches.map((match) => `<a class="search-result" href="./reader.html?book=${match.book.id}&page=${match.page}"><span class="result-book">${match.book.shortTitle} · Page ${match.page}</span><strong>${escapeHtml(match.snippet)}</strong><span class="result-arrow">→</span></a>`).join("");
    } catch (_) {
      status.textContent = navigator.onLine ? "Search is temporarily unavailable." : "Download a manual before searching it offline.";
      results.innerHTML = "";
    }
  }

  function showInstallDialog() {
    if (isStandalone()) {
      installInstructions.innerHTML = "<p>TACEF Books is already installed on this device. Save any manual for complete offline reading.</p>";
      document.getElementById("dialogInstallButton").hidden = true;
    } else if (isIOS()) {
      installInstructions.innerHTML = "<ol><li>Open this page in Safari.</li><li>Tap the <strong>Share</strong> button.</li><li>Select <strong>Add to Home Screen</strong>, then tap Add.</li></ol>";
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

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; showToast("TACEF Books has been installed."); installDialog.close(); });
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  installButtons.forEach((button) => button.addEventListener("click", showInstallDialog));
  document.getElementById("dialogInstallButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; await deferredInstallPrompt.prompt(); deferredInstallPrompt = null; });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

  document.getElementById("searchForm").addEventListener("submit", (event) => { event.preventDefault(); searchLibrary(document.getElementById("searchInput").value); });
  document.getElementById("searchInput").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchLibrary(event.target.value), 450); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  updateNetworkStatus();
  renderBooks();
  renderContinueReading();
  updateStorageNote();
})();
