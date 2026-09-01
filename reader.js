import { getDocument, GlobalWorkerOptions } from "./vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const books = window.TACEF_CATALOG || [];
const params = new URLSearchParams(window.location.search);
const book = books.find((item) => item.id === params.get("book")) || books[0];
const readerName = String(localStorage.getItem("tacef-reader-name") || "").trim();
const currentStudy = window.TACEF_STUDY_SCHEDULE?.getCurrentStudy(new Date(), book.id);
const weekPages = window.TACEF_STUDY_SCHEDULE?.manualPages?.[book.id] || [1];
const weekTitles = window.TACEF_STUDY_SCHEDULE?.titles || [];
const manualCacheName = "tacef-manuals-v1";
const progressKey = "tacef-progress";
const bookmarksKey = "tacef-bookmarks";
const zoomKey = "tacef-reading-zoom";
const zoomLevels = [0.82, 1, 1.24, 1.48];
const toast = document.getElementById("toast");
const stage = document.querySelector(".pdf-stage");
const canvasWrap = document.getElementById("pdfCanvasWrap");
const canvas = document.getElementById("pdfCanvas");
const bookLeaf = document.getElementById("bookLeaf");
const gestureGuide = document.getElementById("gestureGuide");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const loading = document.getElementById("readerLoading");
const loadingText = document.getElementById("readerLoadingText");
const errorPanel = document.getElementById("readerError");
const errorMessage = document.getElementById("readerErrorMessage");
let pdfDocument = null;
let loadingTask = null;
let renderTask = null;
let renderSequence = 0;
let totalPages = book.pages;
let page = Math.min(totalPages, Math.max(1, Number(params.get("page")) || getSavedPage()));
let isTurning = false;
let wheelDistance = 0;
let wheelResetTimer = null;
let readingZoom = Number(localStorage.getItem(zoomKey)) || 1;
let chromeTimer = null;

readingZoom = zoomLevels.reduce((closest, value) => Math.abs(value - readingZoom) < Math.abs(closest - readingZoom) ? value : closest, 1);

const absolute = (path) => new URL(path, window.location.href).href;

function getSavedPage() {
  const progress = JSON.parse(localStorage.getItem(progressKey) || "{}");
  return progress[book.id]?.page || 1;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function setLoading(message = "Preparing the manual…") {
  loadingText.textContent = message;
  loading.classList.remove("hidden");
  errorPanel.classList.add("hidden");
}

function showReaderError(error) {
  loading.classList.add("hidden");
  canvasWrap.classList.add("hidden");
  errorPanel.classList.remove("hidden");
  errorMessage.textContent = navigator.onLine
    ? "The manual could not be rendered. Please try again or open the original PDF."
    : "This manual is not available offline yet. Reconnect, save it offline, and try again.";
  console.error("TACEF reader error", error);
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

function weekIndexForPage(value = page) {
  let index = 0;
  for (let position = 0; position < weekPages.length; position += 1) {
    if (value >= weekPages[position]) index = position;
    else break;
  }
  return index;
}

function updateWeekControls() {
  const index = weekIndexForPage();
  const label = `Week ${index + 1}`;
  document.getElementById("weekMenuButton").textContent = label;
  document.getElementById("previousWeekButton").disabled = index <= 0;
  document.getElementById("nextWeekButton").disabled = index >= weekPages.length - 1;
  document.getElementById("storyMarkerTitle").textContent = `${label} · ${book.shortTitle}`;
}

function updateZoomControls() {
  const index = zoomLevels.indexOf(readingZoom);
  document.getElementById("zoomOutButton").disabled = index <= 0;
  document.getElementById("zoomInButton").disabled = index >= zoomLevels.length - 1;
  document.getElementById("zoomResetButton").classList.toggle("active", readingZoom === 1);
  document.getElementById("zoomResetButton").title = `${Math.round(readingZoom * 100)}%`;
}

function updatePageControls() {
  const progress = Math.max(0, Math.min(100, (page / totalPages) * 100));
  document.getElementById("currentPageNumber").textContent = page;
  document.getElementById("pageTotalNumber").textContent = totalPages;
  document.getElementById("pagePositionButton").setAttribute("aria-label", `Page ${page} of ${totalPages}. Select to go to another page.`);
  document.getElementById("readingProgressBar").style.width = `${progress}%`;
  document.getElementById("readingProgressText").textContent = `Page ${page} · ${Math.round(progress)}%`;
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = page >= totalPages;
  updateWeekControls();
  updateZoomControls();
}

async function renderPage({ quiet = false } = {}) {
  if (!pdfDocument) return;
  const sequence = ++renderSequence;
  if (renderTask) renderTask.cancel();
  if (!quiet) setLoading(`Opening page ${page}…`);

  try {
    const pdfPage = await pdfDocument.getPage(page);
    if (sequence !== renderSequence) return;

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const fitWidth = Math.max(260, Math.min(stage.clientWidth - (window.innerWidth < 700 ? 18 : 44), 1120));
    const availableWidth = fitWidth * readingZoom;
    const viewport = pdfPage.getViewport({ scale: availableWidth / baseViewport.width });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2.25);
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    renderTask = pdfPage.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    });
    await renderTask.promise;
    if (sequence !== renderSequence) return;

    canvasWrap.classList.remove("hidden");
    loading.classList.add("hidden");
    errorPanel.classList.add("hidden");
    stage.scrollTo({ top: 0, behavior: "auto" });
  } catch (error) {
    if (error?.name !== "RenderingCancelledException" && sequence === renderSequence) showReaderError(error);
  }
}

