// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

// ============ Minimalist Animated Intro Logic ============
function playMinimalistIntro() {
    const overlay = document.getElementById('introOverlay');
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
        bestStreak: 0,
        lastStreakDate: null,
        longestSession: 0,
        todaySessions: 0,
        lastSessionDate: null,
        weeklyFocus: {},
        todos: [],
        journalEntries: {},
        timetable: {},
        settings: {
            workDuration: 25 * 60,
            shortBreakDuration: 5 * 60,
            longBreakDuration: 15 * 60,
            soundProfile: "indian",
            isAccountabilityOn: false,
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
let awayTimerStart = null;
let modelsLoaded = false; // Flag to check if face-api models are loaded
let poseDetector = null;
let poseDetectionInterval = null;

// YOUTUBE PLAYER STATE
let youtubePlayer = null;
let isPipDragging = false;
let pipDragOffset = { x: 0, y: 0 };

// ===================================================================================
// DOM ELEMENTS CACHE
// ===================================================================================
const DOMElements = {
    video: document.getElementById("video"),
    poseCanvas: document.getElementById("pose-canvas"),
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
        currentStreak: document.getElementById("currentStreak"),
        bestStreak: document.getElementById("bestStreak"),
        longestSession: document.getElementById("longestSession"),
        todaySessions: document.getElementById("todaySessions")
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
    },
    // New elements for enhanced features
    journal: {
        section: document.getElementById("journal-section"),
        entry: document.getElementById("journal-entry"),
        charCount: document.getElementById("journal-char-count"),
        saveStatus: document.getElementById("journal-save-status"),
        imageUpload: document.getElementById("journal-image-upload"),
        imagePreview: document.getElementById("journal-image-preview"),
        entriesList: document.getElementById("journal-entries-list"),
        currentDate: document.getElementById("journal-current-date"),
        saveBtn: document.getElementById("save-journal-btn")
    },
    timetable: {
        section: document.getElementById("timetable-section"),
        timeslotsList: document.getElementById("timeslots-list"),
        days: document.querySelectorAll(".day-tab"),
        addSlotBtn: document.getElementById("add-timeslot-btn"),
        addFirstSlotBtn: document.getElementById("add-first-slot"),
        clearBtn: document.getElementById("clear-timetable-btn"),
        addModal: document.getElementById("add-timeslot-modal"),
        form: document.getElementById("timeslot-form"),
        currentDayName: document.getElementById("current-day-name")
    },
    macDock: document.getElementById("mac-dock"),
    dockItems: document.querySelectorAll(".dock-item"),
    pipPlayer: {
        container: document.getElementById("pip-player-container"),
        header: document.getElementById("pip-player-header"),
        content: document.getElementById("pip-player-content"),
        closeBtn: document.getElementById("pip-close-btn"),
        youtubeInput: document.getElementById("pip-youtube-input"),
        setBtn: document.getElementById("pip-set-btn"),
        resizeHandle: document.getElementById("pip-resize-handle")
    }
};

// ===================================================================================
// FIREBASE AUTH & DATA
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
                // Initialize missing properties for backward compatibility
                if (currentUserData.bestStreak === undefined) currentUserData.bestStreak = 0;
                if (currentUserData.longestSession === undefined) currentUserData.longestSession = 0;
                if (currentUserData.todaySessions === undefined) currentUserData.todaySessions = 0;
            }
            initializeAppState();
        });
    }
}
function loadGuestData() {
    try { return JSON.parse(localStorage.getItem('youfloww_guest')); } catch { return null; }
}

// ===================================================================================
// CORE TIMER LOGIC
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
    if (isAccountabilityOn) {
        startFaceDetection();
        startPoseDetection();
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

    if (isAccountabilityOn && !DOMElements.video.srcObject) {
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
        stopPoseDetection();
    } else {
        pauseWasManual = false;
    }
    lastPauseTimestamp = Date.now();
    updateUIState();
}

function resetTimer() {
    clearInterval(timerInterval);
    stopFaceDetection();
    stopPoseDetection();
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
    if (isAccountabilityOn) showSessionReview();
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
    stopPoseDetection();
    stopVideo();
    if (minutesFocused > 0) {
        currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
        currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
        
        // Update today's sessions count
        const today = new Date().toISOString().slice(0, 10);
        if (currentUserData.lastSessionDate !== today) {
            currentUserData.todaySessions = 1;
            currentUserData.lastSessionDate = today;
        } else {
            currentUserData.todaySessions = (currentUserData.todaySessions || 0) + 1;
        }
        
        // Update longest session
        if (minutesFocused > currentUserData.longestSession) {
            currentUserData.longestSession = minutesFocused;
        }
        
        // Update streak
        updateStreak();
        
        if (!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
        currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;
    }
    if (minutesFocused >= 20) playRandomSound('good');
    else if (minutesFocused > 0) playRandomSound('bad');
    saveUserData();
}

// Update streak logic
function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const lastStreakDate = currentUserData.lastStreakDate;
    
    // If no last streak date or last streak was yesterday, increment streak
    if (!lastStreakDate) {
        currentUserData.streakCount = 1;
        currentUserData.lastStreakDate = today;
    } else {
        const lastDate = new Date(lastStreakDate);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day
            currentUserData.streakCount = (currentUserData.streakCount || 0) + 1;
            currentUserData.lastStreakDate = today;
        } else if (diffDays > 1) {
            // Broken streak, reset to 1
            currentUserData.streakCount = 1;
            currentUserData.lastStreakDate = today;
        }
        // If same day, do nothing (already completed a session today)
    }
    
    // Update best streak
    if (currentUserData.streakCount > currentUserData.bestStreak) {
        currentUserData.bestStreak = currentUserData.streakCount;
    }
    
    // Update streak display
    DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
}

