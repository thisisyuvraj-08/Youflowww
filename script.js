// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

// ===================================================================================
// FIREBASE INITIALIZATION
// ===================================================================================
const firebaseConfig = {
    apiKey: "AIzaSyDG1vbcNcWrgFJmYfjpXTBiLQyurT0dbmw",
    authDomain: "youfloww.firebaseapp.com",
    projectId: "youfloww",
    storageBucket: "youfloww.appspot.com",
    messagingSenderId: "905093243857",
    appId: "1:905093243857:web:0419862992ab35d26ab6f0",
    measurementId: "G-V3CLSWYVTF"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
let currentUserData = {};
let userDataRef = null;

document.addEventListener('DOMContentLoaded', () => {

    // ===================================================================================
    // GLOBAL STATE & VARIABLES
    // ===================================================================================
    let timerInterval, isRunning = false, isWorkSession = true, sessionCount = 0;
    let endTime = 0, timeLeft;
    let workDuration, shortBreakDuration, longBreakDuration;
    let awayStart = null, sleepStart = null;
    let totalAwayTime = 0, totalSleepTime = 0;
    let faceDetectionActive = false, sleepDetectionActive = false;
    let lastFaceDetected = Date.now();
    let lastEyesOpen = Date.now();

    // TF.js Face Landmarks Model
    let faceModel = null, detectionVideo = null, detectionInterval = null;

    // ===================================================================================
    // DOM ELEMENTS CACHE
    // ===================================================================================
    const DOMElements = {
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
            totalFocusTime: document.getElementById("totalFocusTime"),
            totalSessionsCount: document.getElementById("totalSessionsCount"),
            review: document.getElementById("reviewModal"),
        },
        profile: {
            nameDisplay: document.getElementById("profileNameDisplay"),
        },
        streak: {
            count: document.getElementById("streak-count"),
        },
        sounds: {
            whiteNoise: document.getElementById("whiteNoise"),
            start: document.querySelectorAll('.start-sound'),
            goodMeme: document.querySelectorAll('.good-meme'),
            badMeme: document.querySelectorAll('.bad-meme'),
            pauseAlert: document.getElementById("pauseAlertSound"),
            resumeAlert: document.getElementById("resumeAlertSound"),
            startInt: document.querySelectorAll('.start-sound-int'),
            goodMemeInt: document.querySelectorAll('.good-meme-int'),
            badMemeInt: document.querySelectorAll('.bad-meme-int'),
        }
    };

    // ===================================================================================
    // FIREBASE AUTHENTICATION & DATA HANDLING
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
            currentUserData = {};
            userDataRef = null;
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
                    soundRegion: "indian",
                    soundEffects: true,
                    accountability: false,
                    sleepDetection: false,
                },
                theme: { backgroundPath: null, youtubeVideoId: null, }
            };
            await setDoc(userDataRef, currentUserData);
        }
        initializeAppState();
    }
    async function saveUserData() {
        if (userDataRef) {
            try {
                await setDoc(userDataRef, currentUserData, { merge: true });
            } catch (error) {
                console.error("Error saving user data: ", error);
            }
        }
    }

    // ===================================================================================
    // ENHANCED SOUND REGION/SETTINGS LOGIC
    // ===================================================================================
    function getSoundRegion() {
        let set = currentUserData.settings;
        if (!set) return "indian";
        if (!set.soundEffects || set.soundRegion === "off") return "off";
        return set.soundRegion || "indian";
    }
    function playRandomSound(type) {
        let region = getSoundRegion();
        if (region === "off") return;
        let arr;
        switch (type) {
            case "start":
                arr = (region === "indian") ? DOMElements.sounds.start : DOMElements.sounds.startInt;
                break;
            case "good":
                arr = (region === "indian") ? DOMElements.sounds.goodMeme : DOMElements.sounds.goodMemeInt;
                break;
            case "bad":
                arr = (region === "indian") ? DOMElements.sounds.badMeme : DOMElements.sounds.badMemeInt;
                break;
            default: arr = null;
        }
        if (arr && arr.length > 0) {
            const sound = arr[Math.floor(Math.random() * arr.length)];
            sound.currentTime = 0;
            sound.play().catch(e => {});
        }
    }

    // ===================================================================================
    // CORE TIMER LOGIC (ENHANCED)
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
    function startTimer() {
        if (isRunning) return;

        if (isWorkSession) {
            (timeLeft >= workDuration) ? playRandomSound("start") : DOMElements.sounds.resumeAlert.play();
        }
        isRunning = true;
        endTime = Date.now() + timeLeft * 1000;
        updateUIState();

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
    function pauseTimer(reason) {
        if (!isRunning) return;
        clearInterval(timerInterval);
        isRunning = false;
        if (!reason) DOMElements.sounds.pauseAlert.play();
        updateUIState();
    }
    function resetTimer() {
        clearInterval(timerInterval);
        isRunning = false;
        isWorkSession = true;
        sessionCount = 0;
        timeLeft = workDuration;
        updateTimerDisplay();
        updateUIState();
        totalAwayTime = 0;
        totalSleepTime = 0;
    }
    function endSession() {
        const timeFocusedSec = workDuration - timeLeft;
        const minutesFocused = Math.floor(timeFocusedSec / 60);
        handleEndOfWorkSession(minutesFocused, false);
        resetTimer();
    }

    function handleSessionCompletion() {
        if (isWorkSession) {
            const minutesFocused = Math.floor(workDuration / 60);
            handleEndOfWorkSession(minutesFocused, true);
            showCompletionPopup();
            sessionCount++;
            isWorkSession = false;
            timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
        } else {
            isWorkSession = true;
            timeLeft = workDuration;
        }
        updateTimerDisplay();
        updateUIState();
        startTimer();
    }

    function handleEndOfWorkSession(minutesFocused, sessionCompleted) {
        if (minutesFocused > 0) {
            currentUserData.totalFocusMinutes = (currentUserData.totalFocusMinutes || 0) + minutesFocused;
            currentUserData.totalSessions = (currentUserData.totalSessions || 0) + 1;
            const today = new Date().toISOString().slice(0, 10);
            if (!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
            currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;

            if (sessionCompleted && workDuration / 60 >= 25) {
                updateStreak();
            }
        }

        if (minutesFocused >= 20) {
            playRandomSound("good");
        } else if (minutesFocused > 0) {
            playRandomSound("bad");
        }

        saveUserData();
        showReviewModal();
        totalAwayTime = 0;
        totalSleepTime = 0;
    }

    // ===================================================================================
    // CAMERA & SLEEP DETECTION (TF.js)
    // ===================================================================================
    async function setupFaceDetection() {
        if (!detectionVideo) {
            detectionVideo = document.createElement("video");
            detectionVideo.style.display = "none";
            document.body.appendChild(detectionVideo);
        }
        if (!faceModel) {
            faceModel = await faceLandmarksDetection.load(faceLandmarksDetection.SupportedPackages.mediapipeFacemesh, { maxFaces: 1 });
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            detectionVideo.srcObject = stream;
            await detectionVideo.play();
        } catch (err) {
            alert("Could not access camera for accountability features.");
            return;
        }
        if (!detectionInterval) {
            detectionInterval = setInterval(doFaceDetection, 1000);
        }
    }

    function stopFaceDetection() {
        if (detectionVideo && detectionVideo.srcObject) {
            detectionVideo.srcObject.getTracks().forEach(track => track.stop());
            detectionVideo.remove();
            detectionVideo = null;
        }
        if (detectionInterval) clearInterval(detectionInterval);
        detectionInterval = null;
    }

    async function doFaceDetection() {
        if (!faceModel || !detectionVideo || detectionVideo.readyState < 2) return;
        const predictions = await faceModel.estimateFaces({ input: detectionVideo, returnTensors: false, flipHorizontal: false });

        // Accountability (face visibility)
        if (faceDetectionActive) {
            if (predictions && predictions.length > 0) {
                // Face detected
                if (!isRunning && awayStart) {
                    // Resume on return
                    startTimer();
                    totalAwayTime += Math.round((Date.now() - awayStart) / 1000);
                    awayStart = null;
                }
                lastFaceDetected = Date.now();
            } else {
                // Face not detected
                if (isRunning && Date.now() - lastFaceDetected > 15000) {
                    pauseTimer("away");
                    awayStart = Date.now();
                    showFaceNotVisiblePrompt();
                }
            }
        }

        // Sleep detection (eyes closed)
        if (sleepDetectionActive && predictions && predictions.length > 0) {
            const keypoints = predictions[0].scaledMesh;
            // Eye openness: compare upper/lower eyelid points
            const leftEyeOpen = isEyeOpen(keypoints, "left");
            const rightEyeOpen = isEyeOpen(keypoints, "right");
            if (leftEyeOpen && rightEyeOpen) {
                if (!isRunning && sleepStart) {
                    startTimer();
                    totalSleepTime += Math.round((Date.now() - sleepStart) / 1000);
                    sleepStart = null;
                }
                lastEyesOpen = Date.now();
            } else {
                // Eyes closed
                if (isRunning && Date.now() - lastEyesOpen > 10000) {
                    pauseTimer("sleep");
                    sleepStart = Date.now();
                    showSleepPrompt();
                }
            }
        }
    }

    // Eye detection helpers (based on eye landmarks in TF.js facemesh)
    function isEyeOpen(keypoints, eye) {
        // Use average distance between eyelid points (indices based on facemesh model)
        let upper, lower;
        if (eye === "left") {
            upper = keypoints[159];
            lower = keypoints[145];
        } else {
            upper = keypoints[386];
            lower = keypoints[374];
        }
        const dist = Math.sqrt(Math.pow(upper[0] - lower[0], 2) + Math.pow(upper[1] - lower[1], 2));
        return dist > 4; // tune threshold if needed
    }

    function showFaceNotVisiblePrompt() {
        DOMElements.statusDisplay.textContent = "Face not visible! Timer paused.";
    }
    function showSleepPrompt() {
        DOMElements.statusDisplay.textContent = "Looks like you are sleepy! Timer paused.";
    }

    // ===================================================================================
    // BEAUTIFUL REVIEW MODAL
    // ===================================================================================
    function showReviewModal() {
        // Get session stats
        const totalSessionTime = workDuration;
        const effectiveFocus = totalSessionTime - totalAwayTime - totalSleepTime;
        const reviewTitle = ["Great Session!", "Well Done!", "Awesome!", "👏 Excellent!"][Math.floor(Math.random()*4)];
        document.getElementById("review-title").textContent = reviewTitle + " 🎉";
        document.getElementById("review-focus").textContent = `You focused for ${(effectiveFocus/60).toFixed(1)} min of ${(totalSessionTime/60).toFixed(1)} min.`;
        document.getElementById("review-away").textContent = `Away from screen: ${(totalAwayTime/60).toFixed(1)} min`;
        document.getElementById("review-sleep").textContent = `Eyes closed/asleep: ${(totalSleepTime/60).toFixed(1)} min`;
        DOMElements.modals.review.classList.add('visible');
    }

    // ===================================================================================
    // STREAK & DATA LOGIC
    // ===================================================================================
    function getFormattedDate(date) { return date.toISOString().slice(0, 10); }

    function checkStreak() {
        const today = getFormattedDate(new Date());
        const yesterday = getFormattedDate(new Date(Date.now() - 86400000));
        const lastStreakDate = currentUserData.lastStreakDate;
        
        if (lastStreakDate && lastStreakDate !== today && lastStreakDate !== yesterday) {
            currentUserData.streakCount = 0;
            saveUserData();
        }
        updateStreakDisplay();
    }

    function updateStreak() {
        const today = getFormattedDate(new Date());
        if (currentUserData.lastStreakDate !== today) {
            const yesterday = getFormattedDate(new Date(Date.now() - 86400000));
            currentUserData.streakCount = (currentUserData.lastStreakDate === yesterday) ? (currentUserData.streakCount || 0) + 1 : 1;
            currentUserData.lastStreakDate = today;
            updateStreakDisplay();
        }
    }
    
    function updateStreakDisplay() {
        DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
    }

    function changeProfileName() {
        const newName = prompt("Enter new name:", currentUserData.profileName);
        if (newName && newName.trim()) {
           currentUserData.profileName = newName.trim();
           saveUserData();
           DOMElements.profile.nameDisplay.textContent = newName.trim();
        }
    }

    // ===================================================================================
    // INITIALIZATION & MAIN APP LOGIC
    // ===================================================================================
    function initializeAppState() {
        loadSettingsFromData();
        updateTimerDisplay();
        updateUIState();
        loadTodos();
        updateCornerWidget();
        DOMElements.profile.nameDisplay.textContent = currentUserData.profileName || "Floww User";
        checkStreak();
        loadTheme();
    }

    function loadSettingsFromData() {
        const settings = currentUserData.settings || {};
        workDuration = settings.workDuration || 25 * 60;
        shortBreakDuration = settings.shortBreakDuration || 5 * 60;
        longBreakDuration = settings.longBreakDuration || 15 * 60;

        // Sound region dropdown
        document.getElementById('soundRegionSelect').value = settings.soundRegion || "indian";
        // Accountability
        document.getElementById('enableAccountability').checked = !!settings.accountability;
        // Sleep detection
        document.getElementById('enableSleepDetection').checked = !!settings.sleepDetection;

        if (!isRunning) timeLeft = workDuration;
        document.getElementById('work-duration').value = workDuration / 60;
        document.getElementById('short-break-duration').value = shortBreakDuration / 60;
        document.getElementById('long-break-duration').value = longBreakDuration / 60;

        faceDetectionActive = !!settings.accountability;
        sleepDetectionActive = !!settings.sleepDetection;
    }

    function saveSettingsToData() {
        const newWork = parseInt(document.getElementById('work-duration').value, 10) * 60;
        const newShort = parseInt(document.getElementById('short-break-duration').value, 10) * 60;
        const newLong = parseInt(document.getElementById('long-break-duration').value, 10) * 60;
        let soundRegion = document.getElementById('soundRegionSelect').value;
        let accountability = document.getElementById('enableAccountability').checked;
        let sleepDetection = document.getElementById('enableSleepDetection').checked;
        currentUserData.settings = { 
            workDuration: newWork,
            shortBreakDuration: newShort,
            longBreakDuration: newLong,
            soundRegion: soundRegion,
            soundEffects: (soundRegion !== "off"),
            accountability: accountability,
            sleepDetection: sleepDetection,
        };
        saveUserData();
        loadSettingsFromData();
        if (!isRunning) resetTimer();
        alert("Settings saved!");
        // Camera logic start/stop
        if (accountability || sleepDetection) {
            setupFaceDetection();
        } else {
            stopFaceDetection();
        }
    }

    // ===================================================================================
    // UI, POPUPS, THEMES, HELPERS
    // ===================================================================================
    function showCompletionPopup() {
        const messages = ["Fantastic focus!", "Great session!", "Awesome work!", "You crushed it!"];
        document.getElementById('completion-message').textContent = messages[Math.floor(Math.random() * messages.length)];
        DOMElements.modals.completion.classList.add('visible');
    }
    function openStats() { DOMElements.modals.stats.classList.add('visible'); renderCharts(); updateStatsDisplay(); }
    function closeStats() { DOMElements.modals.stats.classList.remove('visible'); }
    function updateStatsDisplay() {
        const totalMinutes = currentUserData.totalFocusMinutes || 0;
        DOMElements.modals.totalFocusTime.textContent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        DOMElements.modals.totalSessionsCount.textContent = currentUserData.totalSessions || 0;
    }
    
    function loadTodos() {
        const todos = currentUserData.todos || [];
        const todoList = document.getElementById('todo-list');
        todoList.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.innerHTML = `<input type="checkbox" id="todo-${index}" ${todo.completed ? 'checked' : ''}> <label for="todo-${index}">${todo.text}</label> <div class="actions"><button class="btn-icon" aria-label="Edit Task">✏️</button></div>`;
            li.querySelector('input').onchange = () => toggleTodo(index);
            li.querySelector('button').onclick = () => editTodo(index);
            todoList.appendChild(li);
        });
    }
    function addTodo() { const input = document.getElementById('todo-input'); if (input.value.trim()) { if (!currentUserData.todos) currentUserData.todos = []; currentUserData.todos.push({ text: input.value.trim(), completed: false }); saveUserData(); input.value = ''; loadTodos(); } }
    function toggleTodo(index) { if (currentUserData.todos[index]) { currentUserData.todos[index].completed = !currentUserData.todos[index].completed; saveUserData(); loadTodos(); } }
    function editTodo(index) { if (currentUserData.todos[index]) { const newText = prompt("Edit:", currentUserData.todos[index].text); if (newText && newText.trim()) { currentUserData.todos[index].text = newText.trim(); saveUserData(); loadTodos(); } } }
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
        if (isSnowActive && timestamp - lastSnowSpawn > SNOW_INTERVAL) {
            lastSnowSpawn = timestamp;
            createAndAnimateElement('snowflake', 8, 15, 'fall');
        }
        if (isRainActive && timestamp - lastRainSpawn > RAIN_INTERVAL) {
            lastRainSpawn = timestamp;
            createAndAnimateElement('raindrop', 0.4, 0.8, 'fall');
        }
        if (isSakuraActive && timestamp - lastSakuraSpawn > SAKURA_INTERVAL) {
            lastSakuraSpawn = timestamp;
            createAndAnimateElement('sakura', 15, 25, 'spinFall');
        }
        if (isSnowActive || isRainActive || isSakuraActive) {
            animationFrameId = requestAnimationFrame(ambientLoop);
        } else {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
    function createAndAnimateElement(className, minDuration, maxDuration, animationName) {
        const el = document.createElement('div');
        el.className = `ambient-effect ${className}`;
        el.style.left = `${Math.random() * 100}vw`;
        el.style.animation = `${animationName} ${Math.random() * (maxDuration - minDuration) + minDuration}s linear forwards`;
        DOMElements.ambientContainer.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
    let animationFrameId = null;
    let isSnowActive = false, isRainActive = false, isSakuraActive = false;
    let lastSnowSpawn = 0, lastRainSpawn = 0, lastSakuraSpawn = 0;
    const SNOW_INTERVAL = 200;
    const RAIN_INTERVAL = 50;
    const SAKURA_INTERVAL = 500;
    function toggleAmbience(type) {
        if (type === 'snow') isSnowActive = !isSnowActive;
        if (type === 'rain') isRainActive = !isRainActive;
        if (type === 'sakura') isSakuraActive = !isSakuraActive;
        document.getElementById(`${type}Btn`).classList.toggle('active');
        if (!animationFrameId && (isSnowActive || isRainActive || isSakuraActive)) {
            animationFrameId = requestAnimationFrame(ambientLoop);
        }
    }
    function handleVisibilityChange() {
        if (document.hidden) {
            DOMElements.ambientContainer.innerHTML = '';
        }
    }

    function getYoutubeVideoId(url) { return url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([^"&?/\s]{11})/) ?.[1] || null; }
    function setYoutubeBackground(videoId) { document.getElementById("video-background-container").innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3" frameborder="0" allow="autoplay"></iframe>`; document.body.style.backgroundImage = 'none'; }
    function applyBackgroundTheme(path) { document.body.style.backgroundImage = `url('${path}')`; document.getElementById("video-background-container").innerHTML = ''; }
    function loadTheme() { if (currentUserData.theme?.backgroundPath) applyBackgroundTheme(currentUserData.theme.backgroundPath); if (currentUserData.theme?.youtubeVideoId) setYoutubeBackground(currentUserData.theme.youtubeVideoId); }

    // --- Floating Player Logic ---
    const pipPlayer = document.getElementById('pip-player-container');
    const pipHeader = document.getElementById('pip-player-header');
    const pipContent = document.getElementById('pip-player-content');
    const pipInput = document.getElementById('pip-youtube-input');
    let isDragging = false, offsetX, offsetY;

    function showPipPlayer() {
        pipPlayer.classList.remove('hidden');
        if (!pipContent.querySelector('iframe')) {
            const defaultPlaylistId = "PLBgJjIxp0WaVX6LSodfsQ9pBfHWObvkfX";
            loadPipVideo(defaultPlaylistId, true);
        }
    }
    function hidePipPlayer() {
        pipPlayer.classList.add('hidden');
        pipContent.innerHTML = ''; 
    }
    function loadPipVideo(id, isPlaylist = false) {
        let embedUrl = isPlaylist ? `https://www.youtube.com/embed/videoseries?list=${id}&autoplay=1` : `https://www.youtube.com/embed/${id}?autoplay=1`;
        pipContent.innerHTML = `<iframe src="${embedUrl}&enablejsapi=1&modestbranding=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    function getYoutubeIdAndType(url) {
        const videoIdMatch = url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([^"&?/\s]{11})/);
        const playlistIdMatch = url.match(/[?&]list=([^"&?/\s]+)/);
        if (playlistIdMatch) return { id: playlistIdMatch[1], isPlaylist: true };
        if (videoIdMatch) return { id: videoIdMatch[1], isPlaylist: false };
        return null;
    }
    
    // ===================================================================================
    // CHARTS (STATS)
    // ===================================================================================
    function renderCharts() {
        const weeklyData = currentUserData.weeklyFocus || {};
        const today = new Date();
        const labels = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); return d.toLocaleDateString('en-US', { weekday: 'short' }); });
        const data = labels.map((_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); const key = d.toISOString().slice(0, 10); return (weeklyData[key] || 0) / 60; });
        const barCtx = document.getElementById('barChart').getContext('2d');
        if (window.myBarChart) window.myBarChart.destroy();
        window.myBarChart = new Chart(barCtx, { type: 'bar', data: { labels, datasets: [{ label: 'Daily Focus (hours)', data, backgroundColor: '#f7a047' }] }, options: { maintainAspectRatio: false } });
        const totalFocus = currentUserData.totalFocusMinutes || 0;
        const totalSessions = currentUserData.totalSessions || 0;
        const totalBreak = totalSessions * ((currentUserData.settings?.shortBreakDuration || 300) / 60);
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        if(window.myPieChart) window.myPieChart.destroy();
        window.myPieChart = new Chart(pieCtx, {type: 'pie', data: { labels: ['Work', 'Break'], datasets: [{ data: [totalFocus, totalBreak], backgroundColor: ['#f7a047', '#6c63ff'] }] }, options: { maintainAspectRatio: false }});
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Container`).classList.add('active');
    }

    // ===================================================================================
    // EVENT LISTENERS (INCLUDING NEW SETTINGS)
    // ===================================================================================
    function attachMainAppEventListeners() {
        DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer());
        DOMElements.resetBtn.addEventListener('click', resetTimer);
        DOMElements.endSessionBtn.addEventListener('click', endSession);
        document.getElementById('changeNameBtn').addEventListener('click', changeProfileName);
        document.getElementById('statsBtn').addEventListener('click', openStats);
        document.querySelector('.close-btn').addEventListener('click', closeStats);
        document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
        document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
        document.getElementById("noiseBtn").addEventListener('click', (e) => { const noise = DOMElements.sounds.whiteNoise; noise.paused ? noise.play() : noise.pause(); e.target.textContent = noise.paused ? "🎧 Play Noise" : "🎧 Stop Noise"; });
        document.getElementById("snowBtn").addEventListener('click', () => toggleAmbience('snow'));
        document.getElementById("rainBtn").addEventListener('click', () => toggleAmbience('rain'));
        document.getElementById("sakuraBtn").addEventListener('click', () => toggleAmbience('sakura'));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.getElementById("focusModeBtn").addEventListener('click', toggleFocusMode);
        DOMElements.focusMode.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer());
        DOMElements.focusMode.exitBtn.addEventListener('click', toggleFocusMode);
        document.getElementById("add-todo-btn").addEventListener('click', addTodo);
        document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);
        document.getElementById('todo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
        document.getElementById("saveSettingsBtn").addEventListener('click', saveSettingsToData);
        document.getElementById('storeItems').addEventListener('click', (e) => { 
            if (e.target.tagName !== 'BUTTON') return;
            const item = e.target.closest('.store-item'); 
            currentUserData.theme = {}; 
            if (item.dataset.type === 'image') {
                currentUserData.theme.backgroundPath = item.dataset.path;
                applyBackgroundTheme(item.dataset.path);
            } else if (item.dataset.type === 'youtube') {
                currentUserData.theme.youtubeVideoId = item.dataset.id;
                setYoutubeBackground(item.dataset.id);
            }
            saveUserData();
            closeStats();
        });
        document.getElementById("setYoutubeBtn").addEventListener('click', () => {
            const url = document.getElementById("youtube-input").value; 
            const videoId = getYoutubeVideoId(url);
            if (videoId) {
                currentUserData.theme = { youtubeVideoId: videoId, backgroundPath: null };
                setYoutubeBackground(videoId);
                saveUserData();
            } else if (url) { 
                alert("Please enter a valid YouTube URL."); 
            }
        });
        document.getElementById("clearDataBtn").addEventListener('click', async () => { if (confirm("DANGER: This will reset ALL your stats and settings permanently.")) { 
            currentUserData = {
                profileName: "Floww User", totalFocusMinutes: 0, totalSessions: 0, streakCount: 0, lastStreakDate: null, weeklyFocus: {}, todos: [],
                settings: { workDuration: 25 * 60, shortBreakDuration: 5 * 60, longBreakDuration: 15 * 60, },
                theme: { backgroundPath: null, youtubeVideoId: null, }
            };
            await saveUserData();
            initializeAppState();
        } });
        // Floating Player Listeners
        document.getElementById('pipYoutubeBtn').addEventListener('click', showPipPlayer);
        document.getElementById('pip-close-btn').addEventListener('click', hidePipPlayer);
        document.getElementById('pip-set-btn').addEventListener('click', () => { const result = getYoutubeIdAndType(pipInput.value); if (result) { loadPipVideo(result.id, result.isPlaylist); pipInput.value = ''; } else { alert("Please enter a valid YouTube video or playlist URL."); } });
        pipInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('pip-set-btn').click(); });
        pipHeader.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - pipPlayer.offsetLeft; offsetY = e.clientY - pipPlayer.offsetTop; pipPlayer.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; });
        document.addEventListener('mousemove', (e) => { if (isDragging) { let newX = e.clientX - offsetX; let newY = e.clientY - offsetY; const maxX = window.innerWidth - pipPlayer.offsetWidth; const maxY = window.innerHeight - pipPlayer.offsetHeight; pipPlayer.style.left = `${Math.max(0, Math.min(newX, maxX))}px`; pipPlayer.style.top = `${Math.max(0, Math.min(newY, maxY))}px`; pipPlayer.style.bottom = 'auto'; pipPlayer.style.right = 'auto'; } });
        document.addEventListener('mouseup', () => { isDragging = false; pipPlayer.style.cursor = 'default'; document.body.style.userSelect = 'auto'; });
        // Global listeners
        window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); isRunning ? pauseTimer() : startTimer(); } });
        window.addEventListener('beforeunload', (e) => { if (isRunning) { e.preventDefault(); e.returnValue = 'Timer is running!'; return e.returnValue; } });
        setInterval(updateCornerWidget, 30000);

        // NEW: Sound region/accountability/sleep settings listeners
        document.getElementById('soundRegionSelect').addEventListener('change', saveSettingsToData);
        document.getElementById('enableAccountability').addEventListener('change', saveSettingsToData);
        document.getElementById('enableSleepDetection').addEventListener('change', saveSettingsToData);

        // Review modal close
        document.getElementById('closeReviewModalBtn').addEventListener('click', () => DOMElements.modals.review.classList.remove('visible'));
    }
    attachMainAppEventListeners();
});
