// Firebase Initialization (Non-module approach)
const firebase = window.firebase;

const firebaseConfig = {
    apiKey: "AIzaSyBYNl851w109ym8vRneK9IpFhu7QOUXc08",
    authDomain: "wogo-app-86a9b.firebaseapp.com",
    projectId: "wogo-app-86a9b",
    storageBucket: "wogo-app-86a9b.firebasestorage.app",
    messagingSenderId: "365747366015",
    appId: "1:365747366015:web:b54dda9f0705124879b74a",
    measurementId: "G-1MRMQ0XH6X",
    databaseURL: "https://wogo-app-86a9b-default-rtdb.firebaseio.com"
};

let app, database;
try {
    app = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization failed:", error);
    database = null;
}

let map, routeLayer, driverMarker, driverMap, driverRouteLayer;
let selectedRideType = "uberx";
let bookingData = {};
let rideHistory = [];
let user = null; // Will be set in loadInitialData
let drivers = [];
let currentDriver = null;

// Store the original booking panel HTML
const originalBookingPanelHTML = `
    <h1>Where to?</h1>
    <div class="location-inputs">
        <div class="input-group">
            <span class="dot pickup"></span>
            <input type="text" id="pickup" placeholder="Enter pickup location" class="input-field" required>
            <ul class="suggestions" id="pickup-suggestions"></ul>
        </div>
        <div class="input-group">
            <span class="dot destination"></span>
            <input type="text" id="destination" placeholder="Enter destination" class="input-field" required>
            <ul class="suggestions" id="destination-suggestions"></ul>
        </div>
    </div>
    <div class="ride-options">
        <div class="ride-type active" data-type="uberx">
            <img src="https://cdn-icons-png.flaticon.com/512/3202/3202926.png" alt="UberX" class="ride-icon">
            <span>UberX</span>
            <span class="price">₹0</span>
        </div>
        <div class="ride-type" data-type="uberxl">
            <img src="https://cdn-icons-png.flaticon.com/512/3082/3082383.png" alt="UberXL" class="ride-icon">
            <span>UberXL</span>
            <span class="price">₹0</span>
        </div>
        <div class="ride-type" data-type="black">
            <img src="https://cdn-icons-png.flaticon.com/512/2550/2550223.png" alt="Black" class="ride-icon">
            <span>Black</span>
            <span class="price">₹0</span>
        </div>
    </div>
    <div id="fare-details">
        <p>Distance: <span id="distance">-- km</span></p>
        <p>Duration: <span id="duration">-- min</span></p>
        <p>Estimated Fare: <span id="fare-estimate">₹--</span></p>
    </div>
    <input type="datetime-local" id="schedule-time" class="input-field" style="display: none;">
    <button id="book-btn" class="action-btn primary-btn" disabled>Request WoGo</button>
    <button id="schedule-btn" class="action-btn secondary-btn">Schedule for Later</button>
`;