async function loadDocument() {
  if (loadingTask) {
    try { await loadingTask.destroy(); } catch (_) { /* A failed loading task is safe to discard. */ }
  }
  pdfDocument = null;
  canvasWrap.classList.add("hidden");
  setLoading("Preparing the manual…");

  try {
    loadingTask = getDocument({ url: book.file });
    loadingTask.onProgress = ({ loaded, total }) => {
      if (total > 0) loadingText.textContent = `Loading manual… ${Math.min(100, Math.round((loaded / total) * 100))}%`;
    };
    pdfDocument = await loadingTask.promise;
    totalPages = pdfDocument.numPages;
    page = Math.min(totalPages, page);
    updatePageControls();
    await renderPage();
  } catch (error) {
    showReaderError(error);
  }
}

function commitPageChange(nextPage, announce) {
  page = nextPage;
  updatePageControls();
  saveProgress();
  updateBookmarkButton();
  history.replaceState(null, "", `?book=${encodeURIComponent(book.id)}&page=${page}`);
  if (announce) showToast(`Page ${page}`);
}

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function turnPage(nextPage, announce, direction) {
  if (isTurning) return;
  isTurning = true;
  const outClass = direction === "forward" ? "turn-forward-out" : "turn-backward-out";
  const inClass = direction === "forward" ? "turn-forward-in" : "turn-backward-in";

  try {
    bookLeaf.classList.add(outClass);
    await wait(190);
    commitPageChange(nextPage, announce);
    await renderPage({ quiet: true });
    bookLeaf.classList.remove(outClass);
    bookLeaf.classList.add(inClass);
    await wait(330);
  } finally {
    bookLeaf.classList.remove(outClass, inClass);
    isTurning = false;
  }
}

function openPage(nextPage, announce = false) {
  const targetPage = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
  if (targetPage === page) {
    commitPageChange(targetPage, announce);
    return;
  }

  const direction = targetPage > page ? "forward" : "backward";
  if (pdfDocument && !reducedMotion.matches) {
    turnPage(targetPage, announce, direction);
    return;
  }

  commitPageChange(targetPage, announce);
  if (pdfDocument) renderPage();
}

