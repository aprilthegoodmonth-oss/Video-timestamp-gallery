// Register the Service Worker (REQUIRED FOR SHARE TARGET ON REAL HOSTS)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}


document.addEventListener('DOMContentLoaded', () => {
    
    // NOTE: The call to dynamicallyCreateManifest() has been removed.

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const addVideoButton = document.getElementById('addVideoButton');
    const carouselTrack = document.getElementById('videoGallery'); 

    // --- CAROUSEL 3D CONFIGURATION ---
    const IS_MOBILE = window.innerWidth <= 500;
    const CAROUSEL_RADIUS = IS_MOBILE ? 280 : 400; 
    let currentRotation = 0; 
    // ----------------------------------

    // --- CAROUSEL GESTURE VARIABLES ---
    let startX = 0; 
    let startY = 0; 
    let startRotation = 0; 
    let isSwiping = false; 
    const SENSITIVITY = 0.5;
    const SCROLL_THRESHOLD = 5; 
    // ----------------------------------------

    // Storage Key
    const storageKey = 'videoGalleryData';
    let videoGalleryData = [];

    // --- MAX VIDEO LIMIT ---
    const MAX_VIDEOS = 6;
    // ----------------------------
    
    // --- Store YouTube Player Objects ---
    const youtubePlayers = {}; 
    
    // Global function required by the YouTube API
    window.onYouTubeIframeAPIReady = () => {
        loadGalleryData();
        handleSharedUrl(); // Check for shared URL immediately after loading data
    };
    
    // =========================================================
    // --- CORE DATA MANAGEMENT AND HELPERS ---
    // =========================================================

    function saveGalleryData() {
        localStorage.setItem(storageKey, JSON.stringify(videoGalleryData));
    }

    function loadGalleryData() {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            videoGalleryData = JSON.parse(savedData);

            videoGalleryData.forEach(video => {
                video.timestamps = video.timestamps.map(ts => {
                    if (typeof ts === 'number') {
                        return { time: ts, note: '' };
                    }
                    return ts;
                });
            });
        }
        renderGallery();
    }

    function getYouTubeId(input) {
        if (!input) return null;

        const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
        const match = input.match(regExp);

        if (match && match[1].length === 11) {
            return match[1];
        } else if (input.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return input;
        }
        return null;
    }
    
    // --- Timestamp Helpers ---
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const paddedSeconds = String(seconds).padStart(2, '0');
        if (hours > 0) {
            const paddedMinutes = String(minutes).padStart(2, '0');
            return `${hours}:${paddedMinutes}:${paddedSeconds}`;
        }
        return `${minutes}:${paddedSeconds}`; 
    }

    function parseTimeInput(input) {
        const timeRegex = /^\s*([\d:]+)\s*(.*)$/;
        const match = input.match(timeRegex);
        if (!match) return { seconds: NaN, note: '' };
        const timePart = match[1];
        const note = match[2].trim();
        let totalSeconds = 0;
        const parts = timePart.split(':').map(p => parseInt(p.trim(), 10));
        if (parts.some(isNaN) || parts.length > 3 || parts.length === 0) {
            return { seconds: NaN, note: '' };
        }
        if (parts.length === 3) {
            totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            totalSeconds = parts[0] * 60 + parts[1];
        } else {
            totalSeconds = parts[0];
        }
        if (totalSeconds < 0) return { seconds: NaN, note: '' };
        return { seconds: totalSeconds, note: note };
    }

    // --- SHARE TARGET HANDLER UTILITIES ---
    function displayLimitMessage() {
        const message = document.createElement('div');
        message.id = 'shareStatus';
        message.textContent = `🚫 Gallery Full! Max of ${MAX_VIDEOS} videos reached. Please delete one to add a new video.`;
        message.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; background: #ff4747; color: white; text-align: center; padding: 10px; z-index: 1000; font-weight: bold;';
        document.body.appendChild(message);

        // Remove the message after a few seconds
        setTimeout(() => {
            message.remove();
        }, 6000); 
    }

    function handleSharedUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const sharedUrl = urlParams.get('share_url'); 
        
        if (sharedUrl) {
            const videoId = getYouTubeId(sharedUrl);

            if (videoId) {
                // *** THE CRITICAL LIMIT CHECK ***
                if (videoGalleryData.length >= MAX_VIDEOS) {
                    displayLimitMessage();
                    // Clear the URL parameter so refreshing doesn't keep showing the message
                    history.replaceState(null, '', window.location.pathname);
                    return; 
                }
                // ********************************

                const exists = videoGalleryData.some(video => video.id === videoId);
                
                if (!exists) {
                    const newVideoData = { id: videoId, timestamps: [] };
                    videoGalleryData.push(newVideoData);
                    saveGalleryData();
                    
                    // Re-render the gallery to show the new video
                    renderGallery();
                }

                // Clear the URL parameter after successful addition
                history.replaceState(null, '', window.location.pathname);
            }
        }
    }
    // =========================================================
    // --- CAROUSEL POSITIONING AND RENDERING ---
    // =========================================================
    
    function initializePlayers() {
        Object.values(youtubePlayers).forEach(player => {
            if (player.getPlayerState && player.getPlayerState() === 1) { 
                player.pauseVideo();
            }
        });
        
        videoGalleryData.forEach(video => {
            initializeSinglePlayer(video);
        });
    }

    function initializeSinglePlayer(video) {
        const playerElementId = `player-${video.id}`;
        const playerContainer = document.getElementById(playerElementId);
        
        if (playerContainer && !youtubePlayers[video.id]) {
            youtubePlayers[video.id] = new YT.Player(playerElementId, {
                videoId: video.id,
                playerVars: {
                    'autoplay': 0,
                    'rel': 0,
                    'enablejsapi': 1,
                    'modestbranding': 1,
                    'controls': 1
                },
                events: {}
            });
        }
    }

    function positionCardsInCarousel() {
        const cards = carouselTrack.querySelectorAll('.video-card');
        const totalCards = cards.length;

        if (totalCards === 0) {
            carouselTrack.style.transform = 'none';
            currentRotation = 0;
            return;
        }

        const angleIncrement = 360 / totalCards;
        
        const validRotation = Math.round(currentRotation / angleIncrement) * angleIncrement;
        currentRotation = validRotation;
        
        carouselTrack.style.transform = `rotateY(${currentRotation}deg)`;

        cards.forEach((card, index) => {
            const cardAngle = index * angleIncrement;
            card.style.transform = `rotateY(${cardAngle}deg) translateZ(${CAROUSEL_RADIUS}px)`; 
            
            const currentCardAngle = cardAngle + currentRotation;
            let normalizedAngle = currentCardAngle % 360;
            if (normalizedAngle < 0) { normalizedAngle += 360; }
            const isFlipped = normalizedAngle > 90 && normalizedAngle < 270;

            if (isFlipped) {
                card.classList.add('flip-content');
            } else {
                card.classList.remove('flip-content');
            }
            card.style.backfaceVisibility = 'visible'; 
        });
    }

    function renderGallery() {
        carouselTrack.innerHTML = '';
        
        videoGalleryData.forEach(video => {
            const card = createVideoCard(video);
            carouselTrack.appendChild(card);
            renderTimestamps(video); 
        });
        
        positionCardsInCarousel();
        attachTimestampListeners(); 

        if (typeof YT !== 'undefined' && YT.Player) {
            initializePlayers();
        }
    }
    
    function addVideoCardOnly(video) {
        const card = createVideoCard(video);
        carouselTrack.appendChild(card);
        renderTimestamps(video); 
        
        positionCardsInCarousel();
        attachTimestampListeners();

        if (typeof YT !== 'undefined' && YT.Player) {
            initializeSinglePlayer(video);
        }
    }

    // UPDATED: Card creation HTML (no change)
    function createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.id = video.id;
        
        const playerElementId = `player-${video.id}`;
        
        card.innerHTML = `
            <button class="delete-video-btn" data-video-id="${video.id}">Delete Video</button>
            <div class="video-container">
                <div id="${playerElementId}"></div> 
            </div>
            <div class="timestamp-controls">
                <div class="timestamp-list" id="timestampList-${video.id}"></div>
                <div class="add-controls">
                    <button class="capture-timestamp-btn" data-video-id="${video.id}">Capture Time</button>
                </div>
            </div>
        `;
        return card;
    }

    function renderTimestamps(video) {
        const listContainer = document.getElementById(`timestampList-${video.id}`);
        if (!listContainer) return;
        listContainer.innerHTML = '';
        video.timestamps.forEach(ts => {
            const timeString = formatTime(ts.time);
            const entryContainer = document.createElement('div');
            entryContainer.classList.add('timestamp-entry');
            const a = document.createElement('a');
            a.href = "#";
            a.textContent = timeString;
            a.classList.add('timestamp-link');
            a.dataset.videoId = video.id;
            a.dataset.time = ts.time;
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'x';
            deleteBtn.classList.add('delete-btn');
            deleteBtn.dataset.videoId = video.id;
            deleteBtn.dataset.time = ts.time;
            
            // --- DELETE BUTTON LISTENER ATTACHMENT ---
            deleteBtn.addEventListener('click', (event) => {
                event.preventDefault(); 
                event.stopPropagation(); 
                const secondsToDelete = parseInt(event.currentTarget.dataset.time, 10);
                deleteTimestamp(video.id, secondsToDelete);
            });
            // --------------------------------------------------------

            if (ts.note) {
                const noteElement = document.createElement('p');
                noteElement.textContent = ts.note;
                noteElement.classList.add('timestamp-note');
                
                // --- NEW SHARE LISTENER ATTACHMENT ---
                noteElement.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    shareTimestamp(video.id, ts.time, ts.note);
                });
                // -------------------------------------

                a.appendChild(deleteBtn);
                entryContainer.appendChild(a);
                entryContainer.appendChild(noteElement);
            } else {
                a.appendChild(deleteBtn);
                entryContainer.appendChild(a);
            }
            listContainer.appendChild(entryContainer);
        });
    }

    // =========================================================
    // --- SHARING FUNCTION (UPDATED TO PREVENT DUPLICATION) ---
    // =========================================================
    async function shareTimestamp(videoId, seconds, note) {
        const url = `https://youtu.be/${videoId}?t=${seconds}`;
        
        // FIX: The share text now ONLY contains the note. 
        const shareText = `${note}`; 

        // 1. Try Web Share API (native share sheet)
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'YouTube Timestamp',
                    text: shareText, // The message body will be the note.
                    url: url         // This generates the rich link preview in Telegram/Messenger.
                });
            } catch (error) {
                // User closed the share dialog (AbortError) or an error occurred.
                console.error('Sharing failed:', error);
                if (error.name !== 'AbortError') {
                    // Fallback to clipboard if share failed for other reasons
                    fallbackToClipboard(`${shareText}\n\n${url}`); // Fallback must include the URL
                }
            }
        } 
        // 2. Fallback to Clipboard API
        else if (navigator.clipboard) {
            // For clipboard fallback, we MUST include the URL in the text for the user.
            fallbackToClipboard(`${shareText}\n\n${url}`); 
        } else {
            alert("Sharing and clipboard features not supported by your browser.");
        }
    }

    function fallbackToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert("Link and note copied to clipboard! You can paste it into any app.");
        }).catch(err => {
            console.error('Could not copy text: ', err);
            alert("Could not copy link to clipboard. Please check browser permissions.");
        });
    }

    // =========================================================
    // --- CAROUSEL GESTURE HANDLERS ---
    // =========================================================

    function isControlElement(target) {
        // Block interaction only on interactive elements. 
        return target.matches(
            'input, button, textarea, iframe, .delete-btn, .capture-timestamp-btn, .new-timestamp-input, .delete-video-btn'
        ) || target.closest('button') || target.closest('input');
    }

    function handleTouchStart(event) {
        if (event.type === 'touchstart' && isControlElement(event.target)) {
            isSwiping = false; 
            return; 
        }
        
        isSwiping = true;
        
        startX = event.touches ? event.touches[0].clientX : event.clientX;
        startY = event.touches ? event.touches[0].clientY : event.clientY; 
        startRotation = currentRotation; 
        
        carouselTrack.style.transition = 'none'; 

        if (event.type === 'mousedown') {
            document.addEventListener('mousemove', handleTouchMove);
            document.addEventListener('mouseup', handleTouchEnd);
        }
    }

    function handleTouchMove(event) {
        // --- FIX: Disable swipe if only 0 or 1 video exists ---
        if (videoGalleryData.length <= 1) return;
        // ------------------------------------------------------

        if (!isSwiping) return;
        
        const currentX = event.touches ? event.touches[0].clientX : event.clientX;
        const currentY = event.touches ? event.touches[0].clientY : event.clientY; 
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        
        if (event.type === 'touchmove') {
            if (event.target.closest('.timestamp-list')) {
                 if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > SCROLL_THRESHOLD) {
                    isSwiping = false;
                    return;
                } 
            }
            
            if (Math.abs(deltaX) > SCROLL_THRESHOLD) {
                event.preventDefault(); 
            } else {
                 return; 
            }
        }

        const rotationChange = deltaX * SENSITIVITY; 
        const visualRotation = startRotation + rotationChange; 
        
        carouselTrack.style.transform = `rotateY(${visualRotation}deg)`;
        
        const cards = carouselTrack.querySelectorAll('.video-card');
        const totalCards = cards.length;
        if (totalCards === 0) return;

        const angleIncrement = 360 / totalCards;
        
        cards.forEach((card, index) => {
            const cardAngle = index * angleIncrement;
            const currentCardAngle = cardAngle + visualRotation; 
            let normalizedAngle = currentCardAngle % 360;
            if (normalizedAngle < 0) { normalizedAngle += 360; }
            const isFlipped = normalizedAngle > 90 && normalizedAngle < 270;

            if (isFlipped) {
                card.classList.add('flip-content');
            } else {
                card.classList.remove('flip-content');
            }
        });
    }

    function snapToNearestCard(swipeDistance) {
        const cards = carouselTrack.querySelectorAll('.video-card');
        const totalCards = cards.length;
        if (totalCards < 2) return;

        const angleIncrement = 360 / totalCards;
        const totalSwipeRotation = swipeDistance * SENSITIVITY;
        let finalRotation = startRotation + totalSwipeRotation; 

        const nearestIndex = Math.round(finalRotation / angleIncrement);
        const newRotation = nearestIndex * angleIncrement;
        
        carouselTrack.style.transition = 'transform 0.5s ease-in-out';
        carouselTrack.style.transform = `rotateY(${newRotation}deg)`;
        currentRotation = newRotation;
    }

    function handleTouchEnd(event) {
        if (!isSwiping) return;

        isSwiping = false;
        
        const endX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
        const swipeDistance = endX - startX;
        
        snapToNearestCard(swipeDistance);
        
        if (event.type === 'mouseup') {
            document.removeEventListener('mousemove', handleTouchMove);
            document.removeEventListener('mouseup', handleTouchEnd);
        }
    }
    
    // Attach event listeners
    carouselTrack.addEventListener('touchstart', handleTouchStart);
    carouselTrack.addEventListener('touchmove', handleTouchMove);
    carouselTrack.addEventListener('touchend', handleTouchEnd);
    carouselTrack.addEventListener('mousedown', handleTouchStart);

    // =========================================================
    // --- EVENT DELEGATION ---
    // =========================================================

    addVideoButton.addEventListener('click', () => {
        // --- LIMIT CHECK ---
        if (videoGalleryData.length >= MAX_VIDEOS) {
            alert(`Gallery limit of ${MAX_VIDEOS} videos reached. Please delete a video to add a new one.`);
            searchInput.value = '';
            return; 
        }
        // -------------------

        const input = searchInput.value.trim();
        const videoId = getYouTubeId(input);
        if (videoId) {
            const exists = videoGalleryData.some(video => video.id === videoId);
            if (exists) {
                alert('This video is already in your gallery.');
                return;
            }
            
            const newVideoData = { id: videoId, timestamps: [] };
            videoGalleryData.push(newVideoData);
            saveGalleryData();
            
            addVideoCardOnly(newVideoData); 
            searchInput.value = '';
        } else {
            alert('Please enter a valid YouTube URL or 11-character ID.');
        }
    });

    carouselTrack.addEventListener('click', (event) => {
        const target = event.target;
        const videoId = target.dataset.videoId;

        if (target.classList.contains('delete-video-btn')) {
            if (confirm('Are you sure you want to delete this video and all its saved timestamps?')) {
                
                const cardToDelete = carouselTrack.querySelector(`.video-card[data-id="${videoId}"]`);

                if (youtubePlayers[videoId]) {
                    youtubePlayers[videoId].destroy();
                    delete youtubePlayers[videoId];
                }

                videoGalleryData = videoGalleryData.filter(v => v.id !== videoId);
                saveGalleryData();
                
                if (cardToDelete) {
                    cardToDelete.remove();
                }

                positionCardsInCarousel();
                
                if (videoGalleryData.length === 0) {
                     renderGallery(); 
                }
            }
        } else if (target.classList.contains('capture-timestamp-btn')) {
            captureTimestamp(videoId);
        } 
    });

    // Capture the current time and ask for a note
    function captureTimestamp(videoId) {
        const player = youtubePlayers[videoId];

        if (!player || typeof player.getCurrentTime !== 'function') {
            alert('YouTube player not found or not ready. Please play the video first.');
            return;
        }

        const currentTimeSeconds = Math.round(player.getCurrentTime()); 
        const timeString = formatTime(currentTimeSeconds);
        
        const note = prompt(`Capturing time: ${timeString}. Enter your note:`);

        if (note !== null) {
            const video = videoGalleryData.find(v => v.id === videoId);
            const timeExists = video.timestamps.some(ts => ts.time === currentTimeSeconds);

            if (video && !timeExists) {
                video.timestamps.push({ time: currentTimeSeconds, note: note.trim() });
                video.timestamps.sort((a, b) => a.time - b.time);
                saveGalleryData();
                renderTimestamps(video);
                attachTimestampListeners();
                player.pauseVideo();
            } else if (timeExists) {
                alert(`A timestamp already exists near ${timeString}.`);
            }
        }
    }


    function attachTimestampListeners() {
        document.querySelectorAll('.timestamp-link').forEach(link => {
            link.onclick = (event) => {
                event.preventDefault();
                if (event.target.classList.contains('delete-btn')) {
                    return; 
                }
                
                const videoId = event.currentTarget.dataset.videoId;
                const seconds = parseInt(event.currentTarget.dataset.time, 10);
                const player = youtubePlayers[videoId];
                
                if (player && typeof player.seekTo === 'function') {
                    Object.values(youtubePlayers).forEach(p => {
                        if (p !== player && p.pauseVideo && p.getPlayerState() === 1) {
                            p.pauseVideo();
                        }
                    });

                    player.seekTo(seconds, true);
                    player.playVideo();
                } else {
                    console.error('YouTube player object not found or not ready.');
                }
            };
        });
    }

    function deleteTimestamp(videoId, secondsToDelete) {
        const video = videoGalleryData.find(v => v.id === videoId);
        if (video) {
            video.timestamps = video.timestamps.filter(ts => ts.time !== secondsToDelete);
            saveGalleryData();
            renderTimestamps(video);
            attachTimestampListeners(); 
        }
    }
    
    // Final check for YT API is handled by window.onYouTubeIframeAPIReady and DOMContentLoaded
});

