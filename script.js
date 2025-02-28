let map, routeLayer, driverMarker;
let selectedRideType = "economy";
let bookingData = {};
let rideHistory = JSON.parse(localStorage.getItem("rideHistory")) || [];
let user = JSON.parse(localStorage.getItem("user")) || null;
let drivers = JSON.parse(localStorage.getItem("drivers")) || [];

function initMap() {
    map = L.map("map").setView([20.5937, 78.9629], 5); // Default to India
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(map);

    checkAuthStatus();
    setupThemeToggle();
}

function checkAuthStatus() {
    const bookingPanel = document.getElementById("booking-panel");
    if (!user) {
        bookingPanel.innerHTML = `
            <h1>Sign In</h1>
            <div class="auth-section">
                <input type="email" id="email-login" placeholder="Email" required>
                <input type="password" id="password-login" placeholder="Password" required>
                <button id="login-btn">Login</button>
                <button id="signup-btn">Sign Up</button>
                <button id="driver-signup-btn">Join as Driver</button>
            </div>`;
        setupAuth();
    } else {
        const isDriver = user.role === "driver";
        bookingPanel.innerHTML = `
            <h1>${isDriver ? "Driver Dashboard" : "Where to?"}</h1>
            ${isDriver ? `
                <div id="driver-dashboard">
                    <p>Status: <span id="driver-status-text">${user.available ? "Available" : "Unavailable"}</span></p>
                    <button id="toggle-availability">${user.available ? "Go Offline" : "Go Online"}</button>
                    <h3>Assigned Rides</h3>
                    <ul id="assigned-rides"></ul>
                </div>
            ` : ""}
            <div class="location-inputs">
                <div class="input-group">
                    <span class="dot pickup"></span>
                    <input type="text" id="pickup" placeholder="Enter pickup location" required>
                    <ul class="suggestions" id="pickup-suggestions"></ul>
                </div>
                <div class="input-group extra-stop" style="display: none;">
                    <span class="dot stop"></span>
                    <input type="text" id="extra-stop" placeholder="Add extra stop">
                    <ul class="suggestions" id="extra-stop-suggestions"></ul>
                </div>
                <div class="input-group">
                    <span class="dot destination"></span>
                    <input type="text" id="destination" placeholder="Enter destination" required>
                    <ul class="suggestions" id="destination-suggestions"></ul>
                </div>
            </div>
            <button id="add-stop-btn">Add Stop</button>
            <div class="ride-options">
                <div class="ride-type active" data-type="economy"><img src="economy.png" alt="Economy"><span>Economy</span><span class="price">₹0</span></div>
                <div class="ride-type" data-type="premium"><img src="premium.png" alt="Premium"><span>Premium</span><span class="price">₹0</span></div>
                <div class="ride-type" data-type="luxury"><img src="luxury.png" alt="Luxury"><span>Luxury</span><span class="price">₹0</span></div>
                <div class="ride-type" data-type="bike"><img src="bike.png" alt="Bike"><span>Bike</span><span class="price">₹0</span></div>
                <div class="ride-type" data-type="pool"><img src="pool.png" alt="Pool"><span>Pool</span><span class="price">₹0</span></div>
            </div>
            <div class="fare-details-container">
        <div class="fare-details-grid">
            <div class="fare-item">
                <span class="fare-label">Distance:</span>
                <span id="distance"> -- km</span>
            </div>
            <div class="fare-item">
                <span class="fare-label">Duration:</span>
                <span id="duration"> -- min</span>
            </div>
            <div class="fare-item">
                <span class="fare-label">Weather:</span>
                <span id="weather-info">Checking...</span>
            </div>
            <div class="fare-item fare-estimate">
                <span class="fare-label">Estimated Fare:</span>
                <span id="fare-estimate">₹--</span>
            </div>
        </div>
    </div>
    <div class="action-buttons">
        <input type="datetime-local" id="schedule-time" style="display: none;">
        <button id="schedule-btn" class="secondary-btn">Schedule Ride</button>
        <button id="book-btn" class="primary-btn" disabled>Book Now</button>
    </div>`;
        document.getElementById("profile-btn").textContent = user.name.split(" ")[0];
        
        getUserLocation();
        setupAutocomplete("pickup", "pickup-suggestions");
        setupAutocomplete("destination", "destination-suggestions");
        setupAutocomplete("extra-stop", "extra-stop-suggestions");
        setupRideOptions();
        setupBooking();
        if (isDriver) setupDriverDashboard();
        setupProfile();
    }
}