function setReadingZoom(value) {
  const nextZoom = zoomLevels.reduce((closest, level) => Math.abs(level - value) < Math.abs(closest - value) ? level : closest, 1);
  if (nextZoom === readingZoom) return;
  readingZoom = nextZoom;
  localStorage.setItem(zoomKey, String(readingZoom));
  updateZoomControls();
  if (pdfDocument) renderPage({ quiet: true });
  showToast(`Reading size ${Math.round(readingZoom * 100)}%`);
}

function showWeeks() {
  const activeIndex = weekIndexForPage();
  const calendarIndex = Math.max(0, (currentStudy?.week || 1) - 1);
  const list = document.getElementById("weekList");
  list.innerHTML = weekPages.map((weekPage, index) => `<button type="button" data-week-index="${index}" class="${index === activeIndex ? "active" : ""} ${index === calendarIndex ? "current" : ""}" ${index === activeIndex ? 'aria-current="page"' : ""}>
    <span>Week ${index + 1}</span><small>Page ${weekPage}</small><em>${weekTitles[index] || "Bible study lesson"}</em>
  </button>`).join("");
  document.getElementById("weeksDialogMeta").textContent = currentStudy ? `Current calendar lesson: Week ${currentStudy.week} · ${currentStudy.dates}` : "Choose any available lesson week.";
  list.querySelectorAll("[data-week-index]").forEach((button) => button.addEventListener("click", () => {
    document.getElementById("weeksDialog").close();
    openPage(weekPages[Number(button.dataset.weekIndex)], true);
  }));
  document.getElementById("weeksDialog").showModal();
}

function scheduleChromeHide() {
  clearTimeout(chromeTimer);
  chromeTimer = window.setTimeout(hideReaderChrome, 8000);
}

function hideReaderChrome() {
  const focusedControl = document.activeElement?.closest?.(".reader-header, .reader-tool-dock, dialog");
  const keyboardFocus = focusedControl && document.activeElement.matches?.(":focus-visible");
  const hoveredControls = document.querySelector(".reader-header:hover, .reader-tool-dock:hover");
  if (document.querySelector("dialog[open]") || keyboardFocus || hoveredControls || isTurning) { scheduleChromeHide(); return; }
  document.body.classList.add("reader-chrome-hidden");
}

function showReaderChrome() {
  document.body.classList.remove("reader-chrome-hidden");
  scheduleChromeHide();
}

function toggleReaderChrome() {
  if (document.body.classList.contains("reader-chrome-hidden")) showReaderChrome();
  else { clearTimeout(chromeTimer); hideReaderChrome(); }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (_) {
    showToast("Fullscreen is not available in this browser.");
  }
}

function requestPage() {
  const requestedPage = window.prompt(`Go to page (1–${totalPages})`, String(page));
  if (requestedPage !== null) openPage(requestedPage, true);
}

function dismissGestureGuide() {
  gestureGuide.classList.add("used");
}

let touchStart = null;
stage.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1 || document.querySelector("dialog[open]")) return;
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now(), interactive: Boolean(event.target.closest?.("button, a, input")) };
  scheduleChromeHide();
}, { passive: true });

stage.addEventListener("touchend", (event) => {
  if (!touchStart || event.changedTouches.length !== 1 || isTurning) { touchStart = null; return; }
  const touch = event.changedTouches[0];
  const distanceX = touch.clientX - touchStart.x;
  const distanceY = touch.clientY - touchStart.y;
  const elapsed = Date.now() - touchStart.at;
  const interactive = touchStart.interactive;
  touchStart = null;

  if (interactive) { showReaderChrome(); return; }
  if (elapsed < 420 && Math.abs(distanceX) < 12 && Math.abs(distanceY) < 12) { toggleReaderChrome(); return; }
  if (elapsed > 900 || Math.abs(distanceX) < 58 || Math.abs(distanceX) < Math.abs(distanceY) * 1.25) return;
  dismissGestureGuide();
  openPage(page + (distanceX < 0 ? 1 : -1), true);
}, { passive: true });

