// Game logic for "Processing Your Regret"
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const hiddenCursor = document.getElementById('hiddenCursor');
    const cursorReflection = document.getElementById('cursorReflection');
    const loadingBar = document.querySelector('.loading-bar');
    const container = document.querySelector('.container');
    
    // Audio context for sound effects
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create the "pop" sound effect
    function playPopSound() {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.05);
    }
    
    // Create the "rewind" sound effect
    function playRewindSound() {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 3);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 3);
    }
    
    // Create the "reject" sound effect
    function playRejectSound() {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const noise = audioContext.createBufferSource();
        const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < noiseBuffer.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        
        noise.buffer = noiseBuffer;
        noise.loop = false;
        noise.start(audioContext.currentTime);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }
    
    // Trigger the "pop" sound effect and freeze
    function triggerPop() {
        playPopSound();
        
        // Freeze the game for 3 seconds
        setTimeout(() => {
            // Add shiver effect to the container
            container.classList.add('shiver');
            
            // Add the loading bar animation (backward)
            loadingBar.style.animation = 'none';
            loadingBar.style.transform = 'scaleX(0)';
            loadingBar.style.backgroundPosition = '100% 50%';
            
            // Play rewind sound
            playRewindSound();
            
            // Start the backward loading bar animation
            setTimeout(() => {
                loadingBar.style.animation = 'loadingBar 4s linear infinite reverse';
                loadingBar.style.backgroundPosition = '100% 50%';
            }, 100);
            
            // Show the error message after 3 seconds
            setTimeout(() => {
                document.querySelector('.error-message').style.display = 'block';
            }, 3000);
            
        }, 1000); // Delay the freeze by 1 second to make the pop noticeable
    }
    
    // Mouse movement tracking for cursor reflection
    document.addEventListener('mousemove', (e) => {
        // Update cursor reflection position (slightly delayed)
        cursorReflection.style.left = e.clientX + 'px';
        cursorReflection.style.top = e.clientY + 'px';
        
        // Add a slight delay to the reflection
        setTimeout(() => {
            cursorReflection.style.left = e.clientX + 'px';
            cursorReflection.style.top = e.clientY + 'px';
        }, 100);
    });
    
    // Handle click to trigger the pop
    document.addEventListener('click', (e) => {
        // Disable normal cursor
        hiddenCursor.style.cursor = 'none';
        
        // Add shiver effect to container
        container.classList.add('shiver');
        
        // Play pop sound
        triggerPop();
    });
    
    // Prevent all interactions after pop
    document.addEventListener('mousemove', (e) => {
        // Check if pop has been triggered
        if (document.querySelector('.loading-bar').style.animation === 'loadingBar 4s linear infinite reverse') {
            // If pop has been triggered, add rejection effect
            if (Math.random() < 0.1) { // 10% chance of rejection
                playRejectSound();
                // Add micro-stutter effect
                container.classList.add('shiver');
                setTimeout(() => {
                    container.classList.remove('shiver');
                }, 100);
            }
        }
    });
    
    // Initialize error message as hidden
    document.querySelector('.error-message').style.display = 'none';
});
