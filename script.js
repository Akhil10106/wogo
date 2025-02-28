let map, routeLayer, driverMarker;
let selectedRideType = "uberx";
let bookingData = {};
let rideHistory = JSON.parse(localStorage.getItem("rideHistory")) || [];
let user = JSON.parse(localStorage.getItem("user")) || null;
let drivers = JSON.parse(localStorage.getItem("drivers")) || [];

function initMap() {
    map = L.map("map").setView([37.7749, -122.4194], 13); // Default to San Francisco
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(map);

    // Load and apply saved theme on page load
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark");
        document.getElementById("theme-toggle").textContent = "☀️";
    } else {
        document.body.classList.remove("dark");
        document.getElementById("theme-toggle").textContent = "🌙";
    }

    checkAuthStatus();
    setupThemeToggle();
    setupMobileNav();

    // Clear input fields on page refresh
    clearInputFields();
}

function setupMobileNav() {
    const hamburger = document.getElementById("hamburger");
    const mobileNav = document.getElementById("mobile-nav");
    hamburger.addEventListener("click", () => mobileNav.classList.toggle("active"));
    document.getElementById("mobile-profile-btn").addEventListener("click", () => document.getElementById("profile-btn").click());
    document.getElementById("mobile-theme-toggle").addEventListener("click", () => document.getElementById("theme-toggle").click());
}

function checkAuthStatus() {
    const bookingPanel = document.getElementById("booking-panel");
    if (!user) {
        bookingPanel.innerHTML = `
            <h1>Welcome</h1>
            <div class="auth-section">
                <input type="email" id="email-login" placeholder="Email" class="input-field" required>
                <input type="password" id="password-login" placeholder="Password" class="input-field" required>
                <button id="login-btn" class="action-btn primary-btn">Sign In</button>
                <button id="signup-btn" class="action-btn primary-btn">Sign Up</button>
            </div>`;
        setupAuth();
    } else {
        // User is logged in; don’t overwrite booking-panel, just initialize
        document.getElementById("profile-btn").textContent = user.name.split(" ")[0];
        getUserLocation();
        setupAutocomplete("pickup", "pickup-suggestions");
        setupAutocomplete("destination", "destination-suggestions");
        setupRideOptions();
        setupBooking();
        setupProfile();
    }
}

function setupAuth() {
    document.getElementById("login-btn").addEventListener("click", () => authenticate("login"));
    document.getElementById("signup-btn").addEventListener("click", () => authenticate("signup"));

    function authenticate(type) {
        const email = document.getElementById("email-login").value;
        const password = document.getElementById("password-login").value;
        if (!email || !password) return alert("Please fill in all fields.");
        user = { email, name: "User", phone: "+1 123-456-7890", profilePic: null, ratings: [] };
        localStorage.setItem("user", JSON.stringify(user));
        checkAuthStatus();
    }
}

function getUserLocation() {
    const pickupInput = document.getElementById("pickup");
    if (navigator.geolocation) {
        pickupInput.value = "Getting your location...";
        pickupInput.disabled = true;
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
                    .then(res => res.json())
                    .then(data => {
                        pickupInput.value = data.display_name.split(", ").slice(0, 2).join(", ");
                        pickupInput.dataset.lat = latitude;
                        pickupInput.dataset.lon = longitude;
                        pickupInput.disabled = false;
                        map.setView([latitude, longitude], 13);
                        calculateRouteIfReady();
                    });
            },
            () => {
                pickupInput.value = "Location unavailable";
                pickupInput.disabled = false;
            }
        );
    }
}

function setupAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    input.addEventListener("input", debounce(async () => {
        const query = input.value.trim();
        if (query.length < 2) return;

        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
        const data = await response.json();

        suggestions.innerHTML = "";
        data.forEach(place => {
            const li = document.createElement("li");
            li.textContent = place.display_name.split(", ").slice(0, 2).join(", ");
            li.addEventListener("click", () => {
                input.value = li.textContent;
                input.dataset.lat = place.lat;
                input.dataset.lon = place.lon;
                suggestions.classList.remove("visible");
                calculateRouteIfReady();
            });
            suggestions.appendChild(li);
        });
        suggestions.classList.add("visible");
    }, 300));

    input.addEventListener("blur", () => setTimeout(() => suggestions.classList.remove("visible"), 200));
    input.addEventListener("focus", () => suggestions.classList.add("visible"));
}