stage.addEventListener("wheel", (event) => {
  scheduleChromeHide();
  if (event.ctrlKey || isTurning || document.querySelector("dialog[open]") || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  const atTop = stage.scrollTop <= 2;
  const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
  const canTurnForward = event.deltaY > 0 && atBottom && page < totalPages;
  const canTurnBackward = event.deltaY < 0 && atTop && page > 1;

  if (!canTurnForward && !canTurnBackward) {
    wheelDistance = 0;
    return;
  }

  event.preventDefault();
  wheelDistance += event.deltaY;
  clearTimeout(wheelResetTimer);
  wheelResetTimer = window.setTimeout(() => { wheelDistance = 0; }, 260);

  if (Math.abs(wheelDistance) >= 120) {
    const direction = wheelDistance > 0 ? 1 : -1;
    wheelDistance = 0;
    dismissGestureGuide();
    openPage(page + direction, true);
  }
}, { passive: false });

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
  if (pages.includes(page)) {
    setBookmarks(pages.filter((value) => value !== page));
    showToast(`Bookmark removed from page ${page}.`);
  } else {
    setBookmarks([...pages, page]);
    showToast(`Page ${page} bookmarked.`);
  }
  updateBookmarkButton();
}

function showBookmarks() {
  const pages = getBookmarks();
  const list = document.getElementById("bookmarkList");
  list.innerHTML = pages.length
    ? pages.map((value) => `<button type="button" data-bookmark-page="${value}"><span>Page ${value}</span><small>Open saved page</small><b>→</b></button>`).join("")
    : '<div class="empty-state"><span>☆</span><p>No bookmarks yet. Select the star while reading to save a page.</p></div>';
  list.querySelectorAll("[data-bookmark-page]").forEach((button) => button.addEventListener("click", () => {
    document.getElementById("bookmarksDialog").close();
    openPage(button.dataset.bookmarkPage, true);
  }));
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
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    const cache = await caches.open(manualCacheName);
    const [pdfResponse, indexResponse] = await Promise.all([fetch(book.file), fetch(book.index)]);
    if (!pdfResponse.ok || !indexResponse.ok) throw new Error();
    await Promise.all([cache.put(absolute(book.file), pdfResponse), cache.put(absolute(book.index), indexResponse)]);
    showToast(`${book.shortTitle} is ready offline.`);
  } catch (_) {
    showToast("The manual could not be saved. Please try again.");
  } finally {
    button.disabled = false;
    updateOfflineButton();
  }
}