function initMap() {
    map = L.map("map").setView([37.7749, -122.4194], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(map);

    driverMap = L.map("driver-map").setView([37.7749, -122.4194], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(driverMap);

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark");
        document.getElementById("theme-toggle").textContent = "☀️";
    } else {
        document.body.classList.remove("dark");
        document.getElementById("theme-toggle").textContent = "🌙";
    }

    // Wait for initial data to load before setting up UI
    loadInitialData().then(() => {
        checkAuthStatus();
        setupThemeToggle();
        setupMobileNav();
        setupDriverRegistration();
        clearInputFields();
    });
}

function loadInitialData() {
    return new Promise((resolve) => {
        if (database) {
            const rideHistoryRef = database.ref('rideHistory');
            const userRef = database.ref('users');
            const driversRef = database.ref('drivers');
            const currentDriverRef = database.ref('currentDriver');

            let userLoaded = false;

            rideHistoryRef.on('value', (snapshot) => {
                const data = snapshot.val();
                rideHistory = data ? Object.values(data) : [];
            }, (error) => console.error("Error loading rideHistory:", error));

            userRef.once('value', (snapshot) => { // Use 'once' for initial load
                user = snapshot.val() || null;
                userLoaded = true;
                console.log("User loaded from Firebase:", user);
                resolve();
            }, (error) => {
                console.error("Error loading user:", error);
                user = null;
                userLoaded = true;
                resolve();
            });

            driversRef.on('value', (snapshot) => {
                const data = snapshot.val();
                drivers = data ? Object.values(data) : [];
            }, (error) => console.error("Error loading drivers:", error));

            currentDriverRef.on('value', (snapshot) => {
                currentDriver = snapshot.val() || null;
                updateDriverUI();
            }, (error) => console.error("Error loading currentDriver:", error));

            // Fallback timeout in case Firebase fails to respond
            setTimeout(() => {
                if (!userLoaded) {
                    console.warn("Firebase user load timeout, falling back to localStorage");
                    user = JSON.parse(localStorage.getItem("user")) || null;
                    resolve();
                }
            }, 3000); // 3-second timeout
        } else {
            rideHistory = JSON.parse(localStorage.getItem("rideHistory")) || [];
            user = JSON.parse(localStorage.getItem("user")) || null;
            drivers = JSON.parse(localStorage.getItem("drivers")) || [];
            currentDriver = JSON.parse(localStorage.getItem("currentDriver")) || null;
            console.log("User loaded from localStorage:", user);
            updateDriverUI();
            resolve();
        }
    });
}

function updateDriverUI() {
    if (currentDriver) {
        document.getElementById("driver-btn").textContent = "Driver Dashboard";
        document.getElementById("mobile-driver-btn").textContent = "Driver Dashboard";
    } else {
        document.getElementById("driver-btn").textContent = "Become a Driver";
        document.getElementById("mobile-driver-btn").textContent = "Become a Driver";
    }
}

function setupMobileNav() {
    const hamburger = document.getElementById("hamburger");
    const mobileNav = document.getElementById("mobile-nav");
    hamburger.addEventListener("click", () => mobileNav.classList.toggle("active"));
    document.getElementById("mobile-profile-btn").addEventListener("click", () => document.getElementById("profile-btn").click());
    document.getElementById("mobile-driver-btn").addEventListener("click", () => document.getElementById("driver-btn").click());
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
        bookingPanel.innerHTML = originalBookingPanelHTML;
        document.getElementById("profile-btn").textContent = user.name.split(" ")[0];
        getUserLocation();
        setupAutocomplete("pickup", "pickup-suggestions");
        setupAutocomplete("destination", "destination-suggestions");
        setupRideOptions();
        setupBooking();
        setupProfile();
    }
    updateDriverUI();
}

function setupAuth() {
    const loginBtn = document.getElementById("login-btn");
    const signupBtn = document.getElementById("signup-btn");
    const emailInput = document.getElementById("email-login");
    const passwordInput = document.getElementById("password-login");

    function authenticate(type) {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        console.log("Authenticating:", email, password);

        if (!email || !password) {
            alert("Please enter both email and password.");
            return;
        }

        user = { email, name: type === "signup" ? "New User" : "User", phone: "+1 123-456-7890", profilePic: null, ratings: [] };
        console.log("User set:", user);

        if (database) {
            database.ref('users').set(user)
                .then(() => {
                    console.log("Firebase save successful");
                    checkAuthStatus();
                })
                .catch(error => {
                    console.error("Firebase error:", error);
                    alert("Error: " + error.message);
                });
        } else {
            localStorage.setItem("user", JSON.stringify(user));
            console.log("LocalStorage save successful");
            checkAuthStatus();
        }
    }

    loginBtn.addEventListener("click", () => {
        console.log("Login button clicked");
        authenticate("login");
    });
    signupBtn.addEventListener("click", () => {
        console.log("Signup button clicked");
        authenticate("signup");
    });
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
                    })
                    .catch(error => {
                        console.error("Error fetching location:", error);
                        pickupInput.value = "Location unavailable";
                        pickupInput.disabled = false;
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

        try {
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
                    if (inputId === "pickup" || inputId === "destination") calculateRouteIfReady();
                });
                suggestions.appendChild(li);
            });
            suggestions.classList.add("visible");
        } catch (error) {
            console.error("Error in autocomplete:", error);
        }
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
        })
        .catch(error => console.error("Error calculating route:", error));
}

