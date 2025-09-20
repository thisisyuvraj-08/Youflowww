// FIREBASE SDKs - Imported from index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

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
        journalEntries: {},
        timetable: {},
        settings: {
            workDuration: 25 * 60,
            shortBreakDuration: 5 * 60,
            longBreakDuration: 15 * 60,
            soundProfile: "indian",
            isAccountabilityOn: false,
        },
        theme: { backgroundPath: null, youtubeVideoId: null },
        // New data structures
        timetableSlots: {},
        journal: {
            dailyGoal: "",
            mood: 3,
            entries: {}
        },
        stats: {
            longestSession: 0,
            bestStreak: 0,
            mostProductiveDay: "Monday",
            bestTimeOfDay: "Morning"
        }
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
        goalInput: document.getElementById("daily-goal"),
        goalCharCount: document.getElementById("goal-char-count"),
        username: document.getElementById("journal-username"),
        saveBtn: document.getElementById("save-journal-btn"),
        moodOptions: document.querySelectorAll(".mood-option")
    },
    timetable: {
        section: document.getElementById("timetable-section"),
        daysHeaders: document.querySelectorAll(".day-header"),
        daysContainers: document.querySelectorAll(".timetable-day"),
        addSlotBtn: document.getElementById("add-timeslot-btn"),
        addSlotModal: document.getElementById("add-timeslot-modal"),
        timeslotForm: document.getElementById("timeslot-form"),
        currentWeekDisplay: document.getElementById("current-week-display")
    },
    stats: {
        modal: document.getElementById("statsModal"),
        currentStreak: document.getElementById("stat-current-streak"),
        bestStreak: document.getElementById("stat-best-streak"),
        totalFocus: document.getElementById("stat-total-focus"),
        totalSessions: document.getElementById("stat-total-sessions"),
        longestSession: document.getElementById("longest-session"),
        mostProductiveDay: document.getElementById("most-productive-day"),
        bestTimeOfDay: document.getElementById("best-time-of-day"),
        tabs: document.querySelectorAll(".stats-tab"),
        tabContents: document.querySelectorAll("[data-tab-content]")
    },
    macDock: document.getElementById("mac-dock"),
    dockItems: document.querySelectorAll(".dock-item")
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
        
        // Update streak
        updateStreak();
        
        const today = new Date().toISOString().slice(0, 10);
        if (!currentUserData.weeklyFocus) currentUserData.weeklyFocus = {};
        currentUserData.weeklyFocus[today] = (currentUserData.weeklyFocus[today] || 0) + minutesFocused;
        
        // Update longest session if applicable
        if (minutesFocused > (currentUserData.stats.longestSession || 0)) {
            currentUserData.stats.longestSession = minutesFocused;
        }
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
    
    // Update best streak if applicable
    if (currentUserData.streakCount > (currentUserData.stats.bestStreak || 0)) {
        currentUserData.stats.bestStreak = currentUserData.streakCount;
    }
    
    // Update streak display
    DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
}

// ===================================================================================
// TODO LIST ENHANCEMENTS
// ===================================================================================
function setupTodoList() {
    // Add event listener for Enter key in todo input
    document.getElementById('todo-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTodo();
        }
    });
    
    // Add event delegation for subtask input Enter key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('subtask-text')) {
            e.preventDefault();
            const input = e.target;
            const todoItem = input.closest('.todo-item');
            const index = parseInt(todoItem.dataset.index);
            
            if (input.value.trim()) {
                if (!currentUserData.todos[index].subtasks) currentUserData.todos[index].subtasks = [];
                currentUserData.todos[index].subtasks.push({
                    text: input.value.trim(),
                    completed: false
                });
                saveUserData();
                input.value = '';
                loadTodos();
            }
        }
    });
}

// ===================================================================================
// TIMETABLE ENHANCEMENTS
// ===================================================================================
function initTimetable() {
    // Set up week navigation
    setupWeekNavigation();
    
    // Set up add timeslot modal
    setupTimeslotModal();
    
    // Load timetable data
    loadTimetableData();
    
    // Highlight current day and time
    highlightCurrentDayAndTime();
    
    // Update every minute to keep current time highlight updated
    setInterval(highlightCurrentDayAndTime, 60000);
}