// ===================================================================================
// ACCOUNTABILITY AI (FACE-API.JS & POSE DETECTION)
// ===================================================================================
async function loadFaceApiModels() {
    if (modelsLoaded) return;
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        modelsLoaded = true;
    } catch (error) {
        console.error("Could not load face-api models:", error);
    }
}

async function setupPoseDetection() {
    try {
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true
        };
        poseDetector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
    } catch (error) {
        console.error("Could not load pose detection model:", error);
    }
}

async function startVideo() {
    try {
        if (DOMElements.video.srcObject) return;
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        DOMElements.video.srcObject = stream;
        DOMElements.poseCanvas.width = DOMElements.video.videoWidth;
        DOMElements.poseCanvas.height = DOMElements.video.videoHeight;
    } catch (err) {
        console.error("Camera access error:", err);
        alert("Camera access is required for Accountability features. Please allow access and refresh.");
        DOMElements.settings.accountabilityToggle.checked = false;
        isAccountabilityOn = false;
        window.isAccountabilityOn = isAccountabilityOn;
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
    if (!faceApiInterval && isAccountabilityOn) {
        faceApiInterval = setInterval(handleFaceDetection, 1000);
        window.faceApiInterval = faceApiInterval;
    }
}

function stopFaceDetection() {
    clearInterval(faceApiInterval);
    faceApiInterval = null;
    window.faceApiInterval = faceApiInterval;
    hideFaceStatusPrompt();
    awayTimerStart = null;
}

function startPoseDetection() {
    if (!poseDetectionInterval && isAccountabilityOn && poseDetector) {
        poseDetectionInterval = setInterval(handlePoseDetection, 1000);
    }
}

function stopPoseDetection() {
    clearInterval(poseDetectionInterval);
    poseDetectionInterval = null;
}

async function handleFaceDetection() {
    if (!modelsLoaded || !isRunning || DOMElements.video.paused || DOMElements.video.ended || !DOMElements.video.srcObject) return;
    
    try {
        const detections = await faceapi.detectAllFaces(
            DOMElements.video, 
            new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 })
        ).withFaceLandmarks(true);

        const faceDetected = detections.length > 0;
        handlePresenceDetection(faceDetected);
    } catch (error) {
        console.error("Face detection error:", error);
    }
}

async function handlePoseDetection() {
    if (!poseDetector || !isRunning || DOMElements.video.paused || DOMElements.video.ended || !DOMElements.video.srcObject) return;
    
    try {
        const poses = await poseDetector.estimatePoses(DOMElements.video);
        const personDetected = poses.length > 0 && poses[0].keypoints.some(kp => kp.score > 0.4);
        
        // If pose detection finds a person, use that instead of face detection
        if (personDetected) {
            handlePresenceDetection(true);
        }
    } catch (error) {
        console.error("Pose detection error:", error);
    }
}

