document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.href.includes('index.html') && window.location.pathname !== '/') {
        const pageLoadAudio = new Audio('assets/sounds/click2.mp3');
        pageLoadAudio.currentTime = 0;      // Start time offset in seconds
        pageLoadAudio.volume = 0.6;         // Volume (0-1)
        pageLoadAudio.playbackRate = 1;     // Pitch control (1 = normal, 0.5 = lower, 2 = higher)
        pageLoadAudio.play();
    }
});

// Add hover effect to all test images
const images = document.querySelectorAll('.top-layer img, .bottom-layer img');
images.forEach(img => {
    // Prevent context menu on images
    img.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Hover effects
    img.addEventListener('mouseenter', () => {
        img.src = img.dataset.active;
        
        // Play click sound with 0.1s offset and 80% volume
        const audio = new Audio('assets/sounds/click1.mp3');
        audio.volume = 0.3;
        audio.currentTime = 0.3;
        audio.play();
    });
    img.addEventListener('mouseleave', () => {
        img.src = img.dataset.default;
    });
    
    // Click event for navigation
    img.addEventListener('click', () => {
        // Navigate to page if data-href is set
        if (img.dataset.href) {
            window.location.href = img.dataset.href;
        }
    });
});
