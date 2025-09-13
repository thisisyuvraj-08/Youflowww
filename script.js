// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

document.addEventListener('DOMContentLoaded', () => {

    // ===================================================================================
    // FIREBASE INITIALIZATION
    // ===================================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyBCi5Ea0r2c9tdgk_6RnpSuqDV5CE3nGbo",
        authDomain: "youfloww2.firebaseapp.com",
        projectId: "youfloww2",
        storageBucket: "youfloww2.firebasestorage.app",
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
    
    // AMBIENCE STATE
    let animationFrameId = null;
    let isSnowActive = false, isRainActive = false, isSakuraActive = false;
    let lastSnowSpawn = 0, lastRainSpawn = 0, lastSakuraSpawn = 0;

    // ACCOUNTABILITY AI STATE
    const faceapi = window.faceapi;
    let faceApiInterval = null;
    let isAccountabilityOn = false;
    let isSleepDetectionOn = false;
    let awayTimerStart = null;
    let eyesClosedTimerStart = null;
    let sessionStartTime = null;
    let totalAwayTime = 0;
    let lastPauseTimestamp = null;
    let pauseWasManual = true;

    // ===================================================================================
    // DOM ELEMENTS CACHE
    // ===================================================================================
    const DOMElements = {
        video: document.getElementById("video"),
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
        focusMode: { /* ... */ },
        modals: {
            stats: document.getElementById("statsModal"),
            completion: document.getElementById("completionModal"),
            review: document.getElementById("reviewModal"),
            totalFocusTime: document.getElementById("totalFocusTime"),
            totalSessionsCount: document.getElementById("totalSessionsCount"),
        },
        profile: { /* ... */ },
        streak: { /* ... */ },
        settings: {
            soundEffects: document.getElementById('sound-effects-select'),
            accountabilityToggle: document.getElementById('accountability-toggle'),
            sleepDetectionToggle: document.getElementById('sleep-detection-toggle'),
        },
        sounds: {
            whiteNoise: document.getElementById("whiteNoise"),
            pauseAlert: document.getElementById("pauseAlertSound"),
            resumeAlert: document.getElementById("resumeAlertSound"),
            // Sound sets will be dynamically selected
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
    onAuthStateChanged(auth, user => {
        if (user) {
            DOMElements.appContainer.classList.remove('hidden');
            DOMElements.authModal.classList.remove('visible');
            userDataRef = doc(db, "users", user.uid);
            loadUserData();
        } else {
            DOMElements.appContainer.classList.add('hidden');
            DOMElements.authModal.add('visible');
            if (timerInterval) clearInterval(timerInterval);
            isRunning = false;
        }
    });

    async function loadUserData() {
        if (!userDataRef) return;
        const docSnap = await getDoc(userDataRef);
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
        } else {
            currentUserData = {
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
                    soundProfile: 'indian',
                    isAccountabilityOn: false,
                    isSleepDetectionOn: false,
                },
                theme: { backgroundPath: null, youtubeVideoId: null }
            };
            await setDoc(userDataRef, currentUserData);
        }
        initializeAppState();
    }

    async function saveUserData() {
        if (userDataRef) {
            try {
                await setDoc(userDataRef, currentUserData, { merge: true });
            } catch (error) { console.error("Error saving user data: ", error); }
        }
    }

    // ===================================================================================
    // CORE TIMER LOGIC
    // ===================================================================================
    function updateTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        DOMElements.timerDisplay.textContent = timeString;
        document.title = isRunning ? `${timeString} - YouFloww` : 'YouFloww';
    }

    function updateUIState() {
        DOMElements.statusDisplay.textContent = isWorkSession ? "Work Session" : "Break Time";
        DOMElements.playIcon.classList.toggle('hidden', isRunning);
        DOMElements.pauseIcon.classList.toggle('hidden', !isRunning);
        DOMElements.resetBtn.disabled = isRunning;
        DOMElements.endSessionBtn.disabled = !isRunning;
    }

    function playRandomSound(type) {
        const soundProfile = currentUserData.settings?.soundProfile;
        if (soundProfile === 'off') return;

        let soundSet;
        if (soundProfile === 'indian') soundSet = DOMElements.sounds.indian[type];
        else if (soundProfile === 'non-indian') soundSet = DOMElements.sounds.nonIndian[type];

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

        if (isAccountabilityOn || isSleepDetectionOn) {
            startFaceDetection();
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
        if(!isAuto) {
            pauseWasManual = true;
            DOMElements.sounds.pauseAlert.play();
            stopFaceDetection(); // Stop detection on manual pause
        } else {
            pauseWasManual = false;
        }
        lastPauseTimestamp = Date.now();
        updateUIState();
    }

    function resetTimer() {
        clearInterval(timerInterval);
        stopFaceDetection();
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
        showSessionReview();

        sessionCount++;
        isWorkSession = false;
        timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
        sessionStartTime = null; // Reset for break
        totalAwayTime = 0;
        
        updateTimerDisplay();
        updateUIState();
        startTimer(); // Auto-start next session (break)
    }

    function handleEndOfWorkSession(minutesFocused, sessionCompleted) {
        stopFaceDetection();
        if (minutesFocused > 0) {
            currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
            currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
            const today = new Date().toISOString().slice(0, 10);
            if (!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
            currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;
            
            if (sessionCompleted && workDuration / 60 >= 25) { /* updateStreak(); */ }
        }
        
        if (minutesFocused >= 20) playRandomSound('good');
        else if(minutesFocused > 0) playRandomSound('bad');

        saveUserData();
    }
    
    // ===================================================================================
    // ACCOUNTABILITY AI (FACE-API.JS)
    // ===================================================================================
    async function loadFaceApiModels() {
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
            console.log("FaceAPI models loaded.");
        } catch (error) {
            console.error("Error loading FaceAPI models:", error);
        }
    }

    async function startVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
            DOMElements.video.srcObject = stream;
        } catch (err) {
            console.error("Camera access denied:", err);
            alert("Camera access is required for Accountability features. Please allow access and refresh.");
            // Turn off toggles if permission denied
            DOMElements.settings.accountabilityToggle.checked = false;
            DOMElements.settings.sleepDetectionToggle.checked = false;
            isAccountabilityOn = false;
            isSleepDetectionOn = false;
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
            faceApiInterval = setInterval(handleFaceDetection, 500); // Check every 500ms
        }
    }

    function stopFaceDetection() {
        clearInterval(faceApiInterval);
        faceApiInterval = null;
        hideFaceStatusPrompt();
        awayTimerStart = null;
        eyesClosedTimerStart = null;
    }

    const EYE_AR_THRESH = 0.2; // Threshold for eye closure

    function getEyeAspectRatio(landmarks) {
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        const eyeAR = (eye) => {
            const A = faceapi.euclideanDistance([eye[1].x, eye[1].y], [eye[5].x, eye[5].y]);
            const B = faceapi.euclideanDistance([eye[2].x, eye[2].y], [eye[4].x, eye[4].y]);
            const C = faceapi.euclideanDistance([eye[0].x, eye[0].y], [eye[3].x, eye[3].y]);
            return (A + B) / (2.0 * C);
        };
        return (eyeAR(leftEye) + eyeAR(rightEye)) / 2.0;
    }

    async function handleFaceDetection() {
        if (!isRunning || DOMElements.video.paused || DOMElements.video.ended) return;

        const detections = await faceapi.detectAllFaces(DOMElements.video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);

        const faceDetected = detections.length > 0;

        // Accountability Partner Logic
        if (isAccountabilityOn) {
            if (!faceDetected) {
                if (!awayTimerStart) {
                    awayTimerStart = Date.now();
                    showFaceStatusPrompt("Are you there? Timer will pause soon...");
                } else if (Date.now() - awayTimerStart > 15000) {
                    pauseTimer(true); // Auto-pause
                    showFaceStatusPrompt("Timer paused. Come back to resume.");
                }
            } else {
                if (awayTimerStart) { // User returned
                    awayTimerStart = null;
                    hideFaceStatusPrompt();
                    if (!isRunning && !pauseWasManual) startTimer(true); // Auto-resume
                }
            }
        }
        
        // Sleep Detection Logic
        if (isSleepDetectionOn && faceDetected) {
            const ear = getEyeAspectRatio(detections[0].landmarks);
            if (ear < EYE_AR_THRESH) {
                 if (!eyesClosedTimerStart) {
                    eyesClosedTimerStart = Date.now();
                    showFaceStatusPrompt("Feeling sleepy? Timer will pause.");
                } else if (Date.now() - eyesClosedTimerStart > 10000) {
                    pauseTimer(true); // Auto-pause for sleep
                    showFaceStatusPrompt("Timer paused due to inactivity.");
                }
            } else {
                if (eyesClosedTimerStart) {
                    eyesClosedTimerStart = null;
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
    // UI, POPUPS, THEMES, HELPERS
    // ===================================================================================
    function showCompletionPopup() {
        DOMElements.modals.completion.classList.add('visible');
    }
    
    function showSessionReview() {
        if (!sessionStartTime || !isWorkSession) return;
        
        const totalDurationMs = Date.now() - sessionStartTime;
        const awayTimeMs = totalAwayTime + (lastPauseTimestamp ? Date.now() - lastPauseTimestamp : 0);
        const focusTimeMs = totalDurationMs - awayTimeMs;

        const formatMs = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}m ${seconds}s`;
        };

        document.getElementById('reviewFocusTime').textContent = formatMs(focusTimeMs);
        document.getElementById('reviewAwayTime').textContent = formatMs(awayTimeMs);
        document.getElementById('reviewTotalDuration').textContent = formatMs(totalDurationMs);

        DOMElements.modals.review.classList.add('visible');
    }


    function initializeAppState() {
        loadSettingsFromData();
        updateTimerDisplay();
        updateUIState();
        // Other initializations...
        loadFaceApiModels();
    }

    function loadSettingsFromData() {
        const settings = currentUserData.settings || {};
        workDuration = settings.workDuration || 25 * 60;
        shortBreakDuration = settings.shortBreakDuration || 5 * 60;
        longBreakDuration = settings.longBreakDuration || 15 * 60;
        if (!isRunning) timeLeft = workDuration;

        // Update UI from saved data
        document.getElementById('work-duration').value = workDuration / 60;
        document.getElementById('short-break-duration').value = shortBreakDuration / 60;
        document.getElementById('long-break-duration').value = longBreakDuration / 60;
        DOMElements.settings.soundEffects.value = settings.soundProfile || 'indian';
        DOMElements.settings.accountabilityToggle.checked = settings.isAccountabilityOn || false;
        DOMElements.settings.sleepDetectionToggle.checked = settings.isSleepDetectionOn || false;

        isAccountabilityOn = settings.isAccountabilityOn || false;
        isSleepDetectionOn = settings.isSleepDetectionOn || false;
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
            
            saveUserData();
            loadSettingsFromData();
            if (!isRunning) resetTimer();
            alert("Settings saved!");
        } else {
            alert("Please enter valid numbers for all durations.");
        }
    }
    
    function attachMainAppEventListeners() {
        // Timer controls
        DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
        DOMElements.resetBtn.addEventListener('click', resetTimer);
        DOMElements.endSessionBtn.addEventListener('click', endSession);

        // Settings controls
        document.getElementById("saveSettingsBtn").addEventListener('click', saveSettingsToData);
        DOMElements.settings.accountabilityToggle.addEventListener('change', (e) => {
            isAccountabilityOn = e.target.checked;
            if (isAccountabilityOn) startVideo(); else if (!isSleepDetectionOn) stopVideo();
        });
        DOMElements.settings.sleepDetectionToggle.addEventListener('change', (e) => {
            isSleepDetectionOn = e.target.checked;
            if (isSleepDetectionOn) startVideo(); else if (!isAccountabilityOn) stopVideo();
        });

        // Modals
        document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
        document.getElementById('closeReviewModalBtn').addEventListener('click', () => DOMElements.modals.review.classList.remove('visible'));

        // Auth
        document.getElementById('signup-form').addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            DOMElements.authError.textContent = ''; 
            const email = document.getElementById('signup-email').value; 
            const password = document.getElementById('signup-password').value; 
            try { 
                await createUserWithEmailAndPassword(auth, email, password); 
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
        document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
        document.getElementById('show-login').addEventListener('click', (e) => { 
            e.preventDefault(); 
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('signup-form').classList.add('hidden');
            DOMElements.authError.textContent = '';
        });
        document.getElementById('show-signup').addEventListener('click', (e) => { 
            e.preventDefault(); 
            document.getElementById('signup-form').classList.remove('hidden');
            document.getElementById('login-form').classList.add('hidden');
            DOMElements.authError.textContent = '';
        });
    }
    
    attachMainAppEventListeners();
});

