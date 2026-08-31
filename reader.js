(function () {
  const books = window.TACEF_CATALOG || [];
  const params = new URLSearchParams(window.location.search);
  const book = books.find((item) => item.id === params.get("book")) || books[0];
  const manualCacheName = "tacef-manuals-v1";
  const frame = document.getElementById("pdfFrame");
  const pageInput = document.getElementById("pageInput");
  const toast = document.getElementById("toast");
  let page = Math.min(book.pages, Math.max(1, Number(params.get("page")) || getSavedPage()));

  const absolute = (path) => new URL(path, window.location.href).href;
  const progressKey = "tacef-progress";
  const bookmarksKey = "tacef-bookmarks";

  function getSavedPage() {
    const progress = JSON.parse(localStorage.getItem(progressKey) || "{}");
    return progress[book.id]?.page || 1;
  }

  function showToast(message) {
    toast.textContent = message; toast.classList.add("visible");
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3000);
  }

  function updateNetworkStatus() {
    const status = document.getElementById("networkStatus");
    status.classList.toggle("offline", !navigator.onLine);
    status.querySelector("span").textContent = navigator.onLine ? "Online" : "Offline";
  }

  function saveProgress() {
    const progress = JSON.parse(localStorage.getItem(progressKey) || "{}");
    progress[book.id] = { page, updated: Date.now() };
    localStorage.setItem(progressKey, JSON.stringify(progress));
  }

  function pdfUrl() {
    return `${book.file}#page=${page}&view=FitH&toolbar=1&navpanes=0`;
  }

  function openPage(nextPage, announce = false) {
    page = Math.min(book.pages, Math.max(1, Number(nextPage) || 1));
    pageInput.value = page;
    document.getElementById("mobilePageNumber").textContent = page;
    document.getElementById("prevPage").disabled = page <= 1;
    document.getElementById("mobilePrevPage").disabled = page <= 1;
    document.getElementById("nextPage").disabled = page >= book.pages;
    document.getElementById("mobileNextPage").disabled = page >= book.pages;
    frame.src = pdfUrl();
    saveProgress();
    updateBookmarkButton();
    history.replaceState(null, "", `?book=${encodeURIComponent(book.id)}&page=${page}`);
    if (announce) showToast(`Page ${page}`);
  }

  function getBookmarks() {
    const all = JSON.parse(localStorage.getItem(bookmarksKey) || "{}");
    return all[book.id] || [];
  }

  function setBookmarks(pages) {
    const all = JSON.parse(localStorage.getItem(bookmarksKey) || "{}");
    all[book.id] = [...new Set(pages)].sort((a, b) => a - b);
    localStorage.setItem(bookmarksKey, JSON.stringify(all));
  }

  function updateBookmarkButton() {
    const marked = getBookmarks().includes(page);
    const button = document.getElementById("bookmarkButton");
    button.textContent = marked ? "★" : "☆";
    button.classList.toggle("active", marked);
    button.setAttribute("aria-label", marked ? "Remove bookmark from this page" : "Bookmark this page");
  }

  function toggleBookmark() {
    const pages = getBookmarks();
    if (pages.includes(page)) { setBookmarks(pages.filter((value) => value !== page)); showToast(`Bookmark removed from page ${page}.`); }
    else { setBookmarks([...pages, page]); showToast(`Page ${page} bookmarked.`); }
    updateBookmarkButton();
  }

  function showBookmarks() {
    const pages = getBookmarks();
    const list = document.getElementById("bookmarkList");
    list.innerHTML = pages.length ? pages.map((value) => `<button type="button" data-bookmark-page="${value}"><span>Page ${value}</span><small>Open saved page</small><b>→</b></button>`).join("") : '<div class="empty-state"><span>☆</span><p>No bookmarks yet. Select the star while reading to save a page.</p></div>';
    list.querySelectorAll("[data-bookmark-page]").forEach((button) => button.addEventListener("click", () => { document.getElementById("bookmarksDialog").close(); openPage(button.dataset.bookmarkPage, true); }));
    document.getElementById("bookmarksDialog").showModal();
  }

  async function isCached() {
    if (!("caches" in window)) return false;
    return Boolean(await (await caches.open(manualCacheName)).match(absolute(book.file)));
  }

  async function updateOfflineButton() {
    const button = document.getElementById("offlineButton");
    const cached = await isCached();
    button.textContent = cached ? "Saved offline" : "Save offline";
    button.classList.toggle("is-saved", cached);
  }

  async function saveOffline() {
    if (await isCached()) { showToast("This manual is already available offline."); return; }
    if (!navigator.onLine) { showToast("Connect to the internet to download this manual."); return; }
    const button = document.getElementById("offlineButton");
    button.disabled = true; button.textContent = "Saving…";
    try {
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      const cache = await caches.open(manualCacheName);
      const [pdfResponse, indexResponse] = await Promise.all([fetch(book.file), fetch(book.index)]);
      if (!pdfResponse.ok || !indexResponse.ok) throw new Error();
      await Promise.all([cache.put(absolute(book.file), pdfResponse), cache.put(absolute(book.index), indexResponse)]);
      showToast(`${book.shortTitle} is ready offline.`);
    } catch (_) { showToast("The manual could not be saved. Please try again."); }
    finally { button.disabled = false; updateOfflineButton(); }
  }

  function normalise(value) { return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
  function escapeHtml(value) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
  function snippet(text, query) { const clean = text.replace(/\s+/g, " ").trim(); const at = normalise(clean).indexOf(normalise(query)); const start = Math.max(0, at - 80); const end = Math.min(clean.length, Math.max(at + query.length + 100, 190)); return `${start ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`; }

  async function searchBook(query) {
    const status = document.getElementById("readerSearchStatus");
    const results = document.getElementById("readerSearchResults");
    if (query.trim().length < 2) { status.textContent = "Enter at least two characters."; results.innerHTML = ""; return; }
    status.textContent = "Searching…"; results.innerHTML = '<div class="result-skeleton"></div>';
    try {
      const pages = await fetch(book.index).then((response) => { if (!response.ok) throw new Error(); return response.json(); });
      const needle = normalise(query.trim());
      const matches = pages.filter((item) => normalise(item.text).includes(needle)).slice(0, 40);
      status.textContent = matches.length ? `${matches.length}${matches.length === 40 ? "+" : ""} matching pages` : `No pages found for “${query}”.`;
      results.innerHTML = matches.map((item) => `<button class="search-result" type="button" data-result-page="${item.page}"><span class="result-book">Page ${item.page}</span><strong>${escapeHtml(snippet(item.text, query))}</strong><span class="result-arrow">→</span></button>`).join("");
      results.querySelectorAll("[data-result-page]").forEach((button) => button.addEventListener("click", () => { document.getElementById("searchDialog").close(); openPage(button.dataset.resultPage, true); }));
    } catch (_) { status.textContent = navigator.onLine ? "Search is temporarily unavailable." : "Save this manual offline to search without internet."; results.innerHTML = ""; }
  }

  document.title = `${book.shortTitle} · TACEF Books`;
  document.getElementById("readerBookTitle").textContent = book.shortTitle;
  document.getElementById("readerBookMeta").textContent = `${book.language} · ${book.pages} pages`;
  document.getElementById("pageTotal").textContent = `of ${book.pages}`;
  pageInput.max = book.pages;
  document.getElementById("originalPdfLink").href = book.file;
  frame.addEventListener("load", () => document.getElementById("readerLoading").classList.add("hidden"));

  document.getElementById("prevPage").addEventListener("click", () => openPage(page - 1));
  document.getElementById("nextPage").addEventListener("click", () => openPage(page + 1));
  document.getElementById("mobilePrevPage").addEventListener("click", () => openPage(page - 1));
  document.getElementById("mobileNextPage").addEventListener("click", () => openPage(page + 1));
  document.getElementById("mobilePageButton").addEventListener("click", () => { pageInput.focus(); pageInput.select(); });
  pageInput.addEventListener("change", () => openPage(pageInput.value, true));
  document.getElementById("bookmarkButton").addEventListener("click", toggleBookmark);
  document.getElementById("bookmarksButton").addEventListener("click", showBookmarks);
  document.getElementById("offlineButton").addEventListener("click", saveOffline);
  document.getElementById("readerSearchButton").addEventListener("click", () => document.getElementById("searchDialog").showModal());
  document.getElementById("readerSearchForm").addEventListener("submit", (event) => { event.preventDefault(); searchBook(document.getElementById("readerSearchInput").value); });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  window.addEventListener("online", updateNetworkStatus); window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("keydown", (event) => { if (event.target.matches("input") || document.querySelector("dialog[open]")) return; if (event.key === "ArrowLeft") openPage(page - 1); if (event.key === "ArrowRight") openPage(page + 1); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  updateNetworkStatus(); updateOfflineButton(); openPage(page);
})();