function setupAuth() {
    document.getElementById("login-btn").addEventListener("click", () => authenticate("login"));
    document.getElementById("signup-btn").addEventListener("click", () => authenticate("signup"));
    document.getElementById("driver-signup-btn").addEventListener("click", setupDriverSignup);

    function authenticate(type) {
        const email = document.getElementById("email-login").value;
        const password = document.getElementById("password-login").value;
        if (!email || !password) return alert("Please fill in all fields.");
        user = { 
            email, 
            name: type === "signup" ? "New User" : "User", 
            phone: "+91 12345 67890",
            profilePic: null,
            role: "rider"
        };
        safeLocalStorageSet("user", JSON.stringify(user));
        checkAuthStatus();
    }
}

function setupDriverSignup() {
    const bookingPanel = document.getElementById("booking-panel");
    bookingPanel.innerHTML = `
        <h1>Driver Signup</h1>
        <div class="auth-section">
            <input type="email" id="driver-email" placeholder="Email" required>
            <input type="text" id="driver-name" placeholder="Full Name" required>
            <input type="tel" id="driver-phone" placeholder="Phone Number" required>
            <input type="text" id="vehicle-type" placeholder="Vehicle Type (e.g., Sedan, Bike)" required>
            <input type="text" id="license-number" placeholder="License Number" required>
            <button id="register-driver-btn">Register</button>
            <button id="back-to-login-btn">Back to Login</button>
        </div>`;

    document.getElementById("register-driver-btn").addEventListener("click", () => {
        const email = document.getElementById("driver-email").value;
        const name = document.getElementById("driver-name").value;
        const phone = document.getElementById("driver-phone").value;
        const vehicleType = document.getElementById("vehicle-type").value;
        const licenseNumber = document.getElementById("license-number").value;

        if (!email || !name || !phone || !vehicleType || !licenseNumber) {
            return alert("Please fill in all fields.");
        }
        if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            return alert("Please enter a valid email address.");
        }
        if (!/^\+?\d{10,15}$/.test(phone.replace(/\s/g, ""))) {
            return alert("Please enter a valid phone number (10-15 digits).");
        }

        user = {
            email,
            name,
            phone,
            profilePic: null,
            role: "driver",
            vehicleType,
            licenseNumber,
            available: true,
            assignedRides: []
        };
        drivers.push(user);
        safeLocalStorageSet("user", JSON.stringify(user));
        safeLocalStorageSet("drivers", JSON.stringify(drivers));
        alert("Driver registration successful!");
        checkAuthStatus();
    });

    document.getElementById("back-to-login-btn").addEventListener("click", checkAuthStatus);
}

function setupDriverDashboard() {
    const toggleBtn = document.getElementById("toggle-availability");
    const statusText = document.getElementById("driver-status-text");
    const assignedRidesList = document.getElementById("assigned-rides");

    toggleBtn.addEventListener("click", () => {
        user.available = !user.available;
        statusText.textContent = user.available ? "Available" : "Unavailable";
        toggleBtn.textContent = user.available ? "Go Offline" : "Go Online";
        updateDriverInList(user);
        safeLocalStorageSet("user", JSON.stringify(user));
    });

    assignedRidesList.innerHTML = user.assignedRides.map(ride => 
        `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} - ₹${ride.total}</li>`
    ).join("") || "<li>No assigned rides yet.</li>";
}

function updateDriverInList(updatedDriver) {
    drivers = drivers.map(driver => driver.email === updatedDriver.email ? updatedDriver : driver);
    safeLocalStorageSet("drivers", JSON.stringify(drivers));
}

