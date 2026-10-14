import { getDocument, GlobalWorkerOptions } from "./vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const books = window.TACEF_CATALOG || [];
const params = new URLSearchParams(window.location.search);
const book = books.find((item) => item.id === params.get("book")) || books[0];
const currentStudy = window.TACEF_STUDY_SCHEDULE?.getCurrentStudy(new Date(), book.id);
const weekPages = window.TACEF_STUDY_SCHEDULE?.manualPages?.[book.id] || [1];
const weekTitles = window.TACEF_STUDY_SCHEDULE?.titles || [];
const progressKey = "tacef-progress";
const bookmarksKey = "tacef-bookmarks";
const zoomKey = "tacef-reading-zoom";
const viewStateKey = "tacef-reader-view-v1";
const annotationsKey = "tacef-reader-annotations-v1";
const zoomLevels = [0.82, 1, 1.2, 1.5, 1.85, 2.25, 2.75];
const isPhoneLayout = () => (window.visualViewport?.width || window.innerWidth) <= 700;
const availableZoomLevels = () => isPhoneLayout() ? zoomLevels.filter((level) => level <= 1) : zoomLevels;
const toast = document.getElementById("toast");
const stage = document.querySelector(".pdf-stage");
const canvasWrap = document.getElementById("pdfCanvasWrap");
const canvas = document.getElementById("pdfCanvas");
const annotationCanvas = document.getElementById("annotationCanvas");
const annotationContext = annotationCanvas.getContext("2d");
const annotationToolbar = document.getElementById("annotationToolbar");
const annotateButton = document.getElementById("annotateButton");
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
let readingZoom = Number(localStorage.getItem(zoomKey)) || 1;
let chromeTimer = null;
let lastStagePointer = null;
let restoreViewAfterRender = null;
let annotationTool = "pen";
let annotationEnabled = false;
let drawingPointerId = null;
let activeStroke = null;
let pageStrokes = [];
let viewSaveTimer = null;

readingZoom = zoomLevels.reduce((closest, value) => Math.abs(value - readingZoom) < Math.abs(closest - readingZoom) ? value : closest, 1);
if (isPhoneLayout()) readingZoom = Math.min(readingZoom, 1);

function readStoredObject(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); }
  catch (_) { return {}; }
}

function writeStoredObject(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) { showToast("This device could not save the latest change."); return false; }
}

function getPageViewState(targetPage = page) {
  return readStoredObject(viewStateKey)[book.id]?.[targetPage] || null;
}

function saveCurrentViewState() {
  if (!pdfDocument || !canvas.offsetWidth) return;
  const all = readStoredObject(viewStateKey);
  const bookViews = all[book.id] || {};
  const maxX = Math.max(0, stage.scrollWidth - stage.clientWidth);
  const maxY = Math.max(0, stage.scrollHeight - stage.clientHeight);
  bookViews[page] = {
    zoom: readingZoom,
    x: maxX ? stage.scrollLeft / maxX : 0.5,
    y: maxY ? stage.scrollTop / maxY : 0,
    updated: Date.now()
  };
  all[book.id] = bookViews;
  writeStoredObject(viewStateKey, all);
}

function applyPageZoom(targetPage = page) {
  const saved = getPageViewState(targetPage);
  const requested = saved?.zoom || 1;
  const levels = availableZoomLevels();
  readingZoom = levels.reduce((closest, level) => Math.abs(level - requested) < Math.abs(closest - requested) ? level : closest, 1);
  localStorage.setItem(zoomKey, String(readingZoom));
}

function captureViewAnchor(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = Number.isFinite(clientX) ? clientX : (lastStagePointer?.x ?? rect.left + stage.clientWidth / 2);
  const y = Number.isFinite(clientY) ? clientY : (lastStagePointer?.y ?? rect.top + stage.clientHeight / 2);
  const offsetX = Math.max(0, Math.min(stage.clientWidth, x - rect.left));
  const offsetY = Math.max(0, Math.min(stage.clientHeight, y - rect.top));
  return {
    kind: "anchor",
    x: (stage.scrollLeft + offsetX) / Math.max(1, stage.scrollWidth),
    y: (stage.scrollTop + offsetY) / Math.max(1, stage.scrollHeight),
    offsetX,
    offsetY
  };
}