function setupWeekNavigation() {
    let currentWeekOffset = 0;
    
    // Set initial week display
    updateWeekDisplay();
    
    // Previous week button
    document.getElementById('prev-week-btn').addEventListener('click', () => {
        currentWeekOffset--;
        updateWeekDisplay();
        loadTimetableData();
    });
    
    // Next week button
    document.getElementById('next-week-btn').addEventListener('click', () => {
        currentWeekOffset++;
        updateWeekDisplay();
        loadTimetableData();
    });
    
    function updateWeekDisplay() {
        const now = new Date();
        const currentDate = new Date(now);
        currentDate.setDate(now.getDate() + currentWeekOffset * 7);
        
        // Get Monday of this week
        const monday = new Date(currentDate);
        const day = monday.getDay();
        const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
        monday.setDate(diff);
        
        // Get Sunday of this week
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        // Format dates
        const options = { month: 'short', day: 'numeric' };
        const mondayStr = monday.toLocaleDateString('en-US', options);
        const sundayStr = sunday.toLocaleDateString('en-US', options);
        const year = monday.getFullYear();
        
        // Update display
        DOMElements.timetable.currentWeekDisplay.textContent = `${mondayStr} - ${sundayStr}, ${year}`;
        
        // Update day headers
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach((day, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayDate = date.getDate();
            
            const dayHeader = document.querySelector(`.day-header[data-day="${day}"]`);
            if (dayHeader) {
                dayHeader.querySelector('.day-name').textContent = dayName;
                dayHeader.querySelector('.day-date').textContent = dayDate;
                
                // Check if this is today
                const today = new Date();
                if (date.toDateString() === today.toDateString()) {
                    dayHeader.classList.add('current-day');
                } else {
                    dayHeader.classList.remove('current-day');
                }
            }
        });
    }
}

function setupTimeslotModal() {
    // Open modal when Add Time Slot button is clicked
    DOMElements.timetable.addSlotBtn.addEventListener('click', () => {
        DOMElements.timetable.addSlotModal.classList.add('visible');
    });
    
    // Close modal when close button is clicked
    DOMElements.timetable.addSlotModal.querySelector('.close-btn').addEventListener('click', () => {
        DOMElements.timetable.addSlotModal.classList.remove('visible');
    });
    
    // Close modal when cancel button is clicked
    DOMElements.timetable.addSlotModal.querySelector('.btn-cancel').addEventListener('click', () => {
        DOMElements.timetable.addSlotModal.classList.remove('visible');
    });
    
    // Handle form submission
    DOMElements.timetable.timeslotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const day = document.getElementById('timeslot-day').value;
        const startTime = document.getElementById('timeslot-start').value;
        const endTime = document.getElementById('timeslot-end').value;
        const activity = document.getElementById('timeslot-activity').value;
        
        if (startTime >= endTime) {
            alert('End time must be after start time');
            return;
        }
        
        addTimeslot(day, startTime, endTime, activity);
        DOMElements.timetable.addSlotModal.classList.remove('visible');
        DOMElements.timetable.timeslotForm.reset();
    });
}

function addTimeslot(day, startTime, endTime, activity) {
    if (!currentUserData.timetableSlots) currentUserData.timetableSlots = {};
    if (!currentUserData.timetableSlots[day]) currentUserData.timetableSlots[day] = [];
    
    // Add new timeslot
    currentUserData.timetableSlots[day].push({
        startTime,
        endTime,
        activity,
        completed: false
    });
    
    saveUserData();
    renderTimetable();
}

function loadTimetableData() {
    renderTimetable();
}

function renderTimetable() {
    // Clear all timeslots
    document.querySelectorAll('.timeslot').forEach(slot => slot.remove());
    
    // Generate time labels
    generateTimeLabels();
    
    // Render timeslots for each day
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const dayContainer = document.querySelector(`.timetable-day[data-day="${day}"]`);
        if (!dayContainer) return;
        
        const timeslots = currentUserData.timetableSlots && currentUserData.timetableSlots[day] 
            ? currentUserData.timetableSlots[day] 
            : [];
        
        timeslots.forEach((timeslot, index) => {
            const timeslotElement = createTimeslotElement(day, timeslot, index);
            dayContainer.appendChild(timeslotElement);
        });
    });
}

