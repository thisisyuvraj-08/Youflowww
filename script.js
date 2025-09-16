// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

// ============ Guest Mode State ============
let isGuestMode = false;

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
        },
        theme: { backgroundPath: null, youtubeVideoId: null }
    };
}

// ===================================================================================
// FIREBASE INITIALIZATION
// ===================================================================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // Replace with your Firebase config
    authDomain: "youfloww2.firebaseapp.com",
    projectId: "youfloww2",
    storageBucket: "youfloww2.appspot.com",
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

// NEW: MediaPipe Accountability AI State
let visionModel;
let camera;
let isAccountabilityOn = false;
let isSleepDetectionOn = false;
let awayTimerStart = null;
let eyesClosedTimerStart = null;
let modelsLoaded = false;

// ===================================================================================
// DOM ELEMENTS CACHE
// ===================================================================================
const DOMElements = {
    video: document.getElementById("camera-feed"),
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
// FIREBASE AUTH & DATA
// ===================================================================================
onAuthStateChanged(auth, user => { /* ... Your existing code ... */ });
function saveUserData() { /* ... Your existing code ... */ }
function loadUserData() { /* ... Your existing code ... */ }

// ===================================================================================
// CORE TIMER LOGIC (with Accountability Hooks)
// ===================================================================================
function updateTimerDisplay() { /* ... Your existing code ... */ }
function updateUIState() { /* ... Your existing code ... */ }
function playRandomSound(type) { /* ... Your existing code ... */ }

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
    if (isAccountabilityOn || isSleepDetectionOn) {
        startVideo();
    }
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
}

function pauseTimer(isAuto = false) {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
    if (!isAuto) {
        pauseWasManual = true;
        DOMElements.sounds.pauseAlert.play();
        stopVideo();
    } else {
        pauseWasManual = false;
    }
    lastPauseTimestamp = Date.now();
    updateUIState();
}

function resetTimer() {
    clearInterval(timerInterval);
    stopVideo();
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
// ACCOUNTABILITY AI (MEDIAPIPE FACE MESH)
// ===================================================================================
async function initializeVisionModel() {
    if (modelsLoaded) return;
    showFaceStatusPrompt("Loading AI models...");
    visionModel = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    visionModel.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    visionModel.onResults(onVisionResults);
    modelsLoaded = true; // Assume loaded for now
    hideFaceStatusPrompt();
}

async function startVideo() {
    try {
        if (camera) return;
        const videoElement = DOMElements.video;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 128, height: 72 } });
        videoElement.srcObject = stream;
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (videoElement.readyState >= 3) {
                    await visionModel.send({ image: videoElement });
                }
            },
            width: 128, height: 72
        });
        camera.start();
    } catch (err) {
        alert("Camera access is required. Please allow access and refresh.");
        DOMElements.settings.accountabilityToggle.checked = false;
        DOMElements.settings.sleepDetectionToggle.checked = false;
        isAccountabilityOn = false;
        isSleepDetectionOn = false;
        saveSettingsToData();
    }
}

function stopVideo() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    if (DOMElements.video.srcObject) {
        DOMElements.video.srcObject.getTracks().forEach(track => track.stop());
        DOMElements.video.srcObject = null;
    }
    clearInterval(faceApiInterval); // Renaming this would be good, but keeping for consistency with your code
    faceApiInterval = null;
    hideFaceStatusPrompt();
    awayTimerStart = null;
    eyesClosedTimerStart = null;
}

function getEyeAspectRatio(landmarks) {
    // MediaPipe landmark indices for one eye
    const p1 = landmarks[160]; const p2 = landmarks[144];
    const p3 = landmarks[158]; const p4 = landmarks[153];
    const p5 = landmarks[33];  const p6 = landmarks[133];
    const vert = Math.hypot(p1.x - p4.x, p1.y - p4.y) + Math.hypot(p2.x - p3.x, p2.y - p3.y);
    const horiz = Math.hypot(p5.x - p6.x, p5.y - p6.y);
    return vert / (2 * horiz);
}

