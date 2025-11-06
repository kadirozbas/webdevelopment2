// Customer portal JavaScript
let currentShipmentData = null;

document.getElementById('shipmentForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Get form data
    const formData = {
        customerName: document.getElementById('customerName').value,
        productName: document.getElementById('productName').value,
        category: document.getElementById('category').value,
        weight: parseInt(document.getElementById('weight').value),
        containerType: document.getElementById('containerType').value,
        destinationCity: document.getElementById('destinationCity').value,
        destinationCountry: document.getElementById('destinationCountry').value
    };
    
    // Validation
    if (!validateForm(formData)) {
        return;
    }
    
    // Show loading
    document.getElementById('loadingSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    
    try {
        // Check inventory
        const inventoryCheck = checkInventory(formData.category, formData.weight);
        if (!inventoryCheck.available) {
            alert('Inventory Error: ' + inventoryCheck.message);
            document.getElementById('loadingSection').style.display = 'none';
            return;
        }
        
        // Check container capacity
        const capacityCheck = checkContainerCapacity(formData.containerType, formData.weight);
        if (!capacityCheck.available) {
            alert('Capacity Error: ' + capacityCheck.message);
            document.getElementById('loadingSection').style.display = 'none';
            return;
        }
        
        const imageInput = document.getElementById('productImage');
        let productImage = null;
        if (imageInput && imageInput.files && imageInput.files[0]) {
            productImage = await readFileAsDataURL(imageInput.files[0]);
        }

        const destination = `${formData.destinationCity}, ${formData.destinationCountry}`;
        const route = await calculateRoute(destination);
        const distance = route.totalKm;
        
        // Calculate price
        const price = calculatePrice(distance, formData.containerType);
        
        // Delivery date
        const deliveryDate = estimateDeliveryTime(distance);
        
        // Order ID
        const orderId = generateOrderId();
        
        // Store result data
        currentShipmentData = {
            ...formData,
            orderId,
            destination,
            distance,
            price,
            deliveryDate,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            productImage,
            domesticTruckKm: route.domesticTruckKm,
            seaKm: route.seaKm,
            originPort: route.originPort
        };
        
        // Display results
        displayResults(currentShipmentData);
        
    } catch (error) {
        console.error('Shipment creation error:', error);
        alert('An error occurred. Please try again.');
    } finally {
        document.getElementById('loadingSection').style.display = 'none';
    }
});

function validateForm(data) {
    if (data.weight <= 0) {
        alert('Weight must be greater than 0');
        return false;
    }
    
    const containerCapacity = CONTAINER_TYPES[data.containerType].capacity;
    if (data.weight > containerCapacity) {
        alert(`Weight exceeds ${data.containerType} container capacity (${containerCapacity} kg)`);
        return false;
    }
    
    return true;
}

function displayResults(data) {
    document.getElementById('resultCustomer').textContent = data.customerName;
    document.getElementById('resultProduct').textContent = data.productName + ' (' + data.category + ')';
    document.getElementById('resultWeight').textContent = data.weight + ' kg';
    document.getElementById('resultDestination').textContent = data.destination;
    document.getElementById('resultDistance').textContent = data.distance.toLocaleString('en-US') + ' km';
    document.getElementById('resultContainer').textContent = data.containerType;
    document.getElementById('resultPrice').textContent = formatCurrency(data.price);
    document.getElementById('resultDelivery').textContent = data.deliveryDate;
    document.getElementById('resultOrderId').textContent = data.orderId;
    const imgEl = document.getElementById('resultImage');
    if (imgEl) {
        if (data.productImage) {
            imgEl.src = data.productImage;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
    }
    
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Confirm order
document.getElementById('confirmShipment').addEventListener('click', function() {
    if (!currentShipmentData) return;
    
    // Update inventory
    updateInventory(currentShipmentData.category, currentShipmentData.weight);
    
    // Add to shipments
    const shipments = Storage.get('shipments', []);
    shipments.push(currentShipmentData);
    Storage.set('shipments', shipments);
    
    alert('Order successfully created!\nOrder ID: ' + currentShipmentData.orderId);
    
    // Reset form
    document.getElementById('shipmentForm').reset();
    document.getElementById('resultSection').style.display = 'none';
    currentShipmentData = null;
    
    // Redirect to tracking page
    if (confirm('Would you like to track your shipment?')) {
        window.location.href = 'tracking.html';
    }
});

// Cancel order
document.getElementById('cancelShipment').addEventListener('click', function() {
    if (confirm('Are you sure you want to cancel this order?')) {
        document.getElementById('resultSection').style.display = 'none';
        currentShipmentData = null;
    }
});

function addToContainer(shipmentData) {
    const containers = Storage.get('containers', []);
    const container = containers.find(c => 
        c.type === shipmentData.containerType && 
        c.status === 'Available' &&
        (c.capacity - c.currentLoad) >= shipmentData.weight
    );
    
    if (container) {
        container.currentLoad += shipmentData.weight;
        container.shipments.push({
            orderId: shipmentData.orderId,
            weight: shipmentData.weight,
            customer: shipmentData.customerName
        });
        
        // Update container status if full
        if (container.currentLoad >= container.capacity * 0.9) {
            container.status = 'Ready';
        }
        
        Storage.set('containers', containers);
        
        // Add container id to shipment
        shipmentData.containerId = container.id;
    }
}