function getUserLocation() {
    const pickupInput = document.getElementById("pickup");
    if (!navigator.geolocation) {
        console.error("Geolocation not supported by browser");
        pickupInput.value = "Geolocation not supported";
        pickupInput.disabled = false;
        return;
    }

    pickupInput.value = "Fetching your location...";
    pickupInput.disabled = true;
    pickupInput.parentElement.classList.add("loading");

    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            fetchLocationName(latitude, longitude, pickupInput, () => {
                pickupInput.disabled = false;
                pickupInput.parentElement.classList.remove("loading");
                fetchWeatherForLocation(latitude, longitude);
                calculateRouteIfReady();
            });
        },
        error => {
            console.error("Geolocation error:", error.message);
            pickupInput.value = "Unable to fetch location";
            pickupInput.disabled = false;
            pickupInput.parentElement.classList.remove("loading");
            alert("Couldn’t fetch your location. Please enter it manually.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function fetchLocationName(lat, lon, inputElement, callback) {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data && data.display_name) {
                const address = data.display_name.split(", ").slice(0, 3).join(", ");
                inputElement.value = address;
                inputElement.dataset.lat = lat.toString();
                inputElement.dataset.lon = lon.toString();
                map.setView([lat, lon], 13);
                calculateRouteIfReady();
            } else {
                throw new Error("No display name in response");
            }
            callback();
        })
        .catch(err => {
            console.error("Reverse geocoding failed:", err.message);
            inputElement.value = `${lat}, ${lon} (Unknown Location)`;
            inputElement.dataset.lat = lat.toString();
            inputElement.dataset.lon = lon.toString();
            map.setView([lat, lon], 13);
            calculateRouteIfReady();
            callback();
        });
}

function setupAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    const recentSearches = JSON.parse(localStorage.getItem(`${inputId}-recent`)) || [];

    input.addEventListener("input", debounce(async () => {
        const query = input.value.trim();
        if (query.length < 2) {
            showRecentSearches(recentSearches, input, suggestions);
            calculateRouteIfReady();
            return;
        }

        input.parentElement.classList.add("loading");
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`);
            if (!response.ok) throw new Error(`Search API error: ${response.status}`);
            const data = await response.json();

            suggestions.innerHTML = "";
            if (!data || !data.length) {
                suggestions.innerHTML = "<li>No results found</li>";
                suggestions.classList.add("visible");
                await geocodeManualInput(input);
                return;
            }

            data.forEach(place => {
                const li = document.createElement("li");
                const displayName = place.display_name.split(", ").slice(0, 3).join(", ");
                li.textContent = displayName;
                li.addEventListener("click", () => {
                    input.value = displayName;
                    input.dataset.lat = place.lat;
                    input.dataset.lon = place.lon;
                    suggestions.classList.remove("visible");
                    updateRecentSearches(inputId, displayName);
                    calculateRouteIfReady();
                });
                suggestions.appendChild(li);
            });
            suggestions.classList.add("visible");
        } catch (err) {
            console.error("Autocomplete error:", err.message);
            suggestions.innerHTML = "<li>Error fetching suggestions</li>";
            suggestions.classList.add("visible");
            await geocodeManualInput(input);
        } finally {
            input.parentElement.classList.remove("loading");
        }
    }, 100));

    input.addEventListener("blur", () => {
        setTimeout(() => suggestions.classList.remove("visible"), 200);
        geocodeManualInput(input);
    });
    input.addEventListener("focus", () => showRecentSearches(recentSearches, input, suggestions));
}

async function geocodeManualInput(input) {
    if (!input.value.trim() || (input.dataset.lat && input.dataset.lon)) {
        calculateRouteIfReady();
        return;
    }

    input.parentElement.classList.add("loading");
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input.value)}&format=json&limit=1&countrycodes=in`);
        const data = await response.json();
        if (data && data.length) {
            input.dataset.lat = data[0].lat;
            input.dataset.lon = data[0].lon;
            input.value = data[0].display_name.split(", ").slice(0, 3).join(", ");
            calculateRouteIfReady();
        } else {
            console.warn(`No geocoding result for ${input.id}: ${input.value}`);
            resetRideDetails();
        }
    } catch (err) {
        console.error("Manual geocoding error:", err.message);
        resetRideDetails();
    } finally {
        input.parentElement.classList.remove("loading");
    }
}

function showRecentSearches(recentSearches, input, suggestions) {
    suggestions.innerHTML = "";
    if (recentSearches.length) {
        recentSearches.forEach(search => {
            const li = document.createElement("li");
            li.textContent = search;
            li.classList.add("recent");
            li.addEventListener("click", () => {
                input.value = search;
                suggestions.classList.remove("visible");
                calculateRouteIfReady();
            });
            suggestions.appendChild(li);
        });
        suggestions.classList.add("visible");
    }
}

