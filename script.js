// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

// ============ Minimalist Animated Intro Logic ============
function playMinimalistIntro() {
    const overlay = document.getElementById('introOverlay');
    if (!overlay) return;
    const sparkle = overlay.querySelector('.sparkle');
    for (let i = 0; i < 12; i++) {
        const dot = document.createElement('div');
        dot.className = 'sparkle-dot';
        dot.style.left = `${60 + Math.random()*90}px`;
        dot.style.top = `${80 + Math.random()*60}px`;
        dot.style.animationDelay = `${Math.random()*2.2}s`;
        dot.style.background = `linear-gradient(135deg,#f7a047 0%,#6c63ff 100%)`;
        sparkle.appendChild(dot);
    }
    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => { overlay.style.display = 'none'; }, 1200);
    }, 3400);
}
window.addEventListener('DOMContentLoaded', playMinimalistIntro);

// ============ NEW: Guest Mode State ============
let isGuestMode = false;

// ============ NEW: Guest Mode Handler ============
document.addEventListener('DOMContentLoaded', () => {
    const guestBtn = document.getElementById("continueWithoutSignupBtn");
    const guestWarning = document.getElementById("guestWarning");
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            isGuestMode = true;
            DOMElements.appContainer.classList.remove('hidden');
            DOMElements.authModal.classList.remove('visible');
            guestWarning.classList.remove('hidden');
            currentUserData = loadGuestData() || getDefaultUserData();
            initializeAppState();
        });
    }
});

function getDefaultUserData() {
    return {
        profileName: "Floww User",
        totalFocusMinutes: 0,
        totalSessions: 0,
        streakCount: 0,
        lastStreakDate: null,
        weeklyFocus: {},
        todos: [],
        settings: {
            workDuration: 25 * 60,
            shortBreakDuration: 5 * 60,
            longBreakDuration: 15 * 60,
            soundProfile: "indian",
            isAccountabilityOn: false,
            isSleepDetectionOn: false,
            useMediapipe: false // NEW: Option to use Mediapipe
        },
        theme: { backgroundPath: null, youtubeVideoId: null }
    };
}

// ===================================================================================
// FIREBASE INITIALIZATION
// ===================================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBCi5Ea0r2c9tdgk_6RnpSuqDV5CE3nGbo",
    authDomain: "youfloww2.firebaseapp.com",
    projectId: "youfloww2",
    storageBucket: "youfloww2.firbasestorage.app",
    messagingSenderId: "816836186464",
    appId: "1:816836186464:web:e1f816020e6798f9b3ce05",
    measurementId: "G-TBY81E0BC4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
let currentUserData = {};
let userDataRef = null;

// ===================================================================================
// GLOBAL STATE & VARIABLES
// ===================================================================================
let timerInterval, isRunning = false, isWorkSession = true, sessionCount = 0;
let endTime = 0, timeLeft;
let workDuration, shortBreakDuration, longBreakDuration;
let sessionStartTime = null;
let totalAwayTime = 0;
let lastPauseTimestamp = null;
let pauseWasManual = true;
let animationFrameId = null;
let isSnowActive = false, isRainActive = false, isSakuraActive = false;
let lastSnowSpawn = 0, lastRainSpawn = 0, lastSakuraSpawn = 0;
const SNOW_INTERVAL = 200, RAIN_INTERVAL = 50, SAKURA_INTERVAL = 500;

// ACCOUNTABILITY AI STATE
const faceapi = window.faceapi;
let faceApiInterval = null;
window.faceApiInterval = faceApiInterval; // Make interval global for debugging
let isAccountabilityOn = false;
window.isAccountabilityOn = isAccountabilityOn; // Debug global
let isSleepDetectionOn = false;
window.isSleepDetectionOn = isSleepDetectionOn; // Debug global
let awayTimerStart = null;
let eyesClosedTimerStart = null;
let modelsLoaded = false; // Flag to check if face-api models are loaded