function generateTimeLabels() {
    const timeLabelsContainer = document.querySelector('.time-labels');
    timeLabelsContainer.innerHTML = '';
    
    for (let hour = 0; hour < 24; hour++) {
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.textContent = `${hour}:00`;
        timeLabelsContainer.appendChild(timeLabel);
    }
}

function createTimeslotElement(day, timeslot, index) {
    const { startTime, endTime, activity, completed } = timeslot;
    
    // Parse start and end times
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    // Calculate position and height
    const startPosition = (startHour * 60 + startMinute) / 1440 * 100;
    const duration = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 1440 * 100;
    
    // Create timeslot element
    const timeslotElement = document.createElement('div');
    timeslotElement.className = 'timeslot';
    timeslotElement.style.top = `${startPosition}%`;
    timeslotElement.style.height = `${duration}%`;
    
    if (completed) {
        timeslotElement.classList.add('completed');
    }
    
    // Check if this is the current timeslot
    const now = new Date();
    const currentDay = now.getDay();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = days[currentDay];
    
    if (day === currentDayName) {
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;
        
        if (currentTime >= startTimeMinutes && currentTime < endTimeMinutes) {
            timeslotElement.classList.add('current');
        }
    }
    
    // Add timeslot content
    timeslotElement.innerHTML = `
        <div class="timeslot-content">
            <div class="timeslot-activity">${activity}</div>
            <div class="timeslot-actions">
                <button class="timeslot-action complete-btn" title="Mark as completed">✓</button>
                <button class="timeslot-action delete-btn" title="Delete">×</button>
            </div>
        </div>
    `;
    
    // Add event listeners
    timeslotElement.querySelector('.complete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTimeslotCompletion(day, index);
    });
    
    timeslotElement.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTimeslot(day, index);
    });
    
    timeslotElement.addEventListener('click', () => {
        editTimeslot(day, index);
    });
    
    return timeslotElement;
}

function toggleTimeslotCompletion(day, index) {
    if (currentUserData.timetableSlots && currentUserData.timetableSlots[day]) {
        currentUserData.timetableSlots[day][index].completed = 
            !currentUserData.timetableSlots[day][index].completed;
        saveUserData();
        renderTimetable();
    }
}

function deleteTimeslot(day, index) {
    if (confirm('Are you sure you want to delete this timeslot?')) {
        if (currentUserData.timetableSlots && currentUserData.timetableSlots[day]) {
            currentUserData.timetableSlots[day].splice(index, 1);
            saveUserData();
            renderTimetable();
        }
    }
}

function editTimeslot(day, index) {
    if (currentUserData.timetableSlots && currentUserData.timetableSlots[day]) {
        const timeslot = currentUserData.timetableSlots[day][index];
        
        // Populate form with existing data
        document.getElementById('timeslot-day').value = day;
        document.getElementById('timeslot-start').value = timeslot.startTime;
        document.getElementById('timeslot-end').value = timeslot.endTime;
        document.getElementById('timeslot-activity').value = timeslot.activity;
        
        // Show modal
        DOMElements.timetable.addSlotModal.classList.add('visible');
        
        // Change submit button text
        const submitBtn = DOMElements.timetable.timeslotForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Update Time Slot';
        
        // Remove previous submit handler
        const newForm = DOMElements.timetable.timeslotForm.cloneNode(true);
        DOMElements.timetable.timeslotForm.parentNode.replaceChild(newForm, DOMElements.timetable.timeslotForm);
        DOMElements.timetable.timeslotForm = newForm;
        
        // Add new submit handler
        DOMElements.timetable.timeslotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const newDay = document.getElementById('timeslot-day').value;
            const startTime = document.getElementById('timeslot-start').value;
            const endTime = document.getElementById('timeslot-end').value;
            const activity = document.getElementById('timeslot-activity').value;
            
            if (startTime >= endTime) {
                alert('End time must be after start time');
                return;
            }
            
            // Update timeslot
            if (newDay === day) {
                // Same day, just update the timeslot
                currentUserData.timetableSlots[day][index] = {
                    startTime,
                    endTime,
                    activity,
                    completed: timeslot.completed
                };
            } else {
                // Different day, remove from old day and add to new day
                currentUserData.timetableSlots[day].splice(index, 1);
                
                if (!currentUserData.timetableSlots[newDay]) {
                    currentUserData.timetableSlots[newDay] = [];
                }
                
                currentUserData.timetableSlots[newDay].push({
                    startTime,
                    endTime,
                    activity,
                    completed: timeslot.completed
                });
            }
            
            saveUserData();
            renderTimetable();
            DOMElements.timetable.addSlotModal.classList.remove('visible');
            
            // Reset form and button text
            DOMElements.timetable.timeslotForm.reset();
            submitBtn.textContent = 'Add Time Slot';
        });
    }
}