function calculateRouteIfReady() {
    const pickup = document.getElementById("pickup");
    const destination = document.getElementById("destination");
    if (pickup.dataset.lat && destination.dataset.lat) calculateRoute();
}

function calculateRoute() {
    const pickup = document.getElementById("pickup");
    const destination = document.getElementById("destination");
    const waypoints = [
        [pickup.dataset.lon, pickup.dataset.lat],
        [destination.dataset.lon, destination.dataset.lat]
    ];

    fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints.join(";")}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
            const route = data.routes[0];
            updateMap(route.geometry.coordinates);
            updateRideDetails(route.distance, route.duration);
            document.getElementById("book-btn").disabled = false;
        });
}

function updateRideDetails(distance, duration) {
    const distanceKm = distance * 0.001; // Convert meters to kilometers
    const durationMin = Math.round(duration / 60);
    const rates = { uberx: 124.5, uberxl: 166, black: 290.5 }; // ₹ per km
    const baseFare = { uberx: 207.5, uberxl: 415, black: 830 }; // Base fare in ₹
    const surge = 1.2;
    const fare = (baseFare[selectedRideType] + distanceKm * rates[selectedRideType]) * surge;

    document.getElementById("distance").textContent = `${distanceKm.toFixed(1)} km`;
    document.getElementById("duration").textContent = `${durationMin} min`;
    document.getElementById("fare-estimate").textContent = `₹${fare.toFixed(2)}`;

    document.querySelectorAll(".ride-type").forEach(opt => {
        const type = opt.dataset.type;
        const price = (baseFare[type] + distanceKm * rates[type]) * surge;
        opt.querySelector(".price").textContent = `₹${price.toFixed(2)}`;
    });

    bookingData = {
        pickup: document.getElementById("pickup").value,
        destination: document.getElementById("destination").value,
        distance: distanceKm,
        duration: durationMin,
        coordinates: routeLayer.toGeoJSON().geometry.coordinates,
        baseFare: baseFare[selectedRideType],
        distanceCharge: distanceKm * rates[selectedRideType],
        surge: (fare - (baseFare[selectedRideType] + distanceKm * rates[selectedRideType])).toFixed(2),
        total: fare,
        rideType: selectedRideType
    };
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
    const modal = document.getElementById("booking-modal");
    const closeModal = document.getElementById("close-modal");
    const cancelBtn = document.getElementById("cancel-btn");
    const payBtn = document.getElementById("pay-now");
    const submitRating = document.getElementById("submit-rating");
    const sendChat = document.getElementById("send-chat");

    bookBtn.addEventListener("click", () => {
        modal.style.display = "flex";
        document.getElementById("modal-ride-type").textContent = `Ride: ${selectedRideType.toUpperCase()}`;
        document.getElementById("modal-route").textContent = `${bookingData.pickup} → ${bookingData.destination}`;
        document.getElementById("modal-base-fare").textContent = `₹${bookingData.baseFare.toFixed(2)}`;
        document.getElementById("modal-distance-charge").textContent = `₹${bookingData.distanceCharge.toFixed(2)}`;
        document.getElementById("modal-surge").textContent = `₹${bookingData.surge}`;
        document.getElementById("modal-total").textContent = `₹${bookingData.total.toFixed(2)}`;
        document.getElementById("driver-status").textContent = "Finding driver...";
        simulateDriver();
        bookRide();
    });

    payBtn.addEventListener("click", () => {
        const method = document.getElementById("payment-method").value;
        alert(`Payment of ₹${bookingData.total.toFixed(2)} via ${method} confirmed with WoGo.`);
        document.querySelector(".payment-section").style.display = "none";
        document.querySelector(".rating-section").style.display = "block";
    });

    document.querySelectorAll("#rating-stars span").forEach(star => {
        star.addEventListener("click", () => {
            const rating = parseInt(star.dataset.value);
            document.querySelectorAll("#rating-stars span").forEach(s => s.classList.toggle("active", parseInt(s.dataset.value) <= rating));
            bookingData.rating = rating;
        });
    });

    submitRating.addEventListener("click", () => {
        if (bookingData.rating) {
            user.ratings.push(bookingData.rating);
            localStorage.setItem("user", JSON.stringify(user));
            modal.style.display = "none";
        }
    });

    sendChat.addEventListener("click", () => {
        const message = document.getElementById("chat-input").value;
        if (message) {
            document.getElementById("chat-messages").innerHTML += `<p class="sent">${message}</p>`;
            document.getElementById("chat-input").value = "";
            setTimeout(() => document.getElementById("chat-messages").innerHTML += "<p>Driver: On my way!</p>", 1000);
        }
    });

    closeModal.addEventListener("click", () => modal.style.display = "none");
    cancelBtn.addEventListener("click", () => {
        if (confirm("Cancel ride?")) modal.style.display = "none";
    });

    scheduleBtn.addEventListener("click", () => alert("Scheduling not implemented yet."));

    function bookRide() {
        rideHistory.unshift({ ...bookingData, date: new Date().toLocaleString() });
        localStorage.setItem("rideHistory", JSON.stringify(rideHistory));
    }
}