// ========== NEW: Mediapipe FaceMesh State ==========
let useMediapipe = false;
let mediapipeCamera = null;
let mediapipeActive = false;
let mediapipeAwayTimerStart = null;
let mediapipeEyesClosedTimerStart = null;
let mediapipeFacePresent = false;
let mediapipeEyesClosed = false;
const MEDIAPIPE_EYE_AR_THRESH = 0.22; // You can adjust this value for sensitivity

// ===================================================================================
// DOM ELEMENTS CACHE
// ===================================================================================
const DOMElements = {
    video: document.getElementById("video"),
    faceMeshVideo: document.getElementById("faceMeshVideo"),
    timerDisplay: document.getElementById("timer"),
    statusDisplay: document.getElementById("status"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    playIcon: document.getElementById("playIcon"),
    pauseIcon: document.getElementById("pauseIcon"),
    resetBtn: document.getElementById("resetBtn"),
    endSessionBtn: document.getElementById("endSessionBtn"),
    appContainer: document.getElementById("app-container"),
    authModal: document.getElementById("authModal"),
    authError: document.getElementById("auth-error"),
    ambientContainer: document.getElementById("ambient-container"),
    faceStatusPrompt: document.getElementById('face-detection-status'),
    focusMode: {
        ui: document.getElementById("focusModeUI"),
        timer: document.getElementById("focusModeTimer"),
        progressBar: document.getElementById("focusModeProgressBar"),
        playPauseBtn: document.getElementById("focusModePlayPauseBtn"),
        exitBtn: document.getElementById("focusModeExitBtn"),
    },
    modals: {
        stats: document.getElementById("statsModal"),
        completion: document.getElementById("completionModal"),
        review: document.getElementById("reviewModal"),
        totalFocusTime: document.getElementById("totalFocusTime"),
        totalSessionsCount: document.getElementById("totalSessionsCount"),
    },
    profile: {
        nameDisplay: document.getElementById("profileNameDisplay"),
    },
    streak: {
        count: document.getElementById("streak-count"),
    },
    settings: {
        soundEffects: document.getElementById('sound-effects-select'),
        accountabilityToggle: document.getElementById('accountability-toggle'),
        sleepDetectionToggle: document.getElementById('sleep-detection-toggle'),
        mediapipeToggle: document.getElementById('mediapipe-toggle'), // NEW
    },
    sounds: {
        whiteNoise: document.getElementById("whiteNoise"),
        pauseAlert: document.getElementById("pauseAlertSound"),
        resumeAlert: document.getElementById("resumeAlertSound"),
        indian: {
            start: document.querySelectorAll('.start-sound-indian'),
            good: document.querySelectorAll('.good-meme-indian'),
            bad: document.querySelectorAll('.bad-meme-indian'),
        },
        nonIndian: {
            start: document.querySelectorAll('.start-sound-non-indian'),
            good: document.querySelectorAll('.good-meme-non-indian'),
            bad: document.querySelectorAll('.bad-meme-non-indian'),
        }
    }
};

// ===================================================================================
// FIREBASE AUTH & DATA (unchanged)
// ===================================================================================
onAuthStateChanged(auth, user => {
    if (user) {
        isGuestMode = false;
        DOMElements.appContainer.classList.remove('hidden');
        DOMElements.authModal.classList.remove('visible');
        userDataRef = doc(db, "users", user.uid);
        loadUserData();
    } else if (!isGuestMode) {
        DOMElements.appContainer.classList.add('hidden');
        DOMElements.authModal.classList.add('visible');
        if (timerInterval) clearInterval(timerInterval);
        isRunning = false;
    }
});

function saveUserData() {
    if (isGuestMode) {
        localStorage.setItem('youfloww_guest', JSON.stringify(currentUserData));
    } else if (userDataRef) {
        setDoc(userDataRef, currentUserData, { merge: true }).catch(error => console.error("Error saving user data: ", error));
    }
}
function loadUserData() {
    if (isGuestMode) {
        currentUserData = loadGuestData() || getDefaultUserData();
        initializeAppState();
    } else if (userDataRef) {
        getDoc(userDataRef).then(docSnap => {
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
            }
            initializeAppState();
        });
    }
}
function loadGuestData() {
    try { return JSON.parse(localStorage.getItem('youfloww_guest')); } catch { return null; }
}