function highlightCurrentDayAndTime() {
    const now = new Date();
    const currentDay = now.getDay();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = days[currentDay];
    
    // Highlight current day header
    document.querySelectorAll('.day-header').forEach(header => {
        if (header.dataset.day === currentDayName) {
            header.classList.add('current-day');
        } else {
            header.classList.remove('current-day');
        }
    });
    
    // Highlight current timeslots
    document.querySelectorAll('.timeslot').forEach(timeslot => {
        timeslot.classList.remove('current');
        
        const dayContainer = timeslot.closest('.timetable-day');
        if (dayContainer && dayContainer.dataset.day === currentDayName) {
            const activity = timeslot.querySelector('.timeslot-activity').textContent;
            const timeslots = currentUserData.timetableSlots[currentDayName] || [];
            const timeslotData = timeslots.find(ts => ts.activity === activity);
            
            if (timeslotData) {
                const [startHour, startMinute] = timeslotData.startTime.split(':').map(Number);
                const [endHour, endMinute] = timeslotData.endTime.split(':').map(Number);
                
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentTime = currentHour * 60 + currentMinute;
                const startTimeMinutes = startHour * 60 + startMinute;
                const endTimeMinutes = endHour * 60 + endMinute;
                
                if (currentTime >= startTimeMinutes && currentTime < endTimeMinutes) {
                    timeslot.classList.add('current');
                }
            }
        }
    });
}

// ===================================================================================
// JOURNAL ENHANCEMENTS
// ===================================================================================
function initJournal() {
    // Set up journal username
    DOMElements.journal.username.textContent = currentUserData.profileName || "Floww User";
    
    // Set up current date
    updateJournalDate();
    
    // Set up character counters
    DOMElements.journal.entry.addEventListener('input', updateJournalCharCount);
    DOMElements.journal.goalInput.addEventListener('input', updateGoalCharCount);
    
    // Set up mood selection
    setupMoodSelection();
    
    // Set up save button
    DOMElements.journal.saveBtn.addEventListener('click', saveJournalEntry);
    
    // Load existing journal data
    loadJournalData();
}

function updateJournalDate() {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayName = days[now.getDay()];
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    
    document.querySelector('.journal-day').textContent = dayName;
    document.querySelector('.journal-full-date').textContent = `${month} ${year}`;
}

function updateJournalCharCount() {
    const count = DOMElements.journal.entry.value.length;
    DOMElements.journal.charCount.textContent = count;
}

function updateGoalCharCount() {
    const count = DOMElements.journal.goalInput.value.length;
    DOMElements.journal.goalCharCount.textContent = count;
}

function setupMoodSelection() {
    DOMElements.journal.moodOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            DOMElements.journal.moodOptions.forEach(opt => {
                opt.removeAttribute('data-selected');
            });
            
            // Add selected class to clicked option
            option.setAttribute('data-selected', 'true');
            
            // Save mood selection
            const moodValue = parseInt(option.dataset.mood);
            if (!currentUserData.journal) currentUserData.journal = {};
            currentUserData.journal.mood = moodValue;
            saveUserData();
        });
    });
}

function saveJournalEntry() {
    const entryText = DOMElements.journal.entry.value;
    const goalText = DOMElements.journal.goalInput.value;
    
    if (!currentUserData.journal) currentUserData.journal = {};
    if (!currentUserData.journal.entries) currentUserData.journal.entries = {};
    
    const today = new Date().toISOString().slice(0, 10);
    
    // Save entry
    currentUserData.journal.entries[today] = {
        text: entryText,
        goal: goalText,
        mood: currentUserData.journal.mood || 3,
        date: today
    };
    
    saveUserData();
    
    // Show confirmation
    const saveBtn = DOMElements.journal.saveBtn;
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
    
    setTimeout(() => {
        saveBtn.innerHTML = originalText;
    }, 2000);
}