function updateRideDetails(distance, duration) {
    const distanceKm = distance * 0.001;
    const durationMin = Math.round(duration / 60);
    const rates = { uberx: 124.5, uberxl: 166, black: 290.5 };
    const baseFare = { uberx: 207.5, uberxl: 415, black: 830 };
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
        coordinates: routeLayer ? routeLayer.toGeoJSON().geometry.coordinates : [],
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

function setupDriverRegistration() {
    const driverBtn = document.getElementById("driver-btn");
    const driverRegistrationModal = document.getElementById("driver-registration-modal");
    const submitDriver = document.getElementById("submit-driver");
    const closeDriverRegistration = document.getElementById("close-driver-registration");
    const driverDashboardView = document.getElementById("driver-dashboard-view");
    const passengerView = document.getElementById("passenger-view");
    const backToPassenger = document.getElementById("back-to-passenger");
    const driverIcon = document.getElementById("driver-icon");
    const driverDetailsModal = document.getElementById("driver-details-modal");
    const closeDriverDetails = document.getElementById("close-driver-details");
    const toggleStatusCheckbox = document.getElementById("toggle-status-checkbox");
    const navItems = document.querySelectorAll(".nav-item");

    setupAutocomplete("driver-location", "driver-location-suggestions");

    driverBtn.addEventListener("click", () => {
        if (currentDriver) {
            passengerView.style.display = "none";
            driverDashboardView.style.display = "flex";
            updateDriverDashboard();
            showSection("overview");
        } else {
            driverRegistrationModal.style.display = "flex";
            driverRegistrationModal.setAttribute("aria-hidden", "false");
        }
    });

    submitDriver.addEventListener("click", () => {
        const name = document.getElementById("driver-name").value.trim();
        const email = document.getElementById("driver-email").value.trim();
        const phone = document.getElementById("driver-phone").value.trim();
        const vehicle = document.getElementById("driver-vehicle").value.trim();
        const license = document.getElementById("driver-license").value.trim();
        const location = document.getElementById("driver-location");
        const lat = location.dataset.lat;
        const lon = location.dataset.lon;

        if (!name || !email || !phone || !vehicle || !license || !location.value || !lat || !lon) {
            alert("Please fill in all fields, including a valid location.");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert("Invalid email format.");
            return;
        }

        if (!/^\+?\d{10,15}$/.test(phone)) {
            alert("Invalid phone number format.");
            return;
        }

        const driver = {
            id: `DRIVER-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            name,
            email,
            phone,
            vehicle,
            license,
            location: location.value,
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            status: "available",
            ratings: [],
            earnings: 0,
            totalRides: 0
        };

        if (database) {
            database.ref('drivers/' + driver.id).set(driver)
                .then(() => {
                    currentDriver = driver;
                    database.ref('currentDriver').set(currentDriver)
                        .then(() => {
                            alert(`Driver registered successfully! Driver ID: ${driver.id}`);
                            document.getElementById("driver-btn").textContent = "Driver Dashboard";
                            document.getElementById("mobile-driver-btn").textContent = "Driver Dashboard";
                            driverRegistrationModal.style.display = "none";
                            driverRegistrationModal.setAttribute("aria-hidden", "true");
                            passengerView.style.display = "none";
                            driverDashboardView.style.display = "flex";
                            updateDriverDashboard();
                            showSection("overview");
                        })
                        .catch(error => console.error("Error setting currentDriver:", error));
                })
                .catch(error => console.error("Error registering driver:", error));
        } else {
            drivers.push(driver);
            currentDriver = driver;
            localStorage.setItem("drivers", JSON.stringify(drivers));
            localStorage.setItem("currentDriver", JSON.stringify(currentDriver));
            alert(`Driver registered successfully! Driver ID: ${driver.id}`);
            document.getElementById("driver-btn").textContent = "Driver Dashboard";
            document.getElementById("mobile-driver-btn").textContent = "Driver Dashboard";
            driverRegistrationModal.style.display = "none";
            driverRegistrationModal.setAttribute("aria-hidden", "true");
            passengerView.style.display = "none";
            driverDashboardView.style.display = "flex";
            updateDriverDashboard();
            showSection("overview");
        }
    });

    closeDriverRegistration.addEventListener("click", () => {
        driverRegistrationModal.style.display = "none";
        driverRegistrationModal.setAttribute("aria-hidden", "true");
    });

    backToPassenger.addEventListener("click", () => {
        driverDashboardView.style.display = "none";
        passengerView.style.display = "flex";
    });

    driverIcon.addEventListener("click", () => {
        driverDetailsModal.style.display = "flex";
        driverDetailsModal.setAttribute("aria-hidden", "false");
        document.getElementById("driver-id").textContent = currentDriver.id;
        document.getElementById("driver-dash-name").textContent = currentDriver.name;
        document.getElementById("driver-dash-email").textContent = currentDriver.email;
        document.getElementById("driver-dash-phone").textContent = currentDriver.phone;
        document.getElementById("driver-dash-vehicle").textContent = currentDriver.vehicle;
        document.getElementById("driver-dash-license").textContent = currentDriver.license;
        document.getElementById("driver-dash-location").textContent = currentDriver.location;
    });

    closeDriverDetails.addEventListener("click", () => {
        driverDetailsModal.style.display = "none";
        driverDetailsModal.setAttribute("aria-hidden", "true");
    });

    toggleStatusCheckbox.addEventListener("change", () => {
        if (currentDriver) {
            const driverIndex = drivers.findIndex(d => d.id === currentDriver.id);
            drivers[driverIndex].status = toggleStatusCheckbox.checked ? "available" : "busy";
            currentDriver.status = drivers[driverIndex].status;
            if (database) {
                database.ref('drivers/' + currentDriver.id).update({ status: currentDriver.status })
                    .then(() => {
                        database.ref('currentDriver').set(currentDriver)
                            .then(() => updateDriverDashboard())
                            .catch(error => console.error("Error updating currentDriver:", error));
                    })
                    .catch(error => console.error("Error updating driver status:", error));
            } else {
                localStorage.setItem("drivers", JSON.stringify(drivers));
                localStorage.setItem("currentDriver", JSON.stringify(currentDriver));
                updateDriverDashboard();
            }
        }
    });

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            if (item.id !== "back-to-passenger") {
                navItems.forEach(nav => nav.classList.remove("active"));
                item.classList.add("active");
                showSection(item.dataset.section);
            }
        });
    });

    function updateDriverDashboard() {
        document.getElementById("driver-name-dash").textContent = currentDriver.name;
        document.getElementById("driver-status-dash").textContent = currentDriver.status;
        toggleStatusCheckbox.checked = currentDriver.status === "available";

        const driverRides = rideHistory.filter(ride => ride.driver && ride.driver.id === currentDriver.id && ride.status === "Completed");
        const totalRides = driverRides.length;
        const totalEarnings = driverRides.reduce((sum, ride) => sum + (ride.total || 0) * 0.8, 0);
        const avgRating = currentDriver.ratings.length ? (currentDriver.ratings.reduce((a, b) => a + b, 0) / currentDriver.ratings.length).toFixed(1) : "--";

        document.getElementById("driver-total-rides").textContent = totalRides;
        document.getElementById("driver-earnings").textContent = `₹${totalEarnings.toFixed(2)}`;
        document.getElementById("driver-avg-rating").textContent = avgRating;
        document.getElementById("driver-history-count").textContent = totalRides;
        document.getElementById("driver-ride-history-list").innerHTML = driverRides.map(ride => 
            `<li class="ride-item">
                <span>${ride.rideType}</span>
                <span>${ride.pickup} → ${ride.destination}</span>
                <span>${ride.date}</span>
                <span>₹${ride.total.toFixed(2)}</span>
            </li>`
        ).join("") || "<li>No rides yet.</li>";
        document.getElementById("driver-no-history").style.display = totalRides ? "none" : "block";

        const activeRide = rideHistory.find(ride => ride.driver && ride.driver.id === currentDriver.id && ride.status === "Completed" && !ride.rating);
        if (activeRide) {
            document.getElementById("current-ride-info").innerHTML = `
                <p><strong>Passenger:</strong> ${user ? user.name : "Unknown"}</p>
                <p><strong>Pickup:</strong> ${activeRide.pickup}</p>
                <p><strong>Destination:</strong> ${activeRide.destination}</p>
                <p><strong>Fare:</strong> ₹${activeRide.total.toFixed(2)}</p>
            `;
            updateDriverMap(activeRide.coordinates);
        } else {
            document.getElementById("current-ride-info").innerHTML = "<p>No active ride assigned.</p>";
            driverMap.setView([currentDriver.lat, currentDriver.lon], 13);
            if (driverRouteLayer) driverMap.removeLayer(driverRouteLayer);
        }
    }

    function showSection(section) {
        document.getElementById("overview-section").style.display = section === "overview" ? "block" : "none";
        document.getElementById("rides-section").style.display = section === "rides" ? "block" : "none";
        document.getElementById("map-section").style.display = section === "map" ? "block" : "none";
    }

    function updateDriverMap(coordinates) {
        const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
        if (driverRouteLayer) driverMap.removeLayer(driverRouteLayer);
        driverRouteLayer = L.polyline(latLngs, { color: "#D4AF37", weight: 5, opacity: 0.9 }).addTo(driverMap);
        driverMap.fitBounds(driverRouteLayer.getBounds(), { padding: [50, 50] });
    }
}

function setupBooking() {
    const bookBtn = document.getElementById("book-btn");
    const scheduleBtn = document.getElementById("schedule-btn");
    const scheduleTime = document.getElementById("schedule-time");
    const modal = document.getElementById("booking-modal");
    const closeModal = document.getElementById("close-modal");
    const cancelBtn = document.getElementById("cancel-btn");
    const payBtn = document.getElementById("pay-now");
    const submitRating = document.getElementById("submit-rating");
    const sendChat = document.getElementById("send-chat");
    const chatMessages = document.getElementById("chat-messages");
    let chatHistory = [];
    let currentOtp = null;

    function generateOTP() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    bookBtn.addEventListener("click", () => {
        if (confirm("Confirm your WoGo ride?")) {
            const bookingId = `WOGO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            currentOtp = generateOTP();
            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");
            modal.querySelector(".modal-content").scrollTop = 0;

            document.getElementById("modal-ride-type").textContent = `Ride: ${selectedRideType.toUpperCase()} (ID: ${bookingId})`;
            document.getElementById("modal-route").textContent = `${bookingData.pickup} → ${bookingData.destination}`;
            document.getElementById("modal-otp").style.display = "block";
            document.getElementById("otp-value").textContent = currentOtp;
            document.getElementById("modal-eta").textContent = "ETA: -- min";
            document.getElementById("modal-base-fare").textContent = `₹${bookingData.baseFare.toFixed(2)}`;
            document.getElementById("modal-distance-charge").textContent = `₹${bookingData.distanceCharge.toFixed(2)}`;
            document.getElementById("modal-surge").textContent = `₹${bookingData.surge}`;
            document.getElementById("modal-total").textContent = `₹${bookingData.total.toFixed(2)}`;
            document.getElementById("driver-status").textContent = "Finding driver...";

            chatMessages.innerHTML = "";
            chatHistory = [];
            document.getElementById("chat-box").style.display = "none";
            document.querySelector(".rating-section").style.display = "none";
            document.querySelector(".payment-section").style.display = "block";

            simulateDriver();
            bookRide(bookingId);
        }
    });

    payBtn.addEventListener("click", () => {
        const method = document.getElementById("payment-method").value;
        let message;
        if (method === "cod") {
            message = `Payment of ₹${bookingData.total.toFixed(2)} will be collected in cash by the driver upon ride completion.`;
        } else if (method === "online-to-driver") {
            message = `Payment of ₹${bookingData.total.toFixed(2)} will be handled online directly with the driver (e.g., via their payment app).`;
        }
        alert(message);
        bookingData.paymentMethod = method;
        document.querySelector(".payment-section").style.display = "none";
        document.querySelector(".rating-section").style.display = "block";
    });

    cancelBtn.addEventListener("click", () => {
        const reasonSelect = document.createElement("select");
        reasonSelect.innerHTML = `
            <option value="">Select a reason</option>
            <option value="Changed mind">Changed mind</option>
            <option value="Driver delay">Driver delay</option>
            <option value="Other">Other</option>
        `;
        reasonSelect.className = "select-input";
        document.body.appendChild(reasonSelect);
        const reasonPrompt = prompt("Why are you cancelling? (Optional)", "");
        document.body.removeChild(reasonSelect);
        if (reasonPrompt !== null) {
            console.log(`Ride cancelled. Reason: ${reasonSelect.value ? `${reasonSelect.value} - ${reasonPrompt}` : reasonPrompt || "No reason provided"}`);
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            document.getElementById("modal-otp").style.display = "none";
        }
    });

    sendChat.addEventListener("click", () => {
        const message = document.getElementById("chat-input").value.trim();
        if (message) {
            const time = new Date().toLocaleTimeString();
            chatHistory.push({ text: message, sent: true, time });
            chatMessages.innerHTML += `<p class="sent">${message} <small>${time}</small></p>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            document.getElementById("chat-input").value = "";

            if (!bookingData.otpVerified && message === currentOtp) {
                setTimeout(() => {
                    const driverTime = new Date().toLocaleTimeString();
                    chatMessages.innerHTML += `<p>Driver: OTP verified. Starting the ride! <small>${driverTime}</small></p>`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    document.getElementById("driver-status").textContent = `Ride started with ${bookingData.driver ? bookingData.driver.name : "Driver"}`;
                    bookingData.otpVerified = true;
                    document.getElementById("modal-otp").style.display = "none";
                }, 1000);
            } else if (!bookingData.otpVerified) {
                setTimeout(() => {
                    const driverTime = new Date().toLocaleTimeString();
                    chatMessages.innerHTML += `<p>Driver: Please share your OTP to start the ride. <small>${driverTime}</small></p>`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 1000);
            } else {
                setTimeout(() => {
                    const driverReplies = ["On my way!", "Almost there!", "Traffic’s a bit heavy."];
                    const reply = driverReplies[Math.floor(Math.random() * driverReplies.length)];
                    const driverTime = new Date().toLocaleTimeString();
                    chatHistory.push({ text: reply, sent: false, time: driverTime });
                    chatMessages.innerHTML += `<p>Driver: ${reply} <small>${driverTime}</small></p>`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 1000);
            }
        }
    });

    document.querySelectorAll("#rating-stars span").forEach(star => {
        star.addEventListener("click", () => {
            const rating = parseInt(star.dataset.value);
            document.querySelectorAll("#rating-stars span").forEach(s => 
                s.classList.toggle("active", parseInt(s.dataset.value) <= rating));
            bookingData.rating = rating;
        });
    });

    submitRating.addEventListener("click", () => {
        if (!bookingData.rating) {
            alert("Please select a rating.");
            return;
        }
        const comment = prompt("Add a comment about your driver (optional):", "");
        if (comment !== null) {
            user.ratings.push(bookingData.rating);
            if (bookingData.driver) {
                const driverIndex = drivers.findIndex(d => d.id === bookingData.driver.id);
                drivers[driverIndex].ratings.push(bookingData.rating);
                drivers[driverIndex].totalRides += 1;
                drivers[driverIndex].earnings += bookingData.total * 0.8;
                if (database) {
                    database.ref('drivers/' + bookingData.driver.id).update({
                        ratings: drivers[driverIndex].ratings,
                        totalRides: drivers[driverIndex].totalRides,
                        earnings: drivers[driverIndex].earnings
                    }).then(() => {
                        if (currentDriver && currentDriver.id === bookingData.driver.id) {
                            currentDriver = drivers[driverIndex];
                            database.ref('currentDriver').set(currentDriver);
                        }
                    });
                } else {
                    localStorage.setItem("drivers", JSON.stringify(drivers));
                    if (currentDriver && currentDriver.id === bookingData.driver.id) {
                        localStorage.setItem("currentDriver", JSON.stringify(currentDriver));
                    }
                }
            }
            if (database) {
                database.ref('users').set(user)
                    .then(() => {
                        console.log(`Rating submitted: ${bookingData.rating} stars. Comment: ${comment || "None"}`);
                        modal.style.display = "none";
                        modal.setAttribute("aria-hidden", "true");
                        document.getElementById("modal-otp").style.display = "none";
                    })
                    .catch(error => console.error("Error updating user ratings:", error));
            } else {
                localStorage.setItem("user", JSON.stringify(user));
                console.log(`Rating submitted: ${bookingData.rating} stars. Comment: ${comment || "None"}`);
                modal.style.display = "none";
                modal.setAttribute("aria-hidden", "true");
                document.getElementById("modal-otp").style.display = "none";
            }
        }
    });

    scheduleBtn.addEventListener("click", () => {
        scheduleTime.style.display = "block";
        scheduleBtn.textContent = "Confirm Schedule";
        scheduleBtn.onclick = () => {
            const time = scheduleTime.value;
            if (!time) {
                alert("Please select a date and time.");
                return;
            }
            const scheduleDate = new Date(time);
            if (scheduleDate <= new Date()) {
                alert("Cannot schedule for past or current time.");
                return;
            }
            const bookingId = `WOGO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            currentOtp = generateOTP();
            const scheduledRide = {
                ...bookingData,
                date: scheduleDate.toLocaleString(),
                status: "Scheduled",
                bookingId,
                otp: currentOtp
            };
            if (database) {
                database.ref('rideHistory/' + bookingId).set(scheduledRide)
                    .then(() => {
                        rideHistory.unshift(scheduledRide);
                        alert(`Ride scheduled for ${scheduleDate.toLocaleString()}! Booking ID: ${bookingId}\nYour OTP: ${currentOtp} (Share this with your driver when the ride begins)`);
                        scheduleTime.style.display = "none";
                        scheduleTime.value = "";
                        scheduleBtn.textContent = "Schedule for Later";
                        scheduleBtn.onclick = () => setupBooking();
                    })
                    .catch(error => console.error("Error scheduling ride:", error));
            } else {
                rideHistory.unshift(scheduledRide);
                localStorage.setItem("rideHistory", JSON.stringify(rideHistory));
                alert(`Ride scheduled for ${scheduleDate.toLocaleString()}! Booking ID: ${bookingId}\nYour OTP: ${currentOtp} (Share this with your driver when the ride begins)`);
                scheduleTime.style.display = "none";
                scheduleTime.value = "";
                scheduleBtn.textContent = "Schedule for Later";
                scheduleBtn.onclick = () => setupBooking();
            }
        };
    });

    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        scheduleTime.style.display = "none";
        scheduleBtn.textContent = "Schedule for Later";
        scheduleBtn.onclick = () => setupBooking();
        document.getElementById("modal-otp").style.display = "none";
        bookingData.otpVerified = false;
    });

    function bookRide(bookingId) {
        const ride = {
            ...bookingData,
            date: new Date().toLocaleString(),
            bookingId,
            status: "Completed",
            otp: currentOtp
        };
        if (database) {
            database.ref('rideHistory/' + bookingId).set(ride)
                .then(() => {
                    rideHistory.unshift(ride);
                    bookingData.otpVerified = false;
                })
                .catch(error => console.error("Error saving ride:", error));
        } else {
            rideHistory.unshift(ride);
            localStorage.setItem("rideHistory", JSON.stringify(rideHistory));
            bookingData.otpVerified = false;
        }
    }
}