function onVisionResults(results) {
    if (!isRunning || (!isAccountabilityOn && !isSleepDetectionOn)) return;
    const faceDetected = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;

    if (isAccountabilityOn) {
        if (!faceDetected) {
            if (!awayTimerStart) { awayTimerStart = Date.now(); showFaceStatusPrompt("Are you there? Timer will pause soon..."); }
            else if (Date.now() - awayTimerStart > 15000) { pauseTimer(true); showFaceStatusPrompt("Timer paused. Come back to resume."); }
        } else {
            if (awayTimerStart) { awayTimerStart = null; hideFaceStatusPrompt(); if (!isRunning && !pauseWasManual) startTimer(true); }
        }
    }

    if (isSleepDetectionOn && faceDetected) {
        const landmarks = results.multiFaceLandmarks[0];
        const ear = getEyeAspectRatio(landmarks);
        if (ear < 0.22) {
            if (!eyesClosedTimerStart) { eyesClosedTimerStart = Date.now(); showFaceStatusPrompt("Feeling sleepy? Timer will pause."); }
            else if (Date.now() - eyesClosedTimerStart > 10000) { pauseTimer(true); showFaceStatusPrompt("Timer paused due to inactivity."); playRandomSound('bad'); }
        } else {
            if (eyesClosedTimerStart) { eyesClosedTimerStart = null; hideFaceStatusPrompt(); if (!isRunning && !pauseWasManual) startTimer(true); }
        }
    } else if (isSleepDetectionOn && !faceDetected) { showFaceStatusPrompt("Face not visible"); }
}

function showFaceStatusPrompt(message) { DOMElements.faceStatusPrompt.textContent = message; DOMElements.faceStatusPrompt.classList.add('visible'); }
function hideFaceStatusPrompt() { DOMElements.faceStatusPrompt.classList.remove('visible'); }

// ===================================================================================
// INITIALIZATION & UI LOGIC
// ===================================================================================
async function initializeAppState() { /* ... Your existing code ... */ }
function loadSettingsFromData() { /* ... Your existing code ... */ }
function saveSettingsToData() { /* ... Your existing code ... */ }
function showCompletionPopup() { /* ... Your existing code ... */ }
function openStats() { /* ... Your existing code ... */ }
function closeStats() { /* ... Your existing code ... */ }
function updateStatsDisplay() { /* ... Your existing code ... */ }
function showSessionReview() { /* ... Your existing code ... */ }
function loadTodos() { /* ... Your existing code ... */ }
function addTodo() { /* ... Your existing code ... */ }
function toggleTodo(index) { /* ... Your existing code ... */ }
function clearTodos() { /* ... Your existing code ... */ }
function updateCornerWidget() { /* ... Your existing code ... */ }
function toggleFocusMode() { /* ... Your existing code ... */ }
function ambientLoop(timestamp) { /* ... Your existing code ... */ }
function createAndAnimateElement(className, minDuration, maxDuration, animationName) { /* ... Your existing code ... */ }
function toggleAmbience(type) { /* ... Your existing code ... */ }
function getYoutubeVideoId(url) { /* ... Your existing code ... */ }
function setYoutubeBackground(videoId) { /* ... Your existing code ... */ }
function applyBackgroundTheme(path) { /* ... Your existing code ... */ }
function loadTheme() { /* ... Your existing code ... */ }
function renderCharts() { /* ... Your existing code ... */ }
function switchTab(tabName) { /* ... Your existing code ... */ }

// ===================================================================================
// EVENT LISTENERS
// ===================================================================================
function attachMainAppEventListeners() {
    DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
    DOMElements.resetBtn.addEventListener('click', resetTimer);
    DOMElements.endSessionBtn.addEventListener('click', endSession);
    // ... all other listeners from your code ...
    DOMElements.settings.accountabilityToggle.addEventListener('change', async (e) => { 
        isAccountabilityOn = e.target.checked; 
        if(isAccountabilityOn) await initializeVisionModel();
        saveSettingsToData();
    });
    DOMElements.settings.sleepDetectionToggle.addEventListener('change', async (e) => { 
        isSleepDetectionOn = e.target.checked; 
        if(isSleepDetectionOn) await initializeVisionModel();
        saveSettingsToData();
    });
    // ... all other listeners from your code ...
}

document.addEventListener('DOMContentLoaded', () => {
    // Your existing DOMContentLoaded, including guest mode and auth forms
    // ...
    attachMainAppEventListeners();
});