function simulateDriver() {
    if (driverMarker) map.removeLayer(driverMarker);
    const coords = bookingData.coordinates;
    let step = 0;
    driverMarker = L.marker([coords[0][1], coords[0][0]], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🚗</div>' })
    }).addTo(map);

    const interval = setInterval(() => {
        step++;
        const eta = Math.round(((coords.length - step) / coords.length) * bookingData.duration);
        document.getElementById("modal-eta").textContent = `ETA: ${eta} min`;
        if (step >= coords.length) {
            clearInterval(interval);
            document.getElementById("driver-status").textContent = "Driver arrived!";
            document.getElementById("chat-box").style.display = "block";
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

    profileBtn.addEventListener("click", () => {
        profileModal.style.display = "flex";
        document.getElementById("profile-name").textContent = user.name;
        document.getElementById("profile-email").textContent = user.email;
        document.getElementById("profile-phone").textContent = user.phone;
        document.getElementById("profile-pic").src = user.profilePic || "https://via.placeholder.com/80";
        document.getElementById("total-rides").textContent = rideHistory.length;
        document.getElementById("avg-rating").textContent = user.ratings.length ? (user.ratings.reduce((a, b) => a + b) / user.ratings.length).toFixed(1) : "--";
        document.getElementById("history-count").textContent = rideHistory.length;
        document.getElementById("ride-history-list").innerHTML = rideHistory.map(ride => `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} (${ride.date})</li>`).join("") || "<li>No trips yet.</li>";
        document.getElementById("no-history").style.display = rideHistory.length ? "none" : "block";
    });

    editBtn.addEventListener("click", () => {
        ["profile-name", "profile-email", "profile-phone"].forEach(id => document.getElementById(id).contentEditable = "true");
        editBtn.style.display = "none";
        saveBtn.style.display = "block";
    });

    saveBtn.addEventListener("click", () => {
        user.name = document.getElementById("profile-name").textContent;
        user.email = document.getElementById("profile-email").textContent;
        user.phone = document.getElementById("profile-phone").textContent;
        localStorage.setItem("user", JSON.stringify(user));
        ["profile-name", "profile-email", "profile-phone"].forEach(id => document.getElementById(id).contentEditable = "false");
        editBtn.style.display = "block";
        saveBtn.style.display = "none";
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("user");
        user = null;
        profileModal.style.display = "none";
        checkAuthStatus();
    });

    closeProfile.addEventListener("click", () => profileModal.style.display = "none");
}

function setupThemeToggle() {
    const toggleBtn = document.getElementById("theme-toggle");
    toggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
        // Save theme preference to localStorage
        localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
    });
}

// New function to clear input fields on page load
function clearInputFields() {
    const pickupInput = document.getElementById("pickup");
    const destinationInput = document.getElementById("destination");
    if (pickupInput) pickupInput.value = ""; // Clear pickup field
    if (destinationInput) destinationInput.value = ""; // Clear destination field
}

function updateMap(coordinates) {
    const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(latLngs, { color: "#D4AF37", weight: 5, opacity: 0.9 }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

document.addEventListener("DOMContentLoaded", initMap);