function updateRecentSearches(inputId, search) {
    let recent = JSON.parse(localStorage.getItem(`${inputId}-recent`)) || [];
    if (!recent.includes(search)) {
        recent.unshift(search);
        if (recent.length > 5) recent.pop();
        safeLocalStorageSet(`${inputId}-recent`, JSON.stringify(recent));
    }
}

function calculateRouteIfReady() {
    const pickup = document.getElementById("pickup");
    const destination = document.getElementById("destination");
    const extraStop = document.getElementById("extra-stop");

    if (pickup.dataset.lat && pickup.dataset.lon && destination.dataset.lat && destination.dataset.lon) {
        calculateRoute();
    } else {
        resetRideDetails();
    }
}

async function calculateRoute() {
    const pickup = document.getElementById("pickup");
    const destination = document.getElementById("destination");
    const extraStop = document.getElementById("extra-stop");
    const bookBtn = document.getElementById("book-btn");

    const waypoints = [
        [pickup.dataset.lat, pickup.dataset.lon],
        ...(extraStop && extraStop.dataset.lat ? [[extraStop.dataset.lat, extraStop.dataset.lon]] : []),
        [destination.dataset.lat, destination.dataset.lon]
    ].map(w => w.map(parseFloat));

    document.getElementById("fare-details").classList.add("loading");
    try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints.map(w => `${w[1]},${w[0]}`).join(";")}?overview=full&geometries=geojson`);
        if (!response.ok) throw new Error(`OSRM API error: ${response.status}`);
        const data = await response.json();

        if (data.code === "Ok" && data.routes.length) {
            const route = data.routes[0];
            updateMap(route.geometry.coordinates);
            updateRideDetails(route.distance, route.duration);
            bookBtn.disabled = false;
        } else {
            throw new Error("No valid route returned");
        }
    } catch (err) {
        console.error("Route calculation error:", err.message);
        updateRideDetailsWithFallback(waypoints);
        drawFallbackRoute(waypoints);
        bookBtn.disabled = false;
    } finally {
        document.getElementById("fare-details").classList.remove("loading");
    }
}

function resetRideDetails() {
    document.getElementById("distance").textContent = "Distance: -- km";
    document.getElementById("duration").textContent = "Duration: -- min";
    document.getElementById("fare-estimate").textContent = "Estimated Fare: ₹--";
    document.getElementById("book-btn").disabled = true;
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}

function updateRideDetailsWithFallback(waypoints) {
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        totalDistance += haversineDistance(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
    }
    const duration = totalDistance / 0.833; // Approx 50 km/h in meters/second
    updateRideDetails(totalDistance, duration);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function updateRideDetails(distance, duration) {
    const distanceKm = distance / 1000;
    const durationMin = Math.round(duration / 60);
    const rates = { economy: 10, premium: 20, luxury: 35, bike: 5, pool: 7 };
    const baseFare = { economy: 50, premium: 100, luxury: 150, bike: 20, pool: 40 };
    const surge = getSurgeMultiplier();
    const fare = (baseFare[selectedRideType] + distanceKm * rates[selectedRideType]) * surge;

    document.getElementById("distance").textContent = `Distance: ${distanceKm.toFixed(1)} km`;
    document.getElementById("duration").textContent = `Duration: ${durationMin} min`;
    document.getElementById("fare-estimate").textContent = `Estimated Fare: ₹${fare.toFixed(2)} (Surge: ${surge}x)`;

    document.querySelectorAll(".ride-type").forEach(opt => {
        const type = opt.dataset.type;
        const price = (baseFare[type] + distanceKm * rates[type]) * surge;
        opt.querySelector(".price").textContent = `₹${price.toFixed(2)}`;
    });

    bookingData = {
        pickup: document.getElementById("pickup").value,
        extraStop: document.getElementById("extra-stop")?.value || null,
        destination: document.getElementById("destination").value,
        distance: distanceKm,
        duration: durationMin,
        coordinates: routeLayer ? routeLayer.toGeoJSON().geometry.coordinates : waypoints.map(w => [w[1], w[0]]),
        baseFare: baseFare[selectedRideType],
        distanceCharge: distanceKm * rates[selectedRideType],
        surge: (fare - (baseFare[selectedRideType] + distanceKm * rates[selectedRideType])).toFixed(2),
        total: fare,
        rideType: selectedRideType
    };
}

function getSurgeMultiplier() {
    const hour = new Date().getHours();
    return (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20) ? 1.5 : 1;
}

function setupRideOptions() {
    document.querySelectorAll(".ride-type").forEach(opt => {
        opt.addEventListener("click", () => {
            document.querySelectorAll(".ride-type").forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
            selectedRideType = opt.dataset.type;
            calculateRouteIfReady();
        });
    });
}

function setupBooking() {
    const bookBtn = document.getElementById("book-btn");
    const scheduleBtn = document.getElementById("schedule-btn");
    const addStopBtn = document.getElementById("add-stop-btn");
    const modal = document.getElementById("booking-modal");
    const closeModal = document.getElementById("close-modal");
    const cancelBtn = document.getElementById("cancel-btn");

    addStopBtn.addEventListener("click", () => {
        const extraStop = document.querySelector(".extra-stop");
        extraStop.style.display = extraStop.style.display === "none" ? "flex" : "none";
        calculateRouteIfReady();
    });

    scheduleBtn.addEventListener("click", () => {
        const scheduleTime = document.getElementById("schedule-time");
        scheduleTime.style.display = scheduleTime.style.display === "none" ? "block" : "none";
        if (scheduleTime.style.display === "block" && scheduleTime.value) {
            const now = new Date();
            const scheduled = new Date(scheduleTime.value);
            if (scheduled <= now) return alert("Please select a future time.");
            alert(`Ride scheduled for ${scheduled.toLocaleString()}`);
            bookRide(true);
        }
    });

    bookBtn.addEventListener("click", () => {
        if (!bookingData.total) return alert("Please select valid locations first.");
        const assignedDriver = user.role === "rider" || !user.available ? assignDriver() : null;
        modal.style.display = "flex";
        document.getElementById("modal-ride-type").textContent = `Ride Type: ${bookingData.rideType.charAt(0).toUpperCase() + bookingData.rideType.slice(1)}`;
        document.getElementById("modal-route").textContent = `${bookingData.pickup}${bookingData.extraStop ? " → " + bookingData.extraStop : ""} → ${bookingData.destination}`;
        document.getElementById("modal-base-fare").textContent = `₹${bookingData.baseFare.toFixed(2)}`;
        document.getElementById("modal-distance-charge").textContent = `₹${bookingData.distanceCharge.toFixed(2)}`;
        document.getElementById("modal-surge").textContent = `₹${bookingData.surge}`;
        document.getElementById("modal-total").textContent = `₹${bookingData.total.toFixed(2)}`;
        document.getElementById("driver-status").textContent = assignedDriver ? `Driver: ${assignedDriver.name}` : "Finding driver...";
        simulateDriver();
        bookRide(false, assignedDriver);
    });

    closeModal.addEventListener("click", () => modal.style.display = "none");
    cancelBtn.addEventListener("click", () => {
        if (confirm("Cancel this ride?")) modal.style.display = "none";
    });

    function bookRide(isScheduled, assignedDriver) {
        const ride = {
            ...bookingData,
            rideType: bookingData.rideType.charAt(0).toUpperCase() + bookingData.rideType.slice(1),
            date: isScheduled ? new Date(document.getElementById("schedule-time").value).toLocaleString() : new Date().toLocaleString(),
            status: isScheduled ? "Scheduled" : "Completed",
            driver: assignedDriver ? assignedDriver.name : "Not Assigned"
        };
        rideHistory.unshift(ride);
        if (assignedDriver && !isScheduled) {
            assignedDriver.assignedRides.push(ride);
            updateDriverInList(assignedDriver);
        }
        safeLocalStorageSet("rideHistory", JSON.stringify(rideHistory));
    }

    function assignDriver() {
        const availableDrivers = drivers.filter(d => d.available && d.vehicleType.toLowerCase().includes(selectedRideType) && d.email !== user.email);
        if (availableDrivers.length === 0) return null;
        const driver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
        driver.available = false;
        updateDriverInList(driver);
        return driver;
    }
}

function simulateDriver() {
    if (driverMarker) map.removeLayer(driverMarker);
    const coords = bookingData.coordinates;
    let step = 0;
    driverMarker = L.marker([coords[0][1], coords[0][0]], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🚗</div>', className: "" })
    }).addTo(map);

    const interval = setInterval(() => {
        step++;
        const eta = Math.round(((coords.length - step) / coords.length) * bookingData.duration);
        document.getElementById("modal-eta").textContent = `ETA: ${eta} min`;
        if (step >= coords.length) {
            clearInterval(interval);
            document.getElementById("driver-status").textContent = "Driver has arrived!";
            return;
        }
        driverMarker.setLatLng([coords[step][1], coords[step][0]]);
    }, 100);
}

function setupProfile() {
    const profileBtn = document.getElementById("profile-btn");
    const profileModal = document.getElementById("profile-modal");
    const closeProfile = document.getElementById("close-profile");
    const editBtn = document.getElementById("edit-profile-btn");
    const saveBtn = document.getElementById("save-profile-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const profilePhone = document.getElementById("profile-phone");
    const historyList = document.getElementById("ride-history-list");
    const historyCount = document.getElementById("history-count");
    const noHistory = document.getElementById("no-history");
    const profilePic = document.getElementById("profile-pic");

    profileBtn.addEventListener("click", () => {
        if (!user) {
            alert("Please sign in to view your profile.");
            return;
        }
        profileModal.style.display = "flex";
        updateProfileUI();
    });

    closeProfile.addEventListener("click", () => {
        profileModal.style.display = "none";
        resetEditableFields();
    });

    editBtn.addEventListener("click", () => {
        profileName.contentEditable = "true";
        profileEmail.contentEditable = "true";
        profilePhone.contentEditable = "true";
        profileName.focus();

        const uploadInput = document.createElement("input");
        uploadInput.type = "file";
        uploadInput.id = "profile-pic-upload";
        uploadInput.accept = "image/*";
        uploadInput.style.marginTop = "10px";
        document.querySelector(".profile-pic").appendChild(uploadInput);

        editBtn.style.display = "none";
        saveBtn.style.display = "inline-block";

        uploadInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    alert("Image size must be less than 2MB.");
                    return;
                }
                const reader = new FileReader();
                reader.onload = (event) => {
                    profilePic.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    });

    saveBtn.addEventListener("click", () => {
        const newName = profileName.textContent.trim();
        const newEmail = profileEmail.textContent.trim();
        const newPhone = profilePhone.textContent.trim();
        const uploadInput = document.getElementById("profile-pic-upload");

        if (!newName || !newEmail || !newPhone) {
            alert("All fields must be filled.");
            return;
        }
        if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(newEmail)) {
            alert("Please enter a valid email address.");
            return;
        }
        if (!/^\+?\d{10,15}$/.test(newPhone.replace(/\s/g, ""))) {
            alert("Please enter a valid phone number (10-15 digits).");
            return;
        }

        user.name = newName;
        user.email = newEmail;
        user.phone = newPhone;

        if (uploadInput && uploadInput.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                user.profilePic = event.target.result;
                updateUserAndDrivers();
                profilePic.src = user.profilePic;
                uploadInput.remove();
                resetEditableFields();
                editBtn.style.display = "inline-block";
                saveBtn.style.display = "none";
                alert("Profile saved successfully!");
            };
            reader.readAsDataURL(uploadInput.files[0]);
        } else {
            updateUserAndDrivers();
            if (uploadInput) uploadInput.remove();
            resetEditableFields();
            editBtn.style.display = "inline-block";
            saveBtn.style.display = "none";
            alert("Profile saved successfully!");
        }

        profileBtn.textContent = user.name.split(" ")[0];
    });

    logoutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to logout?")) {
            localStorage.removeItem("user");
            user = null;
            profileModal.style.display = "none";
            checkAuthStatus();
        }
    });

    function resetEditableFields() {
        profileName.contentEditable = "false";
        profileEmail.contentEditable = "false";
        profilePhone.contentEditable = "false";
        const uploadInput = document.getElementById("profile-pic-upload");
        if (uploadInput) uploadInput.remove();
    }

    function updateProfileUI() {
        profileName.textContent = user.name;
        profileEmail.textContent = user.email;
        profilePhone.textContent = user.phone;
        profilePic.src = user.profilePic || "https://via.placeholder.com/100";
        
        if (user.role === "driver") {
            historyList.innerHTML = `
                <h3>Assigned Rides (${user.assignedRides.length})</h3>
                ${user.assignedRides.map(ride => 
                    `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} (${ride.date}) - ₹${ride.total}</li>`
                ).join("") || "<li>No assigned rides yet.</li>"}
                <h3>Booked Rides (${rideHistory.length})</h3>
                ${rideHistory.map(ride => 
                    `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} (${ride.date}) - ₹${ride.total} (${ride.status})</li>`
                ).join("") || "<li>No booked rides yet.</li>"}`;
            historyCount.textContent = user.assignedRides.length + rideHistory.length;
            noHistory.style.display = (user.assignedRides.length + rideHistory.length) === 0 ? "block" : "none";
            historyList.style.display = "block";
        } else {
            historyCount.textContent = rideHistory.length;
            historyList.innerHTML = rideHistory.map(ride => 
                `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} (${ride.date}) - ₹${ride.total} (${ride.status})</li>`
            ).join("") || "<li>No rides yet.</li>";
            noHistory.style.display = rideHistory.length === 0 ? "block" : "none";
            historyList.style.display = rideHistory.length > 0 ? "block" : "none";
        }
    }

    function updateUserAndDrivers() {
        safeLocalStorageSet("user", JSON.stringify(user));
        if (user.role === "driver") {
            updateDriverInList(user);
        }
    }
}

function setupThemeToggle() {
    const toggleBtn = document.getElementById("theme-toggle");
    toggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
        safeLocalStorageSet("theme", document.body.classList.contains("dark") ? "dark" : "light");
    });

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark");
        toggleBtn.textContent = "☀️";
    }
}

function fetchWeatherForLocation(lat, lon) {
    const apiKey = "YOUR_API_KEY"; // Replace with your OpenWeatherMap API key
    if (apiKey === "YOUR_API_KEY") {
        document.getElementById("weather-info").textContent = "Weather: API Key Missing";
        return;
    }
    document.getElementById("weather-info").textContent = "Weather: Checking...";
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`)
        .then(response => response.json())
        .then(data => {
            document.getElementById("weather-info").textContent = `Weather: ${data.weather[0].main}, ${data.main.temp}°C`;
        })
        .catch(() => {
            document.getElementById("weather-info").textContent = "Weather: Unavailable";
        });
}

