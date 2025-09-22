// Task Manager Application
class TaskManager {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.notificationTimers = new Map();
        this.initializeApp();
    }

    // Initialize the application
    initializeApp() {
        this.loadTasksFromStorage();
        this.bindEvents();
        this.requestNotificationPermission();
        this.renderTasks();
        this.startNotificationChecker();
        this.setupServiceWorkerMessages();
        this.preloadAudio();
    }

    // Preload and prepare audio
    preloadAudio() {
        const audio = document.getElementById('alarmSound');
        const audioBackup = document.getElementById('alarmSoundBackup');
        
        if (audio) {
            audio.volume = 1.0;
            audio.load(); // Force reload
            
            // Test if audio can be played
            audio.addEventListener('canplay', () => {
                console.log('Alarm audio loaded successfully');
            });
            
            audio.addEventListener('error', (e) => {
                console.error('Error loading alarm audio:', e);
                this.showNotification('Peringatan: File audio alarm tidak dapat dimuat. Backup sound akan digunakan.', 'warning');
            });
        }
        
        if (audioBackup) {
            audioBackup.volume = 1.0;
            audioBackup.load();
        }
    }

    // Event binding
    bindEvents() {
        // Form submission
        document.getElementById('taskForm').addEventListener('submit', (e) => this.handleAddTask(e));
        document.getElementById('editTaskForm').addEventListener('submit', (e) => this.handleEditTask(e));

        // Filter buttons
        document.querySelectorAll('.btn-filter').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterChange(e));
        });

        // Action buttons
        document.getElementById('clearCompleted').addEventListener('click', () => this.clearCompletedTasks());
        document.getElementById('testNotification').addEventListener('click', () => this.testNotification());
        document.getElementById('testAlarm').addEventListener('click', () => this.testFullAlarm());
        document.getElementById('testAudio').addEventListener('click', () => this.testAudioOnly());

        // Modal events
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelEdit').addEventListener('click', () => this.closeModal());
        
        // Close modal when clicking outside
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeModal();
            }
        });

        // Set minimum date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('taskDate').min = today;
        document.getElementById('editTaskDate').min = today;
    }

    // Add new task
    handleAddTask(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const task = {
            id: this.generateId(),
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            date: document.getElementById('taskDate').value,
            time: document.getElementById('taskTime').value,
            priority: document.getElementById('taskPriority').value,
            reminderTime: parseInt(document.getElementById('reminderTime').value),
            completed: false,
            createdAt: new Date().toISOString()
        };

        if (!task.title || !task.date || !task.time) {
            this.showNotification('Harap isi semua field yang diperlukan!', 'error');
            return;
        }

        // Check if deadline is in the past
        const deadlineDate = new Date(`${task.date}T${task.time}`);
        if (deadlineDate <= new Date()) {
            this.showNotification('Waktu deadline harus di masa depan!', 'error');
            return;
        }

        this.tasks.push(task);
        this.saveTasksToStorage();
        this.renderTasks();
        this.schedulePersistentNotification(task);
        
        // Reset form
        e.target.reset();
        
        this.showNotification('Tugas berhasil ditambahkan!', 'success');
    }

    // Edit task
    handleEditTask(e) {
        e.preventDefault();
        
        const taskId = document.getElementById('editTaskId').value;
        const taskIndex = this.tasks.findIndex(task => task.id === taskId);
        
        if (taskIndex === -1) return;

        const updatedTask = {
            ...this.tasks[taskIndex],
            title: document.getElementById('editTaskTitle').value.trim(),
            description: document.getElementById('editTaskDescription').value.trim(),
            date: document.getElementById('editTaskDate').value,
            time: document.getElementById('editTaskTime').value,
            priority: document.getElementById('editTaskPriority').value,
            reminderTime: parseInt(document.getElementById('editReminderTime').value)
        };

        // Check if deadline is in the past (only for incomplete tasks)
        const deadlineDate = new Date(`${updatedTask.date}T${updatedTask.time}`);
        if (!updatedTask.completed && deadlineDate <= new Date()) {
            this.showNotification('Waktu deadline harus di masa depan!', 'error');
            return;
        }

        // Clear old notification timer
        this.clearNotificationTimer(taskId);

        this.tasks[taskIndex] = updatedTask;
        this.saveTasksToStorage();
        this.renderTasks();
        
        // Schedule new notification if task is not completed
        if (!updatedTask.completed) {
            this.schedulePersistentNotification(updatedTask);
        }

        this.closeModal();
        this.showNotification('Tugas berhasil diperbarui!', 'success');
    }

    // Filter tasks
    handleFilterChange(e) {
        document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        this.currentFilter = e.target.dataset.filter;
        this.renderTasks();
    }

    // Toggle task completion
    toggleTaskCompletion(taskId) {
        const taskIndex = this.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return;

        this.tasks[taskIndex].completed = !this.tasks[taskIndex].completed;
        
        if (this.tasks[taskIndex].completed) {
            this.tasks[taskIndex].completedAt = new Date().toISOString();
            this.clearNotificationTimer(taskId);
            this.showNotification('Tugas telah diselesaikan!', 'success');
        } else {
            delete this.tasks[taskIndex].completedAt;
            this.schedulePersistentNotification(this.tasks[taskIndex]);
            this.showNotification('Tugas dikembalikan ke belum selesai', 'warning');
        }

        this.saveTasksToStorage();
        this.renderTasks();
    }

    // Delete task
    deleteTask(taskId) {
        if (confirm('Apakah Anda yakin ingin menghapus tugas ini?')) {
            this.clearNotificationTimer(taskId);
            this.tasks = this.tasks.filter(task => task.id !== taskId);
            this.saveTasksToStorage();
            this.renderTasks();
            this.showNotification('Tugas berhasil dihapus!', 'success');
        }
    }

    // Edit task modal
    editTask(taskId) {
        const task = this.tasks.find(task => task.id === taskId);
        if (!task) return;

        document.getElementById('editTaskId').value = task.id;
        document.getElementById('editTaskTitle').value = task.title;
        document.getElementById('editTaskDescription').value = task.description;
        document.getElementById('editTaskDate').value = task.date;
        document.getElementById('editTaskTime').value = task.time;
        document.getElementById('editTaskPriority').value = task.priority;
        document.getElementById('editReminderTime').value = task.reminderTime;

        document.getElementById('editModal').style.display = 'block';
    }

    // Close modal
    closeModal() {
        document.getElementById('editModal').style.display = 'none';
    }

    // Clear completed tasks
    clearCompletedTasks() {
        const completedTasks = this.tasks.filter(task => task.completed);
        
        if (completedTasks.length === 0) {
            this.showNotification('Tidak ada tugas yang selesai untuk dihapus', 'warning');
            return;
        }

        if (confirm(`Hapus ${completedTasks.length} tugas yang telah selesai?`)) {
            // Clear notification timers for completed tasks
            completedTasks.forEach(task => this.clearNotificationTimer(task.id));
            
            this.tasks = this.tasks.filter(task => !task.completed);
            this.saveTasksToStorage();
            this.renderTasks();
            this.showNotification(`${completedTasks.length} tugas selesai berhasil dihapus!`, 'success');
        }
    }

    // Render tasks
    renderTasks() {
        const tasksList = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');
        
        let filteredTasks = this.getFilteredTasks();
        
        if (filteredTasks.length === 0) {
            tasksList.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        
        // Sort tasks by deadline
        filteredTasks.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}`);
            const dateB = new Date(`${b.date}T${b.time}`);
            return dateA - dateB;
        });

        tasksList.innerHTML = filteredTasks.map(task => this.createTaskHTML(task)).join('');
        
        // Bind task action events
        this.bindTaskEvents();
    }

    // Get filtered tasks
    getFilteredTasks() {
        const now = new Date();
        
        switch (this.currentFilter) {
            case 'completed':
                return this.tasks.filter(task => task.completed);
            case 'pending':
                return this.tasks.filter(task => !task.completed);
            case 'overdue':
                return this.tasks.filter(task => {
                    const deadline = new Date(`${task.date}T${task.time}`);
                    return !task.completed && deadline < now;
                });
            default:
                return this.tasks;
        }
    }

    // Create task HTML
    createTaskHTML(task) {
        const deadline = new Date(`${task.date}T${task.time}`);
        const now = new Date();
        const isOverdue = !task.completed && deadline < now;
        
        const deadlineText = this.formatDeadline(deadline);
        const priorityText = this.getPriorityText(task.priority);
        
        return `
            <div class="task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${task.priority}-priority" data-task-id="${task.id}">
                <div class="task-content">
                    <div class="task-header">
                        <h3 class="task-title">${this.escapeHtml(task.title)}</h3>
                    </div>
                    
                    ${task.description ? `<p class="task-description">${this.escapeHtml(task.description)}</p>` : ''}
                    
                    <div class="task-meta">
                        <div class="task-deadline ${isOverdue ? 'overdue' : ''}">
                            <i class="fas fa-calendar-alt"></i>
                            ${deadlineText}
                        </div>
                        <div class="task-status ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}">
                            <i class="fas ${task.completed ? 'fa-check-circle' : isOverdue ? 'fa-exclamation-triangle' : 'fa-clock'}"></i>
                            ${task.completed ? 'Selesai' : isOverdue ? 'Terlambat' : 'Belum selesai'}
                        </div>
                    </div>
                </div>
                
                <div class="task-sidebar">
                    <span class="task-priority ${task.priority}">${priorityText}</span>
                    
                    <div class="task-actions">
                        <button class="btn btn-complete ${task.completed ? 'btn-secondary' : ''}" onclick="taskManager.toggleTaskCompletion('${task.id}')">
                            <i class="fas ${task.completed ? 'fa-undo' : 'fa-check'}"></i>
                            ${task.completed ? 'Batal' : 'Selesai'}
                        </button>
                        <button class="btn btn-edit" onclick="taskManager.editTask('${task.id}')">
                            <i class="fas fa-edit"></i>
                            Edit
                        </button>
                        <button class="btn btn-delete" onclick="taskManager.deleteTask('${task.id}')">
                            <i class="fas fa-trash"></i>
                            Hapus
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Bind task events
    bindTaskEvents() {
        // Events are bound through onclick attributes in createTaskHTML
        // This method is kept for potential future inline event binding
    }

    // Format deadline
    formatDeadline(deadline) {
        const now = new Date();
        const diffTime = deadline - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const dateStr = deadline.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const timeStr = deadline.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let relativeTime = '';
        if (diffTime < 0) {
            relativeTime = ' (Terlambat)';
        } else if (diffDays === 0) {
            relativeTime = ' (Hari ini)';
        } else if (diffDays === 1) {
            relativeTime = ' (Besok)';
        } else if (diffDays <= 7) {
            relativeTime = ` (${diffDays} hari lagi)`;
        }
        
        return `${dateStr}, ${timeStr}${relativeTime}`;
    }

    // Get priority text
    getPriorityText(priority) {
        const priorities = {
            low: 'Rendah',
            medium: 'Sedang',
            high: 'Tinggi'
        };
        return priorities[priority] || 'Sedang';
    }

    // Request notification permission and setup persistent notifications
    requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        this.showNotification('Notifikasi telah diaktifkan! Alarm akan berbunyi meskipun website tidak dibuka.', 'success');
                        this.setupServiceWorker();
                    } else {
                        this.showNotification('Notifikasi dinonaktifkan. Untuk alarm yang optimal, harap izinkan notifikasi.', 'warning');
                    }
                });
            } else if (Notification.permission === 'granted') {
                this.setupServiceWorker();
            }
        } else {
            this.showNotification('Browser Anda tidak mendukung notifikasi.', 'warning');
        }

        // Request persistent notification permission (for Chrome/Edge)
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            this.setupPersistentNotifications();
        }
    }

    // Setup service worker for persistent notifications
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registered successfully');
                    this.serviceWorkerRegistration = registration;
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }

    // Setup persistent notifications (background notifications)
    setupPersistentNotifications() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                // Check if push messaging is supported
                if (registration.pushManager) {
                    console.log('Push messaging is supported');
                }
            });
        }
    }

    // Schedule persistent notification that works even when browser is closed
    schedulePersistentNotification(task) {
        const deadline = new Date(`${task.date}T${task.time}`);
        const reminderTime = new Date(deadline.getTime() - (task.reminderTime * 60 * 1000));
        const now = new Date();

        if (reminderTime > now) {
            // Store in localStorage for persistent tracking
            const persistentAlarms = JSON.parse(localStorage.getItem('persistentAlarms') || '[]');
            const alarmData = {
                id: task.id,
                title: task.title,
                reminderTime: reminderTime.getTime(),
                deadline: deadline.getTime(),
                created: now.getTime()
            };
            
            persistentAlarms.push(alarmData);
            localStorage.setItem('persistentAlarms', JSON.stringify(persistentAlarms));

            // Set multiple alarm methods
            this.setMultipleAlarms(task, reminderTime);
        }
    }

    // Set multiple types of alarms for better coverage
    setMultipleAlarms(task, reminderTime) {
        const now = new Date();
        const timeUntilAlarm = reminderTime - now;

        if (timeUntilAlarm <= 0) return;

        // Method 1: Traditional setTimeout (works if page is open)
        const timeoutId = setTimeout(() => {
            this.triggerAlarm(task);
        }, timeUntilAlarm);
        this.notificationTimers.set(task.id, timeoutId);

        // Method 2: Page Visibility API alarm (works when tab becomes visible)
        this.scheduleVisibilityAlarm(task, reminderTime);

        // Method 3: Local Storage polling (background check)
        this.scheduleStorageAlarm(task, reminderTime);
    }

    // Schedule alarm that triggers when page becomes visible
    scheduleVisibilityAlarm(task, reminderTime) {
        const checkVisibility = () => {
            if (!document.hidden) {
                const now = new Date();
                if (now >= reminderTime) {
                    this.triggerAlarm(task);
                    document.removeEventListener('visibilitychange', checkVisibility);
                }
            }
        };
        document.addEventListener('visibilitychange', checkVisibility);
    }

    // Schedule alarm using localStorage polling
    scheduleStorageAlarm(task, reminderTime) {
        const alarmKey = `alarm_${task.id}`;
        localStorage.setItem(alarmKey, JSON.stringify({
            taskId: task.id,
            taskTitle: task.title,
            reminderTime: reminderTime.getTime(),
            triggered: false
        }));
    }

    // Clear notification timer
    clearNotificationTimer(taskId) {
        if (this.notificationTimers.has(taskId)) {
            clearTimeout(this.notificationTimers.get(taskId));
            this.notificationTimers.delete(taskId);
        }
    }

    // Trigger alarm with multiple methods
    triggerAlarm(task) {
        const deadline = new Date(`${task.date}T${task.time}`);
        const timeLeft = deadline - new Date();
        const minutesLeft = Math.round(timeLeft / (1000 * 60));
        
        let message = '';
        if (minutesLeft <= 0) {
            message = `⏰ DEADLINE SEKARANG: ${task.title}`;
        } else if (minutesLeft < 60) {
            message = `⏰ ALARM: ${minutesLeft} menit lagi - ${task.title}`;
        } else {
            const hoursLeft = Math.round(minutesLeft / 60);
            message = `⏰ ALARM: ${hoursLeft} jam lagi - ${task.title}`;
        }

        // Multiple notification methods
        this.showPersistentNotification(task, message);
        this.playLoudAlarmSound();
        this.showVisualAlarm(task, message);
        this.vibrate();

        // Mark as triggered in localStorage
        const alarmKey = `alarm_${task.id}`;
        const alarmData = JSON.parse(localStorage.getItem(alarmKey) || '{}');
        alarmData.triggered = true;
        localStorage.setItem(alarmKey, JSON.stringify(alarmData));

        // Remove from timer map
        this.notificationTimers.delete(task.id);
    }

    // Show persistent notification that stays until clicked
    showPersistentNotification(task, message) {
        if (Notification.permission === 'granted') {
            const notification = new Notification('🚨 ALARM TUGAS 🚨', {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff4444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff4444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                tag: `alarm_${task.id}`,
                requireInteraction: true,
                silent: false,
                vibrate: [200, 100, 200, 100, 200],
                actions: [
                    {
                        action: 'snooze',
                        title: 'Tunda 5 menit'
                    },
                    {
                        action: 'dismiss',
                        title: 'Tutup'
                    }
                ]
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
                this.stopAlarmSound();
            };

            // Keep notification alive longer
            setTimeout(() => {
                if (notification) {
                    notification.close();
                }
            }, 30000); // 30 seconds
        }
    }

    // Play loud alarm sound with repeating pattern
    playLoudAlarmSound() {
        // Stop any existing alarm
        this.stopAlarmSound();

        // Play immediate sound
        this.playAlarmSound();

        // Set repeating alarm
        this.alarmInterval = setInterval(() => {
            this.playAlarmSound();
        }, 2000); // Repeat every 2 seconds

        // Stop after 30 seconds if not manually stopped
        this.alarmTimeout = setTimeout(() => {
            this.stopAlarmSound();
        }, 30000);
    }

    // Stop alarm sound
    stopAlarmSound() {
        // Stop interval
        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }

        // Stop timeout
        if (this.alarmTimeout) {
            clearTimeout(this.alarmTimeout);
            this.alarmTimeout = null;
        }

        // Stop audio elements
        const audio = document.getElementById('alarmSound');
        const audioBackup = document.getElementById('alarmSoundBackup');
        
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        if (audioBackup) {
            audioBackup.pause();
            audioBackup.currentTime = 0;
        }
    }

    // Show visual alarm overlay
    showVisualAlarm(task, message) {
        // Remove existing alarm if any
        const existingAlarm = document.querySelector('.visual-alarm');
        if (existingAlarm) {
            existingAlarm.remove();
        }

        const alarmOverlay = document.createElement('div');
        alarmOverlay.className = 'visual-alarm';
        alarmOverlay.innerHTML = `
            <div class="alarm-content">
                <div class="alarm-icon">🚨</div>
                <h2>ALARM TUGAS!</h2>
                <p>${message}</p>
                <div class="alarm-actions">
                    <button class="btn btn-primary" onclick="this.parentElement.parentElement.parentElement.remove(); taskManager.stopAlarmSound();">
                        OK, Saya Tahu
                    </button>
                    <button class="btn btn-secondary" onclick="taskManager.snoozeAlarm('${task.id}');">
                        Tunda 5 Menit
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(alarmOverlay);

        // Auto remove after 30 seconds
        setTimeout(() => {
            if (alarmOverlay.parentNode) {
                alarmOverlay.remove();
                this.stopAlarmSound();
            }
        }, 30000);
    }

    // Vibrate device if supported
    vibrate() {
        if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
        }
    }

    // Snooze alarm for 5 minutes
    snoozeAlarm(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            const snoozeTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
            setTimeout(() => {
                this.triggerAlarm(task);
            }, 5 * 60 * 1000);
            
            this.stopAlarmSound();
            document.querySelector('.visual-alarm')?.remove();
            this.showNotification('Alarm ditunda 5 menit', 'warning');
        }
    }

    // Play alarm sound
    playAlarmSound() {
        try {
            const audio = document.getElementById('alarmSound');
            const audioBackup = document.getElementById('alarmSoundBackup');
            
            if (audio) {
                // Reset audio to beginning
                audio.currentTime = 0;
                audio.volume = 1.0; // Maximum volume
                
                // Try to play main audio
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('Alarm sound playing successfully');
                    }).catch(error => {
                        console.log('Main alarm failed, trying backup:', error);
                        this.playBackupSound(audioBackup);
                    });
                } else {
                    // Fallback for older browsers
                    audio.play();
                }
            } else {
                // No audio element, create beep
                this.createLoudBeepSound();
            }
        } catch (error) {
            console.log('Error playing alarm sound:', error);
            this.createLoudBeepSound();
        }
    }

    // Play backup sound
    playBackupSound(audioBackup) {
        try {
            if (audioBackup) {
                audioBackup.currentTime = 0;
                audioBackup.volume = 1.0;
                audioBackup.play().catch(() => {
                    this.createLoudBeepSound();
                });
            } else {
                this.createLoudBeepSound();
            }
        } catch (error) {
            this.createLoudBeepSound();
        }
    }

    // Create beep sound using Web Audio API
    createLoudBeepSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create multiple oscillators for louder sound
            for (let i = 0; i < 3; i++) {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // Different frequencies for each oscillator
                oscillator.frequency.setValueAtTime(800 + (i * 200), audioContext.currentTime);
                oscillator.type = 'sawtooth'; // More aggressive sound
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 1);
            }
        } catch (error) {
            console.log('Could not create beep sound:', error);
            // Last resort: system beep
            console.log('\x07'); // ASCII bell character
        }
    }

    // Test notification
    testNotification() {
        if (Notification.permission === 'granted') {
            new Notification('Test Notifikasi', {
                body: 'Notifikasi berfungsi dengan baik! 🔔',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23667eea"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
            });
        } else {
            this.requestNotificationPermission();
        }
        
        this.playAlarmSound();
        this.showNotification('Test notifikasi berhasil!', 'success');
    }

    // Test full alarm system
    testFullAlarm() {
        const testTask = {
            id: 'test_alarm',
            title: 'Test Alarm System',
            description: 'Ini adalah test alarm untuk memastikan semua fitur berfungsi'
        };
        
        this.triggerAlarm(testTask);
        this.showNotification('🚨 Test alarm penuh dijalankan!', 'warning');
    }

    // Test audio only
    testAudioOnly() {
        this.showNotification('🎵 Testing audio WAV file...', 'info');
        
        // Enable audio context first (required by browsers)
        this.enableAudioContext().then(() => {
            this.playLoudAlarmSound();
            this.showNotification('Audio WAV sedang diputar! Jika tidak terdengar, periksa volume atau file audio.', 'success');
        }).catch(error => {
            console.error('Audio test failed:', error);
            this.showNotification('Gagal memutar audio. Coba klik halaman dulu untuk mengaktifkan audio.', 'error');
        });
    }

    // Enable audio context (required by modern browsers)
    enableAudioContext() {
        return new Promise((resolve, reject) => {
            try {
                const audio = document.getElementById('alarmSound');
                if (audio) {
                    // Try to play and immediately pause to enable audio context
                    const playPromise = audio.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            audio.pause();
                            audio.currentTime = 0;
                            resolve();
                        }).catch(error => {
                            reject(error);
                        });
                    } else {
                        resolve();
                    }
                } else {
                    reject(new Error('Audio element not found'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // Start notification checker (checks every minute)
    startNotificationChecker() {
        // Check for alarms every 10 seconds for better responsiveness
        setInterval(() => {
            this.checkPendingAlarms();
            this.checkOverdueTasks();
        }, 10000); // Check every 10 seconds

        // Also check when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkPendingAlarms();
            }
        });

        // Check on page load
        this.checkPendingAlarms();
    }

    // Check for pending alarms in localStorage
    checkPendingAlarms() {
        const now = new Date().getTime();
        
        // Check individual alarms
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('alarm_')) {
                try {
                    const alarmData = JSON.parse(localStorage.getItem(key));
                    if (alarmData && !alarmData.triggered && now >= alarmData.reminderTime) {
                        const task = this.tasks.find(t => t.id === alarmData.taskId);
                        if (task && !task.completed) {
                            this.triggerAlarm(task);
                            // Mark as triggered
                            alarmData.triggered = true;
                            localStorage.setItem(key, JSON.stringify(alarmData));
                        }
                    }
                } catch (error) {
                    console.error('Error checking alarm:', error);
                }
            }
        });

        // Clean up old triggered alarms (older than 24 hours)
        this.cleanupOldAlarms();
    }

    // Clean up old alarm data
    cleanupOldAlarms() {
        const now = new Date().getTime();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('alarm_')) {
                try {
                    const alarmData = JSON.parse(localStorage.getItem(key));
                    if (alarmData && (alarmData.triggered || alarmData.reminderTime < oneDayAgo)) {
                        localStorage.removeItem(key);
                    }
                } catch (error) {
                    localStorage.removeItem(key);
                }
            }
        });
    }

    // Check for overdue tasks
    checkOverdueTasks() {
        const now = new Date();
        const overdueTasks = this.tasks.filter(task => {
            if (task.completed) return false;
            const deadline = new Date(`${task.date}T${task.time}`);
            return deadline < now;
        });

        // Update UI if there are overdue tasks
        if (overdueTasks.length > 0) {
            this.renderTasks();
        }
    }

    // Show notification toast
    showNotification(message, type = 'info') {
        // Remove existing notification if any
        const existingToast = document.querySelector('.notification-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas ${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(toast);

        // Show toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Hide toast after 4 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    }

    // Get notification icon
    getNotificationIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    // Storage methods
    saveTasksToStorage() {
        try {
            localStorage.setItem('taskManagerTasks', JSON.stringify(this.tasks));
        } catch (error) {
            console.error('Error saving tasks to storage:', error);
            this.showNotification('Gagal menyimpan data tugas', 'error');
        }
    }

    loadTasksFromStorage() {
        try {
            const stored = localStorage.getItem('taskManagerTasks');
            if (stored) {
                this.tasks = JSON.parse(stored);
                
                // Reschedule notifications for incomplete tasks
                this.tasks.forEach(task => {
                    if (!task.completed) {
                        this.schedulePersistentNotification(task);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading tasks from storage:', error);
            this.showNotification('Gagal memuat data tugas', 'error');
            this.tasks = [];
        }
    }

    // Setup service worker messages
    setupServiceWorkerMessages() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const { action, taskId } = event.data;
                
                switch (action) {
                    case 'checkAlarms':
                        this.checkPendingAlarms();
                        break;
                    case 'snooze':
                        this.snoozeAlarm(taskId);
                        break;
                    default:
                        console.log('Unknown service worker message:', event.data);
                }
            });
        }
    }

    // Utility methods
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.taskManager = new TaskManager();
});

// Service Worker registration for better offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}