// Admin panel JavaScript

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab
        this.classList.add('active');
        document.getElementById(tabName).classList.add('active');
        
        // Load data for the tab
        loadTabData(tabName);
    });
});

// Load initial data
document.addEventListener('DOMContentLoaded', function() {
    // Make sure data is initialized
    initializeData();
    loadTabData('shipments');
});

function loadTabData(tabName) {
    switch(tabName) {
        case 'shipments':
            loadShipments();
            break;
        case 'containers':
            loadContainers();
            break;
        case 'fleet':
            loadFleet();
            break;
        case 'financials':
            loadFinancials();
            break;
        case 'inventory':
            loadInventory();
            break;
        case 'reports':
            // Reports are generated on demand
            break;
    }
}

// Load Shipments
function loadShipments() {
    const shipments = Storage.get('shipments', []);
    const tbody = document.querySelector('#shipmentsTable tbody');
    tbody.innerHTML = '';
    
    if (shipments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">No shipments yet</td></tr>';
        return;
    }
    
    shipments.forEach(shipment => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${shipment.orderId}</td>
            <td>${shipment.customerName}</td>
            <td>${shipment.productName}</td>
            <td>${shipment.weight} kg</td>
            <td>${shipment.destination}</td>
            <td>${formatCurrency(shipment.price)}</td>
            <td><span class="status-badge status-${shipment.status.toLowerCase().replace(' ', '-')}">${shipment.status}</span></td>
            <td>
                <select onchange="updateShipmentStatus('${shipment.orderId}', this.value)">
                    <option value="Pending" ${shipment.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Ready" ${shipment.status === 'Ready' ? 'selected' : ''}>Ready</option>
                    <option value="In Transit" ${shipment.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
                    <option value="Delivered" ${shipment.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                </select>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update shipment status
window.updateShipmentStatus = function(orderId, newStatus) {
    const shipments = Storage.get('shipments', []);
    const shipment = shipments.find(s => s.orderId === orderId);
    
    if (shipment) {
        shipment.status = newStatus;
        if (newStatus === 'Ready') {
            assignVehicles(shipment);
        }
        Storage.set('shipments', shipments);
        if (newStatus === 'Delivered' && shipment.containerId) {
            const containers = Storage.get('containers', []);
            const container = containers.find(c => c.id === shipment.containerId);
            if (container) {
                container.shipments = container.shipments.filter(s => s.orderId !== orderId);
                container.currentLoad = container.shipments.reduce((sum, s) => sum + (s.weight || 0), 0);
                container.status = container.shipments.length > 0 ? 'Ready' : 'Available';
                Storage.set('containers', containers);
            }
        }
        if (newStatus === 'Delivered') {
            releaseVehicles(orderId);
        }
        loadContainers();
        loadShipments();
        alert('Shipment status updated');
    }
};

function assignVehicles(shipment) {
    const fleet = Storage.get('fleet');
    if (!fleet) return;
    const availableTruck = fleet.trucks.find(t => t.status !== 'Busy' && t.capacity >= shipment.weight) || fleet.trucks.find(t => t.status !== 'Busy');
    if (availableTruck) {
        availableTruck.status = 'Busy';
        availableTruck.currentOrderId = shipment.orderId;
        shipment.truckId = availableTruck.id;
        shipment.truckName = availableTruck.name;
    }
    if (shipment.seaKm && shipment.seaKm > 0) {
        const availableShip = fleet.ships.find(s => s.status !== 'Busy' && s.capacity >= shipment.weight) || fleet.ships.find(s => s.status !== 'Busy');
        if (availableShip) {
            availableShip.status = 'Busy';
            availableShip.currentOrderId = shipment.orderId;
            shipment.shipId = availableShip.id;
            shipment.shipName = availableShip.name;
        }
    }
    Storage.set('fleet', fleet);
}

function releaseVehicles(orderId) {
    const fleet = Storage.get('fleet');
    if (!fleet) return;
    fleet.trucks.forEach(t => {
        if (t.currentOrderId === orderId) { t.currentOrderId = null; t.status = 'Available'; }
    });
    fleet.ships.forEach(s => {
        if (s.currentOrderId === orderId) { s.currentOrderId = null; s.status = 'Available'; }
    });
    Storage.set('fleet', fleet);
}

// Load Containers
function loadContainers() {
    const containers = Storage.get('containers', []);
    const shipments = Storage.get('shipments', []);
    let changed = false;
    containers.forEach(c => {
        const beforeLen = c.shipments.length;
        c.shipments = c.shipments.filter(s => {
            const sh = shipments.find(ss => ss.orderId === s.orderId);
            return sh && sh.status !== 'Delivered';
        });
        if (c.shipments.length !== beforeLen) changed = true;
        const newLoad = c.shipments.reduce((sum, s) => sum + (s.weight || 0), 0);
        if (newLoad !== c.currentLoad) { c.currentLoad = newLoad; changed = true; }
        c.status = c.shipments.length > 0 ? 'Ready' : 'Available';
    });
    if (changed) Storage.set('containers', containers);
    const containersList = document.getElementById('containersList');
    containersList.innerHTML = '';
    
    if (containers.length === 0) {
        containersList.innerHTML = '<p>No containers available</p>';
        return;
    }
    
    containers.forEach(container => {
        const utilizationPercent = (container.currentLoad / container.capacity * 100).toFixed(1);
        
        const containerDiv = document.createElement('div');
        containerDiv.className = 'container-item';
        containerDiv.innerHTML = `
            <div class="container-header">
                <h3>${container.type} Container #${container.id}</h3>
                <span class="status-badge status-${container.status.toLowerCase()}">${container.status}</span>
            </div>
            <p><strong>Capacity:</strong> ${container.currentLoad} / ${container.capacity} kg (${utilizationPercent}%)</p>
            <div class="inventory-bar">
                <div class="inventory-fill" style="width: ${utilizationPercent}%"></div>
            </div>
            <p><strong>Shipments:</strong></p>
            ${container.shipments.length > 0 ? 
                container.shipments.map(s => `
                    <div class="shipment-item">
                        ${s.orderId} - ${s.customer} (${s.weight} kg)
                    </div>
                `).join('') : 
                '<p>Container is empty</p>'
            }
        `;
        containersList.appendChild(containerDiv);
    });
}

// Optimize Containers (First-Fit Decreasing Algorithm)
document.getElementById('optimizeBtn').addEventListener('click', function() {
    const allShipments = Storage.get('shipments', []);
    const shipments = allShipments.filter(s => s.status === 'Pending');
    
    if (shipments.length === 0) {
        alert('No pending shipments to optimize');
        return;
    }
    
    // Sort shipments by weight (descending)
    shipments.sort((a, b) => b.weight - a.weight);
    
    const containers = Storage.get('containers', []);
    const delivered = allShipments.filter(s => s.status === 'Delivered' && s.containerId);
    if (delivered.length > 0) {
        delivered.forEach(ds => {
            const cont = containers.find(c => c.id === ds.containerId);
            if (cont) {
                cont.shipments = cont.shipments.filter(si => si.orderId !== ds.orderId);
            }
        });
        containers.forEach(c => {
            c.currentLoad = c.shipments.reduce((sum, s) => sum + (s.weight || 0), 0);
            c.status = c.shipments.length > 0 ? 'Ready' : 'Available';
        });
    }
    let optimized = 0;
    
    shipments.forEach(shipment => {
        const container = containers.find(c => (c.capacity - c.currentLoad) >= shipment.weight);
        if (container) {
            container.currentLoad += shipment.weight;
            container.shipments.push({ orderId: shipment.orderId, weight: shipment.weight, customer: shipment.customerName });
            shipment.containerId = container.id;
            shipment.status = 'Ready';
            assignVehicles(shipment);
            optimized++;
        }
    });
    containers.forEach(c => { c.status = c.shipments.length > 0 ? 'Ready' : 'Available'; });
    
    Storage.set('containers', containers);
    Storage.set('shipments', allShipments);
    
    alert(`${optimized} shipments optimized and placed in containers`);
    loadContainers();
    loadShipments();
});

// Load Fleet
function loadFleet() {
    const fleet = Storage.get('fleet');
    
    if (!fleet) {
        console.error('Fleet data not found');
        return;
    }
    
    // Ships
    const shipsTable = document.querySelector('#shipsTable tbody');
    shipsTable.innerHTML = '';
    
    if (fleet.ships && fleet.ships.length > 0) {
        fleet.ships.forEach(ship => {
            const totalExpense = ship.fuelCost + ship.crewCost + ship.maintenance;
            shipsTable.innerHTML += `
                <tr>
                    <td>${ship.name}</td>
                    <td>${ship.capacity.toLocaleString('en-US')} kg</td>
                    <td>₺${ship.fuelCost}/km</td>
                    <td>${formatCurrency(ship.crewCost)}</td>
                    <td>${formatCurrency(ship.maintenance)}</td>
                    <td><span class="status-badge status-${(ship.status || 'Available').toLowerCase()}">${ship.status || 'Available'}${ship.currentOrderId ? ' (' + ship.currentOrderId + ')' : ''}</span></td>
                    <td><strong>${formatCurrency(totalExpense)}</strong></td>
                </tr>
            `;
        });
    } else {
        shipsTable.innerHTML = '<tr><td colspan="7" style="text-align:center">No ships available</td></tr>';
    }
    
    // Trucks
    const trucksTable = document.querySelector('#trucksTable tbody');
    trucksTable.innerHTML = '';
    
    if (fleet.trucks && fleet.trucks.length > 0) {
        fleet.trucks.forEach(truck => {
            const totalExpense = truck.fuelCost + truck.driverCost + truck.maintenance;
            trucksTable.innerHTML += `
                <tr>
                    <td>${truck.name}</td>
                    <td>${truck.capacity.toLocaleString('en-US')} kg</td>
                    <td>₺${truck.fuelCost}/km</td>
                    <td>${formatCurrency(truck.driverCost)}</td>
                    <td>${formatCurrency(truck.maintenance)}</td>
                    <td><span class="status-badge status-${(truck.status || 'Available').toLowerCase()}">${truck.status || 'Available'}${truck.currentOrderId ? ' (' + truck.currentOrderId + ')' : ''}</span></td>
                    <td><strong>${formatCurrency(totalExpense)}</strong></td>
                </tr>
            `;
        });
    } else {
        trucksTable.innerHTML = '<tr><td colspan="7" style="text-align:center">No trucks available</td></tr>';
    }
}

// Load Financials
function loadFinancials() {
    const shipments = Storage.get('shipments', []);
    const fleet = Storage.get('fleet');
    const totalRevenue = shipments.reduce((sum, s) => sum + (s.price || 0), 0);
    let totalExpenses = 0;
    if (fleet && shipments.length > 0) {
        const truck = fleet.trucks.find(t => t.name === 'RoadKing') || fleet.trucks[0];
        const ship = fleet.ships.find(s => s.name === 'BlueSea') || fleet.ships[0];
        shipments.forEach(s => {
            const domesticKm = typeof s.domesticTruckKm === 'number' ? s.domesticTruckKm : (s.seaKm ? 100 : (s.distance || 0));
            const seaKm = typeof s.seaKm === 'number' ? s.seaKm : 0;
            const truckExpense = (truck.fuelCost * domesticKm) + truck.driverCost + truck.maintenance;
            const shipExpense = seaKm > 0 ? (ship.fuelCost * seaKm) + ship.crewCost + ship.maintenance : 0;
            totalExpenses += truckExpense + shipExpense;
        });
    }
    const netIncome = totalRevenue - totalExpenses;
    const tax = netIncome * 0.20;
    const profitAfterTax = netIncome - tax;
    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('totalExpenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('netIncome').textContent = formatCurrency(netIncome);
    document.getElementById('tax').textContent = formatCurrency(tax);
    document.getElementById('profitAfterTax').textContent = formatCurrency(profitAfterTax);
}

// Load Inventory
function loadInventory() {
    const inventory = Storage.get('inventory', []);
    const inventoryGrid = document.getElementById('inventoryGrid');
    inventoryGrid.innerHTML = '';
    
    if (inventory.length === 0) {
        inventoryGrid.innerHTML = '<p>No inventory data available</p>';
        return;
    }
    
    inventory.forEach(item => {
        const percentage = (item.quantity / (item.minStock * 4)) * 100;
        const isLow = item.quantity < item.minStock;
        
        const card = document.createElement('div');
        card.className = 'inventory-card';
        card.innerHTML = `
            <h3>${item.category} Blueberries</h3>
            <p><strong>Quantity:</strong> ${item.quantity.toLocaleString('en-US')} kg</p>
            <p><strong>Minimum Stock:</strong> ${item.minStock.toLocaleString('en-US')} kg</p>
            <div class="inventory-bar">
                <div class="inventory-fill ${isLow ? 'low' : ''}" style="width: ${Math.min(percentage, 100)}%"></div>
            </div>
            <p><strong>Status:</strong> ${isLow ? '⚠️ Low Stock' : '✅ Normal'}</p>
            ${isLow ? '<p style="color: #f59e0b; font-weight: bold;">Please restock!</p>' : ''}
            ${isLow || item.quantity === 0 ? `
                <div class="inventory-actions">
                    <button class="btn btn-primary add-stock-btn" data-category="${item.category}">Add Stock</button>
                </div>
            ` : ''}
        `;
        inventoryGrid.appendChild(card);
        const addBtn = card.querySelector('.add-stock-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function() {
                const category = this.dataset.category;
                const input = prompt('Enter quantity to add (kg)');
                const qty = parseInt(input, 10);
                if (!isNaN(qty) && qty > 0) {
                    updateInventory(category, qty, 'add');
                    loadInventory();
                    alert('Stock updated');
                } else {
                    alert('Please enter a valid quantity');
                }
            });
        }
    });
}

// Generate Report
document.getElementById('generateReport').addEventListener('click', function() {
    const shipments = Storage.get('shipments', []);
    const containers = Storage.get('containers', []);
    const inventory = Storage.get('inventory', []);
    
    const completedShipments = shipments.filter(s => s.status === 'Delivered');
    const totalRevenue = completedShipments.reduce((sum, s) => sum + s.price, 0);
    const totalDistance = shipments.reduce((sum, s) => sum + (s.distance || 0), 0);
    
    // Find most popular route
    const routeCounts = {};
    shipments.forEach(s => {
        routeCounts[s.destination] = (routeCounts[s.destination] || 0) + 1;
    });
    const mostPopularRoute = Object.keys(routeCounts).length > 0 ? 
        Object.keys(routeCounts).reduce((a, b) => routeCounts[a] > routeCounts[b] ? a : b) : 'N/A';
    
    // Container utilization
    const totalCapacity = containers.reduce((sum, c) => sum + c.capacity, 0);
    const totalUsed = containers.reduce((sum, c) => sum + c.currentLoad, 0);
    const utilization = totalCapacity > 0 ? ((totalUsed / totalCapacity) * 100).toFixed(1) : '0';
    
    // Products per category
    const categoryCount = {};
    shipments.forEach(s => {
        categoryCount[s.category] = (categoryCount[s.category] || 0) + s.weight;
    });
    
    const reportContent = `
        <div class="report-section">
            <h3>📊 General Summary</h3>
            <p><strong>Total Shipments:</strong> ${shipments.length}</p>
            <p><strong>Completed Shipments:</strong> ${completedShipments.length}</p>
            <p><strong>Total Revenue:</strong> ${formatCurrency(totalRevenue)}</p>
            <p><strong>Total Distance:</strong> ${totalDistance.toLocaleString('en-US')} km</p>
        </div>
        
        <div class="report-section">
            <h3>🚚 Container Performance</h3>
            <p><strong>Average Utilization Rate:</strong> ${utilization}%</p>
            <p><strong>Total Containers:</strong> ${containers.length}</p>
            <p><strong>Ready Containers:</strong> ${containers.filter(c => c.status === 'Ready').length}</p>
        </div>
        
        <div class="report-section">
            <h3>🌍 Route Analysis</h3>
            <p><strong>Most Popular Route:</strong> Muğla → ${mostPopularRoute}</p>
        </div>
        
        <div class="report-section">
            <h3>📦 Sales by Category</h3>
            ${Object.keys(categoryCount).length > 0 ? 
                Object.entries(categoryCount).map(([cat, weight]) => 
                    `<p><strong>${cat}:</strong> ${weight.toLocaleString('en-US')} kg</p>`
                ).join('') : '<p>No sales data</p>'
            }
        </div>
        
        <div class="report-section">
            <h3>🫐 Inventory Status</h3>
            ${inventory.map(item => 
                `<p><strong>${item.category}:</strong> ${item.quantity.toLocaleString('en-US')} kg 
                ${item.quantity < item.minStock ? '⚠️' : '✅'}</p>`
            ).join('')}
        </div>
    `;
    
    document.getElementById('reportContent').innerHTML = reportContent;
});