import { getDocument, GlobalWorkerOptions } from "./vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const books = window.TACEF_CATALOG || [];
const params = new URLSearchParams(window.location.search);
const book = books.find((item) => item.id === params.get("book")) || books[0];
const manualCacheName = "tacef-manuals-v1";
const progressKey = "tacef-progress";
const bookmarksKey = "tacef-bookmarks";
const pageInput = document.getElementById("pageInput");
const toast = document.getElementById("toast");
const stage = document.querySelector(".pdf-stage");
const canvasWrap = document.getElementById("pdfCanvasWrap");
const canvas = document.getElementById("pdfCanvas");
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

function updatePageControls() {
  pageInput.value = page;
  pageInput.max = totalPages;
  document.getElementById("pageTotal").textContent = `of ${totalPages}`;
  document.getElementById("mobilePageNumber").textContent = page;
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("mobilePrevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = page >= totalPages;
  document.getElementById("mobileNextPage").disabled = page >= totalPages;
}

async function renderPage() {
  if (!pdfDocument) return;
  const sequence = ++renderSequence;
  if (renderTask) renderTask.cancel();
  setLoading(`Opening page ${page}…`);

  try {
    const pdfPage = await pdfDocument.getPage(page);
    if (sequence !== renderSequence) return;

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(260, Math.min(stage.clientWidth - (window.innerWidth < 700 ? 18 : 44), 1120));
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

function openPage(nextPage, announce = false) {
  page = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
  updatePageControls();
  saveProgress();
  updateBookmarkButton();
  history.replaceState(null, "", `?book=${encodeURIComponent(book.id)}&page=${page}`);
  if (pdfDocument) renderPage();
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
document.getElementById("readerBookMeta").textContent = `${book.language} · ${book.pages} pages`;
document.getElementById("originalPdfLink").href = book.file;
document.getElementById("errorPdfLink").href = book.file;
updatePageControls();

document.getElementById("prevPage").addEventListener("click", () => openPage(page - 1));
document.getElementById("nextPage").addEventListener("click", () => openPage(page + 1));
document.getElementById("mobilePrevPage").addEventListener("click", () => openPage(page - 1));
document.getElementById("mobileNextPage").addEventListener("click", () => openPage(page + 1));
document.getElementById("mobilePageButton").addEventListener("click", () => {
  const requestedPage = window.prompt(`Go to page (1–${totalPages})`, String(page));
  if (requestedPage !== null) openPage(requestedPage, true);
});
pageInput.addEventListener("change", () => openPage(pageInput.value, true));
document.getElementById("bookmarkButton").addEventListener("click", toggleBookmark);
document.getElementById("bookmarksButton").addEventListener("click", showBookmarks);
document.getElementById("offlineButton").addEventListener("click", saveOffline);
document.getElementById("retryReader").addEventListener("click", loadDocument);
document.getElementById("readerSearchButton").addEventListener("click", () => document.getElementById("searchDialog").showModal());
document.getElementById("readerSearchForm").addEventListener("submit", (event) => { event.preventDefault(); searchBook(document.getElementById("readerSearchInput").value); });
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("keydown", (event) => {
  if (event.target.matches("input") || document.querySelector("dialog[open]")) return;
  if (event.key === "ArrowLeft") openPage(page - 1);
  if (event.key === "ArrowRight") openPage(page + 1);
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
