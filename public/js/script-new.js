const socket = io();
console.log("Socket connected");

let map = null;
let userMarker = null;
let watchId = null;

// DOM elements
const errorMessage = document.getElementById('error-message');
const locationStatus = document.getElementById('location-status');

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Show location status
function showStatus(message) {
    locationStatus.textContent = message;
    locationStatus.style.display = 'block';
    setTimeout(() => {
        locationStatus.style.display = 'none';
    }, 3000);
}

// Initialize map with coordinates
function initializeMap(latitude, longitude) {
    if (!map) {
        map = L.map("map").setView([latitude, longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    } else {
        map.setView([latitude, longitude], 15);
    }

    // Update or create marker
    if (userMarker) {
        userMarker.setLatLng([latitude, longitude]);
    } else {
        userMarker = L.marker([latitude, longitude])
            .addTo(map)
            .bindPopup('Your current location')
            .openPopup();
    }
}

// Get approximate location using IP (fallback)
function getApproximateLocation() {
    fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
            const { latitude, longitude, city, country } = data;
            showStatus(`Using approximate location: ${city}, ${country}`);
            initializeMap(latitude, longitude);
            socket.emit("send-location", { latitude, longitude, approximate: true });
        })
        .catch(err => {
            showError('Could not determine your location. Please check your internet connection.');
            console.error('IP-based location error:', err);
        });
}

// Handle geolocation success
function handleGeolocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    showStatus(`Location accuracy: ±${Math.round(accuracy)} meters`);
    
    initializeMap(latitude, longitude);
    socket.emit("send-location", { 
        latitude, 
        longitude, 
        accuracy: Math.round(accuracy),
        timestamp: new Date().toISOString()
    });
}

// Handle geolocation error
function handleGeolocationError(error) {
    let errorMsg = '';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please enable location permissions in your browser settings.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable. Trying approximate location...';
            showStatus(errorMsg);
            getApproximateLocation();
            return;
        case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        default:
            errorMsg = 'An unknown error occurred while getting your location.';
    }
    
    showError(errorMsg);
    console.error('Geolocation error:', error);
}

// Start location tracking
function startLocationTracking() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser. Using approximate location...');
        getApproximateLocation();
        return;
    }

    showStatus('Getting your location...');

    // First try to get current position with high accuracy
    navigator.geolocation.getCurrentPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );

    // Then start watching for continuous updates with less strict settings
    watchId = navigator.geolocation.watchPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000
        }
    );
}

// Stop location tracking
function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// Handle received location data from server
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, accuracy, approximate } = data;
    
    if (map && !approximate) {
        // For other users' locations, you could add markers here
        console.log('Received location from:', id, latitude, longitude);
    }
});

// Handle socket connection events
socket.on('connect', () => {
    console.log('Socket connected');
    startLocationTracking();
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    stopLocationTracking();
    showError('Connection lost. Reconnecting...');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showError('Connection error. Please check your internet connection.');
});

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startLocationTracking);
} else {
    startLocationTracking();
}