// ===================================================================================
// CORE TIMER LOGIC (unchanged)
// ===================================================================================
function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    DOMElements.timerDisplay.textContent = timeString;
    DOMElements.focusMode.timer.textContent = timeString;
    const currentDuration = isWorkSession ? workDuration : (sessionCount % 4 === 0 ? longBreakDuration : shortBreakDuration);
    const progress = timeLeft > 0 ? ((currentDuration - timeLeft) / currentDuration) * 100 : 0;
    DOMElements.focusMode.progressBar.style.width = `${progress}%`;
    document.title = isRunning ? `${timeString} - ${isWorkSession ? 'Work' : 'Break'} | YouFloww` : 'YouFloww';
}

function updateUIState() {
    DOMElements.statusDisplay.textContent = isWorkSession ? "Work Session" : "Break Time";
    DOMElements.playIcon.classList.toggle('hidden', isRunning);
    DOMElements.pauseIcon.classList.toggle('hidden', !isRunning);
    DOMElements.playPauseBtn.setAttribute('aria-label', isRunning ? 'Pause Timer' : 'Start Timer');
    DOMElements.resetBtn.disabled = isRunning;
    DOMElements.endSessionBtn.disabled = !isRunning;
    DOMElements.focusMode.playPauseBtn.classList.toggle('paused', !isRunning);
}

function playRandomSound(type) {
    const soundProfile = currentUserData.settings?.soundProfile;
    if (soundProfile === 'off') return;
    let soundSet = (soundProfile === 'indian') ? DOMElements.sounds.indian[type] : DOMElements.sounds.nonIndian[type];
    if (soundSet && soundSet.length > 0) {
        const sound = soundSet[Math.floor(Math.random() * soundSet.length)];
        sound.currentTime = 0;
        sound.play().catch(e => console.error("Audio play failed:", e));
    }
}

function startTimer(isResume = false) {
    if (isRunning) return;
    isRunning = true;
    if (isWorkSession) {
        if (isResume) DOMElements.sounds.resumeAlert.play();
        else playRandomSound('start');
    }
    if (!sessionStartTime) sessionStartTime = Date.now();
    if (lastPauseTimestamp) {
        totalAwayTime += Date.now() - lastPauseTimestamp;
        lastPauseTimestamp = null;
    }
    endTime = Date.now() + timeLeft * 1000;
    updateUIState();
    // ============== MODIFIED: Use face detection source ==============
    if ((isAccountabilityOn || isSleepDetectionOn) && useMediapipe) {
        startMediapipeDetection();
    } else if (isAccountabilityOn || isSleepDetectionOn) {
        startFaceDetection();
    }
    // ===============================================================
    timerInterval = setInterval(() => {
        timeLeft = Math.round((endTime - Date.now()) / 1000);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timeLeft = 0;
            updateTimerDisplay();
            isRunning = false;
            handleSessionCompletion();
        } else {
            updateTimerDisplay();
        }
    }, 1000);

    if ((isAccountabilityOn || isSleepDetectionOn) && !useMediapipe && !DOMElements.video.srcObject) {
        startVideo();
    }
}

function pauseTimer(isAuto = false) {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
    if (!isAuto) {
        pauseWasManual = true;
        DOMElements.sounds.pauseAlert.play();
        stopFaceDetection();
        stopMediapipeDetection();
    } else {
        pauseWasManual = false;
    }
    lastPauseTimestamp = Date.now();
    updateUIState();
}

function resetTimer() {
    clearInterval(timerInterval);
    stopFaceDetection();
    stopMediapipeDetection();
    isRunning = false;
    isWorkSession = true;
    sessionCount = 0;
    timeLeft = workDuration;
    sessionStartTime = null;
    totalAwayTime = 0;
    updateTimerDisplay();
    updateUIState();
}