function simulateDriver() {
    if (driverMarker) map.removeLayer(driverMarker);
    const coords = bookingData.coordinates;

    const pickupLat = parseFloat(document.getElementById("pickup").dataset.lat);
    const pickupLon = parseFloat(document.getElementById("pickup").dataset.lon);

    const availableDrivers = drivers.filter(d => d.status === "available");
    if (availableDrivers.length === 0) {
        alert("No drivers available. Please try again later.");
        document.getElementById("driver-status").textContent = "No drivers available";
        return;
    }

    const driversWithDistance = availableDrivers.map(driver => ({
        ...driver,
        distance: calculateDistance(pickupLat, pickupLon, driver.lat, driver.lon)
    }));
    driversWithDistance.sort((a, b) => a.distance - b.distance);
    const assignedDriver = driversWithDistance[0];

    const driverIndex = drivers.findIndex(d => d.id === assignedDriver.id);
    drivers[driverIndex].status = "busy";
    if (database) {
        database.ref('drivers/' + assignedDriver.id).update({ status: "busy" })
            .then(() => {
                if (currentDriver && currentDriver.id === assignedDriver.id) {
                    currentDriver.status = "busy";
                    database.ref('currentDriver').set(currentDriver);
                }
            });
    } else {
        localStorage.setItem("drivers", JSON.stringify(drivers));
        if (currentDriver && currentDriver.id === assignedDriver.id) {
            localStorage.setItem("currentDriver", JSON.stringify(currentDriver));
        }
    }

    bookingData.driver = assignedDriver;

    document.getElementById("driver-status").textContent = `Driver assigned: ${assignedDriver.name} (${assignedDriver.vehicle}) - ${assignedDriver.distance.toFixed(1)} km away`;

    driverMarker = L.marker([coords[0][1], coords[0][0]], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🚗</div>' })
    }).addTo(map);

    let step = 0;
    const interval = setInterval(() => {
        step++;
        const eta = Math.round(((coords.length - step) / coords.length) * bookingData.duration);
        document.getElementById("modal-eta").textContent = `ETA: ${eta} min`;
        if (step >= coords.length) {
            clearInterval(interval);
            document.getElementById("driver-status").textContent = `Driver arrived: ${assignedDriver.name}`;
            document.getElementById("chat-box").style.display = "block";
            drivers[driverIndex].status = "available";
            if (database) {
                database.ref('drivers/' + assignedDriver.id).update({ status: "available" })
                    .then(() => {
                        if (currentDriver && currentDriver.id === assignedDriver.id) {
                            currentDriver.status = "available";
                            database.ref('currentDriver').set(currentDriver);
                        }
                    });
            } else {
                localStorage.setItem("drivers", JSON.stringify(drivers));
                if (currentDriver && currentDriver.id === assignedDriver.id) {
                    localStorage.setItem("currentDriver", JSON.stringify(currentDriver));
                }
            }
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
    const profilePic = document.getElementById("profile-pic");
    const profilePicUpload = document.getElementById("profile-pic-upload");

    profileBtn.addEventListener("click", () => {
        profileModal.style.display = "flex";
        const modalContent = profileModal.querySelector(".modal-content");
        if (modalContent) modalContent.scrollTop = 0;

        document.getElementById("profile-name").textContent = user.name;
        document.getElementById("profile-email").textContent = user.email;
        document.getElementById("profile-phone").textContent = user.phone;
        profilePic.src = user.profilePic || "https://via.placeholder.com/80";
        document.getElementById("total-rides").textContent = rideHistory.length;
        document.getElementById("avg-rating").textContent = user.ratings.length ? (user.ratings.reduce((a, b) => a + b) / user.ratings.length).toFixed(1) : "--";
        document.getElementById("history-count").textContent = rideHistory.length;
        document.getElementById("ride-history-list").innerHTML = rideHistory.map(ride => `<li>${ride.rideType}: ${ride.pickup} → ${ride.destination} (${ride.date})</li>`).join("") || "<li>No trips yet.</li>";
        document.getElementById("no-history").style.display = rideHistory.length ? "none" : "block";
    });

    editBtn.addEventListener("click", () => {
        ["profile-name", "profile-email", "profile-phone"].forEach(id => document.getElementById(id).contentEditable = "true");
        profilePicUpload.style.display = "block";
        editBtn.style.display = "none";
        saveBtn.style.display = "block";

        profilePicUpload.addEventListener("change", (e) => {
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
        const newName = document.getElementById("profile-name").textContent.trim();
        const newEmail = document.getElementById("profile-email").textContent.trim();
        const newPhone = document.getElementById("profile-phone").textContent.trim();

        if (!newName || !newEmail || !newPhone) {
            alert("All fields must be filled.");
            return;
        }

        user.name = newName;
        user.email = newEmail;
        user.phone = newPhone;

        if (profilePicUpload.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                user.profilePic = event.target.result;
                if (database) {
                    database.ref('users').set(user)
                        .then(() => resetEditState())
                        .catch(error => console.error("Error saving profile:", error));
                } else {
                    localStorage.setItem("user", JSON.stringify(user));
                    resetEditState();
                }
            };
            reader.readAsDataURL(profilePicUpload.files[0]);
        } else {
            if (database) {
                database.ref('users').set(user)
                    .then(() => resetEditState())
                    .catch(error => console.error("Error saving profile:", error));
            } else {
                localStorage.setItem("user", JSON.stringify(user));
                resetEditState();
            }
        }
    });

    logoutBtn.addEventListener("click", () => {
        user = null;
        if (database) {
            database.ref('users').set(null)
                .then(() => {
                    profileModal.style.display = "none";
                    checkAuthStatus();
                })
                .catch(error => console.error("Error logging out:", error));
        } else {
            localStorage.removeItem("user");
            profileModal.style.display = "none";
            checkAuthStatus();
        }
    });

    closeProfile.addEventListener("click", () => {
        profileModal.style.display = "none";
        resetEditState();
    });

    function resetEditState() {
        ["profile-name", "profile-email", "profile-phone"].forEach(id => document.getElementById(id).contentEditable = "false");
        profilePicUpload.style.display = "none";
        profilePicUpload.value = "";
        editBtn.style.display = "block";
        saveBtn.style.display = "none";
    }
}

function setupThemeToggle() {
    const toggleBtn = document.getElementById("theme-toggle");
    toggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
        localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
    });
}

function clearInputFields() {
    const pickupInput = document.getElementById("pickup");
    const destinationInput = document.getElementById("destination");
    if (pickupInput) pickupInput.value = "";
    if (destinationInput) destinationInput.value = "";
}

function updateMap(coordinates) {
    const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(latLngs, { color: "#D4AF37", weight: 5, opacity: 0.9 }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

document.addEventListener("DOMContentLoaded", initMap);