function handlePresenceDetection(presenceDetected) {
    if (isAccountabilityOn) {
        if (!presenceDetected) {
            if (!awayTimerStart) {
                awayTimerStart = Date.now();
                showFaceStatusPrompt("Are you there? Timer will pause soon...");
            } else if (Date.now() - awayTimerStart > 30000) { // 30 seconds
                pauseTimer(true);
                showFaceStatusPrompt("Timer paused. Come back to resume.");
            }
        } else {
            if (awayTimerStart) {
                awayTimerStart = null;
                hideFaceStatusPrompt();
                if (!isRunning && !pauseWasManual) startTimer(true);
            }
        }
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
// YOUTUBE PIP PLAYER FUNCTIONALITY
// ===================================================================================
function initYoutubePlayer() {
    // Default playlists based on user location
    const defaultPlaylist = currentUserData.settings?.soundProfile === 'indian' 
        ? 'UBBHpoW3AKA' 
        : 'PLBgJjIxp0WaVX6LSodfsQ9pBfHWObvkfX';
    
    // Load YouTube IFrame API
    if (typeof YT !== 'undefined' && YT.Player) {
        createYoutubePlayer(defaultPlaylist);
    } else {
        // Wait for YouTube API to load
        window.onYouTubeIframeAPIReady = function() {
            createYoutubePlayer(defaultPlaylist);
        };
    }
    
    // Set up PiP player event listeners
    setupPipPlayer();
}

function createYoutubePlayer(playlistId) {
    youtubePlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            'listType': 'playlist',
            'list': playlistId,
            'autoplay': 0,
            'controls': 1,
            'rel': 0,
            'modestbranding': 1,
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("YouTube player ready");
}

function onPlayerStateChange(event) {
    // Handle player state changes if needed
}

function setupPipPlayer() {
    // Toggle PiP player visibility
    document.getElementById('pipYoutubeBtn').addEventListener('click', () => {
        DOMElements.pipPlayer.container.classList.toggle('hidden');
        if (!DOMElements.pipPlayer.container.classList.contains('hidden') && youtubePlayer) {
            youtubePlayer.playVideo();
        } else if (youtubePlayer) {
            youtubePlayer.pauseVideo();
        }
    });
    
    // Close PiP player
    DOMElements.pipPlayer.closeBtn.addEventListener('click', () => {
        DOMElements.pipPlayer.container.classList.add('hidden');
        if (youtubePlayer) {
            youtubePlayer.pauseVideo();
        }
    });
    
    // Set new YouTube URL
    DOMElements.pipPlayer.setBtn.addEventListener('click', () => {
        const url = DOMElements.pipPlayer.youtubeInput.value;
        const videoId = getYoutubeVideoId(url);
        if (videoId && youtubePlayer) {
            youtubePlayer.loadVideoById(videoId);
            DOMElements.pipPlayer.youtubeInput.value = '';
        } else if (url) {
            alert("Please enter a valid YouTube URL.");
        }
    });
    
    // Make PiP player draggable
    DOMElements.pipPlayer.header.addEventListener('mousedown', startDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mousemove', drag);
    
    // Make PiP player resizable
    DOMElements.pipPlayer.resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('mousemove', resize);
}

function startDrag(e) {
    isPipDragging = true;
    const rect = DOMElements.pipPlayer.container.getBoundingClientRect();
    pipDragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    e.preventDefault();
}

function stopDrag() {
    isPipDragging = false;
}

function drag(e) {
    if (!isPipDragging) return;
    
    DOMElements.pipPlayer.container.style.left = (e.clientX - pipDragOffset.x) + 'px';
    DOMElements.pipPlayer.container.style.top = (e.clientY - pipDragOffset.y) + 'px';
    DOMElements.pipPlayer.container.style.right = 'auto';
    DOMElements.pipPlayer.container.style.bottom = 'auto';
}

let isResizing = false;
let startWidth, startHeight, startX, startY;

function startResize(e) {
    isResizing = true;
    startWidth = parseInt(getComputedStyle(DOMElements.pipPlayer.container).width, 10);
    startHeight = parseInt(getComputedStyle(DOMElements.pipPlayer.container).height, 10);
    startX = e.clientX;
    startY = e.clientY;
    e.preventDefault();
}

function stopResize() {
    isResizing = false;
}

function resize(e) {
    if (!isResizing) return;
    
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    
    // Set minimum size
    if (width > 300 && height > 200) {
        DOMElements.pipPlayer.container.style.width = width + 'px';
        DOMElements.pipPlayer.container.style.height = height + 'px';
    }
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
    await setupPoseDetection();
    
    // Initialize new features
    initJournal();
    initTimetable();
    initMacDock();
    initYoutubePlayer();
    
    // Update streak display
    DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
}

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

    isAccountabilityOn = settings.isAccountabilityOn || false;
    window.isAccountabilityOn = isAccountabilityOn;
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

        isAccountabilityOn = DOMElements.settings.accountabilityToggle.checked;
        window.isAccountabilityOn = isAccountabilityOn;

        saveUserData();
        loadSettingsFromData();
        if (!isRunning) resetTimer();
        alert("Settings saved!");
    } else {
        alert("Please enter valid numbers for all durations.");
    }
}

function showCompletionPopup() { DOMElements.modals.completion.classList.add('visible'); }
function openStats() { 
    DOMElements.modals.stats.classList.add('visible'); 
    renderCharts(); 
    updateStatsDisplay(); 
}
function closeStats() { DOMElements.modals.stats.classList.remove('visible'); }
function updateStatsDisplay() {
    const totalMinutes = currentUserData.totalFocusMinutes || 0;
    DOMElements.modals.totalFocusTime.textContent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    DOMElements.modals.totalSessionsCount.textContent = currentUserData.totalSessions || 0;
    DOMElements.modals.currentStreak.textContent = `${currentUserData.streakCount || 0} days`;
    DOMElements.modals.bestStreak.textContent = `${currentUserData.bestStreak || 0} days`;
    DOMElements.modals.longestSession.textContent = `${currentUserData.longestSession || 0}m`;
    DOMElements.modals.todaySessions.textContent = currentUserData.todaySessions || 0;
}
function showSessionReview() {
    if (!sessionStartTime || !isWorkSession) return;
    const totalDurationMs = Date.now() - sessionStartTime;
    const currentPauseDuration = lastPauseTimestamp ? Date.now() - lastPauseTimestamp : 0;
    const awayTimeMs = totalAwayTime + currentPauseDuration;
    const focusTimeMs = totalDurationMs - awayTimeMs;
    const formatMs = (ms) => {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    };

    document.getElementById('reviewFocusTime').textContent = formatMs(focusTimeMs);
    document.getElementById('reviewAwayTime').textContent = formatMs(awayTimeMs);
    document.getElementById('reviewTotalDuration').textContent = formatMs(totalDurationMs);
    DOMElements.modals.review.classList.add('visible');
}

// ===================================================================================
// ENHANCED TODO LIST FUNCTIONALITY
// ===================================================================================
function loadTodos() {
    const todos = currentUserData.todos || [];
    const todoList = document.getElementById('todo-list');
    todoList.innerHTML = '';
    
    todos.forEach((todo, index) => {
        const li = createTodoElement(todo, index);
        todoList.appendChild(li);
    });
    
    // Make the list sortable
    makeTodoListSortable();
}

function createTodoElement(todo, index) {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.draggable = true;
    li.dataset.index = index;
    
    const deadlineText = todo.deadline ? new Date(todo.deadline).toLocaleDateString() : 'No deadline';
    const estimatedTimeText = todo.estimatedTime ? `${todo.estimatedTime} min` : 'No time estimate';
    
    li.innerHTML = `
        <div class="todo-drag-handle"><i class="fas fa-grip-vertical"></i></div>
        <div class="todo-content">
            <div class="todo-main-row">
                <input type="checkbox" id="todo-${index}" ${todo.completed ? 'checked' : ''}>
                <label for="todo-${index}" class="todo-title">${todo.text}</label>
                <button class="todo-expand-btn"><i class="fas fa-chevron-down"></i></button>
                <button class="todo-delete-btn"><i class="fas fa-trash"></i></button>
            </div>
            <div class="todo-details">
                <div class="todo-meta">
                    <div class="todo-meta-item"><i class="far fa-calendar"></i> ${deadlineText}</div>
                    <div class="todo-meta-item"><i class="far fa-clock"></i> ${estimatedTimeText}</div>
                </div>
                <div class="todo-subtasks">
                    <div class="subtask-input">
                        <input type="text" placeholder="Add a subtask..." class="subtask-text">
                        <button class="add-subtask-btn"><i class="fas fa-plus"></i></button>
                    </div>
                    <ul class="subtask-list">
                        ${renderSubtasks(todo.subtasks || [], index)}
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners
    li.querySelector('input[type="checkbox"]').onchange = () => toggleTodo(index);
    li.querySelector('.todo-expand-btn').onclick = () => {
        const details = li.querySelector('.todo-details');
        details.classList.toggle('expanded');
        const icon = li.querySelector('.todo-expand-btn i');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    };
    
    li.querySelector('.todo-delete-btn').onclick = () => {
        deleteTodo(index);
    };
    
    // Add Enter key functionality for subtasks
    const subtaskInput = li.querySelector('.subtask-text');
    subtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            li.querySelector('.add-subtask-btn').click();
        }
    });
    
    li.querySelector('.add-subtask-btn').onclick = () => {
        if (subtaskInput.value.trim()) {
            if (!currentUserData.todos[index].subtasks) currentUserData.todos[index].subtasks = [];
            currentUserData.todos[index].subtasks.push({
                text: subtaskInput.value.trim(),
                completed: false
            });
            saveUserData();
            subtaskInput.value = '';
            loadTodos();
        }
    };
    
    return li;
}

function renderSubtasks(subtasks, todoIndex) {
    return subtasks.map((subtask, i) => `
        <li class="subtask-item">
            <input type="checkbox" ${subtask.completed ? 'checked' : ''} data-todo-index="${todoIndex}" data-subtask-index="${i}">
            <label>${subtask.text}</label>
            <button class="subtask-delete-btn" data-todo-index="${todoIndex}" data-subtask-index="${i}"><i class="fas fa-times"></i></button>
        </li>
    `).join('');
}

function addTodo() {
    const input = document.getElementById('todo-input');
    if (input.value.trim()) {
        if (!currentUserData.todos) currentUserData.todos = [];
        currentUserData.todos.push({
            text: input.value.trim(),
            completed: false,
            subtasks: [],
            deadline: null,
            estimatedTime: null
        });
        saveUserData();
        input.value = '';
        loadTodos();
    }
}

function toggleTodo(index) {
    if (currentUserData.todos[index]) {
        currentUserData.todos[index].completed = !currentUserData.todos[index].completed;
        saveUserData();
        loadTodos();
    }
}

function deleteTodo(index) {
    if (confirm("Delete this task?")) {
        currentUserData.todos.splice(index, 1);
        saveUserData();
        loadTodos();
    }
}

function clearTodos() {
    if (confirm("Clear all tasks?")) {
        currentUserData.todos = [];
        saveUserData();
        loadTodos();
    }
}

function makeTodoListSortable() {
    const todoList = document.getElementById('todo-list');
    let draggedItem = null;
    
    // Add drag events to all items
    const items = todoList.querySelectorAll('.todo-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        });
        
        item.addEventListener('dragend', () => {
            draggedItem = null;
            items.forEach(item => item.classList.remove('dragging'));
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (item !== draggedItem) {
                const allItems = [...todoList.querySelectorAll('.todo-item:not(.dragging)')];
                const currentPos = allItems.indexOf(draggedItem);
                const newPos = allItems.indexOf(item);
                
                if (currentPos < newPos) {
                    todoList.insertBefore(draggedItem, item.nextSibling);
                } else {
                    todoList.insertBefore(draggedItem, item);
                }
                
                // Update the order in the data
                const todos = currentUserData.todos;
                const [movedItem] = todos.splice(currentPos, 1);
                todos.splice(newPos, 0, movedItem);
                saveUserData();
            }
        });
    });
}

// Add event delegation for subtask checkboxes and delete buttons
document.addEventListener('click', (e) => {
    // Handle subtask checkbox toggle
    if (e.target.matches('.subtask-item input[type="checkbox"]')) {
        const todoIndex = e.target.dataset.todoIndex;
        const subtaskIndex = e.target.dataset.subtaskIndex;
        toggleSubtask(todoIndex, subtaskIndex);
    }
    
    // Handle subtask delete button
    if (e.target.closest('.subtask-delete-btn')) {
        const btn = e.target.closest('.subtask-delete-btn');
        const todoIndex = btn.dataset.todoIndex;
        const subtaskIndex = btn.dataset.subtaskIndex;
        deleteSubtask(todoIndex, subtaskIndex);
    }
});

function toggleSubtask(todoIndex, subtaskIndex) {
    if (currentUserData.todos[todoIndex] && currentUserData.todos[todoIndex].subtasks[subtaskIndex]) {
        currentUserData.todos[todoIndex].subtasks[subtaskIndex].completed = 
            !currentUserData.todos[todoIndex].subtasks[subtaskIndex].completed;
        saveUserData();
        loadTodos();
    }
}

function deleteSubtask(todoIndex, subtaskIndex) {
    if (currentUserData.todos[todoIndex] && currentUserData.todos[todoIndex].subtasks[subtaskIndex]) {
        currentUserData.todos[todoIndex].subtasks.splice(subtaskIndex, 1);
        saveUserData();
        loadTodos();
    }
}

// ===================================================================================
// JOURNAL FUNCTIONALITY
// ===================================================================================
function initJournal() {
    // Set current date
    const today = new Date();
    DOMElements.journal.currentDate.textContent = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Load today's entry if it exists
    const todayKey = today.toISOString().slice(0, 10);
    if (currentUserData.journalEntries && currentUserData.journalEntries[todayKey]) {
        const entry = currentUserData.journalEntries[todayKey];
        DOMElements.journal.entry.value = entry.text;
        updateCharCount();
        
        if (entry.image) {
            const img = document.createElement('img');
            img.src = entry.image;
            DOMElements.journal.imagePreview.innerHTML = '';
            DOMElements.journal.imagePreview.appendChild(img);
            DOMElements.journal.imagePreview.classList.remove('hidden');
        }
    }
    
    // Load previous entries
    loadPreviousJournalEntries();
}

function updateCharCount() {
    const text = DOMElements.journal.entry.value;
    const count = text.length;
    DOMElements.journal.charCount.textContent = `${count}/1024`;
    
    if (count > 1000) {
        DOMElements.journal.charCount.style.color = 'var(--danger-color)';
    } else if (count > 800) {
        DOMElements.journal.charCount.style.color = 'var(--primary-color)';
    } else {
        DOMElements.journal.charCount.style.color = 'var(--text-color)';
    }
}

function saveJournalEntry() {
    const text = DOMElements.journal.entry.value;
    if (text.length > 1024) {
        alert("Journal entry exceeds 1024 characters. Please shorten it.");
        return;
    }
    
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    
    if (!currentUserData.journalEntries) currentUserData.journalEntries = {};
    
    currentUserData.journalEntries[todayKey] = {
        text: text,
        date: todayKey,
        image: DOMElements.journal.imagePreview.querySelector('img')?.src || null
    };
    
    saveUserData();
    
    // Show save confirmation
    DOMElements.journal.saveStatus.textContent = 'Saved!';
    setTimeout(() => {
        DOMElements.journal.saveStatus.textContent = '';
    }, 2000);
    
    // Update previous entries list
    loadPreviousJournalEntries();
}

function loadPreviousJournalEntries() {
    const entriesContainer = DOMElements.journal.entriesList;
    entriesContainer.innerHTML = '';
    
    if (!currentUserData.journalEntries || Object.keys(currentUserData.journalEntries).length === 0) {
        entriesContainer.innerHTML = '<p>No previous entries yet.</p>';
        return;
    }
    
    // Sort entries by date (newest first)
    const sortedEntries = Object.entries(currentUserData.journalEntries)
        .sort(([a], [b]) => new Date(b) - new Date(a))
        .slice(0, 5); // Show only the 5 most recent
    
    sortedEntries.forEach(([date, entry]) => {
        const entryEl = document.createElement('div');
        entryEl.className = 'journal-entry-item';
        
        const entryDate = new Date(date);
        const formattedDate = entryDate.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        let content = `
            <div class="journal-entry-date">
                <i class="fas fa-calendar"></i>${formattedDate}
            </div>
            <div class="journal-entry-content">${entry.text}</div>
        `;
        
        if (entry.image) {
            content += `<img src="${entry.image}" class="journal-entry-image" alt="Journal image">`;
        }
        
        entryEl.innerHTML = content;
        entriesContainer.appendChild(entryEl);
    });
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
        alert('Please select an image file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = document.createElement('img');
        img.src = event.target.result;
        DOMElements.journal.imagePreview.innerHTML = '';
        DOMElements.journal.imagePreview.appendChild(img);
        DOMElements.journal.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// ===================================================================================
// TIMETABLE FUNCTIONALITY
// ===================================================================================
function initTimetable() {
    // Set current day
    updateCurrentDay();
    
    // Load saved timetable if exists
    if (currentUserData.timetable) {
        loadTimetableData();
    }
    
    // Set up day selection
    DOMElements.timetable.days.forEach(day => {
        day.addEventListener('click', () => {
            DOMElements.timetable.days.forEach(d => d.classList.remove('active'));
            day.classList.add('active');
            loadTimetableForDay(day.dataset.day);
        });
    });
    
    // Activate current day by default
    const currentDay = getCurrentDay();
    document.querySelector(`.day-tab[data-day="${currentDay}"]`).classList.add('active');
    loadTimetableForDay(currentDay);
    
    // Set up event listeners
    setupTimetableEvents();
}

function updateCurrentDay() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date().getDay();
    const currentDayName = days[today].charAt(0).toUpperCase() + days[today].slice(1);
    DOMElements.timetable.currentDayName.textContent = `Today is ${currentDayName}`;
}

function getCurrentDay() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
}

function setupTimetableEvents() {
    // Add time slot button
    DOMElements.timetable.addSlotBtn.addEventListener('click', () => {
        openAddTimeSlotModal();
    });
    
    // Add first slot button
    DOMElements.timetable.addFirstSlotBtn.addEventListener('click', () => {
        openAddTimeSlotModal();
    });
    
    // Clear timetable button
    DOMElements.timetable.clearBtn.addEventListener('click', () => {
        clearTimetable();
    });
    
    // Close modal button
    document.querySelector('.close-modal').addEventListener('click', () => {
        DOMElements.timetable.addModal.classList.remove('visible');
    });
    
    // Timeslot form submission
    DOMElements.timetable.form.addEventListener('submit', (e) => {
        e.preventDefault();
        addTimeSlot();
    });
}

function openAddTimeSlotModal() {
    // Set the selected day in the modal
    const activeDay = document.querySelector('.day-tab.active');
    if (activeDay) {
        document.getElementById('timeslot-day').value = activeDay.dataset.day;
    }
    
    DOMElements.timetable.addModal.classList.add('visible');
}

function addTimeSlot() {
    const day = document.getElementById('timeslot-day').value;
    const start = document.getElementById('timeslot-start').value;
    const end = document.getElementById('timeslot-end').value;
    const activity = document.getElementById('timeslot-activity').value;
    
    if (!start || !end || !activity) {
        alert('Please fill all fields');
        return;
    }
    
    if (start >= end) {
        alert('End time must be after start time');
        return;
    }
    
    const timeslotId = `${day}-${start}-${end}`;
    
    if (!currentUserData.timetable) currentUserData.timetable = {};
    
    currentUserData.timetable[timeslotId] = {
        day: day,
        start: start,
        end: end,
        activity: activity,
        completed: false
    };
    
    saveUserData();
    DOMElements.timetable.addModal.classList.remove('visible');
    DOMElements.timetable.form.reset();
    
    // Reload the timetable for the current day
    const activeDay = document.querySelector('.day-tab.active');
    if (activeDay) {
        loadTimetableForDay(activeDay.dataset.day);
    }
}

function loadTimetableForDay(day) {
    const timeslotsList = DOMElements.timetable.timeslotsList;
    timeslotsList.innerHTML = '';
    
    if (!currentUserData.timetable || Object.keys(currentUserData.timetable).length === 0) {
        timeslotsList.innerHTML = `
            <div class="no-slots-message">
                <i class="fas fa-calendar-plus"></i>
                <p>No time slots added for this day yet.</p>
                <button id="add-first-slot" class="timetable-btn primary">Add your first time slot</button>
            </div>
        `;
        
        // Reattach event listener
        document.getElementById('add-first-slot').addEventListener('click', () => {
            openAddTimeSlotModal();
        });
        
        return;
    }
    
    // Filter timeslots for the selected day
    const dayTimeslots = Object.entries(currentUserData.timetable)
        .filter(([id, slot]) => slot.day === day)
        .sort((a, b) => a[1].start.localeCompare(b[1].start));
    
    if (dayTimeslots.length === 0) {
        timeslotsList.innerHTML = `
            <div class="no-slots-message">
                <i class="fas fa-calendar-plus"></i>
                <p>No time slots added for this day yet.</p>
                <button id="add-first-slot" class="timetable-btn primary">Add your first time slot</button>
            </div>
        `;
        
        // Reattach event listener
        document.getElementById('add-first-slot').addEventListener('click', () => {
            openAddTimeSlotModal();
        });
        
        return;
    }
    
    // Add timeslots to the list
    dayTimeslots.forEach(([id, slot]) => {
        const timeslotElement = createTimeslotElement(id, slot);
        timeslotsList.appendChild(timeslotElement);
    });
}

function createTimeslotElement(id, slot) {
    const element = document.createElement('div');
    element.className = 'timeslot-item';
    element.dataset.id = id;
    
    // Check if this is the current timeslot
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMinutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;
    const currentDay = getCurrentDay();
    
    if (currentDay === slot.day && currentTime >= slot.start && currentTime <= slot.end) {
        element.classList.add('current');
    }
    
    element.innerHTML = `
        <div class="timeslot-time">${formatTime(slot.start)} - ${formatTime(slot.end)}</div>
        <div class="timeslot-activity">${slot.activity}</div>
        <div class="timeslot-actions">
            <div class="timeslot-check ${slot.completed ? 'checked' : ''}"></div>
            <button class="timeslot-delete"><i class="fas fa-trash"></i></button>
        </div>
    `;
    
    // Add event listeners
    const checkBtn = element.querySelector('.timeslot-check');
    checkBtn.addEventListener('click', () => {
        toggleTimeslotCompletion(id);
    });
    
    const deleteBtn = element.querySelector('.timeslot-delete');
    deleteBtn.addEventListener('click', () => {
        deleteTimeslot(id);
    });
    
    return element;
}

function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${period}`;
}

function toggleTimeslotCompletion(id) {
    if (currentUserData.timetable && currentUserData.timetable[id]) {
        currentUserData.timetable[id].completed = !currentUserData.timetable[id].completed;
        saveUserData();
        
        // Update UI
        const element = document.querySelector(`.timeslot-item[data-id="${id}"]`);
        if (element) {
            const checkBtn = element.querySelector('.timeslot-check');
            checkBtn.classList.toggle('checked');
        }
    }
}

function deleteTimeslot(id) {
    if (confirm('Delete this time slot?')) {
        if (currentUserData.timetable && currentUserData.timetable[id]) {
            delete currentUserData.timetable[id];
            saveUserData();
            
            // Reload the timetable for the current day
            const activeDay = document.querySelector('.day-tab.active');
            if (activeDay) {
                loadTimetableForDay(activeDay.dataset.day);
            }
        }
    }
}

function clearTimetable() {
    if (confirm("Clear entire timetable? This cannot be undone.")) {
        currentUserData.timetable = {};
        saveUserData();
        
        // Reload the timetable for the current day
        const activeDay = document.querySelector('.day-tab.active');
        if (activeDay) {
            loadTimetableForDay(activeDay.dataset.day);
        }
    }
}

function loadTimetableData() {
    // This will be called when initializing to load any existing timetable data
    const activeDay = document.querySelector('.day-tab.active');
    if (activeDay) {
        loadTimetableForDay(activeDay.dataset.day);
    }
}

// ===================================================================================
// macOS DOCK FUNCTIONALITY
// ===================================================================================
function initMacDock() {
    DOMElements.dockItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateToSection(section);
            
            // Add active class for visual feedback
            DOMElements.dockItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function navigateToSection(section) {
    // First, close any open modals
    closeStats();
    DOMElements.modals.completion.classList.remove('visible');
    DOMElements.modals.review.classList.remove('visible');
    
    // Hide all sections first
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    
    // Show the selected section
    switch(section) {
        case 'timer':
            document.getElementById('timer-section').classList.remove('hidden');
            document.getElementById('features-section').classList.remove('hidden');
            break;
        case 'todo':
            document.getElementById('timer-section').classList.remove('hidden');
            document.getElementById('features-section').classList.remove('hidden');
            // Scroll to todo section
            setTimeout(() => {
                document.getElementById('todo-container').scrollIntoView({ behavior: 'smooth' });
            }, 100);
            break;
        case 'journal':
            DOMElements.journal.section.classList.remove('hidden');
            break;
        case 'timetable':
            DOMElements.timetable.section.classList.remove('hidden');
            break;
        case 'stats':
            openStats();
            break;
        case 'settings':
            openStats();
            // Switch to settings tab
            setTimeout(() => switchTab('settings'), 100);
            break;
    }
}

// ===================================================================================
// EVENT LISTENERS SETUP
// ===================================================================================
function setupEventListeners() {
    // Timer controls
    DOMElements.playPauseBtn.addEventListener('click', () => { isRunning ? pauseTimer(false) : startTimer(false); });
    DOMElements.resetBtn.addEventListener('click', resetTimer);
    DOMElements.endSessionBtn.addEventListener('click', endSession);
    DOMElements.focusMode.playPauseBtn.addEventListener('click', () => { isRunning ? pauseTimer(false) : startTimer(false); });
    DOMElements.focusMode.exitBtn.addEventListener('click', () => { document.body.classList.remove('focus-mode'); });
    
    // Auth forms
    document.getElementById('signup-form').addEventListener('submit', handleSignUp);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); showSignupForm(); });
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Modal controls
    document.getElementById('statsBtn').addEventListener('click', openStats);
    document.getElementById('closeCompletionModalBtn').addEventListener('click', () => { DOMElements.modals.completion.classList.remove('visible'); });
    document.getElementById('closeReviewModalBtn').addEventListener('click', () => { DOMElements.modals.review.classList.remove('visible'); });
    document.querySelector('.close-btn').addEventListener('click', closeStats);
    
    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsToData);
    document.getElementById('clearDataBtn').addEventListener('click', () => {
        if (confirm("This will permanently delete ALL your data. Are you sure?")) {
            currentUserData = getDefaultUserData();
            if (isGuestMode) {
                localStorage.removeItem('youfloww_guest');
            } else if (userDataRef) {
                setDoc(userDataRef, currentUserData);
            }
            resetTimer();
            loadTodos();
            alert("All data has been cleared.");
        }
    });
    
    // Theme store
    document.querySelectorAll('.store-item button').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.parentElement;
            const type = item.dataset.type;
            const path = item.dataset.path || item.dataset.id;
            applyTheme(type, path);
        });
    });
    
    // YouTube background
    document.getElementById('setYoutubeBtn').addEventListener('click', () => {
        const url = document.getElementById('youtube-input').value;
        const videoId = getYoutubeVideoId(url);
        if (videoId) applyTheme('youtube', videoId);
        else alert("Please enter a valid YouTube URL.");
    });
    
    // Image background
    document.getElementById('uploadImageBtn').addEventListener('click', () => {
        document.getElementById('image-upload-input').click();
    });
    document.getElementById('image-upload-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.match('image.*')) {
            const reader = new FileReader();
            reader.onload = (event) => applyTheme('image', event.target.result);
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('clearImageBtn').addEventListener('click', () => {
        document.body.style.backgroundImage = '';
        if (currentUserData.theme) currentUserData.theme.backgroundPath = null;
        saveUserData();
    });
    
    // Ambient effects
    document.getElementById('snowBtn').addEventListener('click', () => { toggleAmbientEffect('snow'); });
    document.getElementById('rainBtn').addEventListener('click', () => { toggleAmbientEffect('rain'); });
    document.getElementById('sakuraBtn').addEventListener('click', () => { toggleAmbientEffect('sakura'); });
    
    // Focus mode
    document.getElementById('focusModeBtn').addEventListener('click', () => {
        document.body.classList.add('focus-mode');
        DOMElements.focusMode.timer.textContent = DOMElements.timerDisplay.textContent;
    });
    
    // White noise
    document.getElementById('noiseBtn').addEventListener('click', () => {
        if (DOMElements.sounds.whiteNoise.paused) {
            DOMElements.sounds.whiteNoise.play().catch(e => console.error("Audio play failed:", e));
            document.getElementById('noiseBtn').textContent = '🔇 Stop Noise';
        } else {
            DOMElements.sounds.whiteNoise.pause();
            document.getElementById('noiseBtn').textContent = '🎧 Play Noise';
        }
    });
    
    // Tabs in stats modal
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // To-Do List
    document.getElementById('add-todo-btn').addEventListener('click', addTodo);
    document.getElementById('todo-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addTodo();
        }
    });
    document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);
    
    // Journal
    DOMElements.journal.entry.addEventListener('input', updateCharCount);
    DOMElements.journal.saveBtn.addEventListener('click', saveJournalEntry);
    DOMElements.journal.imageUpload.addEventListener('change', handleImageUpload);
    document.getElementById('upload-image-btn').addEventListener('click', () => {
        DOMElements.journal.imageUpload.click();
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('visible');
        }
    });
    
    // Change name button
    document.getElementById('changeNameBtn').addEventListener('click', () => {
        const newName = prompt("Enter your name:", currentUserData.profileName || "Floww User");
        if (newName && newName.trim()) {
            currentUserData.profileName = newName.trim();
            DOMElements.profile.nameDisplay.textContent = newName.trim();
            saveUserData();
        }
    });
    
    // Progress widget
    updateCornerWidget();
    setInterval(updateCornerWidget, 60000);
}

