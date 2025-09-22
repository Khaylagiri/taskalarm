// Service Worker for Task Manager
// This enables background notifications and offline functionality

const CACHE_NAME = 'task-manager-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});

// Background sync for alarm checking
self.addEventListener('sync', (event) => {
    if (event.tag === 'alarm-check') {
        event.waitUntil(checkAlarms());
    }
});

// Check for pending alarms
async function checkAlarms() {
    try {
        // Get all clients (open tabs)
        const clients = await self.clients.matchAll();
        
        if (clients.length === 0) {
            // No tabs open, check localStorage through indexedDB or postMessage
            // For now, we'll rely on the main script checking when tabs become active
            console.log('No active clients, alarms will be checked when app reopens');
            return;
        }

        // Send message to all clients to check alarms
        clients.forEach(client => {
            client.postMessage({
                action: 'checkAlarms',
                timestamp: Date.now()
            });
        });
    } catch (error) {
        console.error('Error checking alarms:', error);
    }
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const action = event.action;

    if (action === 'snooze') {
        // Handle snooze action
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                if (clients.length > 0) {
                    clients[0].postMessage({
                        action: 'snooze',
                        taskId: notification.tag.replace('alarm_', '')
                    });
                }
            })
        );
    } else if (action === 'dismiss') {
        // Just close the notification
        notification.close();
        return;
    } else {
        // Default click - open/focus the app
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then(clients => {
                // Check if app is already open
                for (const client of clients) {
                    if (client.url.includes('index.html') || client.url.endsWith('/')) {
                        client.focus();
                        return;
                    }
                }
                // If not open, open new window
                return self.clients.openWindow('./index.html');
            })
        );
    }
    
    notification.close();
});

// Handle push events (for future push notification support)
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Pengingat tugas',
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
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
    };

    event.waitUntil(
        self.registration.showNotification('🚨 Alarm Tugas', options)
    );
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'alarm-check') {
        event.waitUntil(checkAlarms());
    }
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    const { action, data } = event.data;
    
    switch (action) {
        case 'scheduleAlarm':
            // Store alarm data for background checking
            // This would typically use IndexedDB for persistent storage
            console.log('Alarm scheduled:', data);
            break;
        case 'cancelAlarm':
            // Cancel scheduled alarm
            console.log('Alarm cancelled:', data);
            break;
        default:
            console.log('Unknown message action:', action);
    }
});

// Setup background alarm checking
function setupBackgroundAlarmCheck() {
    // Check every minute for alarms
    setInterval(() => {
        checkAlarms();
    }, 60000);
}

// Initialize background checking
setupBackgroundAlarmCheck();