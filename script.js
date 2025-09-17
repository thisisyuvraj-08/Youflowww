// ========================= IMPORTANT =========================
// This is the full app script. It preserves/login/signup, guest mode,
// timer, todos, ambience, stats, streaks, settings, and integrates
// MediaPipe FaceMesh for accountability + sleep detection.
// Replace firebaseConfig below with your project's config if needed.
// =========================

// Firebase imports (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";

// ========================= FIREBASE CONFIG =========================
const firebaseConfig = {
  apiKey: "AIzaSyBCi5Ea0r2c9tdgk_6RnpSuqDV5CE3nGbo",
  authDomain: "youfloww2.firebaseapp.com",
  projectId: "youfloww2",
  storageBucket: "youfloww2.firbasestorage.app",
  messagingSenderId: "816836186464",
  appId: "1:816836186464:web:e1f816020e6798f9b3ce05",
  measurementId: "G-TBY81E0BC4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// ========================= GLOBAL STATE =========================
let currentUserData = null;
let userDataRef = null;
let isGuestMode = false;

let timerInterval = null;
let isRunning = false;
let isWorkSession = true;
let sessionCount = 0;
let timeLeft = 25 * 60;
let workDuration = 25*60, shortBreakDuration = 5*60, longBreakDuration = 15*60;
let endTime = 0;
let sessionStartTime = null;
let totalAwayTime = 0;
let lastPauseTimestamp = null;
let pauseWasManual = true;

// FaceMesh state
let faceMesh = null;
let camera = null;
let faceDetectionRunning = false;
let awayTimerStart = null;
let eyesClosedTimerStart = null;
let lastEAR = 1.0;

// thresholds (adjustable)
const EYE_AR_THRESH = 0.22;        // eye aspect ratio below which eyes are considered closed
const AWAY_PAUSE_MS = 15000;       // 15 seconds without face -> pause
const EYE_CLOSED_PAUSE_MS = 10000; // 10 seconds eyes closed -> pause

// MediaPipe eye landmark indices (approx)
const LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_IDX = [263, 387, 385, 362, 380, 373];

// ========================= DOM CACHE =========================
const DOM = {
  video: document.getElementById('video'),
  faceStatusPrompt: document.getElementById('face-detection-status'),

  profileNameDisplay: document.getElementById('profileNameDisplay'),
  streakCount: document.getElementById('streak-count'),
  logoutBtn: document.getElementById('logoutBtn'),
  statsBtn: document.getElementById('statsBtn'),

  timerDisplay: document.getElementById('timer'),
  statusDisplay: document.getElementById('status'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  playIcon: document.getElementById('playIcon'),
  pauseIcon: document.getElementById('pauseIcon'),
  resetBtn: document.getElementById('resetBtn'),
  endSessionBtn: document.getElementById('endSessionBtn'),

  todoInput: document.getElementById('todo-input'),
  addTodoBtn: document.getElementById('add-todo-btn'),
  todoList: document.getElementById('todo-list'),
  clearTodosBtn: document.getElementById('clearTodosBtn'),

  focusModeBtn: document.getElementById('focusModeBtn'),
  noiseBtn: document.getElementById('noiseBtn'),
  pipYoutubeBtn: document.getElementById('pipYoutubeBtn'),
  snowBtn: document.getElementById('snowBtn'),
  rainBtn: document.getElementById('rainBtn'),
  sakuraBtn: document.getElementById('sakuraBtn'),

  workDurationInput: document.getElementById('work-duration'),
  shortBreakInput: document.getElementById('short-break-duration'),
  longBreakInput: document.getElementById('long-break-duration'),
  accountabilityToggle: document.getElementById('accountability-toggle'),
  sleepDetectionToggle: document.getElementById('sleep-detection-toggle'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),

  authModal: document.getElementById('authModal'),
  signupForm: document.getElementById('signup-form'),
  loginForm: document.getElementById('login-form'),
  signupBtn: document.getElementById('signupBtn'),
  loginBtn: document.getElementById('loginBtn'),
  continueGuestBtn: document.getElementById('continueWithoutSignupBtn'),
  showLoginLink: document.getElementById('show-login'),
  showSignupLink: document.getElementById('show-signup'),
  guestWarning: document.getElementById('guestWarning'),
  authError: document.getElementById('auth-error'),

  statsModal: document.getElementById('statsModal'),
  closeStats: document.getElementById('closeStats'),
  closeStatsBtn: document.getElementById('closeStatsBtn'),
  totalFocusTime: document.getElementById('totalFocusTime'),
  totalSessionsCount: document.getElementById('totalSessionsCount'),

  reviewModal: document.getElementById('reviewModal'),
  closeReview: document.getElementById('closeReview'),
  reviewFocusTime: document.getElementById('reviewFocusTime'),
  reviewAwayTime: document.getElementById('reviewAwayTime'),
  reviewTotalDuration: document.getElementById('reviewTotalDuration'),

  signupEmail: document.getElementById('signup-email'),
  signupPassword: document.getElementById('signup-password'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password')
};

// ========================= UTILITIES =========================
function formatTime(seconds){
  const m = Math.floor(seconds/60);
  const s = seconds % 60;
  return `${m}:${s<10?'0'+s:s}`;
}
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y, dz=(a.z||0)-(b.z||0); return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function computeEAR(landmarks, idxArr){
  const p0 = landmarks[idxArr[0]];
  const p1 = landmarks[idxArr[1]];
  const p2 = landmarks[idxArr[2]];
  const p3 = landmarks[idxArr[3]];
  const p4 = landmarks[idxArr[4]];
  const p5 = landmarks[idxArr[5]];
  const A = dist(p1,p5);
  const B = dist(p2,p4);
  const C = dist(p0,p3);
  if(C === 0) return 1.0;
  return (A + B) / (2.0 * C);
}

// ========================= AUTH & DATA =========================
onAuthStateChanged(auth, async (user) => {
  if(user){
    isGuestMode = false;
    DOM.authModal.classList.remove('visible');
    DOM.logoutBtn.classList.remove('hidden');
    userDataRef = doc(db, 'users', user.uid);
    await loadUserData();
  } else {
    if(!isGuestMode) DOM.authModal.classList.add('visible');
    DOM.logoutBtn.classList.add('hidden');
    currentUserData = getDefaultUserData();
    applyUserToUI();
  }
});

function getDefaultUserData(){
  return {
    profileName: "Floww User",
    totalFocusMinutes: 0,
    totalSessions: 0,
    streakCount: 0,
    weeklyFocus: {},
    todos: [],
    settings: {
      workDuration: 25*60,
      shortBreakDuration: 5*60,
      longBreakDuration: 15*60,
      soundProfile: 'indian',
      isAccountabilityOn: false,
      isSleepDetectionOn: false
    },
    theme: {}
  };
}

async function loadUserData(){
  if(isGuestMode){
    const s = localStorage.getItem('youfloww_guest');
    currentUserData = s ? JSON.parse(s) : getDefaultUserData();
    applyUserToUI();
    return;
  }
  if(!userDataRef) return;
  try{
    const snap = await getDoc(userDataRef);
    currentUserData = snap.exists() ? snap.data() : getDefaultUserData();
    applyUserToUI();
  } catch(e){
    console.error("loadUserData error", e);
    currentUserData = getDefaultUserData();
    applyUserToUI();
  }
}

function saveUserData(){
  if(isGuestMode){
    localStorage.setItem('youfloww_guest', JSON.stringify(currentUserData));
    return;
  }
  if(!userDataRef) return;
  setDoc(userDataRef, currentUserData, { merge: true }).catch(e => console.error("saveUserData failed", e));
}

function applyUserToUI(){
  DOM.profileNameDisplay.textContent = currentUserData.profileName || "Floww User";
  DOM.streakCount.textContent = currentUserData.streakCount || 0;
  loadSettingsToUI();
  loadTodosUI();
  updateStatsUI();
}

// ========================= AUTH FORM HANDLERS =========================
document.addEventListener('DOMContentLoaded', () => {
  // toggle login/signup links
  DOM.showLoginLink && DOM.showLoginLink.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').classList.add('hidden'); document.getElementById('login-form').classList.remove('hidden'); });
  DOM.showSignupLink && DOM.showSignupLink.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').classList.add('hidden'); document.getElementById('signup-form').classList.remove('hidden'); });

  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');

  if(signupForm) signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = DOM.signupEmail.value.trim();
    const pass = DOM.signupPassword.value.trim();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      currentUserData = getDefaultUserData();
      currentUserData.profileName = email.split('@')[0];
      userDataRef = doc(db, 'users', cred.user.uid);
      await setDoc(userDataRef, currentUserData);
      DOM.authModal.classList.remove('visible');
    } catch(err){
      document.getElementById('auth-error').textContent = err.message;
      console.error("signup error", err);
    }
  });

  if(loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = DOM.loginEmail.value.trim();
    const pass = DOM.loginPassword.value.trim();
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      DOM.authModal.classList.remove('visible');
    } catch(err){
      document.getElementById('auth-error').textContent = err.message;
      console.error("login error", err);
    }
  });

  DOM.continueGuestBtn && DOM.continueGuestBtn.addEventListener('click', () => {
    isGuestMode = true;
    DOM.guestWarning.classList.remove('hidden');
    DOM.authModal.classList.remove('visible');
    currentUserData = getDefaultUserData();
    applyUserToUI();
    saveUserData();
  });

  DOM.logoutBtn && DOM.logoutBtn.addEventListener('click', async () => {
    try { await signOut(auth); } catch(e){ console.error(e); }
    isGuestMode = true;
    currentUserData = getDefaultUserData();
    applyUserToUI();
    DOM.authModal.classList.add('visible');
  });

  DOM.closeStatsBtn && DOM.closeStatsBtn.addEventListener('click', ()=> DOM.statsModal.classList.remove('visible'));
  DOM.closeReview && DOM.closeReview.addEventListener('click', ()=> DOM.reviewModal.classList.remove('visible'));

  attachAppEventListeners();
  initUI();
});