function restoreSavedView(state) {
  requestAnimationFrame(() => {
    if (state?.kind === "anchor") {
      stage.scrollLeft = Math.max(0, state.x * stage.scrollWidth - state.offsetX);
      stage.scrollTop = Math.max(0, state.y * stage.scrollHeight - state.offsetY);
    } else if (state) {
      const maxX = Math.max(0, stage.scrollWidth - stage.clientWidth);
      const maxY = Math.max(0, stage.scrollHeight - stage.clientHeight);
      stage.scrollLeft = Math.max(0, Math.min(maxX, (state.x ?? 0.5) * maxX));
      stage.scrollTop = Math.max(0, Math.min(maxY, (state.y ?? 0) * maxY));
    } else {
      stage.scrollTo({ left: 0, top: 0, behavior: "auto" });
    }
    saveCurrentViewState();
  });
}

function getAnnotations(targetPage = page) {
  return readStoredObject(annotationsKey)[book.id]?.[targetPage] || [];
}

function saveAnnotations() {
  const all = readStoredObject(annotationsKey);
  const bookAnnotations = all[book.id] || {};
  if (pageStrokes.length) bookAnnotations[page] = pageStrokes;
  else delete bookAnnotations[page];
  all[book.id] = bookAnnotations;
  if (writeStoredObject(annotationsKey, all)) {
    const status = document.getElementById("annotationSaveStatus");
    status.textContent = "Saved on this device";
  }
}

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
  document.getElementById("storyMarkerTitle").textContent = `${label} · ${book.shortTitle}`;
}

function updateZoomControls() {
  const levels = availableZoomLevels();
  const index = levels.indexOf(readingZoom);
  document.getElementById("zoomOutButton").disabled = index <= 0;
  document.getElementById("zoomInButton").disabled = index >= levels.length - 1;
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

function configureAnnotationCanvas() {
  annotationCanvas.width = canvas.width;
  annotationCanvas.height = canvas.height;
  annotationCanvas.style.width = canvas.style.width;
  annotationCanvas.style.height = canvas.style.height;
}

function drawStoredStroke(stroke) {
  if (!stroke?.points?.length) return;
  const points = stroke.points;
  annotationContext.save();
  annotationContext.lineCap = "round";
  annotationContext.lineJoin = "round";
  annotationContext.strokeStyle = stroke.color || "#d7192d";
  annotationContext.globalAlpha = stroke.tool === "highlight" ? 0.3 : 0.92;
  annotationContext.globalCompositeOperation = stroke.tool === "highlight" ? "multiply" : "source-over";
  annotationContext.lineWidth = Math.max(2, (stroke.width || 0.0035) * annotationCanvas.width);
  annotationContext.beginPath();
  annotationContext.moveTo(points[0].x * annotationCanvas.width, points[0].y * annotationCanvas.height);
  if (points.length === 1) {
    annotationContext.lineTo(points[0].x * annotationCanvas.width + 0.01, points[0].y * annotationCanvas.height + 0.01);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      annotationContext.lineTo(points[index].x * annotationCanvas.width, points[index].y * annotationCanvas.height);
    }
  }
  annotationContext.stroke();
  annotationContext.restore();
}

function renderAnnotations() {
  annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  pageStrokes.forEach(drawStoredStroke);
}

function loadPageAnnotations() {
  pageStrokes = getAnnotations();
  configureAnnotationCanvas();
  renderAnnotations();
  document.getElementById("undoAnnotation").disabled = pageStrokes.length === 0;
  document.getElementById("clearAnnotations").disabled = pageStrokes.length === 0;
}

function annotationPoint(event) {
  const rect = annotationCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy));
}