function endSession() {
    const timeFocusedSec = workDuration - timeLeft;
    const minutesFocused = Math.floor(timeFocusedSec / 60);
    handleEndOfWorkSession(minutesFocused, false);
    showSessionReview();
    resetTimer();
}

function handleSessionCompletion() {
    const minutesFocused = Math.floor(workDuration / 60);
    handleEndOfWorkSession(minutesFocused, true);
    showCompletionPopup();
    if (isAccountabilityOn || isSleepDetectionOn) showSessionReview();
    sessionCount++;
    isWorkSession = false;
    timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
    sessionStartTime = null;
    totalAwayTime = 0;
    updateTimerDisplay();
    updateUIState();
    startTimer();
}

function handleEndOfWorkSession(minutesFocused, sessionCompleted) {
    stopFaceDetection();
    stopMediapipeDetection();
    stopVideo();
    if (minutesFocused > 0) {
        currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
        currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
        const today = new Date().toISOString().slice(0, 10);
        if (!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
        currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;
    }
    if (minutesFocused >= 20) playRandomSound('good');
    else if (minutesFocused > 0) playRandomSound('bad');
    saveUserData();
}

// ===================================================================================
// ACCOUNTABILITY AI (FACE-API.JS, unchanged)
// ===================================================================================
async function loadFaceApiModels() {
    if (modelsLoaded) return;
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        modelsLoaded = true;
    } catch (error) {
        alert("Could not load accountability models. Please check your connection and refresh.");
    }
}

async function startVideo() {
    try {
        if (DOMElements.video.srcObject) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        DOMElements.video.srcObject = stream;
    } catch (err) {
        alert("Camera access is required for Accountability features. Please allow access and refresh.");
        DOMElements.settings.accountabilityToggle.checked = false;
        DOMElements.settings.sleepDetectionToggle.checked = false;
        isAccountabilityOn = false;
        isSleepDetectionOn = false;
        window.isAccountabilityOn = isAccountabilityOn;
        window.isSleepDetectionOn = isSleepDetectionOn;
        saveSettingsToData();
    }
}

function stopVideo() {
    if (DOMElements.video.srcObject) {
        DOMElements.video.srcObject.getTracks().forEach(track => track.stop());
        DOMElements.video.srcObject = null;
    }
}

function startFaceDetection() {
    if (!faceApiInterval && (isAccountabilityOn || isSleepDetectionOn)) {
        faceApiInterval = setInterval(handleFaceDetection, 500);
        window.faceApiInterval = faceApiInterval;
    }
}

function stopFaceDetection() {
    clearInterval(faceApiInterval);
    faceApiInterval = null;
    window.faceApiInterval = faceApiInterval;
    hideFaceStatusPrompt();
    awayTimerStart = null;
    eyesClosedTimerStart = null;
}

// ========== NEW: Mediapipe FaceMesh Detection ==========
// EAR calculation for FaceMesh landmarks
function getMediapipeEyeAspectRatio(landmarks) {
    // Left eye landmarks: 33, 160, 158, 133, 153, 144
    // Right eye landmarks: 263, 387, 385, 362, 380, 373
    function eyeAR(indices) {
        const A = distance(landmarks[indices[1]], landmarks[indices[5]]);
        const B = distance(landmarks[indices[2]], landmarks[indices[4]]);
        const C = distance(landmarks[indices[0]], landmarks[indices[3]]);
        return (A + B) / (2.0 * C);
    }
    function distance(p1, p2) {
        return Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
    }
    const left = eyeAR([33, 160, 158, 133, 153, 144]);
    const right = eyeAR([263, 387, 385, 362, 380, 373]);
    return (left + right) / 2.0;
}

// Setup and start Mediapipe Camera and FaceMesh
function startMediapipeDetection() {
    if (mediapipeActive) return;
    mediapipeActive = true;
    DOMElements.faceMeshVideo.classList.remove('hidden');
    // Request webcam access
    mediapipeCamera = new window.Camera(DOMElements.faceMeshVideo, {
        onFrame: async () => {
            await mediapipeFaceMesh.send({image: DOMElements.faceMeshVideo});
        },
        width: 640,
        height: 480
    });
    mediapipeCamera.start();
}

