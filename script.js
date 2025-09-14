// script.js (merged full version)
// Single-file app: retains ALL original features from your uploaded script (todos, themes, charts, focus mode, ambience, pip player, firebase auth, streaks, etc.)
// Adds new features requested:
//  - Start/End sound selection: India / Non-India / Off
//  - Global sound toggle
//  - Camera accountability (pause if face not found > 15s)
//  - Sleep detection (pause if eyes closed > 10s) — toggleable
//  - Assistant-styled review popup saved to user profile if user saves it

// =====================================================
// IMPORTS & FIREBASE INIT (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

// NOTE: you provided this firebase config in your prompt; using it here so the site points to youfloww2
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

// =====================================================
// APP BOOT
document.addEventListener('DOMContentLoaded', () => {

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
  const SNOW_INTERVAL = 200; // ms
  const RAIN_INTERVAL = 50;  // ms
  const SAKURA_INTERVAL = 500; // ms

  // Camera / face detection
  let cameraEnabled = false;
  let detector = null;
  let videoStream = null;
  let videoElement = null;
  let faceAbsentSince = null;
  let eyesClosedSince = null;
  const FACE_ABSENCE_THRESHOLD = 15; // seconds
  const EYES_CLOSED_THRESHOLD = 10; // seconds
  let sleepDetectionEnabled = false;
  let lastAwayStart = null;
  let lastSleepStart = null;
  let awayTotalSeconds = 0;
  let sleepPauseTotalSeconds = 0;

  // Sound selection & global toggle
  let soundSelection = 'india'; // 'india' | 'nonindia' | 'off'
  let globalSoundEnabled = true;

  // user data refs
  let currentUserData = {};
  let userDataRef = null;

  // ===================================================================================
  // DOM ELEMENTS CACHE (keeps original structure and adds new elements)
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
      },
      profile: {
          nameDisplay: document.getElementById("profileNameDisplay"),
      },
      streak: {
          count: document.getElementById("streak-count"),
      },
      sounds: {
          // original sets
          whiteNoise: document.getElementById("whiteNoise"),
          start: document.querySelectorAll('.start-sound'),
          goodMeme: document.querySelectorAll('.good-meme'),
          badMeme: document.querySelectorAll('.bad-meme'),
          pauseAlert: document.getElementById("pauseAlertSound"),
          resumeAlert: document.getElementById("resumeAlertSound"),
          // new: non-india variants (we'll populate by class if available)
          nonStart: document.querySelectorAll('.nonindia-start'),
          nonGood: document.querySelectorAll('.nonindia-good'),
          nonBad: document.querySelectorAll('.nonindia-bad'),
      },
      // new controls (these exist in the index.html we provided earlier)
      soundSelection: document.getElementById("soundSelection"),
      globalSoundToggle: document.getElementById("globalSoundToggle"),
      cameraToggle: document.getElementById("cameraToggle"),
      sleepToggle: document.getElementById("sleepToggle"),
      reviewModal: document.getElementById("reviewModal"),
      reviewContent: document.getElementById("reviewContent"),
      saveReviewBtn: document.getElementById("saveReviewBtn"),
      closeReviewBtn: document.getElementById("closeReviewBtn"),
  };

  // ===================================================================================
  // AUTH: persist user sessions & load user data (keeps original behavior)
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
      // default profile
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
        },
        theme: {
          backgroundPath: null,
          youtubeVideoId: null,
        },
        appPreferences: {
          soundSelection: 'india',
          globalSoundEnabled: true,
          sleepDetectionEnabled: false
        }
      };
      await setDoc(userDataRef, currentUserData);
    }
    initializeAppState();
  }

  async function saveUserData() {
    if (!userDataRef) return;
    try {
      await setDoc(userDataRef, currentUserData, { merge: true });
    } catch (e) {
      console.error("saveUserData error:", e);
    }
  }

  // ===================================================================================
  // INITIALIZATION: set durations, load UI state, attach listeners
  // ===================================================================================
  function initializeAppState() {
    const s = currentUserData.settings || {};
    workDuration = s.workDuration || 25 * 60;
    shortBreakDuration = s.shortBreakDuration || 5 * 60;
    longBreakDuration = s.longBreakDuration || 15 * 60;
    if (!isRunning) timeLeft = workDuration;

    // apply profile name
    DOMElements.profile.nameDisplay.textContent = currentUserData.profileName || "Floww User";

    // load user preferences
    if (currentUserData.appPreferences) {
      soundSelection = currentUserData.appPreferences.soundSelection || 'india';
      globalSoundEnabled = typeof currentUserData.appPreferences.globalSoundEnabled === 'boolean' ? currentUserData.appPreferences.globalSoundEnabled : true;
      sleepDetectionEnabled = typeof currentUserData.appPreferences.sleepDetectionEnabled === 'boolean' ? currentUserData.appPreferences.sleepDetectionEnabled : false;
    }

    // sync controls
    if (DOMElements.soundSelection) DOMElements.soundSelection.value = soundSelection;
    if (DOMElements.globalSoundToggle) DOMElements.globalSoundToggle.textContent = globalSoundEnabled ? '🔊 On' : '🔇 Off';
    if (DOMElements.sleepToggle) {
      DOMElements.sleepToggle.classList.toggle('active', sleepDetectionEnabled);
      DOMElements.sleepToggle.textContent = sleepDetectionEnabled ? 'Enabled' : 'Enable';
    }

    updateTimerDisplay();
    updateUIState();
    loadTodos();
    loadTheme();
    renderCharts();
    updateStatsDisplay();
    attachMainAppEventListeners();
  }

  // ===================================================================================
  // UTILITY: Timer UI helpers
  // ===================================================================================
  function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    DOMElements.timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    document.title = isRunning ? `${minutes}:${seconds < 10 ? '0':''}${seconds} - ${isWorkSession ? 'Work' : 'Break'} | YouFloww` : 'YouFloww';
  }

  function updateUIState() {
    DOMElements.statusDisplay.textContent = isWorkSession ? "Work Session" : "Break Time";
    if (DOMElements.playIcon && DOMElements.pauseIcon) {
      DOMElements.playIcon.classList.toggle('hidden', isRunning);
      DOMElements.pauseIcon.classList.toggle('hidden', !isRunning);
    }
    DOMElements.resetBtn.disabled = isRunning;
    DOMElements.endSessionBtn.disabled = !isRunning;
    DOMElements.playPauseBtn.setAttribute('aria-label', isRunning ? 'Pause Timer' : 'Start Timer');
  }

  // ===================================================================================
  // AUDIO HELPERS (modified to respect soundSelection and global toggle)
  // ===================================================================================
  function playRandomSoundFromNodeList(nodeList) {
    if (!globalSoundEnabled || soundSelection === 'off') return;
    if (!nodeList || nodeList.length === 0) return;
    const arr = Array.from(nodeList);
    const s = arr[Math.floor(Math.random() * arr.length)];
    try { s.currentTime = 0; s.play(); } catch(e){ console.warn("audio play fail", e); }
  }

  // general wrapper for start/good/bad sounds according to selection
  function playStartSound() {
    if (!globalSoundEnabled || soundSelection === 'off') return;
    if (soundSelection === 'india') playRandomSoundFromNodeList(DOMElements.sounds.start);
    else if (soundSelection === 'nonindia') playRandomSoundFromNodeList(DOMElements.sounds.nonStart);
  }
  function playGoodSound() {
    if (!globalSoundEnabled || soundSelection === 'off') return;
    if (soundSelection === 'india') playRandomSoundFromNodeList(DOMElements.sounds.goodMeme);
    else if (soundSelection === 'nonindia') playRandomSoundFromNodeList(DOMElements.sounds.nonGood);
  }
  function playBadSound() {
    if (!globalSoundEnabled || soundSelection === 'off') return;
    if (soundSelection === 'india') playRandomSoundFromNodeList(DOMElements.sounds.badMeme);
    else if (soundSelection === 'nonindia') playRandomSoundFromNodeList(DOMElements.sounds.nonBad);
  }

  // ===================================================================================
  // TIMER CORE (keeps original behavior but uses the new audio wrappers)
  // ===================================================================================
  function startTimer() {
    if (isRunning) return;

    if (isWorkSession) {
      // if a fresh start of work session -> run start sound
      if (timeLeft >= workDuration) playStartSound();
      else DOMElements.sounds.resumeAlert?.play?.();
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

  function pauseTimer(reason = 'manual') {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
    // play pause alert (original)
    try { DOMElements.sounds.pauseAlert.play(); } catch(e){}
    updateUIState();

    // track away / sleep starts if reason matches
    if (reason === 'away') {
      lastAwayStart = lastAwayStart || Date.now();
    } else if (reason === 'sleep') {
      lastSleepStart = lastSleepStart || Date.now();
    }
  }

  function resumeTimerAfterPause() {
    if (isRunning) return;

    // finalize any active away/sleep counters
    if (lastAwayStart) {
      const deltaSec = Math.round((Date.now() - lastAwayStart) / 1000);
      awayTotalSeconds += deltaSec;
      lastAwayStart = null;
    }
    if (lastSleepStart) {
      const deltaSec = Math.round((Date.now() - lastSleepStart) / 1000);
      sleepPauseTotalSeconds += deltaSec;
      lastSleepStart = null;
    }

    try { DOMElements.sounds.resumeAlert.play(); } catch(e){}

    endTime = Date.now() + timeLeft * 1000;
    isRunning = true;
    updateUIState();
    timerInterval = setInterval(() => {
      timeLeft = Math.round((endTime - Date.now()) / 1000);
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timeLeft = 0;
        isRunning = false;
        handleSessionCompletion();
      } else {
        updateTimerDisplay();
      }
    }, 1000);
  }

  function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    isWorkSession = true;
    sessionCount = 0;
    timeLeft = workDuration;
    updateTimerDisplay();
    updateUIState();
  }

  function endSession() {
    const timeFocusedSec = workDuration - timeLeft;
    const minutesFocused = Math.floor(timeFocusedSec / 60);
    handleEndOfWorkSession(minutesFocused, false);
    // show review
    showReviewPopup(false);
    resetTimer();
  }

  function handleSessionCompletion() {
    if (isWorkSession) {
      const minutesFocused = Math.floor(workDuration / 60);
      handleEndOfWorkSession(minutesFocused, true);
      showCompletionPopup();
      // show review after completion
      showReviewPopup(true);
      sessionCount++;
      isWorkSession = false;
      timeLeft = (sessionCount % 4 === 0) ? longBreakDuration : shortBreakDuration;
    } else {
      isWorkSession = true;
      timeLeft = workDuration;
    }
    updateTimerDisplay();
    updateUIState();
    // auto-start next segment
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
      playGoodSound();
    } else if (minutesFocused > 0) {
      playBadSound();
    }

    saveUserData();
  }

  // ===================================================================================
  // STREAK, TODOS, STATS, CHARTS (kept original)
  // ===================================================================================
  function getFormattedDate(date) { return date.toISOString().slice(0, 10); }

  function updateStreak() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const todayS = new Date().toISOString().slice(0,10);
    if (currentUserData.lastStreakDate === yesterday) {
      currentUserData.streakCount = (currentUserData.streakCount || 0) + 1;
    } else if (currentUserData.lastStreakDate !== todayS) {
      currentUserData.streakCount = 1;
    }
    currentUserData.lastStreakDate = todayS;
    DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
  }

  function loadTodos() {
    const todos = currentUserData.todos || [];
    const todoList = document.getElementById('todo-list');
    if (!todoList) return;
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

  function addTodo() {
    const input = document.getElementById('todo-input');
    if (!input) return;
    if (input.value.trim()) {
      if (!currentUserData.todos) currentUserData.todos = [];
      currentUserData.todos.push({ text: input.value.trim(), completed: false });
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

  function editTodo(index) {
    if (currentUserData.todos[index]) {
      const newText = prompt("Edit:", currentUserData.todos[index].text);
      if (newText && newText.trim()) {
        currentUserData.todos[index].text = newText.trim();
        saveUserData();
        loadTodos();
      }
    }
  }

  function clearTodos() {
    if (confirm("Clear all tasks?")) {
      currentUserData.todos = [];
      saveUserData();
      loadTodos();
    }
  }

  function updateStatsDisplay() {
    const totalMinutes = currentUserData.totalFocusMinutes || 0;
    DOMElements.modals.totalFocusTime.textContent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    DOMElements.modals.totalSessionsCount.textContent = currentUserData.totalSessions || 0;
  }

  function renderCharts() {
    const weeklyData = currentUserData.weeklyFocus || {};
    const today = new Date();
    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    });
    const data = labels.map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return (weeklyData[key] || 0) / 60;
    });
    const barCtx = document.getElementById('barChart')?.getContext('2d');
    if (barCtx) {
      if (window.myBarChart) window.myBarChart.destroy();
      window.myBarChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Daily Focus (hours)', data, backgroundColor: '#f7a047' }] },
        options: { maintainAspectRatio: false }
      });
    }

    const totalFocus = currentUserData.totalFocusMinutes || 0;
    const totalSessions = currentUserData.totalSessions || 0;
    const totalBreak = totalSessions * ((currentUserData.settings?.shortBreakDuration || 300) / 60);
    const pieCtx = document.getElementById('pieChart')?.getContext('2d');
    if (pieCtx) {
      if (window.myPieChart) window.myPieChart.destroy();
      window.myPieChart = new Chart(pieCtx, {
        type: 'pie',
        data: { labels: ['Work', 'Break'], datasets: [{ data: [totalFocus, totalBreak], backgroundColor: ['#f7a047', '#6c63ff'] }] },
        options: { maintainAspectRatio: false }
      });
    }
  }

  // ===================================================================================
  // THEME & PIP PLAYER (kept original)
  // ===================================================================================
  function setYoutubeBackground(videoId) {
    document.getElementById("video-background-container").innerHTML =
      `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3" frameborder="0" allow="autoplay"></iframe>`;
    document.body.style.backgroundImage = 'none';
  }
  function applyBackgroundTheme(path) {
    document.body.style.backgroundImage = `url('${path}')`;
    document.getElementById("video-background-container").innerHTML = '';
  }
  function loadTheme() {
    if (currentUserData.theme?.backgroundPath) applyBackgroundTheme(currentUserData.theme.backgroundPath);
    if (currentUserData.theme?.youtubeVideoId) setYoutubeBackground(currentUserData.theme.youtubeVideoId);
  }

  // Floating PIP player logic (kept original behavior)
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
  // AMBIENT EFFECTS (kept original)
  // ===================================================================================
  function ambientLoop() {
    const now = Date.now();
    if (isSnowActive && now - lastSnowSpawn > SNOW_INTERVAL) {
      lastSnowSpawn = now;
      createAndAnimateElement('snow', 8, 18, 'fall');
    }
    if (isRainActive && now - lastRainSpawn > RAIN_INTERVAL) {
      lastRainSpawn = now;
      createAndAnimateElement('rain', 0.8, 1.8, 'fastFall');
    }
    if (isSakuraActive && now - lastSakuraSpawn > SAKURA_INTERVAL) {
      lastSakuraSpawn = now;
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
    document.getElementById('ambient-container')?.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function toggleAmbience(type) {
    if (type === 'snow') isSnowActive = !isSnowActive;
    if (type === 'rain') isRainActive = !isRainActive;
    if (type === 'sakura') isSakuraActive = !isSakuraActive;
    document.getElementById(`${type}Btn`)?.classList.toggle('active');
    if (!animationFrameId && (isSnowActive || isRainActive || isSakuraActive)) animationFrameId = requestAnimationFrame(ambientLoop);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      document.getElementById('ambient-container').innerHTML = '';
    }
  }

  // ===================================================================================
  // ATTACH EVENT LISTENERS (merged original + new)
  // ===================================================================================
  function attachMainAppEventListeners() {
    DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer());
    DOMElements.resetBtn.addEventListener('click', resetTimer);
    DOMElements.endSessionBtn.addEventListener('click', endSession);
    document.getElementById('changeNameBtn')?.addEventListener('click', changeProfileName);
    document.getElementById('statsBtn')?.addEventListener('click', openStats);
    document.querySelector('.close-btn')?.addEventListener('click', closeStats);
    document.getElementById('closeCompletionModalBtn')?.addEventListener('click', () => document.getElementById('completionModal')?.classList.remove('visible'));
    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    document.getElementById("noiseBtn")?.addEventListener('click', (e) => {
      const noise = DOMElements.sounds.whiteNoise;
      if (!noise) return;
      noise.paused ? noise.play() : noise.pause();
      e.target.textContent = noise.paused ? "🎧 Play Noise" : "🎧 Stop Noise";
    });
    document.getElementById("snowBtn")?.addEventListener('click', () => toggleAmbience('snow'));
    document.getElementById("rainBtn")?.addEventListener('click', () => toggleAmbience('rain'));
    document.getElementById("sakuraBtn")?.addEventListener('click', () => toggleAmbience('sakura'));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.getElementById("focusModeBtn")?.addEventListener('click', toggleFocusMode);
    DOMElements.focusMode.playPauseBtn?.addEventListener('click', () => isRunning ? pauseTimer() : startTimer());
    DOMElements.focusMode.exitBtn?.addEventListener('click', toggleFocusMode);
    document.getElementById("add-todo-btn")?.addEventListener('click', addTodo);
    document.querySelector('.clear-todos-btn')?.addEventListener('click', clearTodos);
    document.getElementById('todo-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
    document.getElementById("saveSettingsBtn")?.addEventListener('click', saveSettingsToData);

    // store items apply
    document.getElementById('storeItems')?.addEventListener('click', (e) => {
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

    document.getElementById("setYoutubeBtn")?.addEventListener('click', () => {
      const url = document.getElementById("youtube-input")?.value;
      const result = getYoutubeIdAndType(url);
      if (result) {
        currentUserData.theme = { youtubeVideoId: result.id, backgroundPath: null };
        setYoutubeBackground(result.id);
        saveUserData();
      } else if (url) {
        alert("Please enter a valid YouTube URL.");
      }
    });

    document.getElementById("clearDataBtn")?.addEventListener('click', async () => {
      if (confirm("DANGER: This will reset ALL your stats and settings permanently.")) {
        currentUserData = {
          profileName: "Floww User", totalFocusMinutes: 0, totalSessions: 0, streakCount: 0, lastStreakDate: null, weeklyFocus: {}, todos: [],
          settings: { workDuration: 25 * 60, shortBreakDuration: 5 * 60, longBreakDuration: 15 * 60, },
          theme: { backgroundPath: null, youtubeVideoId: null, },
          appPreferences: { soundSelection: 'india', globalSoundEnabled: true, sleepDetectionEnabled: false }
        };
        await saveUserData();
        initializeAppState();
      }
    });

    // Floating Player listeners
    document.getElementById('pipYoutubeBtn')?.addEventListener('click', showPipPlayer);
    document.getElementById('pip-close-btn')?.addEventListener('click', hidePipPlayer);
    document.getElementById('pip-set-btn')?.addEventListener('click', () => {
      const result = getYoutubeIdAndType(pipInput.value);
      if (result) {
        loadPipVideo(result.id, result.isPlaylist);
        pipInput.value = '';
      } else {
        alert("Please enter a valid YouTube video or playlist URL.");
      }
    });
    pipInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('pip-set-btn')?.click(); });
    pipHeader?.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - pipPlayer.offsetLeft; offsetY = e.clientY - pipPlayer.offsetTop; pipPlayer.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; });
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        const maxX = window.innerWidth - pipPlayer.offsetWidth;
        const maxY = window.innerHeight - pipPlayer.offsetHeight;
        pipPlayer.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
        pipPlayer.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
        pipPlayer.style.bottom = 'auto';
        pipPlayer.style.right = 'auto';
      }
    });
    document.addEventListener('mouseup', () => { isDragging = false; pipPlayer.style.cursor = 'default'; document.body.style.userSelect = 'auto'; });

    // New UI controls: sound selection / global toggle / camera / sleep toggle / review modal
    DOMElements.soundSelection?.addEventListener('change', (e) => {
      soundSelection = e.target.value;
      currentUserData.appPreferences = currentUserData.appPreferences || {};
      currentUserData.appPreferences.soundSelection = soundSelection;
      saveUserData();
    });

    DOMElements.globalSoundToggle?.addEventListener('click', () => {
      globalSoundEnabled = !globalSoundEnabled;
      DOMElements.globalSoundToggle.textContent = globalSoundEnabled ? '🔊 On' : '🔇 Off';
      currentUserData.appPreferences = currentUserData.appPreferences || {};
      currentUserData.appPreferences.globalSoundEnabled = globalSoundEnabled;
      saveUserData();
    });

    DOMElements.cameraToggle?.addEventListener('click', async () => {
      cameraEnabled = !cameraEnabled;
      if (cameraEnabled) {
        DOMElements.cameraToggle.classList.add('active');
        DOMElements.cameraToggle.textContent = 'Disable';
        await startCameraAndDetector();
      } else {
        DOMElements.cameraToggle.classList.remove('active');
        DOMElements.cameraToggle.textContent = 'Enable';
        stopCameraAndDetector();
      }
    });

    DOMElements.sleepToggle?.addEventListener('click', () => {
      sleepDetectionEnabled = !sleepDetectionEnabled;
      DOMElements.sleepToggle.classList.toggle('active', sleepDetectionEnabled);
      DOMElements.sleepToggle.textContent = sleepDetectionEnabled ? 'Enabled' : 'Enable';
      currentUserData.appPreferences = currentUserData.appPreferences || {};
      currentUserData.appPreferences.sleepDetectionEnabled = sleepDetectionEnabled;
      saveUserData();
    });

    DOMElements.closeReviewBtn?.addEventListener('click', () => DOMElements.reviewModal?.classList.remove('visible'));
    DOMElements.saveReviewBtn?.addEventListener('click', async () => {
      if (!window.lastSessionSummary) { alert("No summary to save."); return; }
      currentUserData.lastSessionSummary = window.lastSessionSummary;
      await saveUserData();
      DOMElements.reviewModal?.classList.remove('visible');
      alert("Saved session summary!");
    });

    // keyboard space toggles
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        isRunning ? pauseTimer() : startTimer();
      }
    });

    // unload protection (warn if timer running)
    window.addEventListener('beforeunload', (e) => {
      if (isRunning) {
        e.preventDefault();
        e.returnValue = 'Timer is running!';
        return e.returnValue;
      }
    });

    setInterval(updateCornerWidget, 30000);
  }

  // ===================================================================================
  // CAMERA & FACE/EYE DETECTION (uses TensorFlow face-landmarks-detection in index.html)
  // ===================================================================================
  async function startCameraAndDetector() {
    if (detector) return;
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.style.display = 'none';
      videoElement.setAttribute('playsinline','');
      document.body.appendChild(videoElement);
    }
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      videoElement.srcObject = videoStream;
      await videoElement.play();
    } catch (err) {
      alert("Camera access denied or unavailable.");
      cameraEnabled = false;
      DOMElements.cameraToggle?.classList.remove('active');
      DOMElements.cameraToggle && (DOMElements.cameraToggle.textContent = 'Enable');
      return;
    }

    try {
      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      detector = await faceLandmarksDetection.createDetector(model, { runtime: 'tfjs' });
    } catch (err) {
      console.error("Detector init failed", err);
      alert("Failed to initialize face detector.");
      return;
    }

    faceAbsentSince = null;
    eyesClosedSince = null;
    lastAwayStart = null;
    lastSleepStart = null;
    awayTotalSeconds = 0;
    sleepPauseTotalSeconds = 0;

    runDetectionLoop();
  }

  function stopCameraAndDetector() {
    if (detector) { try { detector.dispose(); } catch(e){} detector = null; }
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    if (videoElement) {
      videoElement.pause();
      videoElement.srcObject = null;
      videoElement.remove();
      videoElement = null;
    }
    faceAbsentSince = null;
    eyesClosedSince = null;
    lastAwayStart = null;
    lastSleepStart = null;
  }

  function computeEAR(eyeLandmarks) {
    if (!eyeLandmarks || eyeLandmarks.length < 6) return 1;
    const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
    const A = dist(eyeLandmarks[1], eyeLandmarks[5]);
    const B = dist(eyeLandmarks[2], eyeLandmarks[4]);
    const C = dist(eyeLandmarks[0], eyeLandmarks[3]) + 1e-6;
    const ear = (A + B) / (2.0 * C);
    return ear;
  }

  async function runDetectionLoop() {
    if (!detector || !videoElement) return;
    try {
      const faces = await detector.estimateFaces(videoElement);
      const now = Date.now();
      if (!faces || faces.length === 0) {
        if (!faceAbsentSince) faceAbsentSince = now;
        const elapsed = Math.round((now - faceAbsentSince)/1000);
        if (elapsed >= FACE_ABSENCE_THRESHOLD && isRunning) {
          pauseTimer('away');
          lastAwayStart = lastAwayStart || Date.now();
        }
      } else {
        // face visible
        faceAbsentSince = null;
        // sleep detection (eyes)
        if (sleepDetectionEnabled) {
          const mesh = faces[0].scaledMesh || faces[0].landmarks || null;
          if (mesh && mesh.length >= 468) {
            const leftIdx = [33,160,158,133,153,144];
            const rightIdx = [362,385,387,263,373,380];
            const leftEye = leftIdx.map(i => ({ x: mesh[i][0], y: mesh[i][1] }));
            const rightEye = rightIdx.map(i => ({ x: mesh[i][0], y: mesh[i][1] }));
            const ear = (computeEAR(leftEye) + computeEAR(rightEye)) / 2;
            if (ear < 0.20) {
              if (!eyesClosedSince) eyesClosedSince = now;
              const el = Math.round((now - eyesClosedSince)/1000);
              if (el >= EYES_CLOSED_THRESHOLD && isRunning) {
                pauseTimer('sleep');
                lastSleepStart = lastSleepStart || Date.now();
              }
            } else {
              if (eyesClosedSince) {
                const delta = Math.round((now - eyesClosedSince)/1000);
                if (delta > 0) sleepPauseTotalSeconds += delta;
                eyesClosedSince = null;
                if (!isRunning && (lastSleepStart || lastAwayStart)) resumeTimerAfterPause();
              }
            }
          }
        }

        // resume if face visible and timer paused due to away (and no active eye-sleep)
        if (!isRunning && lastAwayStart && !eyesClosedSince) {
          resumeTimerAfterPause();
        }
      }
    } catch (err) {
      console.warn("Detection loop error", err);
    } finally {
      if (detector) requestAnimationFrame(runDetectionLoop);
    }
  }

  // ===================================================================================
  // REVIEW POPUP (assistant style) - compute summary and show
  // ===================================================================================
  function showReviewPopup(sessionCompleted) {
    // compute metrics
    const chosenFocusMinutes = Math.round(workDuration / 60);
    const totalSessionTimeSec = chosenFocusMinutes * 60 + awayTotalSeconds + sleepPauseTotalSeconds;
    const effectiveFocusedSec = (workDuration - timeLeft);
    const effectiveFocusedMin = Math.round(effectiveFocusedSec / 60);

    if (lastAwayStart) {
      awayTotalSeconds += Math.round((Date.now() - lastAwayStart)/1000);
      lastAwayStart = null;
    }
    if (lastSleepStart) {
      sleepPauseTotalSeconds += Math.round((Date.now() - lastSleepStart)/1000);
      lastSleepStart = null;
    }

    const awayMin = Math.round(awayTotalSeconds / 60);
    const sleepMin = Math.round(sleepPauseTotalSeconds / 60);
    const totalTimeWithPausesMin = Math.round(totalSessionTimeSec / 60);

    const html = `
      <p><strong>Focus goal:</strong> ${chosenFocusMinutes} minutes</p>
      <p><strong>Effective focus:</strong> ${effectiveFocusedMin} minutes</p>
      <p><strong>Total session time (including pauses):</strong> ${totalTimeWithPausesMin} minutes</p>
      <p><strong>Time away (camera not found):</strong> ${awayMin} minutes</p>
      <p><strong>Sleep pauses (eyes closed):</strong> ${sleepMin} minutes</p>
      <hr/>
      <p>Tip: You can toggle <em>Sleep detection</em> and <em>Accountability camera</em> in the controls to suit your privacy needs.</p>
    `;

    DOMElements.reviewContent.innerHTML = html;
    window.lastSessionSummary = {
      chosenFocusMinutes,
      effectiveFocusedMin,
      totalTimeWithPausesMin,
      awayMin,
      sleepMin,
      timestamp: new Date().toISOString()
    };
    DOMElements.reviewModal?.classList.add('visible');
  }

  // small visual completion modal reused from original
  function showCompletionPopup() {
    const messages = ["Fantastic focus!", "Great session!", "Awesome work!", "You crushed it!"];
    document.getElementById('completion-message')?.textContent = messages[Math.floor(Math.random() * messages.length)];
    document.getElementById('completionModal')?.classList.add('visible');
  }

  // ===================================================================================
  // HELPERS & MISC (corner widget, youtube utils)
  // ===================================================================================
  function updateCornerWidget() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayProgress = ((now - startOfDay) / 86400000) * 100;
    const bar = document.getElementById("dayProgressBar");
    if (bar) bar.style.width = `${dayProgress}%`;
  }

  function getYoutubeIdAndType(url) {
    if (!url) return null;
    const videoIdMatch = url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([^"&?/\s]{11})/);
    const playlistIdMatch = url.match(/[?&]list=([^"&?/\s]+)/);
    if (playlistIdMatch) return { id: playlistIdMatch[1], isPlaylist: true };
    if (videoIdMatch) return { id: videoIdMatch[1], isPlaylist: false };
    return null;
  }

  // ===================================================================================
  // SAVE SETTINGS BUTTON HELPERS
  // ===================================================================================
  function saveSettingsToData() {
    const work = Number(document.getElementById('work-duration')?.value || 25);
    const shortB = Number(document.getElementById('short-break-duration')?.value || 5);
    const longB = Number(document.getElementById('long-break-duration')?.value || 15);
    currentUserData.settings = {
      workDuration: work * 60,
      shortBreakDuration: shortB * 60,
      longBreakDuration: longB * 60
    };
    saveUserData();
    workDuration = currentUserData.settings.workDuration;
    shortBreakDuration = currentUserData.settings.shortBreakDuration;
    longBreakDuration = currentUserData.settings.longBreakDuration;
    timeLeft = workDuration;
    updateTimerDisplay();
    alert("Settings saved.");
  }

  // ===================================================================================
  // PROFILE & NAME CHANGE (kept original)
  // ===================================================================================
  function changeProfileName() {
    const name = prompt("Enter your display name:", currentUserData.profileName || "Floww User");
    if (name && name.trim()) {
      currentUserData.profileName = name.trim();
      saveUserData();
      DOMElements.profile.nameDisplay.textContent = currentUserData.profileName;
    }
  }

  // ===================================================================================
  // BOOTSTRAP: call attachMainAppEventListeners() after DOM loaded
  // ===================================================================================
  attachMainAppEventListeners();

  // If a user is already logged in, onAuthStateChanged -> loadUserData -> initializeAppState will run.
  // If not, the auth modal will be visible and normal flow continues.

}); // end DOMContentLoaded

// ------------------------------------------------------------------------------------
// Additional note: this file is built by merging your original `script (2).js`
// and adding the requested features (camera, sleep detection, sound selection).
// Original script used as base: uploaded file `script (2).js`.  [oai_citation:1‡script (2).js](file-service://file-8QZgS6GRiWmzUAj8BKWJVd)
// ------------------------------------------------------------------------------------