function eraseAt(point) {
  const before = pageStrokes.length;
  pageStrokes = pageStrokes.filter((stroke) => {
    const points = stroke.points || [];
    const threshold = Math.max(0.018, (stroke.width || 0.004) * 1.4);
    if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) > threshold;
    for (let index = 1; index < points.length; index += 1) {
      if (distanceToSegment(point, points[index - 1], points[index]) <= threshold) return false;
    }
    return true;
  });
  if (pageStrokes.length !== before) {
    renderAnnotations();
    saveAnnotations();
    document.getElementById("undoAnnotation").disabled = pageStrokes.length === 0;
    document.getElementById("clearAnnotations").disabled = pageStrokes.length === 0;
  }
}

function selectAnnotationTool(tool) {
  annotationTool = tool;
  document.querySelectorAll("[data-annotation-tool]").forEach((button) => {
    const selected = button.dataset.annotationTool === tool;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  annotationCanvas.classList.toggle("eraser-active", tool === "eraser");
}

function setAnnotationEnabled(enabled) {
  annotationEnabled = enabled;
  annotateButton.classList.toggle("active", enabled);
  annotateButton.setAttribute("aria-pressed", String(enabled));
  annotationToolbar.classList.toggle("hidden", !enabled);
  bookLeaf.classList.toggle("annotation-active", enabled);
  document.body.classList.toggle("annotation-mode", enabled);
  if (enabled) {
    showReaderChrome();
    document.getElementById("annotationSaveStatus").textContent = "Saved on this device";
    showToast("Drawing mode: write or highlight this page.");
  } else {
    drawingPointerId = null;
    activeStroke = null;
    scheduleChromeHide();
  }
}

annotationCanvas.addEventListener("pointerdown", (event) => {
  if (!annotationEnabled || event.button > 0) return;
  event.preventDefault();
  event.stopPropagation();
  annotationCanvas.setPointerCapture(event.pointerId);
  drawingPointerId = event.pointerId;
  const point = annotationPoint(event);
  if (annotationTool === "eraser") { eraseAt(point); return; }
  activeStroke = {
    tool: annotationTool,
    color: annotationTool === "highlight" ? "#ffe45c" : document.getElementById("annotationColour").value,
    width: annotationTool === "highlight" ? 0.022 : 0.0035,
    points: [point]
  };
  pageStrokes.push(activeStroke);
  drawStoredStroke(activeStroke);
}, { passive: false });

annotationCanvas.addEventListener("pointermove", (event) => {
  if (!annotationEnabled || drawingPointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const point = annotationPoint(event);
  if (annotationTool === "eraser") { eraseAt(point); return; }
  if (!activeStroke) return;
  const previous = activeStroke.points[activeStroke.points.length - 1];
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001) return;
  activeStroke.points.push(point);
  renderAnnotations();
}, { passive: false });

function finishAnnotationStroke(event) {
  if (drawingPointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  if (annotationCanvas.hasPointerCapture(event.pointerId)) annotationCanvas.releasePointerCapture(event.pointerId);
  drawingPointerId = null;
  if (activeStroke) {
    activeStroke = null;
    saveAnnotations();
    document.getElementById("undoAnnotation").disabled = false;
    document.getElementById("clearAnnotations").disabled = false;
  }
}

annotationCanvas.addEventListener("pointerup", finishAnnotationStroke, { passive: false });
annotationCanvas.addEventListener("pointercancel", finishAnnotationStroke, { passive: false });

async function renderPage({ quiet = false, restore = null } = {}) {
  if (!pdfDocument) return;
  const sequence = ++renderSequence;
  if (renderTask) renderTask.cancel();
  if (!quiet) setLoading(`Opening page ${page}…`);

  try {
    const pdfPage = await pdfDocument.getPage(page);
    if (sequence !== renderSequence) return;

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const visualWidth = window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
    const stageWidth = Math.min(stage.clientWidth || visualWidth, visualWidth);
    const fitWidth = Math.max(240, Math.min(stageWidth - (isPhoneLayout() ? 32 : 44), 1120));
    const availableWidth = fitWidth * (isPhoneLayout() ? Math.min(readingZoom, 1) : readingZoom);
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
    loadPageAnnotations();
    restoreViewAfterRender = restore || getPageViewState();
    restoreSavedView(restoreViewAfterRender);
    restoreViewAfterRender = null;
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
  saveCurrentViewState();
  page = nextPage;
  applyPageZoom(page);
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
    await wait(240);
    commitPageChange(nextPage, announce);
    await renderPage({ quiet: true });
    bookLeaf.classList.remove(outClass);
    bookLeaf.classList.add(inClass);
    await wait(400);
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

function setReadingZoom(value, anchor = captureViewAnchor()) {
  const levels = availableZoomLevels();
  const nextZoom = levels.reduce((closest, level) => Math.abs(level - value) < Math.abs(closest - value) ? level : closest, 1);
  if (nextZoom === readingZoom) return;
  readingZoom = nextZoom;
  localStorage.setItem(zoomKey, String(readingZoom));
  updateZoomControls();
  if (pdfDocument) renderPage({ quiet: true, restore: anchor });
  showToast(`Reading size ${Math.round(readingZoom * 100)}%`);
}

function showWeeks() {
  const activeIndex = weekIndexForPage();
  const calendarIndex = Math.max(0, (currentStudy?.week || 1) - 1);
  const list = document.getElementById("weekList");
  list.innerHTML = weekPages.map((weekPage, index) => `<button type="button" data-week-index="${index}" style="--week-index:${index}" class="${index === activeIndex ? "active" : ""} ${index === calendarIndex ? "current" : ""}" ${index === activeIndex ? 'aria-current="page"' : ""}>
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
  const focusedControl = document.activeElement?.closest?.(".reader-header, dialog");
  const keyboardFocus = focusedControl && document.activeElement.matches?.(":focus-visible");
  const hoveredControls = document.querySelector(".reader-header:hover");
  if (document.querySelector("dialog[open]") || keyboardFocus || hoveredControls || isTurning || annotationEnabled) { scheduleChromeHide(); return; }
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
  const dialog = document.getElementById("pageDialog");
  const input = document.getElementById("pageJumpInput");
  input.min = "1";
  input.max = String(totalPages);
  input.value = String(page);
  document.getElementById("pageJumpHelp").textContent = `Choose a page from 1 to ${totalPages}.`;
  dialog.showModal();
  window.setTimeout(() => { input.focus(); input.select(); }, 60);
}

function submitPageRequest(event) {
  event.preventDefault();
  const input = document.getElementById("pageJumpInput");
  const requestedPage = Number(input.value);
  if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > totalPages) {
    input.setCustomValidity(`Enter a page from 1 to ${totalPages}.`);
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  document.getElementById("pageDialog").close();
  openPage(requestedPage, true);
}

function dismissGestureGuide() {
  gestureGuide.classList.add("used");
}

let touchStart = null;
let multiTouchGesture = false;
let lastMultiTouchAt = 0;

function isViewportZoomed() {
  const viewportScale = window.visualViewport?.scale || 1;
  return viewportScale > 1.02 || Date.now() - lastMultiTouchAt < 900;
}

function pageIsFittedForSwipe() {
  const hasHorizontalOverflow = stage.scrollWidth > stage.clientWidth + 8;
  return !annotationEnabled && !isViewportZoomed() && readingZoom <= 1.001 && !hasHorizontalOverflow;
}

stage.addEventListener("touchstart", (event) => {
  if (event.touches.length > 1) {
    multiTouchGesture = true;
    lastMultiTouchAt = Date.now();
    touchStart = null;
    return;
  }
  if (event.touches.length !== 1 || multiTouchGesture || !pageIsFittedForSwipe() || document.querySelector("dialog[open]")) {
    touchStart = null;
    return;
  }
  const touch = event.touches[0];
  touchStart = {
    x: touch.clientX,
    y: touch.clientY,
    at: Date.now(),
    maxX: 0,
    maxY: 0,
    edge: touch.clientX < 24 || touch.clientX > window.innerWidth - 24,
    interactive: Boolean(event.target.closest?.("button, a, input, .annotation-toolbar, .annotation-canvas"))
  };
  scheduleChromeHide();
}, { passive: true });

stage.addEventListener("touchmove", (event) => {
  if (event.touches.length > 1) {
    multiTouchGesture = true;
    lastMultiTouchAt = Date.now();
    touchStart = null;
    return;
  }
  if (!touchStart || event.touches.length !== 1 || multiTouchGesture || !pageIsFittedForSwipe()) return;
  const touch = event.touches[0];
  const distanceX = touch.clientX - touchStart.x;
  const distanceY = touch.clientY - touchStart.y;
  touchStart.maxX = Math.max(touchStart.maxX, Math.abs(distanceX));
  touchStart.maxY = Math.max(touchStart.maxY, Math.abs(distanceY));
  if (!touchStart.edge && Math.abs(distanceX) > 24 && Math.abs(distanceX) > Math.abs(distanceY) * 1.65) event.preventDefault();
}, { passive: false });

stage.addEventListener("touchend", (event) => {
  if (multiTouchGesture) {
    lastMultiTouchAt = Date.now();
    touchStart = null;
    if (event.touches.length === 0) multiTouchGesture = false;
    return;
  }
  if (!pageIsFittedForSwipe()) { touchStart = null; return; }
  if (!touchStart || event.changedTouches.length !== 1 || isTurning) { touchStart = null; return; }
  const touch = event.changedTouches[0];
  const distanceX = touch.clientX - touchStart.x;
  const distanceY = touch.clientY - touchStart.y;
  const elapsed = Date.now() - touchStart.at;
  const interactive = touchStart.interactive;
  const edge = touchStart.edge;
  const maxY = touchStart.maxY;
  touchStart = null;

  if (interactive) { showReaderChrome(); return; }
  if (elapsed < 420 && Math.abs(distanceX) < 12 && Math.abs(distanceY) < 12) { toggleReaderChrome(); return; }
  const horizontal = Math.abs(distanceX);
  const vertical = Math.max(Math.abs(distanceY), maxY);
  const velocity = horizontal / Math.max(1, elapsed);
  if (edge || elapsed > 700 || horizontal < 64 || velocity < 0.16 || horizontal < vertical * 1.65) return;
  dismissGestureGuide();
  openPage(page + (distanceX < 0 ? 1 : -1), true);
}, { passive: true });

stage.addEventListener("touchcancel", () => {
  touchStart = null;
  multiTouchGesture = false;
  lastMultiTouchAt = Date.now();
}, { passive: true });

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

document.title = `${book.shortTitle} · TACEF Books`;
document.getElementById("readerBookTitle").textContent = book.shortTitle;
document.getElementById("readerBookMeta").textContent = `${book.language} · ${book.pages} pages`;
document.getElementById("storyMarkerTitle").textContent = currentStudy ? `Week ${currentStudy.week} · ${book.shortTitle}` : book.shortTitle;
document.getElementById("errorPdfLink").href = book.file;
updatePageControls();

document.getElementById("prevPage").addEventListener("click", () => openPage(page - 1));
document.getElementById("nextPage").addEventListener("click", () => openPage(page + 1));
document.getElementById("pagePositionButton").addEventListener("click", requestPage);
document.getElementById("pageJumpForm").addEventListener("submit", submitPageRequest);
document.getElementById("bookmarkButton").addEventListener("click", toggleBookmark);
document.getElementById("bookmarksButton").addEventListener("click", showBookmarks);
document.getElementById("weekMenuButton").addEventListener("click", showWeeks);
annotateButton.addEventListener("click", () => setAnnotationEnabled(!annotationEnabled));
document.querySelectorAll("[data-annotation-tool]").forEach((button) => button.addEventListener("click", () => selectAnnotationTool(button.dataset.annotationTool)));
document.getElementById("closeAnnotations").addEventListener("click", () => setAnnotationEnabled(false));
document.getElementById("undoAnnotation").addEventListener("click", () => {
  if (!pageStrokes.length) return;
  pageStrokes.pop();
  renderAnnotations();
  saveAnnotations();
  document.getElementById("undoAnnotation").disabled = pageStrokes.length === 0;
  document.getElementById("clearAnnotations").disabled = pageStrokes.length === 0;
  showToast("Last mark removed.");
});
document.getElementById("clearAnnotations").addEventListener("click", () => {
  if (!pageStrokes.length || !window.confirm("Clear every drawing and highlight from this page?")) return;
  pageStrokes = [];
  renderAnnotations();
  saveAnnotations();
  document.getElementById("undoAnnotation").disabled = true;
  document.getElementById("clearAnnotations").disabled = true;
  showToast(`Page ${page} annotations cleared.`);
});
document.getElementById("zoomOutButton").addEventListener("click", () => {
  const levels = availableZoomLevels();
  setReadingZoom(levels[Math.max(0, levels.indexOf(readingZoom) - 1)]);
});
document.getElementById("zoomResetButton").addEventListener("click", () => setReadingZoom(1));
document.getElementById("zoomInButton").addEventListener("click", () => {
  const levels = availableZoomLevels();
  setReadingZoom(levels[Math.min(levels.length - 1, levels.indexOf(readingZoom) + 1)]);
});
document.getElementById("fullscreenButton").addEventListener("click", toggleFullscreen);
document.getElementById("retryReader").addEventListener("click", loadDocument);
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => { button.closest("dialog").close(); showReaderChrome(); }));
window.addEventListener("keydown", (event) => {
  scheduleChromeHide();
  if (event.target.matches("input, button, [contenteditable]") || document.querySelector("dialog[open]") || annotationEnabled) return;
  if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && (readingZoom > 1.001 || stage.scrollWidth > stage.clientWidth + 8)) {
    event.preventDefault();
    stage.scrollBy({ left: event.key === "ArrowLeft" ? -120 : 120, behavior: "smooth" });
    return;
  }
  if (event.key === "ArrowLeft") openPage(page - 1);
  if (event.key === "ArrowRight") openPage(page + 1);
  if (event.key === "PageUp") openPage(page - 1);
  if (event.key === "PageDown") openPage(page + 1);
});
window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" && event.clientY <= 96) showReaderChrome();
});
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" || event.pointerType === "pen") lastStagePointer = { x: event.clientX, y: event.clientY };
}, { passive: true });
stage.addEventListener("wheel", (event) => {
  if (!(event.ctrlKey || event.metaKey) || annotationEnabled) return;
  event.preventDefault();
  lastStagePointer = { x: event.clientX, y: event.clientY };
  const levels = availableZoomLevels();
  const index = levels.indexOf(readingZoom);
  const direction = event.deltaY < 0 ? 1 : -1;
  setReadingZoom(levels[Math.max(0, Math.min(levels.length - 1, index + direction))], captureViewAnchor(event.clientX, event.clientY));
}, { passive: false });
stage.addEventListener("scroll", () => {
  clearTimeout(viewSaveTimer);
  viewSaveTimer = window.setTimeout(saveCurrentViewState, 180);
}, { passive: true });
document.querySelectorAll(".reader-header").forEach((element) => {
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
  resizeTimer = setTimeout(() => {
    const anchor = captureViewAnchor();
    if (isPhoneLayout() && readingZoom > 1) {
      readingZoom = 1;
      localStorage.setItem(zoomKey, String(readingZoom));
      updateZoomControls();
    }
    if (pdfDocument) renderPage({ quiet: true, restore: anchor });
  }, 220);
});

window.addEventListener("pagehide", () => {
  saveCurrentViewState();
  if (activeStroke) saveAnnotations();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
applyPageZoom(page);
selectAnnotationTool("pen");
openPage(page);
loadDocument();
if (!document.documentElement.requestFullscreen) document.getElementById("fullscreenButton").hidden = true;
showReaderChrome();