// Stop Mediapipe detection and camera
function stopMediapipeDetection() {
    mediapipeActive = false;
    try {
        if (mediapipeCamera) mediapipeCamera.stop();
    } catch {}
    DOMElements.faceMeshVideo.classList.add('hidden');
    mediapipeAwayTimerStart = null;
    mediapipeEyesClosedTimerStart = null;
    hideFaceStatusPrompt();
}

// Setup and config for Mediapipe FaceMesh
const mediapipeFaceMesh = new window.FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
mediapipeFaceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

mediapipeFaceMesh.onResults(handleMediapipeResults);

// Main detection handler for Mediapipe
function handleMediapipeResults(results) {
    if (!mediapipeActive || !isRunning) return;
    const faceDetected = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;
    let eyesClosed = false;
    if (faceDetected) {
        const landmarks = results.multiFaceLandmarks[0];
        const ear = getMediapipeEyeAspectRatio(landmarks);
        eyesClosed = ear < MEDIAPIPE_EYE_AR_THRESH;
    }

    // Presence detection
    if (isAccountabilityOn) {
        if (!faceDetected) {
            if (!mediapipeAwayTimerStart) {
                mediapipeAwayTimerStart = Date.now();
                showFaceStatusPrompt("Are you there? Timer will pause soon...");
            } else if (Date.now() - mediapipeAwayTimerStart > 15000) {
                pauseTimer(true);
                showFaceStatusPrompt("Timer paused. Come back to resume.");
            }
        } else {
            if (mediapipeAwayTimerStart) {
                mediapipeAwayTimerStart = null;
                hideFaceStatusPrompt();
                if (!isRunning && !pauseWasManual) startTimer(true);
            }
        }
    }

    // Sleep detection
    if (isSleepDetectionOn && faceDetected) {
        if (eyesClosed) {
            if (!mediapipeEyesClosedTimerStart) {
                mediapipeEyesClosedTimerStart = Date.now();
                showFaceStatusPrompt("Feeling sleepy? Timer will pause.");
            } else if (Date.now() - mediapipeEyesClosedTimerStart > 10000) {
                pauseTimer(true);
                showFaceStatusPrompt("Timer paused due to inactivity.");
                playRandomSound('bad');
            }
        } else {
            if (mediapipeEyesClosedTimerStart) {
                mediapipeEyesClosedTimerStart = null;
                hideFaceStatusPrompt();
                if (!isRunning && !pauseWasManual) startTimer(true);
            }
        }
    } else if (isSleepDetectionOn && !faceDetected) {
        showFaceStatusPrompt("Face not visible");
    }
}

function showFaceStatusPrompt(message) {
    DOMElements.faceStatusPrompt.textContent = message;
    DOMElements.faceStatusPrompt.classList.add('visible');
}

function hideFaceStatusPrompt() {
    DOMElements.faceStatusPrompt.classList.remove('visible');
}

// ===================================================================================
// INITIALIZATION & UI LOGIC
// ===================================================================================
async function initializeAppState() {
    loadSettingsFromData();
    updateTimerDisplay();
    updateUIState();
    loadTodos();
    updateCornerWidget();
    DOMElements.profile.nameDisplay.textContent = currentUserData.profileName || "Floww User";
    loadTheme();
    await loadFaceApiModels();
}

// ========== MODIFIED: Settings Load/Save to support Mediapipe ==========

