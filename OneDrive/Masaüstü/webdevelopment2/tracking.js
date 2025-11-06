// Shipment tracking JavaScript

document.getElementById('trackBtn').addEventListener('click', function() {
    const orderId = document.getElementById('orderId').value.trim();
    
    if (!orderId) {
        showError('Please enter your order ID');
        return;
    }
    
    trackShipment(orderId);
});

// Track with Enter key
document.getElementById('orderId').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('trackBtn').click();
    }
});

function trackShipment(orderId) {
    const shipments = Storage.get('shipments', []);
    const shipment = shipments.find(s => s.orderId === orderId);
    
    if (!shipment) {
        showError('Order not found. Please check your order ID.');
        hideTracking();
        return;
    }
    
    hideError();
    displayTrackingInfo(shipment);
}

function displayTrackingInfo(shipment) {
    // Fill shipment details
    document.getElementById('trackOrderId').textContent = shipment.orderId;
    document.getElementById('trackCustomer').textContent = shipment.customerName;
    document.getElementById('trackProduct').textContent = shipment.productName + ' (' + shipment.category + ')';
    document.getElementById('trackWeight').textContent = shipment.weight + ' kg';
    document.getElementById('trackDestination').textContent = shipment.destination;
    document.getElementById('trackContainer').textContent = shipment.containerId ? 
        `Container #${shipment.containerId}` : 'Not assigned yet';
    
    // Status badge
    const statusBadge = document.getElementById('trackStatus');
    statusBadge.textContent = getStatusText(shipment.status);
    statusBadge.className = 'status-badge status-' + shipment.status.toLowerCase().replace(' ', '-');
    
    document.getElementById('trackDelivery').textContent = shipment.deliveryDate;
    
    // Update timeline
    updateTimeline(shipment.status);
    
    // Show tracking result
    document.getElementById('trackingResult').style.display = 'block';
    document.getElementById('trackingResult').scrollIntoView({ behavior: 'smooth' });
}

function getStatusText(status) {
    const statusMap = {
        'Pending': 'Pending',
        'Ready': 'Ready for Transport',
        'In Transit': 'In Transit',
        'Delivered': 'Delivered'
    };
    return statusMap[status] || status;
}

function updateTimeline(status) {
    // Reset all steps
    const steps = ['step1', 'step2', 'step3', 'step4'];
    steps.forEach(step => {
        document.getElementById(step).classList.remove('active', 'completed');
    });
    
    // Determine which steps to activate
    let activeStep = 0;
    switch(status) {
        case 'Pending':
            activeStep = 1;
            break;
        case 'Ready':
            activeStep = 2;
            break;
        case 'In Transit':
            activeStep = 3;
            break;
        case 'Delivered':
            activeStep = 4;
            break;
    }
    
    // Mark completed and active steps
    for (let i = 1; i <= activeStep; i++) {
        const stepEl = document.getElementById('step' + i);
        if (i < activeStep) {
            stepEl.classList.add('completed');
        } else {
            stepEl.classList.add('active');
        }
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function hideTracking() {
    document.getElementById('trackingResult').style.display = 'none';
}

// Auto-load if order ID in URL
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    
    if (orderId) {
        document.getElementById('orderId').value = orderId;
        trackShipment(orderId);
    }
});