// ========================= TODOs =========================
function loadTodosUI(){
  const todos = (currentUserData && currentUserData.todos) ? currentUserData.todos : [];
  DOM.todoList.innerHTML = '';
  todos.forEach((t, idx) => {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.innerHTML = `<label><input type="checkbox" ${t.completed ? 'checked' : ''} data-i="${idx}"> <span class="${t.completed ? 'muted' : ''}">${escapeHtml(t.text)}</span></label>`;
    DOM.todoList.appendChild(li);
    li.querySelector('input').addEventListener('change', (e) => {
      const i = parseInt(e.target.dataset.i);
      currentUserData.todos[i].completed = e.target.checked;
      saveUserData();
      loadTodosUI();
    });
  });
}
function escapeHtml(s){ return String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'); }

DOM.addTodoBtn && DOM.addTodoBtn.addEventListener('click', () => {
  const v = DOM.todoInput.value.trim();
  if(!v) return;
  if(!currentUserData.todos) currentUserData.todos = [];
  currentUserData.todos.push({ text: v, completed: false });
  DOM.todoInput.value = '';
  saveUserData();
  loadTodosUI();
});
DOM.clearTodosBtn && DOM.clearTodosBtn.addEventListener('click', () => {
  if(confirm('Clear all tasks?')) {
    currentUserData.todos = [];
    saveUserData();
    loadTodosUI();
  }
});

// ========================= SETTINGS =========================
function loadSettingsToUI(){
  const s = currentUserData.settings || {};
  DOM.workDurationInput.value = s.workDuration ? Math.floor(s.workDuration/60) : 25;
  DOM.shortBreakInput.value = s.shortBreakDuration ? Math.floor(s.shortBreakDuration/60) : 5;
  DOM.longBreakInput.value = s.longBreakDuration ? Math.floor(s.longBreakDuration/60) : 15;
  DOM.accountabilityToggle.checked = !!s.isAccountabilityOn;
  DOM.sleepDetectionToggle.checked = !!s.isSleepDetectionOn;

  workDuration = (DOM.workDurationInput.value|0) * 60;
  shortBreakDuration = (DOM.shortBreakInput.value|0) * 60;
  longBreakDuration = (DOM.longBreakInput.value|0) * 60;
  timeLeft = workDuration;
}

DOM.saveSettingsBtn && DOM.saveSettingsBtn.addEventListener('click', () => {
  const s = currentUserData.settings = currentUserData.settings || {};
  s.workDuration = (DOM.workDurationInput.value|0) * 60;
  s.shortBreakDuration = (DOM.shortBreakInput.value|0) * 60;
  s.longBreakDuration = (DOM.longBreakInput.value|0) * 60;
  s.isAccountabilityOn = DOM.accountabilityToggle.checked;
  s.isSleepDetectionOn = DOM.sleepDetectionToggle.checked;
  saveUserData();
  loadSettingsToUI();
  if(!isRunning) resetTimer();
  alert('Settings saved');
});

DOM.accountabilityToggle && DOM.accountabilityToggle.addEventListener('change', () => {
  if(DOM.accountabilityToggle.checked || DOM.sleepDetectionToggle.checked) {
    if(isRunning) startFaceDetection();
  } else {
    stopFaceDetection();
  }
});
DOM.sleepDetectionToggle && DOM.sleepDetectionToggle.addEventListener('change', () => {
  if(DOM.accountabilityToggle.checked || DOM.sleepDetectionToggle.checked) {
    if(isRunning) startFaceDetection();
  } else {
    stopFaceDetection();
  }
});

// ========================= TIMER LOGIC =========================
function updateTimerUI(){
  DOM.timerDisplay.textContent = formatTime(timeLeft);
  DOM.statusDisplay.textContent = isWorkSession ? 'Work Session' : 'Break Time';
  if(isRunning){
    DOM.playIcon.classList.add('hidden');
    DOM.pauseIcon.classList.remove('hidden');
  } else {
    DOM.playIcon.classList.remove('hidden');
    DOM.pauseIcon.classList.add('hidden');
  }
}

function startTimer(isResume = false){
  if(isRunning) return;
  isRunning = true;
  if(!sessionStartTime) sessionStartTime = Date.now();
  if(lastPauseTimestamp){
    totalAwayTime += Date.now() - lastPauseTimestamp;
    lastPauseTimestamp = null;
  }
  endTime = Date.now() + timeLeft*1000;
  updateTimerUI();

  timerInterval = setInterval(() => {
    timeLeft = Math.max(0, Math.round((endTime - Date.now())/1000));
    updateTimerUI();
    if(timeLeft <= 0){
      clearInterval(timerInterval);
      isRunning = false;
      handleSessionComplete();
    }
  }, 1000);

  // if accountability/sleep detection toggles are on, start detection
  if(DOM.accountabilityToggle.checked || DOM.sleepDetectionToggle.checked) {
    startFaceDetection();
  }
}

function pauseTimer(isAuto = false){
  if(!isRunning) return;
  clearInterval(timerInterval);
  isRunning = false;
  lastPauseTimestamp = Date.now();
  pauseWasManual = !isAuto;
  updateTimerUI();
  if(isAuto){
    showFaceStatusPrompt('Timer paused automatically');
  }
  if(pauseWasManual){
    // stop detection after manual pause to save CPU
    stopFaceDetection();
  } else {
    // keep video running so the user can resume by looking at camera
  }
}

function resetTimer(){
  clearInterval(timerInterval);
  isRunning = false;
  isWorkSession = true;
  sessionCount = 0;
  workDuration = (DOM.workDurationInput.value|0 || 25) * 60;
  shortBreakDuration = (DOM.shortBreakInput.value|0 || 5) * 60;
  longBreakDuration = (DOM.longBreakInput.value|0 || 15) * 60;
  timeLeft = workDuration;
  sessionStartTime = null;
  totalAwayTime = 0;
  lastPauseTimestamp = null;
  pauseWasManual = true;
  updateTimerUI();
  stopFaceDetection();
}

function endSession(){
  const minutesFocused = Math.floor((sessionStartTime ? (Date.now()-sessionStartTime)/1000 : 0)/60);
  finalizeSession(minutesFocused);
  showSessionReview();
  resetTimer();
}

function handleSessionComplete(){
  const minutesFocused = Math.floor(workDuration/60);
  finalizeSession(minutesFocused);
  showCompletion();
  // start break
  sessionCount++;
  isWorkSession = false;
  timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
  sessionStartTime = null;
  totalAwayTime = 0;
  updateTimerUI();
  startTimer();
}

function finalizeSession(minutesFocused){
  stopFaceDetection();
  if(!currentUserData) currentUserData = getDefaultUserData();
  if(minutesFocused > 0) {
    currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
    currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
    const today = new Date().toISOString().slice(0,10);
    if(!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
    currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;
    saveUserData();
  }
}

function showCompletion(){
  DOM.statsModal.classList.add('visible');
  updateStatsUI();
}
function showSessionReview(){
  const totalDurationMs = sessionStartTime ? (Date.now() - sessionStartTime) : 0;
  const currentPauseDuration = lastPauseTimestamp ? (Date.now() - lastPauseTimestamp) : 0;
  const awayTimeMs = totalAwayTime + currentPauseDuration;
  const focusTimeMs = Math.max(0, totalDurationMs - awayTimeMs);
  DOM.reviewFocusTime.textContent = `${Math.floor(focusTimeMs/60000)}m ${(Math.floor(focusTimeMs/1000)%60)}s`;
  DOM.reviewAwayTime.textContent = `${Math.floor(awayTimeMs/60000)}m ${(Math.floor(awayTimeMs/1000)%60)}s`;
  DOM.reviewTotalDuration.textContent = `${Math.floor(totalDurationMs/60000)}m ${(Math.floor(totalDurationMs/1000)%60)}s`;
  DOM.reviewModal.classList.add('visible');
}
function updateStatsUI(){
  const minutes = currentUserData?.totalFocusMinutes || 0;
  DOM.totalFocusTime.textContent = `${Math.floor(minutes/60)}h ${minutes%60}m`;
  DOM.totalSessionsCount.textContent = currentUserData?.totalSessions || 0;
}

// ========================= MEDIA PIPE FACE MESH =========================
async function initFaceMeshIfNeeded(){
  if(faceMesh) return;
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
  faceMesh.onResults(onFaceMeshResults);

  camera = new Camera(DOM.video, {
    onFrame: async () => {
      await faceMesh.send({image: DOM.video});
    },
    width: 640,
    height: 480
  });
}

async function startVideoStream(){
  try {
    await initFaceMeshIfNeeded();
    await camera.start();
    DOM.video.classList.remove('hidden-video');
  } catch(e){
    console.warn("camera start error", e);
    showFaceStatusPrompt("Allow camera access for accountability features");
    // disable toggles if permission not granted
    DOM.accountabilityToggle.checked = false;
    DOM.sleepDetectionToggle.checked = false;
    if(currentUserData && currentUserData.settings){
      currentUserData.settings.isAccountabilityOn = false;
      currentUserData.settings.isSleepDetectionOn = false;
      saveUserData();
    }
  }
}

async function startFaceDetection(){
  if(faceDetectionRunning) return;
  faceDetectionRunning = true;
  awayTimerStart = null;
  eyesClosedTimerStart = null;
  lastEAR = 1.0;
  await startVideoStream();
}

function stopFaceDetection(){
  faceDetectionRunning = false;
  awayTimerStart = null;
  eyesClosedTimerStart = null;
  hideFaceStatusPrompt();
  try {
    if(camera) camera.stop();
    if(DOM.video.srcObject){
      DOM.video.srcObject.getTracks().forEach(t => t.stop());
      DOM.video.srcObject = null;
    }
    DOM.video.classList.add('hidden-video');
  } catch(e){ /* ignore */ }
}

function showFaceStatusPrompt(msg){
  DOM.faceStatusPrompt.textContent = msg;
  DOM.faceStatusPrompt.classList.add('visible');
}
function hideFaceStatusPrompt(){
  DOM.faceStatusPrompt.classList.remove('visible');
  DOM.faceStatusPrompt.textContent = '';
}

// callback from MediaPipe
function onFaceMeshResults(results){
  const faces = results.multiFaceLandmarks || [];
  const faceDetected = faces.length > 0;
  let ear = 1.0;

  if(faceDetected){
    const lm = faces[0];
    const leftEAR = computeEAR(lm, LEFT_EYE_IDX);
    const rightEAR = computeEAR(lm, RIGHT_EYE_IDX);
    ear = (leftEAR + rightEAR) / 2.0;
    lastEAR = ear;
  }

  // ACCOUNTABILITY
  if(DOM.accountabilityToggle.checked){
    if(!faceDetected){
      if(!awayTimerStart){
        awayTimerStart = Date.now();
        showFaceStatusPrompt('Are you there? Timer will pause soon.');
      } else if(Date.now() - awayTimerStart > AWAY_PAUSE_MS){
        pauseTimer(true);
        showFaceStatusPrompt('Timer paused — please return to continue.');
      }
    } else {
      if(awayTimerStart){
        awayTimerStart = null;
        hideFaceStatusPrompt();
        if(!isRunning && !pauseWasManual) startTimer(true);
      }
    }
  }

  // SLEEP DETECTION
  if(DOM.sleepDetectionToggle.checked){
    if(faceDetected){
      if(ear < EYE_AR_THRESH){
        if(!eyesClosedTimerStart){
          eyesClosedTimerStart = Date.now();
          showFaceStatusPrompt('Looks like your eyes are closing — timer will pause soon.');
        } else if(Date.now() - eyesClosedTimerStart > EYE_CLOSED_PAUSE_MS){
          pauseTimer(true);
          showFaceStatusPrompt('Timer paused due to inactivity (eyes closed).');
        }
      } else {
        if(eyesClosedTimerStart){
          eyesClosedTimerStart = null;
          hideFaceStatusPrompt();
          if(!isRunning && !pauseWasManual) startTimer(true);
        }
      }
    } else {
      if(!DOM.accountabilityToggle.checked){
        showFaceStatusPrompt('Face not visible');
      }
    }
  }

  // debug overlay
  const dbg = localStorage.getItem('faceDebug') === '1';
  renderDebugOverlay(dbg, faceDetected, ear);
}

function renderDebugOverlay(enabled, faceDetected, ear){
  let overlay = document.getElementById('__face_debug_overlay__');
  if(enabled && !overlay){
    overlay = document.createElement('div');
    overlay.id = '__face_debug_overlay__';
    overlay.style.position = 'fixed';
    overlay.style.right = '12px';
    overlay.style.top = '12px';
    overlay.style.zIndex = '99999';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.color = 'white';
    overlay.style.padding = '8px 10px';
    overlay.style.borderRadius = '8px';
    overlay.style.fontSize = '13px';
    document.body.appendChild(overlay);
  }
  if(overlay && enabled){
    overlay.innerHTML = `<div><strong>Face:</strong> ${faceDetected ? 'Yes' : 'No'}</div>
      <div><strong>EAR:</strong> ${ear.toFixed(3)}</div>
      <div><small>AwayStart: ${awayTimerStart ? Math.round((Date.now()-awayTimerStart)/1000)+'s' : '-'}</small></div>
      <div><small>EyesStart: ${eyesClosedTimerStart ? Math.round((Date.now()-eyesClosedTimerStart)/1000)+'s' : '-'}</small></div>`;
  } else if(overlay && !enabled){
    overlay.remove();
  }
}

// ========================= UI BINDINGS =========================
function attachAppEventListeners(){
  DOM.playPauseBtn && DOM.playPauseBtn.addEventListener('click', ()=>{ isRunning ? pauseTimer() : startTimer(); });
  DOM.resetBtn && DOM.resetBtn.addEventListener('click', resetTimer);
  DOM.endSessionBtn && DOM.endSessionBtn.addEventListener('click', endSession);

  DOM.statsBtn && DOM.statsBtn.addEventListener('click', ()=>{ DOM.statsModal.classList.add('visible'); updateStatsUI(); });
  DOM.closeStats && DOM.closeStats.addEventListener('click', ()=> DOM.statsModal.classList.remove('visible'));

  document.getElementById('changeNameBtn').addEventListener('click', ()=>{
    const nn = prompt('Enter your display name:', currentUserData.profileName || '');
    if(nn && nn.trim()){
      currentUserData.profileName = nn.trim();
      applyUserToUI();
      saveUserData();
    }
  });

  DOM.focusModeBtn && DOM.focusModeBtn.addEventListener('click', ()=> document.body.classList.toggle('focus-mode'));
  DOM.snowBtn && DOM.snowBtn.addEventListener('click', ()=> DOM.snowBtn.classList.toggle('active'));
  DOM.rainBtn && DOM.rainBtn.addEventListener('click', ()=> DOM.rainBtn.classList.toggle('active'));
  DOM.sakuraBtn && DOM.sakuraBtn.addEventListener('click', ()=> DOM.sakuraBtn.classList.toggle('active'));
}

// ========================= INITIALIZE UI =========================
function initUI(){
  if(!currentUserData) currentUserData = getDefaultUserData();
  loadSettingsToUI();
  updateTimerUI();
  loadTodosUI();
  updateStatsUI();
}
initUI();
attachAppEventListeners();

// ========================= END OF FILE =========================
