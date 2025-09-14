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
    let modelsLoaded = false; 

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
        sleepStatusPrompt: document.getElementById('sleep-detection-prompt'),
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
            wakeupAlert: document.getElementById("wakeupAlertSound"),
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
        pip: {
            container: document.getElementById('pip-player-container'),
            header: document.getElementById('pip-player-header'),
            content: document.getElementById('pip-player-content'),
            input: document.getElementById('pip-youtube-input'),
            setBtn: document.getElementById('pip-set-btn'),
            closeBtn: document.getElementById('pip-close-btn')
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

    function playSound(type) {
        const profile = currentUserData.settings?.soundProfile;
        if (profile === 'off') return;
        const soundSet = DOMElements.sounds[profile]?.[type];
        if (soundSet?.length > 0) {
            soundSet[Math.floor(Math.random() * soundSet.length)].play().catch(console.error);
        }
    }

    function startTimer(isResume = false) {
        if (isRunning) return;
        isRunning = true;
        
        if (isWorkSession) {
            isResume ? DOMElements.sounds.resumeAlert.play() : playSound('start');
            activateCameraFeatures();
        }
        
        if (!sessionStartTime) sessionStartTime = Date.now();
        if (lastPauseTimestamp) {
            totalAwayTime += Date.now() - lastPauseTimestamp;
            lastPauseTimestamp = null;
        }

        const endTime = Date.now() + timeLeft * 1000;
        updateUIState();

        timerInterval = setInterval(() => {
            timeLeft = Math.round((endTime - Date.now()) / 1000);
            if (timeLeft <= 0) {
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
            deactivateCameraFeatures();
        } else {
            pauseWasManual = false;
        }
        lastPauseTimestamp = Date.now();
        updateUIState();
    }
    
    function resetTimer() {
        clearInterval(timerInterval);
        deactivateCameraFeatures();
        isRunning = false;
        isWorkSession = true;
        sessionCount = 0;
        timeLeft = workDuration;
        sessionStartTime = totalAwayTime = lastPauseTimestamp = null;
        updateTimerDisplay();
        updateUIState();
    }

    function endSession() {
        const focusedSeconds = workDuration - timeLeft;
        handleEndOfWorkSession(Math.floor(focusedSeconds / 60));
        if (isAccountabilityOn || isSleepDetectionOn) showSessionReview();
        resetTimer();
    }

    function handleSessionCompletion() {
        clearInterval(timerInterval);
        timeLeft = 0;
        updateTimerDisplay();
        isRunning = false;

        if (isWorkSession) {
            handleEndOfWorkSession(Math.floor(workDuration / 60));
            showCompletionPopup();
            if (isAccountabilityOn || isSleepDetectionOn) showSessionReview();
            sessionCount++;
            isWorkSession = false;
            timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
        } else {
            isWorkSession = true;
            timeLeft = workDuration;
        }
        
        sessionStartTime = totalAwayTime = lastPauseTimestamp = null;
        updateUIState();
        startTimer(); // Auto-start next session
    }

    function handleEndOfWorkSession(minutesFocused) {
        deactivateCameraFeatures();
        if (minutesFocused > 0) {
            currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
            currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
        }
        if (minutesFocused > 0) {
            playSound(minutesFocused >= 20 ? 'good' : 'bad');
        }
        saveUserData();
    }
    
    // ===================================================================================
    // ACCOUNTABILITY AI (FACE-API.JS)
    // ===================================================================================
    async function loadFaceApiModels() {
        if (modelsLoaded || typeof faceapi === 'undefined') return;
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
            modelsLoaded = true;
        } catch (error) { 
            console.error("Error loading FaceAPI models:", error);
            alert("Could not load accountability models. Please refresh.");
        }
    }

    async function activateCameraFeatures() {
        if (!isWorkSession || (!isAccountabilityOn && !isSleepDetectionOn)) return;
        
        if (!DOMElements.video.srcObject) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
                DOMElements.video.srcObject = stream;
                await new Promise(resolve => DOMElements.video.onloadedmetadata = resolve);
                DOMElements.video.play();
            } catch (err) {
                alert("Camera access is required. Please allow access and restart the session.");
                return;
            }
        }
        startFaceDetection();
    }
    
    function deactivateCameraFeatures() {
        stopFaceDetection();
        if (DOMElements.video.srcObject) {
            DOMElements.video.srcObject.getTracks().forEach(track => track.stop());
            DOMElements.video.srcObject = null;
        }
    }

    function startFaceDetection() {
        if (!faceApiInterval && modelsLoaded) {
            faceApiInterval = setInterval(handleFaceDetection, 1000); // Check every second
        }
    }

    function stopFaceDetection() {
        clearInterval(faceApiInterval);
        faceApiInterval = null;
        DOMElements.faceStatusPrompt.classList.remove('visible');
        DOMElements.sleepStatusPrompt.classList.remove('visible');
        awayTimerStart = null;
        eyesClosedTimerStart = null;
    }

    const EYE_AR_THRESH = 0.22;
    const getEyeAspectRatio = (landmarks) => {
        const eyeAR = (eye) => (faceapi.euclideanDistance([eye[1].x,eye[1].y], [eye[5].x,eye[5].y]) + faceapi.euclideanDistance([eye[2].x,eye[2].y], [eye[4].x,eye[4].y])) / (2.0 * faceapi.euclideanDistance([eye[0].x,eye[0].y], [eye[3].x,eye[3].y]));
        return (eyeAR(landmarks.getLeftEye()) + eyeAR(landmarks.getRightEye())) / 2.0;
    }

    async function handleFaceDetection() {
        if (!isRunning || !DOMElements.video.srcObject || DOMElements.video.paused) return;
        
        const detection = await faceapi.detectSingleFace(DOMElements.video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);

        // --- Accountability Logic ---
        if (isAccountabilityOn && !detection) {
            if (!awayTimerStart) awayTimerStart = Date.now();
            DOMElements.faceStatusPrompt.textContent = "Are you there? Timer will pause soon...";
            DOMElements.faceStatusPrompt.classList.add('visible');
            if (Date.now() - awayTimerStart > 15000) {
                pauseTimer(true);
                DOMElements.faceStatusPrompt.textContent = "Timer paused. Come back to resume.";
            }
            return; // Exit here if no face detected and accountability is on
        }
        
        // --- Sleep Detection Logic (only runs if face is visible) ---
        if (isSleepDetectionOn) {
            if (!detection) {
                DOMElements.sleepStatusPrompt.classList.add('visible');
                eyesClosedTimerStart = null; // Reset sleep timer if face is lost
            } else {
                DOMElements.sleepStatusPrompt.classList.remove('visible');
                const ear = getEyeAspectRatio(detection.landmarks);
                if (ear < EYE_AR_THRESH) {
                    if (!eyesClosedTimerStart) eyesClosedTimerStart = Date.now();
                    DOMElements.faceStatusPrompt.textContent = "Feeling sleepy? Timer will pause...";
                    DOMElements.faceStatusPrompt.classList.add('visible');
                    if (Date.now() - eyesClosedTimerStart > 10000 && isRunning) {
                        DOMElements.sounds.wakeupAlert.play();
                        pauseTimer(true);
                        DOMElements.faceStatusPrompt.textContent = "Timer paused. Open your eyes to resume!";
                    }
                } else {
                    eyesClosedTimerStart = null;
                     // Only hide the prompt if accountability isn't showing its own message
                    if (!awayTimerStart) {
                        DOMElements.faceStatusPrompt.classList.remove('visible');
                    }
                }
            }
        }

        // --- Resume Logic ---
        if (detection) {
            awayTimerStart = null;
            if (isAccountabilityOn && !eyesClosedTimerStart) {
                 DOMElements.faceStatusPrompt.classList.remove('visible');
            }
            if (!isRunning && !pauseWasManual) {
                startTimer(true);
            }
        }
    }
    
    // ===================================================================================
    // INITIALIZATION & UI LOGIC
    // ===================================================================================
    async function initializeAppState() {
        loadSettingsFromData();
        resetTimer();
        DOMElements.profile.nameDisplay.textContent = currentUserData.profileName || "Floww User";
        loadFaceApiModels();
        loadTodos();
        updateCornerWidget();
        loadTheme();
    }
    
    function loadSettingsFromData() {
        const s = currentUserData.settings || {};
        workDuration = s.workDuration || 25 * 60;
        shortBreakDuration = s.shortBreakDuration || 5 * 60;
        longBreakDuration = s.longBreakDuration || 15 * 60;
        isAccountabilityOn = s.isAccountabilityOn || false;
        isSleepDetectionOn = s.isSleepDetectionOn || false;

        document.getElementById('work-duration').value = workDuration / 60;
        document.getElementById('short-break-duration').value = shortBreakDuration / 60;
        document.getElementById('long-break-duration').value = longBreakDuration / 60;
        DOMElements.settings.soundEffects.value = s.soundProfile || 'indian';
        DOMElements.settings.accountabilityToggle.checked = isAccountabilityOn;
        DOMElements.settings.sleepDetectionToggle.checked = isSleepDetectionOn;
    }

    function saveSettingsToData() {
        const newWork = parseInt(document.getElementById('work-duration').value, 10);
        const newShort = parseInt(document.getElementById('short-break-duration').value, 10);
        const newLong = parseInt(document.getElementById('long-break-duration').value, 10);

        if (isNaN(newWork) || isNaN(newShort) || isNaN(newLong) || newWork < 1 || newShort < 1 || newLong < 1) {
            alert("Please enter valid numbers for all durations.");
            return;
        }

        currentUserData.settings = {
            workDuration: newWork * 60,
            shortBreakDuration: newShort * 60,
            longBreakDuration: newLong * 60,
            soundProfile: DOMElements.settings.soundEffects.value,
            isAccountabilityOn: DOMElements.settings.accountabilityToggle.checked,
            isSleepDetectionOn: DOMElements.settings.sleepDetectionToggle.checked,
        };
        saveUserData();
        loadSettingsFromData();
        if (!isRunning) resetTimer();
        alert("Settings saved!");
    }

    function showCompletionPopup() { DOMElements.modals.completion.classList.add('visible'); }
    function openStats() { DOMElements.modals.stats.classList.add('visible'); renderCharts(); updateStatsDisplay(); }
    function closeStats() { DOMElements.modals.stats.classList.remove('visible'); }
    
    function updateStatsDisplay() {
        const totalMinutes = currentUserData.totalFocusMinutes || 0;
        document.getElementById("totalFocusTime").textContent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        document.getElementById("totalSessionsCount").textContent = currentUserData.totalSessions || 0;
    }

    function showSessionReview() {
        if (!sessionStartTime || !isWorkSession) return;
        const totalMs = Date.now() - sessionStartTime;
        const awayMs = totalAwayTime + (lastPauseTimestamp ? Date.now() - lastPauseTimestamp : 0);
        const focusMs = Math.max(0, totalMs - awayMs);
        const format = (ms) => `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
        document.getElementById('reviewFocusTime').textContent = format(focusMs);
        document.getElementById('reviewAwayTime').textContent = format(awayMs);
        document.getElementById('reviewTotalDuration').textContent = format(totalMs);
        DOMElements.modals.review.classList.add('visible');
    }

    function loadTodos() {
        const todoList = document.getElementById('todo-list');
        todoList.innerHTML = '';
        (currentUserData.todos || []).forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.innerHTML = `<input type="checkbox" id="todo-${index}" ${todo.completed ? 'checked' : ''}> <label for="todo-${index}">${todo.text}</label>`;
            li.querySelector('input').onchange = () => toggleTodo(index);
            todoList.appendChild(li);
        });
    }
    function addTodo() { const input = document.getElementById('todo-input'); if (input.value.trim()) { currentUserData.todos = [...(currentUserData.todos || []), { text: input.value.trim(), completed: false }]; saveUserData(); input.value = ''; loadTodos(); } }
    function toggleTodo(index) { currentUserData.todos[index].completed = !currentUserData.todos[index].completed; saveUserData(); }
    function clearTodos() { if (confirm("Clear all tasks?")) { currentUserData.todos = []; saveUserData(); loadTodos(); } }
    
    function updateCornerWidget() {
        const now = new Date();
        const dayProgress = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 864;
        document.getElementById("dayProgressBar").style.width = `${dayProgress}%`;
        document.getElementById("dayProgressPercent").textContent = `${Math.floor(dayProgress)}%`;
    }

    function toggleFocusMode() { document.body.classList.toggle('focus-mode'); }

    function ambientLoop(timestamp) {
        if (isSnowActive && timestamp - lastSnowSpawn > SNOW_INTERVAL) { lastSnowSpawn = timestamp; createAndAnimateElement('snowflake'); }
        if (isRainActive && timestamp - lastRainSpawn > RAIN_INTERVAL) { lastRainSpawn = timestamp; createAndAnimateElement('raindrop'); }
        if (isSakuraActive && timestamp - lastSakuraSpawn > SAKURA_INTERVAL) { lastSakuraSpawn = timestamp; createAndAnimateElement('sakura'); }
        animationFrameId = requestAnimationFrame(ambientLoop);
    }
    function createAndAnimateElement(className) {
        const el = document.createElement('div');
        el.className = `ambient-effect ${className}`;
        el.style.left = `${Math.random() * 100}vw`;
        el.style.animationDuration = `${Math.random() * 5 + 5}s`;
        DOMElements.ambientContainer.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
    function toggleAmbience(type) {
        if (type === 'snow') isSnowActive = !isSnowActive;
        if (type === 'rain') isRainActive = !isRainActive;
        if (type === 'sakura') isSakuraActive = !isSakuraActive;
        document.getElementById(`${type}Btn`).classList.toggle('active');
        if ((isSnowActive || isRainActive || isSakuraActive) && !animationFrameId) {
            animationFrameId = requestAnimationFrame(ambientLoop);
        } else if (!isSnowActive && !isRainActive && !isSakuraActive) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function getYoutubeVideoId(url) { return url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([^"&?/\s]{11})/) ?.[1] || null; }
    function setYoutubeBackground(videoId) { document.getElementById("video-background-container").innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0" frameborder="0" allow="autoplay"></iframe>`; document.body.style.backgroundImage = 'none'; }
    function applyBackgroundTheme(path) { document.body.style.backgroundImage = `url('${path}')`; document.getElementById("video-background-container").innerHTML = ''; }
    function loadTheme() { if (currentUserData.theme?.backgroundPath) applyBackgroundTheme(currentUserData.theme.backgroundPath); if (currentUserData.theme?.youtubeVideoId) setYoutubeBackground(currentUserData.theme.youtubeVideoId); }
    
    // ===================================================================================
    // EVENT LISTENERS & HELPERS
    // ===================================================================================
    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tabName}Container`).classList.add('active');
    }

    function setupPipPlayer() {
        let isDragging = false, offsetX, offsetY;
        DOMElements.pip.header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - DOMElements.pip.container.offsetLeft;
            offsetY = e.clientY - DOMElements.pip.container.offsetTop;
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                DOMElements.pip.container.style.left = `${e.clientX - offsetX}px`;
                DOMElements.pip.container.style.top = `${e.clientY - offsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => isDragging = false);
        DOMElements.pip.setBtn.addEventListener('click', () => {
            const videoId = getYoutubeVideoId(DOMElements.pip.input.value);
            if (videoId) {
                DOMElements.pip.content.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
                DOMElements.pip.input.value = '';
            } else {
                alert("Invalid YouTube URL");
            }
        });
    }

    function attachEventListeners() {
        DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
        DOMElements.resetBtn.addEventListener('click', resetTimer);
        DOMElements.endSessionBtn.addEventListener('click', endSession);
        
        document.getElementById('statsBtn').addEventListener('click', openStats);
        document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('visible')));
        document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
        
        document.getElementById("saveSettingsBtn").addEventListener('click', saveSettingsToData);
        document.getElementById('pipYoutubeBtn').addEventListener('click', () => DOMElements.pip.container.classList.remove('hidden'));
        DOMElements.pip.closeBtn.addEventListener('click', () => DOMElements.pip.container.classList.add('hidden'));

        document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab)));
        
        document.getElementById("noiseBtn").addEventListener('click', (e) => { const noise = DOMElements.sounds.whiteNoise; noise.paused ? noise.play() : noise.pause(); e.target.textContent = noise.paused ? "🎧 Play Noise" : "🎧 Stop Noise"; });
        document.getElementById("snowBtn").addEventListener('click', () => toggleAmbience('snow'));
        document.getElementById("rainBtn").addEventListener('click', () => toggleAmbience('rain'));
        document.getElementById("sakuraBtn").addEventListener('click', () => toggleAmbience('sakura'));
        
        document.getElementById("focusModeBtn").addEventListener('click', toggleFocusMode);
        DOMElements.focusMode.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
        DOMElements.focusMode.exitBtn.addEventListener('click', toggleFocusMode);
        
        document.getElementById("add-todo-btn").addEventListener('click', addTodo);
        document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);

        document.getElementById("changeNameBtn").addEventListener('click', () => {
            const newName = prompt("Enter new name", currentUserData.profileName || "Floww User");
            if (newName && newName.trim()) {
                currentUserData.profileName = newName.trim();
                saveUserData();
                DOMElements.profile.nameDisplay.textContent = newName.trim();
            }
        });

        document.getElementById("clearDataBtn").addEventListener('click', async () => { if (confirm("DANGER: This will reset ALL your stats and settings permanently.")) { 
            const preservedSettings = { soundProfile: currentUserData.settings?.soundProfile || 'indian' };
            currentUserData = {
                profileName: "Floww User", totalFocusMinutes: 0, totalSessions: 0, todos: [],
                settings: { workDuration: 25 * 60, shortBreakDuration: 5 * 60, longBreakDuration: 15 * 60, ...preservedSettings },
            };
            await saveUserData();
            await initializeAppState();
        }});
        
        // Auth
        document.getElementById('signup-form').addEventListener('submit', async (e) => { 
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const location = document.getElementById('signup-location').value;
            if (!location) { DOMElements.authError.textContent = 'Please select a location.'; return; }
            DOMElements.authError.textContent = '';
            try { 
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                userDataRef = doc(db, "users", cred.user.uid);
                currentUserData = { profileName: "Floww User", settings: { workDuration: 25 * 60, shortBreakDuration: 5 * 60, longBreakDuration: 15 * 60, soundProfile: location }};
                await setDoc(userDataRef, currentUserData);
            } catch (error) { DOMElements.authError.textContent = error.message; } 
        });
        document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault(); DOMElements.authError.textContent = ''; try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch (error) { DOMElements.authError.textContent = error.message; } });
        document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
        document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').classList.remove('hidden'); document.getElementById('signup-form').classList.add('hidden'); });
        document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').classList.remove('hidden'); document.getElementById('login-form').classList.add('hidden'); });

        setInterval(updateCornerWidget, 60000);
    }
    
    function renderCharts() {
        const barCtx = document.getElementById('barChart').getContext('2d');
        if (window.myBarChart) window.myBarChart.destroy();
        // Chart rendering logic here...

        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if(window.myPieChart) window.myPieChart.destroy();
        // Chart rendering logic here...
    }

    // START THE APP
    attachEventListeners();
    setupPipPlayer();
});

