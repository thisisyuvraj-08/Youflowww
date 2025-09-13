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
    const SNOW_INTERVAL = 200, RAIN_INTERVAL = 50, SAKURA_INTERVAL = 500;

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
    let modelsLoaded = false; // Flag to check if face-api models are loaded

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
    onAuthStateChanged(auth, user => {
        if (user) {
            DOMElements.appContainer.classList.remove('hidden');
            DOMElements.authModal.classList.remove('visible');
            userDataRef = doc(db, "users", user.uid);
            loadUserData();
        } else {
            DOMElements.appContainer.classList.add('hidden');
            DOMElements.authModal.classList.add('visible');
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
            // This case handles a newly signed-up user who doesn't have a doc yet
            // The doc will be created by the signup function
            console.log("No user document found. A new one will be created on first data save.");
        }
        await initializeAppState();
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
        if (isAccountabilityOn || isSleepDetectionOn) showSessionReview();

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
        if (modelsLoaded) return;
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
        try {
            console.log("Loading FaceAPI models...");
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
            console.log("FaceAPI models loaded successfully.");
            modelsLoaded = true;
        } catch (error) {
            console.error("Error loading FaceAPI models:", error);
            alert("Could not load accountability models. Please check your connection and refresh.")
        }
    }

    async function startVideo() {
        try {
            if (DOMElements.video.srcObject) return; // Already running
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

    const EYE_AR_THRESH = 0.22; // Threshold for eye closure

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
        if (!modelsLoaded || !isRunning || DOMElements.video.paused || DOMElements.video.ended || !DOMElements.video.srcObject) return;

        const detections = await faceapi.detectAllFaces(DOMElements.video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 })).withFaceLandmarks(true);

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
        } else if (isSleepDetectionOn && !faceDetected) {
            // If sleep detection is on but no face is seen, treat it like accountability
            // This prevents gaming sleep detection by just leaving the screen
            if (!awayTimerStart) {
                awayTimerStart = Date.now();
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
    
    function showCompletionPopup() { DOMElements.modals.completion.classList.add('visible'); }
    function openStats() { DOMElements.modals.stats.classList.add('visible'); renderCharts(); updateStatsDisplay(); }
    function closeStats() { DOMElements.modals.stats.classList.remove('visible'); }
    function updateStatsDisplay() {
        const totalMinutes = currentUserData.totalFocusMinutes || 0;
        DOMElements.modals.totalFocusTime.textContent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        DOMElements.modals.totalSessionsCount.textContent = currentUserData.totalSessions || 0;
    }
    function showSessionReview() {
        if (!sessionStartTime || !isWorkSession) return;
        
        const totalDurationMs = Date.now() - sessionStartTime;
        // Finalize away time calculation
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

    function loadTodos() {
        const todos = currentUserData.todos || [];
        const todoList = document.getElementById('todo-list');
        todoList.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.innerHTML = `<input type="checkbox" id="todo-${index}" ${todo.completed ? 'checked' : ''}> <label for="todo-${index}">${todo.text}</label>`;
            li.querySelector('input').onchange = () => toggleTodo(index);
            todoList.appendChild(li);
        });
    }
    function addTodo() { const input = document.getElementById('todo-input'); if (input.value.trim()) { if (!currentUserData.todos) currentUserData.todos = []; currentUserData.todos.push({ text: input.value.trim(), completed: false }); saveUserData(); input.value = ''; loadTodos(); } }
    function toggleTodo(index) { if (currentUserData.todos[index]) { currentUserData.todos[index].completed = !currentUserData.todos[index].completed; saveUserData(); loadTodos(); } }
    function clearTodos() { if (confirm("Clear all tasks?")) { currentUserData.todos = []; saveUserData(); loadTodos(); } }
    
    function updateCornerWidget() {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayProgress = ((now - startOfDay) / 86400000) * 100;
        document.getElementById("dayProgressBar").style.width = `${dayProgress}%`;
        document.getElementById("dayProgressPercent").textContent = `${Math.floor(dayProgress)}%`;
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthProgress = (now.getDate() / endOfMonth.getDate()) * 100;
        document.getElementById("monthProgressBar").style.width = `${monthProgress}%`;
        document.getElementById("monthProgressPercent").textContent = `${Math.floor(monthProgress)}%`;
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const isLeap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
        const totalDaysInYear = isLeap ? 366 : 365;
        const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
        const yearProgress = (dayOfYear / totalDaysInYear) * 100;
        document.getElementById("yearProgressBar").style.width = `${yearProgress}%`;
        document.getElementById("yearProgressPercent").textContent = `${Math.floor(yearProgress)}%`;
    }

    function toggleFocusMode() { document.body.classList.toggle('focus-mode'); }
    
    function ambientLoop(timestamp) {
        if (isSnowActive && timestamp - lastSnowSpawn > SNOW_INTERVAL) { lastSnowSpawn = timestamp; createAndAnimateElement('snowflake', 8, 15, 'fall'); }
        if (isRainActive && timestamp - lastRainSpawn > RAIN_INTERVAL) { lastRainSpawn = timestamp; createAndAnimateElement('raindrop', 0.4, 0.8, 'fall'); }
        if (isSakuraActive && timestamp - lastSakuraSpawn > SAKURA_INTERVAL) { lastSakuraSpawn = timestamp; createAndAnimateElement('sakura', 15, 25, 'spinFall'); }
        if (isSnowActive || isRainActive || isSakuraActive) { animationFrameId = requestAnimationFrame(ambientLoop); } else { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    }
    function createAndAnimateElement(className, minDuration, maxDuration, animationName) {
        const el = document.createElement('div');
        el.className = `ambient-effect ${className}`;
        el.style.left = `${Math.random() * 100}vw`;
        el.style.animation = `${animationName} ${Math.random() * (maxDuration - minDuration) + minDuration}s linear forwards`;
        DOMElements.ambientContainer.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
    function toggleAmbience(type) {
        if (type === 'snow') isSnowActive = !isSnowActive;
        if (type === 'rain') isRainActive = !isRainActive;
        if (type === 'sakura') isSakuraActive = !isSakuraActive;
        document.getElementById(`${type}Btn`).classList.toggle('active');
        if (!animationFrameId && (isSnowActive || isRainActive || isSakuraActive)) {
            animationFrameId = requestAnimationFrame(ambientLoop);
        }
    }
    
    function getYoutubeVideoId(url) { return url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([^"&?/\s]{11})/) ?.[1] || null; }
    function setYoutubeBackground(videoId) { document.getElementById("video-background-container").innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3" frameborder="0" allow="autoplay"></iframe>`; document.body.style.backgroundImage = 'none'; }
    function applyBackgroundTheme(path) { document.body.style.backgroundImage = `url('${path}')`; document.getElementById("video-background-container").innerHTML = ''; }
    function loadTheme() { if (currentUserData.theme?.backgroundPath) applyBackgroundTheme(currentUserData.theme.backgroundPath); if (currentUserData.theme?.youtubeVideoId) setYoutubeBackground(currentUserData.theme.youtubeVideoId); }
    
    // ===================================================================================
    // EVENT LISTENERS
    // ===================================================================================
    function attachMainAppEventListeners() {
        // Timer
        DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
        DOMElements.resetBtn.addEventListener('click', resetTimer);
        DOMElements.endSessionBtn.addEventListener('click', endSession);

        // Header
        document.getElementById('changeNameBtn').addEventListener('click', () => { const newName = prompt("Enter new name:", currentUserData.profileName); if (newName && newName.trim()) { currentUserData.profileName = newName.trim(); saveUserData(); DOMElements.profile.nameDisplay.textContent = newName.trim(); } });
        document.getElementById('statsBtn').addEventListener('click', openStats);

        // Modals
        DOMElements.modals.stats.querySelector('.close-btn').addEventListener('click', closeStats);
        document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
        document.getElementById('closeReviewModalBtn').addEventListener('click', () => DOMElements.modals.review.classList.remove('visible'));
        document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
        
        // Features
        document.getElementById("noiseBtn").addEventListener('click', (e) => { const noise = DOMElements.sounds.whiteNoise; noise.paused ? noise.play() : noise.pause(); e.target.textContent = noise.paused ? "🎧 Play Noise" : "🎧 Stop Noise"; });
        document.getElementById("snowBtn").addEventListener('click', () => toggleAmbience('snow'));
        document.getElementById("rainBtn").addEventListener('click', () => toggleAmbience('rain'));
        document.getElementById("sakuraBtn").addEventListener('click', () => toggleAmbience('sakura'));
        
        // Focus Mode
        document.getElementById("focusModeBtn").addEventListener('click', toggleFocusMode);
        DOMElements.focusMode.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
        DOMElements.focusMode.exitBtn.addEventListener('click', toggleFocusMode);

        // To-Do List
        document.getElementById("add-todo-btn").addEventListener('click', addTodo);
        document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);
        document.getElementById('todo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

        // Settings
        document.getElementById("saveSettingsBtn").addEventListener('click', saveSettingsToData);
        DOMElements.settings.accountabilityToggle.addEventListener('change', (e) => { isAccountabilityOn = e.target.checked; if (isAccountabilityOn) startVideo(); else if (!isSleepDetectionOn) stopVideo(); });
        DOMElements.settings.sleepDetectionToggle.addEventListener('change', (e) => { isSleepDetectionOn = e.target.checked; if (isSleepDetectionOn) startVideo(); else if (!isAccountabilityOn) stopVideo(); });

        // Store / Themes
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

        // Profile / Danger Zone
        document.getElementById("clearDataBtn").addEventListener('click', async () => { if (confirm("DANGER: This will reset ALL your stats and settings permanently.")) { 
            const soundProfile = currentUserData.settings.soundProfile; // Preserve sound profile
            currentUserData = {
                profileName: "Floww User", totalFocusMinutes: 0, totalSessions: 0, streakCount: 0, lastStreakDate: null, weeklyFocus: {}, todos: [],
                settings: { workDuration: 25 * 60, shortBreakDuration: 5 * 60, longBreakDuration: 15 * 60, soundProfile: soundProfile },
                theme: { backgroundPath: null, youtubeVideoId: null }
            };
            await saveUserData();
            await initializeAppState();
            updateTimerDisplay();
        }});

        // Auth
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
                // Create a new user document in Firestore
                userDataRef = doc(db, "users", userCredential.user.uid);
                currentUserData = {
                    profileName: "Floww User",
                    totalFocusMinutes: 0,
                    totalSessions: 0,
                    streakCount: 0,
                    lastStreakDate: null,
                    weeklyFocus: {},
                    todos: [],
                    settings: {
                        workDuration: 25 * 60, // Default 25 mins
                        shortBreakDuration: 5 * 60,
                        longBreakDuration: 15 * 60,
                        soundProfile: location,
                        isAccountabilityOn: false,
                        isSleepDetectionOn: false,
                    },
                    theme: { backgroundPath: null, youtubeVideoId: null }
                };
                await setDoc(userDataRef, currentUserData);
                await initializeAppState();

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
        document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').classList.remove('hidden'); document.getElementById('signup-form').classList.add('hidden'); DOMElements.authError.textContent = ''; });
        document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').classList.remove('hidden'); document.getElementById('login-form').classList.add('hidden'); DOMElements.authError.textContent = ''; });

        // Global
        setInterval(updateCornerWidget, 30000);
    }
    
    function renderCharts() {
        const weeklyData = currentUserData.weeklyFocus || {};
        const today = new Date();
        const labels = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); return d.toLocaleDateString('en-US', { weekday: 'short' }); });
        const data = labels.map((_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); const key = d.toISOString().slice(0, 10); return (weeklyData[key] || 0) / 60; });
        const barCtx = document.getElementById('barChart').getContext('2d');
        if (window.myBarChart) window.myBarChart.destroy();
        window.myBarChart = new Chart(barCtx, { type: 'bar', data: { labels, datasets: [{ label: 'Daily Focus (hours)', data, backgroundColor: '#f7a047', borderRadius: 5 }] }, options: { maintainAspectRatio: false, responsive: true } });
        
        const totalFocus = currentUserData.totalFocusMinutes || 0;
        const totalSessions = currentUserData.totalSessions || 0;
        const totalBreak = totalSessions * ((currentUserData.settings?.shortBreakDuration || 300) / 60);
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if(window.myPieChart) window.myPieChart.destroy();
        window.myPieChart = new Chart(pieCtx, {type: 'pie', data: { labels: ['Work', 'Break'], datasets: [{ data: [totalFocus, totalBreak], backgroundColor: ['#f7a047', '#6c63ff'] }] }, options: { maintainAspectRatio: false, responsive: true }});
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Container`).classList.add('active');
    }
    
    // START THE APP
    attachMainAppEventListeners();
});