function updateMap(coordinates) {
    const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
    if (routeLayer) map.removeLayer(routeLayer);

    routeLayer = L.polyline(latLngs, {
        color: "#1a1a1a",
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1
    }).addTo(map);

    const pickupLatLng = latLngs[0];
    const destinationLatLng = latLngs[latLngs.length - 1];

    L.marker(pickupLatLng, {
        icon: L.divIcon({ html: '<div style="font-size: 20px; color: #00cc00;">📍</div>', className: "" })
    }).addTo(map).bindPopup("Pickup");

    L.marker(destinationLatLng, {
        icon: L.divIcon({ html: '<div style="font-size: 20px; color: #ff3333;">📍</div>', className: "" })
    }).addTo(map).bindPopup("Destination");

    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

function drawFallbackRoute(waypoints) {
    const latLngs = waypoints.map(w => [w[0], w[1]]);
    if (routeLayer) map.removeLayer(routeLayer);

    routeLayer = L.polyline(latLngs, {
        color: "#1a1a1a",
        weight: 4,
        opacity: 0.6,
        dashArray: "5, 10"
    }).addTo(map);

    L.marker(latLngs[0], {
        icon: L.divIcon({ html: '<div style="font-size: 20px; color: #00cc00;">📍</div>', className: "" })
    }).addTo(map).bindPopup("Pickup");

    L.marker(latLngs[latLngs.length - 1], {
        icon: L.divIcon({ html: '<div style="font-size: 20px; color: #ff3333;">📍</div>', className: "" })
    }).addTo(map).bindPopup("Destination");

    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e.name === "QuotaExceededError") {
            console.error("LocalStorage quota exceeded. Clearing old data.");
            if (key === "rideHistory") {
                rideHistory = rideHistory.slice(0, 5);
                safeLocalStorageSet("rideHistory", JSON.stringify(rideHistory));
            } else if (key === "drivers") {
                drivers = drivers.slice(0, 5);
                safeLocalStorageSet("drivers", JSON.stringify(drivers));
            }
            localStorage.setItem(key, value);
        } else {
            console.error("LocalStorage error:", e);
        }
    }
}

document.addEventListener("DOMContentLoaded", initMap);