function loadJournalData() {
    const today = new Date().toISOString().slice(0, 10);
    
    if (currentUserData.journal && currentUserData.journal.entries && currentUserData.journal.entries[today]) {
        const entry = currentUserData.journal.entries[today];
        
        // Load entry text
        DOMElements.journal.entry.value = entry.text || '';
        updateJournalCharCount();
        
        // Load goal
        DOMElements.journal.goalInput.value = entry.goal || '';
        updateGoalCharCount();
        
        // Load mood
        const mood = entry.mood || 3;
        DOMElements.journal.moodOptions.forEach(option => {
            if (parseInt(option.dataset.mood) === mood) {
                option.setAttribute('data-selected', 'true');
            } else {
                option.removeAttribute('data-selected');
            }
        });
    }
}

// ===================================================================================
// STATS ENHANCEMENTS
// ===================================================================================
function initStats() {
    // Set up stats tabs
    setupStatsTabs();
    
    // Load stats data
    loadStatsData();
}

function setupStatsTabs() {
    DOMElements.stats.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Remove active class from all tabs
            DOMElements.stats.tabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all tab contents
            DOMElements.stats.tabContents.forEach(content => {
                content.classList.add('hidden');
            });
            
            // Show selected tab content
            document.querySelector(`[data-tab-content="${tabName}"]`).classList.remove('hidden');
        });
    });
}

function loadStatsData() {
    // Update overview stats
    DOMElements.stats.currentStreak.textContent = currentUserData.streakCount || 0;
    DOMElements.stats.bestStreak.textContent = currentUserData.stats.bestStreak || 0;
    
    const totalMinutes = currentUserData.totalFocusMinutes || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    DOMElements.stats.totalFocus.textContent = `${hours}h ${minutes}m`;
    
    DOMElements.stats.totalSessions.textContent = currentUserData.totalSessions || 0;
    DOMElements.stats.longestSession.textContent = `${currentUserData.stats.longestSession || 0} minutes`;
    DOMElements.stats.mostProductiveDay.textContent = currentUserData.stats.mostProductiveDay || "Monday";
    DOMElements.stats.bestTimeOfDay.textContent = currentUserData.stats.bestTimeOfDay || "Morning";
    
    // Render charts
    renderStatsCharts();
}

function renderStatsCharts() {
    // This would be implemented with Chart.js
    // For now, we'll just log that charts would be rendered
    console.log("Rendering stats charts...");
}

// ===================================================================================
// macOS DOCK ENHANCEMENTS
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
    // Hide all sections first
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    
    // Close any open modals
    document.querySelectorAll('.modal.visible').forEach(modal => {
        modal.classList.remove('visible');
    });
    
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
    setupTodoList();
    initJournal();
    initTimetable();
    initStats();
    initMacDock();
    initYoutubePlayer();
    
    // Update streak display
    DOMElements.streak.count.textContent = currentUserData.streakCount || 0;
}

// ===================================================================================
// EVENT LISTENERS
// ===================================================================================
function attachMainAppEventListeners() {
    // Existing event listeners...
    DOMElements.playPauseBtn.addEventListener('click', () => isRunning ? pauseTimer() : startTimer(true));
    DOMElements.resetBtn.addEventListener('click', resetTimer);
    DOMElements.endSessionBtn.addEventListener('click', endSession);
    document.getElementById('changeNameBtn').addEventListener('click', () => { const newName = prompt("Enter new name:", currentUserData.profileName); if (newName && newName.trim()) { currentUserData.profileName = newName.trim(); saveUserData(); DOMElements.profile.nameDisplay.textContent = newName.trim(); } });
    document.getElementById('statsBtn').addEventListener('click', openStats);
    DOMElements.modals.stats.querySelector('.close-btn').addEventListener('click', closeStats);
    document.getElementById('closeCompletionModalBtn').addEventListener('click', () => DOMElements.modals.completion.classList.remove('visible'));
    document.getElementById('closeReviewModalBtn').addEventListener('click', () => DOMElements.modals.review.classList.remove('visible'));
    
    // Add todo button
    document.getElementById("add-todo-btn").addEventListener('click', addTodo);
    
    // Clear todos button
    document.querySelector('.clear-todos-btn').addEventListener('click', clearTodos);
    
    // And all other existing event listeners...
}

// ===================================================================================
// INITIALIZATION
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    attachMainAppEventListeners();
    setInterval(updateCornerWidget, 60000);
    updateCornerWidget();
});