function normalise(value) { return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function snippet(text, query) {
  const clean = text.replace(/\s+/g, " ").trim();
  const at = normalise(clean).indexOf(normalise(query));
  const start = Math.max(0, at - 80);
  const end = Math.min(clean.length, Math.max(at + query.length + 100, 190));
  return `${start ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

async function searchBook(query) {
  const status = document.getElementById("readerSearchStatus");
  const results = document.getElementById("readerSearchResults");
  if (query.trim().length < 2) { status.textContent = "Enter at least two characters."; results.innerHTML = ""; return; }
  status.textContent = "Searching…";
  results.innerHTML = '<div class="result-skeleton"></div>';
  try {
    const pages = await fetch(book.index).then((response) => { if (!response.ok) throw new Error(); return response.json(); });
    const needle = normalise(query.trim());
    const matches = pages.filter((item) => normalise(item.text).includes(needle)).slice(0, 40);
    status.textContent = matches.length ? `${matches.length}${matches.length === 40 ? "+" : ""} matching pages` : `No pages found for “${query}”.`;
    results.innerHTML = matches.map((item) => `<button class="search-result" type="button" data-result-page="${item.page}"><span class="result-book">Page ${item.page}</span><strong>${escapeHtml(snippet(item.text, query))}</strong><span class="result-arrow">→</span></button>`).join("");
    results.querySelectorAll("[data-result-page]").forEach((button) => button.addEventListener("click", () => {
      document.getElementById("searchDialog").close();
      openPage(button.dataset.resultPage, true);
    }));
  } catch (_) {
    status.textContent = navigator.onLine ? "Search is temporarily unavailable." : "Save this manual offline to search without internet.";
    results.innerHTML = "";
  }
}

document.title = `${book.shortTitle} · TACEF Books`;
document.getElementById("readerBookTitle").textContent = book.shortTitle;
document.getElementById("readerBookMeta").textContent = `${readerName ? `Welcome ${readerName} · ` : ""}${book.language} · ${book.pages} pages`;
document.getElementById("storyMarkerTitle").textContent = currentStudy ? `Week ${currentStudy.week} · ${book.shortTitle}` : book.shortTitle;
document.getElementById("originalPdfLink").href = book.file;
document.getElementById("errorPdfLink").href = book.file;
updatePageControls();

document.getElementById("prevPage").addEventListener("click", () => openPage(page - 1));
document.getElementById("nextPage").addEventListener("click", () => openPage(page + 1));
document.getElementById("pagePositionButton").addEventListener("click", requestPage);
document.getElementById("bookmarkButton").addEventListener("click", toggleBookmark);
document.getElementById("bookmarksButton").addEventListener("click", showBookmarks);
document.getElementById("weeksButton").addEventListener("click", showWeeks);
document.getElementById("weekMenuButton").addEventListener("click", showWeeks);
document.getElementById("previousWeekButton").addEventListener("click", () => openPage(weekPages[Math.max(0, weekIndexForPage() - 1)], true));
document.getElementById("nextWeekButton").addEventListener("click", () => openPage(weekPages[Math.min(weekPages.length - 1, weekIndexForPage() + 1)], true));
document.getElementById("zoomOutButton").addEventListener("click", () => setReadingZoom(zoomLevels[Math.max(0, zoomLevels.indexOf(readingZoom) - 1)]));
document.getElementById("zoomResetButton").addEventListener("click", () => setReadingZoom(1));
document.getElementById("zoomInButton").addEventListener("click", () => setReadingZoom(zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(readingZoom) + 1)]));
document.getElementById("fullscreenButton").addEventListener("click", toggleFullscreen);
document.getElementById("offlineButton").addEventListener("click", saveOffline);
document.getElementById("retryReader").addEventListener("click", loadDocument);
document.getElementById("readerSearchButton").addEventListener("click", () => document.getElementById("searchDialog").showModal());
document.getElementById("readerSearchForm").addEventListener("submit", (event) => { event.preventDefault(); searchBook(document.getElementById("readerSearchInput").value); });
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => { button.closest("dialog").close(); showReaderChrome(); }));
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("keydown", (event) => {
  scheduleChromeHide();
  if (event.target.matches("input") || document.querySelector("dialog[open]")) return;
  if (event.key === "ArrowLeft") openPage(page - 1);
  if (event.key === "ArrowRight") openPage(page + 1);
  if (event.key === "PageUp") openPage(page - 1);
  if (event.key === "PageDown") openPage(page + 1);
});
window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" && event.clientY <= 96) showReaderChrome();
});
document.querySelectorAll(".reader-header, .reader-tool-dock").forEach((element) => {
  element.addEventListener("pointerenter", showReaderChrome);
  element.addEventListener("focusin", showReaderChrome);
});
document.addEventListener("fullscreenchange", () => {
  const button = document.getElementById("fullscreenButton");
  button.textContent = document.fullscreenElement ? "×" : "⛶";
  button.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
  showReaderChrome();
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (pdfDocument) renderPage(); }, 220);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
updateNetworkStatus();
updateOfflineButton();
openPage(page);
loadDocument();
if (!document.documentElement.requestFullscreen) document.getElementById("fullscreenButton").hidden = true;
showReaderChrome();