function loadSettingsFromData() {
    const settings = currentUserData.settings || {};
    workDuration = settings.workDuration || 25 * 60;
    shortBreakDuration = settings.shortBreakDuration || 5 * 60;
    longBreakDuration = settings.longBreakDuration || 15 * 60;
    if (!isRunning && !isWorkSession) {
         timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
    } else if (!isRunning) {
        timeLeft = workDuration;
    }

    document.getElementById('work-duration').value = workDuration / 60;
    document.getElementById('short-break-duration').value = shortBreakDuration / 60;
    document.getElementById('long-break-duration').value = longBreakDuration / 60;
    DOMElements.settings.soundEffects.value = settings.soundProfile || 'indian';
    DOMElements.settings.accountabilityToggle.checked = settings.isAccountabilityOn || false;
    DOMElements.settings.sleepDetectionToggle.checked = settings.isSleepDetectionOn || false;
    DOMElements.settings.mediapipeToggle.checked = settings.useMediapipe || false;

    isAccountabilityOn = settings.isAccountabilityOn || false;
    isSleepDetectionOn = settings.isSleepDetectionOn || false;
    useMediapipe = settings.useMediapipe || false;
    window.isAccountabilityOn = isAccountabilityOn;
    window.isSleepDetectionOn = isSleepDetectionOn;
}

function saveSettingsToData() {
    const newWork = parseInt(document.getElementById('work-duration').value, 10) * 60;
    const newShort = parseInt(document.getElementById('short-break-duration').value, 10) * 60;
    const newLong = parseInt(document.getElementById('long-break-duration').value, 10) * 60;

    if (newWork && newShort && newLong) {
        currentUserData.settings = currentUserData.settings || {};
        currentUserData.settings.workDuration = newWork;
        currentUserData.settings.shortBreakDuration = newShort;
        currentUserData.settings.longBreakDuration = newLong;
        currentUserData.settings.soundProfile = DOMElements.settings.soundEffects.value;
        currentUserData.settings.isAccountabilityOn = DOMElements.settings.accountabilityToggle.checked;
        currentUserData.settings.isSleepDetectionOn = DOMElements.settings.sleepDetectionToggle.checked;
        currentUserData.settings.useMediapipe = DOMElements.settings.mediapipeToggle.checked || false;

        isAccountabilityOn = DOMElements.settings.accountabilityToggle.checked;
        isSleepDetectionOn = DOMElements.settings.sleepDetectionToggle.checked;
        useMediapipe = DOMElements.settings.mediapipeToggle.checked || false;
        window.isAccountabilityOn = isAccountabilityOn;
        window.isSleepDetectionOn = isSleepDetectionOn;

        saveUserData();
        loadSettingsFromData();
        if (!isRunning) resetTimer();
        alert("Settings saved!");
    } else {
        alert("Please enter valid numbers for all durations.");
    }
}

// ========= Rest of UI/event logic unchanged =========
// ... (the rest of your script.js from original is unchanged, including attachMainAppEventListeners, charts, todos, etc.)

