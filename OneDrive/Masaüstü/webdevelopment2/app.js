// Global variables and constants
const CONTAINER_TYPES = {
    Small: { capacity: 2000, rate: 5 },
    Medium: { capacity: 5000, rate: 8 },
    Large: { capacity: 10000, rate: 12 }
};

const FLEET = {
    ships: [
        { id: 'S001', name: 'BlueSea', capacity: 100000, fuelCost: 40, crewCost: 20000, maintenance: 10000, status: 'Available', currentOrderId: null },
        { id: 'S002', name: 'OceanStar', capacity: 120000, fuelCost: 50, crewCost: 25000, maintenance: 12000, status: 'Available', currentOrderId: null },
        { id: 'S003', name: 'AegeanWind', capacity: 90000, fuelCost: 35, crewCost: 18000, maintenance: 8000, status: 'Available', currentOrderId: null }
    ],
    trucks: [
        { id: 'T001', name: 'RoadKing', capacity: 10000, fuelCost: 8, driverCost: 3000, maintenance: 2000, status: 'Available', currentOrderId: null },
        { id: 'T002', name: 'FastMove', capacity: 12000, fuelCost: 9, driverCost: 3500, maintenance: 2500, status: 'Available', currentOrderId: null },
        { id: 'T003', name: 'CargoPro', capacity: 9000, fuelCost: 7, driverCost: 2800, maintenance: 2000, status: 'Available', currentOrderId: null },
        { id: 'T004', name: 'HeavyLoad', capacity: 15000, fuelCost: 10, driverCost: 4000, maintenance: 3000, status: 'Available', currentOrderId: null }
    ]
};

const TURKISH_PORTS = [
    { name: 'Izmir', lat: 38.423734, lon: 27.142826 },
    { name: 'Mersin', lat: 36.8121, lon: 34.6415 },
    { name: 'Istanbul', lat: 41.0082, lon: 28.9784 },
    { name: 'Antalya', lat: 36.8969, lon: 30.7133 }
];

// LocalStorage helper functions
const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    },
    
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },
    
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
};

// Initialize data on first load
function initializeData() {
    // Inventory - ALWAYS initialize if not exists
    if (!Storage.get('inventory')) {
        const initialInventory = [
            { category: 'Fresh', quantity: 4500, minStock: 2000 },
            { category: 'Frozen', quantity: 1200, minStock: 1000 },
            { category: 'Organic', quantity: 8000, minStock: 2500 }
        ];
        Storage.set('inventory', initialInventory);
        console.log('Inventory initialized:', initialInventory);
    }
    
    // Shipments
    if (!Storage.get('shipments')) {
        Storage.set('shipments', []);
        console.log('Shipments initialized');
    }
    
    // Containers
    if (!Storage.get('containers')) {
        const initialContainers = [
            { id: 1, type: 'Small', capacity: 2000, currentLoad: 0, status: 'Available', shipments: [] },
            { id: 2, type: 'Medium', capacity: 5000, currentLoad: 0, status: 'Available', shipments: [] },
            { id: 3, type: 'Large', capacity: 10000, currentLoad: 0, status: 'Available', shipments: [] },
            { id: 4, type: 'Large', capacity: 10000, currentLoad: 0, status: 'Available', shipments: [] }
        ];
        Storage.set('containers', initialContainers);
        console.log('Containers initialized');
    }
    
    // Fleet - initialize only if not exists to preserve runtime status
    if (!Storage.get('fleet')) {
        Storage.set('fleet', FLEET);
        console.log('Fleet initialized:', FLEET);
    }
}

// Distance calculation using OpenRouteService API
async function calculateDistance(destination) {
    const origin = 'Muğla, Turkey';
    try {
        const originCoords = await geocodeLocationNominatim(origin);
        const destCoords = await geocodeLocationNominatim(destination);
        if (originCoords && destCoords) {
            const distance = calculateHaversineDistance(
                originCoords.lat, originCoords.lon,
                destCoords.lat, destCoords.lon
            );
            return Math.round(distance * 1.3);
        }
        return estimateDistance(destination);
    } catch (error) {
        console.error('Distance calculation error:', error);
        return estimateDistance(destination);
    }
}

function isDomestic(destination) {
    const d = destination.toLowerCase();
    return d.includes('turkey') || d.includes('türkiye');
}

