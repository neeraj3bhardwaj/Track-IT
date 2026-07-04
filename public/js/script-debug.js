const socket = io();
console.log("Socket connected");

let map = null;
let userMarker = null;
let watchId = null;
let lastLocation = null;

// DOM elements
const errorMessage = document.getElementById('error-message');
const locationStatus = document.getElementById('location-status');

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    console.error('Location Error:', message);
}

// Show location status
function showStatus(message) {
    locationStatus.textContent = message;
    locationStatus.style.display = 'block';
    console.log('Location Status:', message);
    setTimeout(() => {
        locationStatus.style.display = 'none';
    }, 3000);
}

// Hide status messages
function hideStatus() {
    errorMessage.style.display = 'none';
    locationStatus.style.display = 'none';
}

// Initialize map with coordinates
function initializeMap(latitude, longitude) {
    if (!map) {
        map = L.map("map").setView([latitude, longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        console.log('Map initialized at:', latitude, longitude);
    } else {
        map.setView([latitude, longitude], 15);
        console.log('Map view updated to:', latitude, longitude);
    }

    // Update or create marker
    if (userMarker) {
        userMarker.setLatLng([latitude, longitude]);
        console.log('Marker updated to:', latitude, longitude);
    } else {
        userMarker = L.marker([latitude, longitude])
            .addTo(map)
            .bindPopup('Your current location')
            .openPopup();
        console.log('Marker created at:', latitude, longitude);
    }
}

// Get approximate location using IP (fallback)
function getApproximateLocation() {
    showStatus('Getting approximate location from IP...');
    
    fetch('https://ipapi.co/json/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('IP-based location data:', data);
            const { latitude, longitude, city, country } = data;
            
            if (latitude && longitude) {
                showStatus(`Approximate location: ${city}, ${country}`);
                initializeMap(latitude, longitude);
                socket.emit("send-location", { 
                    latitude, 
                    longitude, 
                    approximate: true,
                    source: 'ipapi',
                    city,
                    country
                });
            } else {
                throw new Error('No location data from IP API');
            }
        })
        .catch(err => {
            console.error('IP-based location error:', err);
            showError('Could not determine your location. Please check your internet connection or enable location services.');
        });
}

// Handle geolocation success
function handleGeolocationSuccess(position) {
    hideStatus();
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
    
    console.log('Geolocation success:', {
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
        altitude,
        altitudeAccuracy,
        heading,
        speed,
        timestamp: new Date(position.timestamp).toLocaleString()
    });

    // Check if this is a significant location change
    if (lastLocation) {
        const distance = calculateDistance(
            lastLocation.latitude, 
            lastLocation.longitude, 
            latitude, 
            longitude
        );
        console.log('Distance from last location:', distance.toFixed(2), 'meters');
    }

    lastLocation = { latitude, longitude };

    showStatus(`Location accuracy: ±${Math.round(accuracy)} meters`);
    
    initializeMap(latitude, longitude);
    socket.emit("send-location", { 
        latitude, 
        longitude, 
        accuracy: Math.round(accuracy),
        timestamp: new Date().toISOString(),
        source: 'geolocation'
    });
}

// Calculate distance between two coordinates in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Handle geolocation error
function handleGeolocationError(error) {
    console.error('Geolocation error details:', error);
    
    let errorMsg = '';
    let showAsError = true;
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please enable location permissions in your browser settings.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable. Trying approximate location...';
            showAsError = false;
            showStatus(errorMsg);
            setTimeout(() => getApproximateLocation(), 1000);
            return;
        case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again or check your GPS signal.';
            break;
        default:
            errorMsg = 'An unknown error occurred while getting your location.';
    }
    
    if (showAsError) {
        showError(errorMsg);
    } else {
        showStatus(errorMsg);
    }
}

// Start location tracking
function startLocationTracking() {
    console.log('Starting location tracking...');
    
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser. Using approximate location...');
        setTimeout(() => getApproximateLocation(), 1000);
        return;
    }

    showStatus('Getting your precise location...');

    // First try to get current position with high accuracy
    navigator.geolocation.getCurrentPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );

    // Then start watching for continuous updates
    watchId = navigator.geolocation.watchPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 60000,
            timeout: 30000
        }
    );
}

// Stop location tracking
function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log('Location tracking stopped');
    }
}

// Handle received location data from server
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, accuracy, approximate, source } = data;
    console.log('Received location from server:', data);
    
    if (map && !approximate) {
        // For other users' locations, you could add markers here
        console.log('Other user location:', id, latitude, longitude);
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

// Add manual location refresh button functionality
function addRefreshButton() {
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh Location';
    refreshBtn.style.position = 'absolute';
    refreshBtn.style.bottom = '20px';
    refreshBtn.style.left = '50%';
    refreshBtn.style.transform = 'translateX(-50%)';
    refreshBtn.style.zIndex = '1000';
    refreshBtn.style.padding = '10px 20px';
    refreshBtn.style.backgroundColor = '#007bff';
    refreshBtn.style.color = 'white';
    refreshBtn.style.border = 'none';
    refreshBtn.style.borderRadius = '5px';
    refreshBtn.style.cursor = 'pointer';
    
    refreshBtn.addEventListener('click', () => {
        console.log('Manual location refresh requested');
        stopLocationTracking();
        hideStatus();
        startLocationTracking();
    });
    
    document.body.appendChild(refreshBtn);
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, starting app...');
        addRefreshButton();
        startLocationTracking();
    });
} else {
    console.log('DOM already loaded, starting app...');
    addRefreshButton();
    startLocationTracking();
}

// Export functions for debugging in console
window.debugLocation = {
    start: startLocationTracking,
    stop: stopLocationTracking,
    getApproximate: getApproximateLocation,
    showError,
    showStatus
};