// ===================================================================================
// HELPER FUNCTIONS
// ===================================================================================
function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const location = document.getElementById('signup-location').value;
    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            currentUserData = { ...getDefaultUserData(), settings: { ...getDefaultUserData().settings, soundProfile: location } };
            saveUserData();
        })
        .catch((error) => {
            DOMElements.authError.textContent = error.message;
        });
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, email, password)
        .catch((error) => {
            DOMElements.authError.textContent = error.message;
        });
}

function handleLogout() {
    signOut(auth).catch((error) => {
        console.error("Logout error:", error);
    });
}

function showLoginForm() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
}

function showSignupForm() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
}

function updateCornerWidget() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 0);
    
    const dayProgress = (now - startOfDay) / (endOfDay - startOfDay) * 100;
    const monthProgress = (now - startOfMonth) / (endOfMonth - startOfMonth) * 100;
    const yearProgress = (now - startOfYear) / (endOfYear - startOfYear) * 100;
    
    document.getElementById('dayProgressBar').style.width = `${dayProgress}%`;
    document.getElementById('monthProgressBar').style.width = `${monthProgress}%`;
    document.getElementById('yearProgressBar').style.width = `${yearProgress}%`;
    
    document.getElementById('dayProgressPercent').textContent = `${Math.round(dayProgress)}%`;
    document.getElementById('monthProgressPercent').textContent = `${Math.round(monthProgress)}%`;
    document.getElementById('yearProgressPercent').textContent = `${Math.round(yearProgress)}%`;
}

function getYoutubeVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
}

function applyTheme(type, path) {
    if (type === 'image') {
        document.body.style.backgroundImage = `url(${path})`;
        currentUserData.theme = { backgroundPath: path, youtubeVideoId: null };
    } else if (type === 'youtube') {
        document.body.style.backgroundImage = '';
        const container = document.getElementById('video-background-container');
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${path}?autoplay=1&mute=1&loop=1&playlist=${path}&controls=0&modestbranding=1&rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        currentUserData.theme = { backgroundPath: null, youtubeVideoId: path };
    }
    saveUserData();
}

function loadTheme() {
    if (currentUserData.theme) {
        if (currentUserData.theme.backgroundPath) {
            document.body.style.backgroundImage = `url(${currentUserData.theme.backgroundPath})`;
        } else if (currentUserData.theme.youtubeVideoId) {
            const container = document.getElementById('video-background-container');
            container.innerHTML = `<iframe src="https://www.youtube.com/embed/${currentUserData.theme.youtubeVideoId}?autoplay=1&mute=1&loop=1&playlist=${currentUserData.theme.youtubeVideoId}&controls=0&modestbranding=1&rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
    }
}

function toggleAmbientEffect(effect) {
    const btn = document.getElementById(`${effect}Btn`);
    if (effect === 'snow') {
        isSnowActive = !isSnowActive;
        btn.classList.toggle('active', isSnowActive);
        if (isSnowActive) spawnAmbientParticles(effect);
    } else if (effect === 'rain') {
        isRainActive = !isRainActive;
        btn.classList.toggle('active', isRainActive);
        if (isRainActive) spawnAmbientParticles(effect);
    } else if (effect === 'sakura') {
        isSakuraActive = !isSakuraActive;
        btn.classList.toggle('active', isSakuraActive);
        if (isSakuraActive) spawnAmbientParticles(effect);
    }
}

function spawnAmbientParticles(effect) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const particles = [];
    
    function animate() {
        const now = Date.now();
        if (effect === 'snow' && isSnowActive && now - lastSnowSpawn > SNOW_INTERVAL) {
            createParticle('snowflake');
            lastSnowSpawn = now;
        } else if (effect === 'rain' && isRainActive && now - lastRainSpawn > RAIN_INTERVAL) {
            createParticle('raindrop');
            lastRainSpawn = now;
        } else if (effect === 'sakura' && isSakuraActive && now - lastSakuraSpawn > SAKURA_INTERVAL) {
            createParticle('sakura');
            lastSakuraSpawn = now;
        }
        
        updateParticles();
        if (isSnowActive || isRainActive || isSakuraActive) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }
    
    function createParticle(type) {
        const particle = document.createElement('div');
        particle.className = `ambient-effect ${type}`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.opacity = Math.random() * 0.5 + 0.5;
        
        let fallTime, spinFall;
        if (type === 'snowflake') {
            particle.style.width = `${Math.random() * 10 + 5}px`;
            particle.style.height = particle.style.width;
            fallTime = Math.random() * 10 + 10;
            spinFall = Math.random() > 0.5;
        } else if (type === 'raindrop') {
            particle.style.height = `${Math.random() * 20 + 10}px`;
            fallTime = Math.random() * 2 + 1;
        } else if (type === 'sakura') {
            particle.style.width = `${Math.random() * 15 + 10}px`;
            particle.style.height = particle.style.width;
            fallTime = Math.random() * 15 + 10;
            spinFall = true;
        }
        
        particle.style.animation = `fall ${fallTime}s linear forwards${spinFall ? ', spinFall 20s linear infinite' : ''}`;
        DOMElements.ambientContainer.appendChild(particle);
        particles.push({ element: particle, born: Date.now(), lifetime: fallTime * 1000 });
    }
    
    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            if (Date.now() - particles[i].born > particles[i].lifetime) {
                DOMElements.ambientContainer.removeChild(particles[i].element);
                particles.splice(i, 1);
            }
        }
    }
    
    animate();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Container`).classList.add('active');
}

function renderCharts() {
    // Weekly focus chart
    const weeklyData = currentUserData.weeklyFocus || {};
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().slice(0, 10);
    }).reverse();
    
    const barCtx = document.getElementById('barChart').getContext('2d');
    if (window.barChartInstance) window.barChartInstance.destroy();
    window.barChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: last7Days.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' })),
            datasets: [{
                label: 'Focus Minutes',
                data: last7Days.map(d => weeklyData[d] || 0),
                backgroundColor: 'rgba(108, 99, 255, 0.7)',
                borderColor: 'rgba(108, 99, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } }
            }
        }
    });
    
    // Session distribution chart
    const sessionData = currentUserData.todos ? currentUserData.todos.reduce((acc, todo) => {
        if (todo.completed) acc.completed++;
        else acc.pending++;
        return acc;
    }, { completed: 0, pending: 0 }) : { completed: 0, pending: 0 };
    
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    if (window.pieChartInstance) window.pieChartInstance.destroy();
    window.pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Pending'],
            datasets: [{
                data: [sessionData.completed, sessionData.pending],
                backgroundColor: ['rgba(76, 175, 80, 0.7)', 'rgba(244, 67, 54, 0.7)'],
                borderColor: ['rgba(76, 175, 80, 1)', 'rgba(244, 67, 54, 1)'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: '#e0e0e0' }
                }
            }
        }
    });
}

// ===================================================================================
// INITIALIZATION
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    // Initialize the app state after DOM is loaded
    if (isGuestMode) {
        initializeAppState();
    }
});