async function calculateRoute(destination) {
    const origin = 'Muğla, Turkey';
    const originCoords = await geocodeLocationNominatim(origin);
    const destCoords = await geocodeLocationNominatim(destination);
    if (!originCoords || !destCoords) {
        const fallback = estimateDistance(destination);
        return { domesticTruckKm: fallback, seaKm: 0, totalKm: fallback, originPort: null };
    }
    if (isDomestic(destination)) {
        const road = calculateHaversineDistance(originCoords.lat, originCoords.lon, destCoords.lat, destCoords.lon);
        const km = Math.round(road * 1.3);
        return { domesticTruckKm: km, seaKm: 0, totalKm: km, originPort: null };
    }
    let bestPort = null;
    let bestRoadKm = Infinity;
    TURKISH_PORTS.forEach(p => {
        const d = calculateHaversineDistance(originCoords.lat, originCoords.lon, p.lat, p.lon) * 1.3;
        const km = Math.round(d);
        if (km < bestRoadKm) { bestRoadKm = km; bestPort = p; }
    });
    const sea = calculateHaversineDistance(bestPort.lat, bestPort.lon, destCoords.lat, destCoords.lon);
    const seaKm = Math.round(sea * 1.1);
    const total = bestRoadKm + seaKm;
    return { domesticTruckKm: bestRoadKm, seaKm: seaKm, totalKm: total, originPort: bestPort.name };
}

// Geocoding using Nominatim (OpenStreetMap - free, no API key)
async function geocodeLocationNominatim(location) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'GlobalFreightApp/1.0'
            }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Haversine formula for distance calculation
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Approximate distance estimation (fallback)
function estimateDistance(destination) {
    const distances = {
        'Berlin': 3000, 'Germany': 3000,
        'Paris': 2500, 'France': 2500,
        'London': 3000, 'UK': 3000, 'England': 3000,
        'Rome': 1500, 'Italy': 1500,
        'Madrid': 3200, 'Spain': 3200,
        'Amsterdam': 2400, 'Netherlands': 2400,
        'Vienna': 1400, 'Austria': 1400,
        'Athens': 900, 'Greece': 900,
        'Istanbul': 600, 'Turkey': 600,
        'Ankara': 450,
        'Izmir': 150,
        'Antalya': 250,
        'Brussels': 2600, 'Belgium': 2600,
        'Copenhagen': 2400, 'Denmark': 2400,
        'Stockholm': 2800, 'Sweden': 2800,
        'Oslo': 3000, 'Norway': 3000,
        'Helsinki': 2900, 'Finland': 2900,
        'Warsaw': 1800, 'Poland': 1800,
        'Prague': 1700, 'Czech': 1700,
        'Budapest': 1300, 'Hungary': 1300,
        'Bucharest': 900, 'Romania': 900,
        'Sofia': 600, 'Bulgaria': 600
    };
    
    const dest = destination.toLowerCase();
    for (let [key, value] of Object.entries(distances)) {
        if (dest.includes(key.toLowerCase())) {
            return value;
        }
    }
    
    // Default
    return 2000;
}

// Calculate price
function calculatePrice(distance, containerType) {
    const rate = CONTAINER_TYPES[containerType].rate;
    return distance * rate;
}

// Estimate delivery time
function estimateDeliveryTime(distance) {
    const days = Math.ceil(distance / 500); // 1 day per 500 km
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + days);
    return deliveryDate.toLocaleDateString('en-US');
}

// Generate order ID
function generateOrderId() {
    return 'ORD-' + Date.now();
}

// Update inventory
function updateInventory(category, quantity, operation = 'subtract') {
    const inventory = Storage.get('inventory', []);
    const item = inventory.find(i => i.category === category);
    
    if (item) {
        if (operation === 'subtract') {
            item.quantity -= quantity;
        } else {
            item.quantity += quantity;
        }
        Storage.set('inventory', inventory);
        console.log('Inventory updated:', inventory);
    }
}

// Check inventory
function checkInventory(category, quantity) {
    const inventory = Storage.get('inventory', []);
    const item = inventory.find(i => i.category === category);
    
    if (!item) return { available: false, message: 'Category not found' };
    
    if (item.quantity < quantity) {
        return { available: false, message: `Insufficient stock. Available: ${item.quantity} kg` };
    }
    
    return { available: true, message: 'Stock available' };
}

// Check container capacity
function checkContainerCapacity(containerType, weight) {
    const containers = Storage.get('containers', []);
    const availableContainer = containers.find(c => 
        c.type === containerType && 
        c.status === 'Available' && 
        (c.capacity - c.currentLoad) >= weight
    );
    
    if (availableContainer) {
        return { available: true, container: availableContainer };
    }
    
    return { available: false, message: `Not enough space in ${containerType} container` };
}

// Format currency
function formatCurrency(amount) {
    return '₺' + amount.toLocaleString('en-US');
}

// Initialize data when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    console.log('Application initialized');
});