function attachMainAppEventListeners() {
    DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
    DOMElements.resetBtn.addEventListener('click', resetTimer);
    DOMElements.endSessionBtn.addEventListener('click', endSession);
    document.getElementById('changeNameBtn').addEventListener('click', () => { const newName = prompt("Enter new name:", currentUserData.profileName); if (newName && newName.trim()) { currentUserData.profileName = newName.trim(); saveUserData(); DOMElements.profile.nameDisplay.textContent = newName.trim(); } });
    document.getElementById('statsBtn').addEventListener('click', openStats);
    DOMElements.modals.stats.querySelector('.close-btn').addEventListener('click', closeStats);
    document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
    document.getElementById('closeReviewModalBtn').addEventListener('click', () => DOMElements.modals.review.classList.remove('visible'));
    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    document.getElementById("noiseBtn").addEventListener('click', (e) => { const noise = DOMElements.sounds.whiteNoise; noise.paused ? noise.play() : noise.pause(); e.target.textContent = noise.paused ? "🎧 Play Noise" : "🎧 Stop Noise"; });
    document.getElementById("snowBtn").addEventListener('click', () => toggleAmbience('snow'));
    document.getElementById("rainBtn").addEventListener('click', () => toggleAmbience('rain'));
    document.getElementById("sakuraBtn").addEventListener('click', () => toggleAmbience('sakura'));
    document.getElementById("focusModeBtn").addEventListener('click', toggleFocusMode);
    DOMElements.focusMode.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
    DOMElements.focusMode.exitBtn.addEventListener('click', toggleFocusMode);
    document.getElementById("add-todo-btn").addEventListener('click', addTodo);
    document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);
    document.getElementById('todo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
    document.getElementById("saveSettingsBtn").addEventListener('click', saveSettingsToData);
    DOMElements.settings.accountabilityToggle.addEventListener('change', (e) => { 
        isAccountabilityOn = e.target.checked; 
        window.isAccountabilityOn = isAccountabilityOn;
        saveSettingsToData();
    });
    DOMElements.settings.sleepDetectionToggle.addEventListener('change', (e) => { 
        isSleepDetectionOn = e.target.checked; 
        window.isSleepDetectionOn = isSleepDetectionOn;
        saveSettingsToData();
    });
    DOMElements.settings.mediapipeToggle.addEventListener('change', (e) => {
        useMediapipe = e.target.checked;
        saveSettingsToData();
    });
    document.getElementById('storeItems').addEventListener('click', (e) => { 
        if (e.target.tagName !== 'BUTTON') return;
        const item = e.target.closest('.store-item'); 
        currentUserData.theme = {}; 
        if (item.dataset.type === 'image') { currentUserData.theme.backgroundPath = item.dataset.path; applyBackgroundTheme(item.dataset.path); } 
        else if (item.dataset.type === 'youtube') { currentUserData.theme.youtubeVideoId = item.dataset.id; setYoutubeBackground(item.dataset.id); }
        saveUserData();
        closeStats();
    });
    document.getElementById("setYoutubeBtn").addEventListener('click', () => {
        const url = document.getElementById("youtube-input").value; 
        const videoId = getYoutubeVideoId(url);
        if (videoId) { currentUserData.theme = { youtubeVideoId: videoId, backgroundPath: null }; setYoutubeBackground(videoId); saveUserData(); } 
        else if (url) { alert("Please enter a valid YouTube URL."); }
    });
    document.getElementById("clearDataBtn").addEventListener('click', async () => { if (confirm("DANGER: This will reset ALL your stats and settings permanently.")) { 
        const soundProfile = currentUserData.settings.soundProfile;
        currentUserData = getDefaultUserData();
        currentUserData.settings.soundProfile = soundProfile;
        saveUserData();
        initializeAppState();
        updateTimerDisplay();
    }});
    document.getElementById('signup-form').addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        DOMElements.authError.textContent = ''; 
        const email = document.getElementById('signup-email').value; 
        const password = document.getElementById('signup-password').value; 
        const location = document.getElementById('signup-location').value;
        if (!location) {
            DOMElements.authError.textContent = 'Please select where you are from.';
            return;
        }
        try { 
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            userDataRef = doc(db, "users", userCredential.user.uid);
            currentUserData = getDefaultUserData();
            currentUserData.settings.soundProfile = location;
            await setDoc(userDataRef, currentUserData);
            initializeAppState();
        } catch (error) { 
            DOMElements.authError.textContent = error.message; 
        } 
    });
    document.getElementById('login-form').addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        DOMElements.authError.textContent = ''; 
        const email = document.getElementById('login-email').value; 
        const password = document.getElementById('login-password').value; 
        try { 
            await signInWithEmailAndPassword(auth, email, password); 
        } catch (error) { 
            DOMElements.authError.textContent = error.message; 
        } 
    });
    document.getElementById('logoutBtn').addEventListener('click', () => { 
        if (isGuestMode) {
            isGuestMode = false;
            localStorage.removeItem('youfloww_guest');
            DOMElements.appContainer.classList.add('hidden');
            DOMElements.authModal.classList.add('visible');
        } else {
            signOut(auth);
        }
    });
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').classList.remove('hidden'); document.getElementById('signup-form').classList.add('hidden'); DOMElements.authError.textContent = ''; });
    document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').classList.remove('hidden'); document.getElementById('login-form').classList.add('hidden'); DOMElements.authError.textContent = ''; });
    setInterval(updateCornerWidget, 30000);
}

// ... rest of the original code unchanged

attachMainAppEventListeners();
