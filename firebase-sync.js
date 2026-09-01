const progressKey = "tacef-progress";
const bookmarksKey = "tacef-bookmarks";
const dialog = document.getElementById("accountDialog");
const authButtons = [...document.querySelectorAll("[data-auth-button]")];
const authLabels = [...document.querySelectorAll("[data-auth-label]")];
const authAvatars = [...document.querySelectorAll("[data-auth-avatar]")];
const accountIdentity = document.getElementById("accountIdentity");
const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const googleButton = document.getElementById("googleSignInButton");
const signOutButton = document.getElementById("signOutButton");
const authStatus = document.getElementById("authStatus");

let auth;
let db;
let firebaseApi;
let currentUser = null;
let initialisePromise = null;
let syncTimer = null;
let applyingCloudState = false;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); }
  catch (_) { return {}; }
}

function initials(user) {
  const source = user?.displayName || user?.email || "T";
  return source.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function setStatus(message, state = "") {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.dataset.state = state;
}

function updateUi(user) {
  currentUser = user;
  authLabels.forEach((label) => { label.textContent = user ? (user.displayName?.split(" ")[0] || "Account") : "Sign in"; });
  authAvatars.forEach((avatar) => { avatar.textContent = user ? initials(user) : "↗"; avatar.classList.toggle("signed-in", Boolean(user)); });
  authButtons.forEach((button) => button.setAttribute("aria-label", user ? `Account for ${user.displayName || user.email}` : "Sign in to sync reading progress"));
  if (accountIdentity) accountIdentity.hidden = !user;
  if (accountName) accountName.textContent = user?.displayName || "TACEF reader";
  if (accountEmail) accountEmail.textContent = user?.email || "";
  if (googleButton) googleButton.hidden = Boolean(user);
  if (signOutButton) signOutButton.hidden = !user;
  setStatus(user ? "Your progress and bookmarks sync securely across signed-in devices." : "Sign-in is optional. Reading and offline manuals work without an account.", user ? "synced" : "");
}

function mergeProgress(localProgress, cloudProgress) {
  const merged = { ...cloudProgress };
  for (const [bookId, localEntry] of Object.entries(localProgress)) {
    const cloudEntry = merged[bookId];
    if (!cloudEntry || Number(localEntry.updated || 0) >= Number(cloudEntry.updated || 0)) merged[bookId] = localEntry;
  }
  return merged;
}

function mergeBookmarks(localBookmarks, cloudBookmarks) {
  const merged = {};
  const bookIds = new Set([...Object.keys(localBookmarks), ...Object.keys(cloudBookmarks)]);
  bookIds.forEach((bookId) => {
    const pages = [...(localBookmarks[bookId] || []), ...(cloudBookmarks[bookId] || [])].map(Number).filter(Number.isFinite);
    merged[bookId] = [...new Set(pages)].sort((a, b) => a - b);
  });
  return merged;
}

async function pullAndMerge(user) {
  const { doc, getDoc, setDoc, serverTimestamp } = firebaseApi;
  const stateReference = doc(db, "users", user.uid, "state", "reading");
  const snapshot = await getDoc(stateReference);
  const cloud = snapshot.exists() ? snapshot.data() : {};
  const progress = mergeProgress(readJson(progressKey), cloud.progress || {});
  const bookmarks = mergeBookmarks(readJson(bookmarksKey), cloud.bookmarks || {});

  applyingCloudState = true;
  localStorage.setItem(progressKey, JSON.stringify(progress));
  localStorage.setItem(bookmarksKey, JSON.stringify(bookmarks));
  applyingCloudState = false;
  window.dispatchEvent(new CustomEvent("tacef:cloud-state-loaded"));

  await setDoc(stateReference, { progress, bookmarks, updatedAt: serverTimestamp() }, { merge: true });
}

async function pushLocalState() {
  if (!currentUser || !db || applyingCloudState) return;
  const { doc, setDoc, serverTimestamp } = firebaseApi;
  await setDoc(doc(db, "users", currentUser.uid, "state", "reading"), {
    progress: readJson(progressKey),
    bookmarks: readJson(bookmarksKey),
    updatedAt: serverTimestamp()
  }, { merge: true });
  setStatus("Progress synced.", "synced");
}

function scheduleSync() {
  if (!currentUser || applyingCloudState) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushLocalState().catch(() => setStatus("Saved on this device. Cloud sync will retry when online.", "warning")), 700);
}

async function initialiseFirebase() {
  if (initialisePromise) return initialisePromise;
  initialisePromise = (async () => {
    if (!navigator.onLine) throw new Error("offline");
    const version = "11.10.0";
    const [appApi, authApi, firestoreApi] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
    ]);
    const app = appApi.initializeApp(window.TACEF_FIREBASE_CONFIG);
    auth = authApi.getAuth(app);
    db = firestoreApi.getFirestore(app);
    firebaseApi = { ...authApi, ...firestoreApi };
    await authApi.getRedirectResult(auth).catch(() => null);
    authApi.onAuthStateChanged(auth, async (user) => {
      updateUi(user);
      if (!user) return;
      setStatus("Connecting your reading history…");
      try { await pullAndMerge(user); setStatus("Progress synced.", "synced"); }
      catch (_) { setStatus("Signed in. Progress is saved here and will sync when available.", "warning"); }
    });
  })();
  return initialisePromise;
}

authButtons.forEach((button) => button.addEventListener("click", () => {
  if (dialog) dialog.showModal();
  initialiseFirebase().catch(() => setStatus("You are offline. Reading still works; sign-in will be available when connected.", "warning"));
}));

googleButton?.addEventListener("click", async () => {
  googleButton.disabled = true;
  setStatus("Opening Google sign-in…");
  try {
    await initialiseFirebase();
    const provider = new firebaseApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebaseApi.signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      const provider = new firebaseApi.GoogleAuthProvider();
      await firebaseApi.signInWithRedirect(auth, provider);
    } else if (error?.code === "auth/unauthorized-domain") {
      setStatus("This website must be added to Firebase Authentication → Authorized domains.", "error");
    } else {
      setStatus("Google sign-in could not be completed. Please try again.", "error");
    }
  } finally { googleButton.disabled = false; }
});

signOutButton?.addEventListener("click", async () => {
  try { await firebaseApi.signOut(auth); dialog?.close(); }
  catch (_) { setStatus("Could not sign out. Please try again.", "error"); }
});

dialog?.querySelectorAll("[data-close-account]").forEach((button) => button.addEventListener("click", () => dialog.close()));
window.addEventListener("tacef:local-state-changed", scheduleSync);
window.addEventListener("online", () => {
  if (!firebaseApi) { initialisePromise = null; initialiseFirebase().catch(() => {}); }
  else scheduleSync();
});

updateUi(null);
initialiseFirebase().catch(() => setStatus("Offline mode is ready. Sign in when you reconnect to sync devices.", "warning"));
