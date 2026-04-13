document.addEventListener('DOMContentLoaded', () => {
    // Only run if audio player exists
    if (!document.getElementById('audio-player')) return;

    const audio = document.getElementById('audio-player');
    
    // Mini player UI
    const playPauseBtn = document.getElementById('btn-play-pause');
    const playIcon = document.getElementById('play-icon');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const progressBar = document.getElementById('progress-bar');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const volumeBar = document.getElementById('volume-bar');
    const volumeIcon = document.getElementById('volume-icon');
    
    const playerBar = document.getElementById('player-bar');
    const playerCover = document.getElementById('player-cover');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');

    const expandedPlayer = document.getElementById('expanded-player');
    const minimizeBtn = document.getElementById('minimize-btn');
    const expCover = document.getElementById('expanded-cover-img');
    const expTitle = document.getElementById('expanded-title');
    const expArtist = document.getElementById('expanded-artist');
    const expPlayPauseBtn = document.getElementById('expanded-play');
    const expPlayIcon = document.getElementById('expanded-play-icon');
    const expPrevBtn = document.getElementById('expanded-prev');
    const expNextBtn = document.getElementById('expanded-next');
    const expProgressBar = document.getElementById('expanded-progress-bar');
    const expTimeCurrent = document.getElementById('expanded-time-current');
    const expTimeTotal = document.getElementById('expanded-time-total');

    let currentTrackIndex = -1;
    let isPlaying = false;
    let musicData = window.MUSIC_DATA || [];
    let userQueue = [];
    let isShuffle = false;
    let isRepeat = false;
    let parsedLyrics = [];

    // Queue Tray State
    const queueTray = document.getElementById('queue-tray');
    const queueList = document.getElementById('queue-list');
    const btnQueueToggle = document.getElementById('btn-queue-toggle');
    const btnClearQueue = document.getElementById('btn-clear-queue');
    
    // Shuffle UI Nodes
    const btnShuffle = document.getElementById('btn-shuffle');
    const expShuffle = document.getElementById('expanded-shuffle');
    
    // Repeat UI Nodes
    const btnRepeat = document.getElementById('btn-repeat');
    const expRepeat = document.getElementById('expanded-repeat');

    // ==========================================
    // Phase 4: Waveform Visualiser Logic
    // ==========================================
    let audioCtx;
    let analyser;
    let source;
    let dataArray;
    let animationId;
    const miniCanvas = document.getElementById('waveform-mini');
    const expCanvas = document.getElementById('waveform-expanded');
    const miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null;
    const expCtx = expCanvas ? expCanvas.getContext('2d') : null;

    function initAudioContext() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024; // Higher resolution frequency data
            analyser.smoothingTimeConstant = 0.85; // Fluid movement
            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        } catch (e) { console.error("Audio analyser failed:", e); }
    }

    function drawWaveforms() {
        if (!isPlaying) {
            cancelAnimationFrame(animationId);
            return;
        }
        animationId = requestAnimationFrame(drawWaveforms);
        if (!analyser) return;

        analyser.getByteFrequencyData(dataArray);
        if (miniCtx) renderMini(miniCtx, dataArray);
        if (expCtx) renderExpanded(expCtx, dataArray);
    }

    function renderMini(ctx, data) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const bars = 6;
        const width = 4;
        const gap = 2;
        ctx.fillStyle = "#8b5cf6"; // var(--accent)
        for (let i = 0; i < bars; i++) {
            const h = (data[i * 4] / 255) * ctx.canvas.height;
            ctx.fillRect(i * (width + gap), ctx.canvas.height - Math.max(2, h), width, Math.max(2, h));
        }
    }

    function renderExpanded(ctx, data) {
        // High DPI canvas scaling
        const dpr = window.devicePixelRatio || 1;
        const rect = ctx.canvas.getBoundingClientRect();
        
        if (ctx.canvas.width !== Math.floor(rect.width * dpr) || 
            ctx.canvas.height !== Math.floor(rect.height * dpr)) {
            ctx.canvas.width = Math.floor(rect.width * dpr);
            ctx.canvas.height = Math.floor(rect.height * dpr);
        }
        
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        ctx.clearRect(0, 0, width, height);
        
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-dynamic').trim() || '#8b5cf6';
        const centerY = height / 2;
        
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        // Draw fluid continuous symmetrical waveform
        const len = data.length / 2; // Use lower half of frequencies (more active)
        const sliceWidth = width / (len * 2);
        
        // Left side (mirrored)
        for(let i = len - 1; i >= 0; i--) {
            const val = data[i] / 255.0;
            const h = val * (height * 0.45);
            ctx.lineTo((len - 1 - i) * sliceWidth, centerY - h);
        }
        // Right side
        for(let i = 0; i < len; i++) {
            const val = data[i] / 255.0;
            const h = val * (height * 0.45);
            ctx.lineTo((len + i) * sliceWidth, centerY - h);
        }

        ctx.lineTo(width, centerY);

        // Add glow and gradient stroke
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = accent;
        ctx.shadowBlur = 20 * dpr;
        ctx.shadowColor = accent;
        ctx.stroke();
        
        // Mirror bottom half
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for(let i = len - 1; i >= 0; i--) {
            const val = data[i] / 255.0;
            const h = val * (height * 0.2); // Smaller pulse downwards
            ctx.lineTo((len - 1 - i) * sliceWidth, centerY + h);
        }
        for(let i = 0; i < len; i++) {
            const val = data[i] / 255.0;
            const h = val * (height * 0.2);
            ctx.lineTo((len + i) * sliceWidth, centerY + h);
        }
        ctx.lineTo(width, centerY);
        
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = accent + '80'; // 50% opacity
        ctx.shadowBlur = 10 * dpr;
        ctx.stroke();

        ctx.shadowBlur = 0; // Reset
    }

    // ==========================================
    // SPA Event Delegation Re-binder
    // ==========================================
    function initDynamicEvents() {
        if (window.MUSIC_DATA) musicData = window.MUSIC_DATA;
        
        // Phase 5: Re-bind Playlist Modals & Handlers
        if (typeof initPlaylistModals === 'function') initPlaylistModals();

        // Attach click events to all song cards
        const songCards = document.querySelectorAll('.song-card');
        songCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if(e.target.closest('.queue-add-btn')) return;
                if(e.target.closest('.card-like-btn')) return;
                if(e.target.closest('.global-like-btn')) return;
                if(e.target.closest('.uploader-link')) return;
                const index = parseInt(card.getAttribute('data-index'));
                loadTrack(index);
                playTrack();
            });
        });

        // Add to Queue Event
        document.querySelectorAll('.queue-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const queueIndex = parseInt(btn.getAttribute('data-index'));
                userQueue.push(queueIndex);
                renderQueueUI();
                const originalIcon = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                btn.style.color = 'var(--accent)';
                setTimeout(() => {
                    btn.innerHTML = originalIcon;
                    btn.style.color = '';
                }, 1500);
            });
        });

        // Like Button Event (Card Level)
        document.querySelectorAll('.card-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const likeIndex = parseInt(btn.getAttribute('data-index'));
                const track = musicData[likeIndex];
                if (track.id) {
                    fetch(`/api/toggle_like/${track.id}`, { method: 'POST' })
                    .then(r => r.json())
                    .then(data => {
                        track.is_liked = data.liked;
                        const icon = btn.querySelector('i');
                        icon.className = track.is_liked ? 'fa-solid fa-heart liked' : 'fa-regular fa-heart';
                        if (currentTrackIndex === likeIndex) syncGlobalLikeIcons(track.is_liked);
                    })
                    .catch(e => console.error('Like tracking failed:', e));
                }
            });
        });

        // Follow Button Event
        const followBtn = document.getElementById('follow-btn');
        if (followBtn) {
            followBtn.addEventListener('click', () => {
                const userId = followBtn.getAttribute('data-user-id');
                fetch(`/api/toggle_follow/${userId}`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'success') {
                        const followerCountSpan = document.getElementById('follower-count');
                        let count = parseInt(followerCountSpan.innerText);
                        if (data.followed) {
                            followBtn.innerText = 'Following';
                            followBtn.classList.add('following');
                            count++;
                        } else {
                            followBtn.innerText = 'Follow';
                            followBtn.classList.remove('following');
                            count--;
                        }
                        followerCountSpan.innerText = count;
                    }
                })
                .catch(err => console.error('Follow failed:', err));
            });
        }

        const searchInput = document.getElementById('song-search-input');
        const searchClearBtn = document.getElementById('search-clear-btn');
        const songsGrid = document.getElementById('songs-grid');
        const searchEmptyState = document.getElementById('search-empty-state');
        const searchEmptyQuery = document.getElementById('search-empty-query');
        const searchDropdown = document.getElementById('search-dropdown');
        const searchResultsContainer = document.getElementById('search-results-container');

        // Helper to dynamically add and play a song from search
        window.__universalPlayTrack = function(songData) {
            // Encode the object state into a string to pass it over inline onclick (or we can just append it here)
            // Wait, we can't pass object easily in inline HTML. Let's make index-based fetch.
            // Better: searchData globally stores search results.
            const existingIdx = musicData.findIndex(s => s.id === songData.id);
            if (existingIdx !== -1) {
                // Song already in current page's queue
                window.__appPlayTrack(existingIdx);
            } else {
                // Inject new song at the end of musicData
                musicData.push(songData);
                window.__appPlayTrack(musicData.length - 1);
            }
            if (searchDropdown) searchDropdown.style.display = 'none';
        };

        if (searchInput) {
            let searchTimeout;
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newInput, searchInput);
            
            let newClearBtn;
            if (searchClearBtn) {
                newClearBtn = searchClearBtn.cloneNode(true);
                searchClearBtn.parentNode.replaceChild(newClearBtn, searchClearBtn);
                newClearBtn.style.display = 'none';
                newClearBtn.addEventListener('click', () => {
                    newInput.value = '';
                    newInput.focus();
                    if (searchDropdown) searchDropdown.style.display = 'none';
                    newClearBtn.style.display = 'none';
                });
            }

            newInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (newClearBtn) newClearBtn.style.display = query ? 'flex' : 'none';
                
                if (!query) {
                    if (searchDropdown) searchDropdown.style.display = 'none';
                    return;
                }

                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    fetch(`/api/search?q=${encodeURIComponent(query)}`)
                        .then(res => res.json())
                        .then(data => {
                            if (!searchDropdown || !searchResultsContainer) return;
                            searchResultsContainer.innerHTML = '';
                            let html = '';
                            
                            if (data.songs.length > 0) {
                                html += '<div class="search-section-title">Songs</div>';
                                data.songs.forEach(song => {
                                    // Store song data in dataset or stringify for onclick
                                    const songJson = JSON.stringify(song).replace(/"/g, '&quot;');
                                    html += `
                                        <a href="#" class="search-item" onclick="event.preventDefault(); window.__universalPlayTrack(${songJson})">
                                            <img src="${song.cover}" alt="cover">
                                            <div class="details">
                                                <span class="main-text">${song.title}</span>
                                                <span class="sub-text">${song.artist}</span>
                                            </div>
                                        </a>
                                    `;
                                });
                            }
                            
                            if (data.users.length > 0) {
                                html += '<div class="search-section-title">Users</div>';
                                data.users.forEach(user => {
                                    html += `
                                        <a href="/user/${user.username}" class="search-item">
                                            <img src="${user.image}" alt="profile" style="border-radius:50%">
                                            <div class="details">
                                                <span class="main-text">${user.username}</span>
                                                <span class="sub-text">User</span>
                                            </div>
                                        </a>
                                    `;
                                });
                            }
                            
                            if (data.playlists.length > 0) {
                                html += '<div class="search-section-title">Playlists</div>';
                                data.playlists.forEach(pl => {
                                    html += `
                                        <a href="/profile" class="search-item">
                                            <div class="details" style="margin-left: 5px;">
                                                <span class="main-text">${pl.name}</span>
                                                <span class="sub-text">By ${pl.owner}</span>
                                            </div>
                                        </a>
                                    `;
                                });
                            }
                            
                            if (!html) {
                                html = '<div style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No results found</div>';
                            }
                            
                            searchResultsContainer.innerHTML = html;
                            searchDropdown.style.display = 'block';
                        })
                        .catch(err => console.error('Search error:', err));
                }, 300);
            });
            
            document.addEventListener('click', (e) => {
                if (searchDropdown && !e.target.closest('.search-bar-wrapper')) {
                    searchDropdown.style.display = 'none';
                }
            });
            
            newInput.addEventListener('focus', () => {
                if (searchDropdown && newInput.value.trim() && searchResultsContainer.innerHTML.trim()) {
                    searchDropdown.style.display = 'block';
                }
            });
        }
        
        // Initialize Profile Specific Events (Folders, Panels, etc)
        initProfileEvents();
    }

    // ==========================================
    // Playlist Modal & Event Logic
    // ==========================================
    let activeSongIdForPlaylist = null;

    function initPlaylistModals() {
        const addToModal = document.getElementById('add-to-playlist-modal');
        const createModal = document.getElementById('create-playlist-modal');
        const playlistList = document.getElementById('playlist-options-list');

        // Show Add to Playlist Modal
        document.querySelectorAll('.playlist-add-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                activeSongIdForPlaylist = btn.dataset.songId;
                fetchUserPlaylistsAndPopulate();
                addToModal.style.display = 'flex';
                setTimeout(() => addToModal.classList.add('active'), 10);
            };
        });

        // Hide modals on X click
        const hideAddBtn = document.getElementById('hide-add-to-playlist');
        if(hideAddBtn) hideAddBtn.onclick = () => hidePlaylistModal(addToModal);
        
        const hideCreateBtn = document.getElementById('hide-create-playlist');
        if(hideCreateBtn) hideCreateBtn.onclick = () => hidePlaylistModal(createModal);

        // Switch from Add to Create modal
        const showCreateBtn = document.getElementById('btn-show-create-playlist');
        if(showCreateBtn) showCreateBtn.onclick = () => {
            addToModal.classList.remove('active');
            setTimeout(() => {
                addToModal.style.display = 'none';
                createModal.style.display = 'flex';
                setTimeout(() => createModal.classList.add('active'), 10);
            }, 300);
        };

        // Submit New Playlist
        const submitCreateBtn = document.getElementById('btn-submit-create-playlist');
        if(submitCreateBtn) submitCreateBtn.onclick = () => {
            const nameInput = document.getElementById('new-playlist-name');
            const coverInput = document.getElementById('new-playlist-cover');
            const name = nameInput.value.trim();
            if (!name) return alert('Please enter a name');

            const fd = new FormData();
            fd.append('name', name);
            if (coverInput && coverInput.files[0]) {
                fd.append('cover_image', coverInput.files[0]);
            }

            const origText = submitCreateBtn.innerHTML;
            submitCreateBtn.disabled = true;
            submitCreateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

            fetch('/api/create_playlist', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(data => {
                    submitCreateBtn.disabled = false;
                    submitCreateBtn.innerHTML = origText;
                    if (data.status === 'success') {
                        nameInput.value = '';
                        if (coverInput) coverInput.value = '';
                        hidePlaylistModal(createModal);
                        // If we came from "Add to Playlist", go back after creation
                        if (activeSongIdForPlaylist) {
                            fetchUserPlaylistsAndPopulate();
                            addToModal.style.display = 'flex';
                            setTimeout(() => addToModal.classList.add('active'), 10);
                        } else {
                            // On profile page? Refresh folder view
                            if (window.location.pathname === '/profile' || window.location.pathname.includes('/user/')) {
                                window.location.reload(); // Simple reload for now to reflect new playlist
                            }
                        }
                    } else {
                        alert(data.message || 'Error creating playlist');
                    }
                })
                .catch(err => {
                    submitCreateBtn.disabled = false;
                    submitCreateBtn.innerHTML = origText;
                    console.error(err);
                });
        };

        function fetchUserPlaylistsAndPopulate() {
            playlistList.innerHTML = '<div style="text-align:center; padding:1rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            
            fetch('/api/playlists')
                .then(r => r.json())
                .then(data => {
                    playlistList.innerHTML = '';
                    if (!data.playlists || data.playlists.length === 0) {
                        playlistList.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.3); padding:1rem;">You don\'t have any playlists yet.</p>';
                        return;
                    }

                    data.playlists.forEach(pl => {
                        const item = document.createElement('div');
                        item.className = 'playlist-option-item';
                        const coverHtml = pl.cover 
                            ? `<img src="${pl.cover}" class="p-thumb" alt="">`
                            : `<div class="p-icon"><i class="fa-solid fa-list-ul"></i></div>`;
                            
                        item.innerHTML = `
                            ${coverHtml}
                            <div class="p-info">
                                <h4>${pl.name}</h4>
                                <span>${pl.count} songs</span>
                            </div>
                        `;
                        item.onclick = () => addSongToSpecificPlaylist(pl.id);
                        playlistList.appendChild(item);
                    });
                })
                .catch(err => {
                    console.error('Failed to fetch playlists:', err);
                    playlistList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:1rem;">Error loading playlists.</p>';
                });
        }

        function addSongToSpecificPlaylist(playlistId) {
            if (!activeSongIdForPlaylist) return;
            fetch(`/api/add_to_playlist/${playlistId}/${activeSongIdForPlaylist}`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'success') {
                        hidePlaylistModal(addToModal);
                        // Show success toast?
                        const btn = document.querySelector(`.playlist-add-btn[data-song-id="${activeSongIdForPlaylist}"]`);
                        if (btn) {
                            const icon = btn.querySelector('i');
                            icon.className = 'fa-solid fa-check';
                            setTimeout(() => icon.className = 'fa-solid fa-list-check', 2000);
                        }
                    }
                });
        }

        function hidePlaylistModal(modal) {
            if (!modal) return;
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    }

    // ==========================================
    // Profile Page Logic (PJAX Compatible)
    // ==========================================
    function initProfileEvents() {
        const folderCards = document.querySelectorAll('.folder-card');
        if (folderCards.length === 0) return; // Not on profile page

        folderCards.forEach(card => {
            card.addEventListener('click', () => {
                // Special case for Playlist folders (dynamic content)
                if (card.classList.contains('folder-playlist')) {
                    const plId = card.dataset.playlistId;
                    renderPlaylistPanel(plId, card);
                    return;
                }
                
                // Trigger: Create Playlist Card
                if (card.id === 'btn-create-playlist-trigger') {
                    activeSongIdForPlaylist = null;
                    const createModal = document.getElementById('create-playlist-modal');
                    createModal.style.display = 'flex';
                    setTimeout(() => createModal.classList.add('active'), 10);
                    return;
                }

                const targetId = card.dataset.target;
                const panel    = document.getElementById(targetId);
                if (!panel) return;
                const isOpen   = panel.classList.contains('open');

                // Close all panels & deactivate all cards
                document.querySelectorAll('.track-panel').forEach(p => p.classList.remove('open'));
                folderCards.forEach(c => c.classList.remove('active'));

                if (!isOpen) {
                    panel.classList.add('open');
                    card.classList.add('active');
                    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
                }
            });
        });

        async function renderPlaylistPanel(id, card) {
            const panel = document.getElementById('panel-playlist-detail');
            const title = document.getElementById('playlist-detail-title');
            const content = document.getElementById('playlist-detail-content');
            const empty = document.getElementById('playlist-detail-empty');

            // Set current playlist ID for deletion logic
            document.getElementById('btn-delete-current-playlist').dataset.playlistId = id;

            // Show loading state
            content.innerHTML = '<div class="track-empty"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
            
            // Toggle panel open
            document.querySelectorAll('.track-panel').forEach(p => p.classList.remove('open'));
            folderCards.forEach(c => c.classList.remove('active'));
            panel.classList.add('open');
            card.classList.add('active');

            try {
                const response = await fetch(`/api/playlist/${id}`);
                const data = await response.json();
                
                title.innerHTML = `<i class="fa-solid fa-list-ul"></i> ${data.name}`;
                content.innerHTML = '';
                
                if (!data.songs || data.songs.length === 0) {
                    empty.style.display = 'flex';
                    content.style.display = 'none';
                } else {
                    empty.style.display = 'none';
                    content.style.display = 'block';
                    
                    data.songs.forEach((song, i) => {
                        // Find this song's index in the global musicData or generate a temporary one
                        const globalIdx = musicData.findIndex(s => s.id === song.id);
                        
                        const row = document.createElement('div');
                        row.className = 'track-row';
                        row.dataset.index = globalIdx; // Link to global musicData for player
                        row.innerHTML = `
                            <span class="track-num">${i+1}</span>
                            <img src="${song.cover}" class="track-thumb" alt="cover">
                            <div class="track-details">
                                <span class="track-title">${song.title}</span>
                                <span class="track-artist">${song.artist}</span>
                            </div>
                            <span class="track-quality quality-badge">320kbps</span>
                            <div class="song-options-wrapper" style="margin-left: auto;">
                                <button class="track-panel-close" style="background:none; border:none; color:rgba(255,255,255,0.2);" onclick="event.stopPropagation(); removeSongFromPlaylist(${id}, ${song.id}, this)">
                                    <i class="fa-solid fa-circle-minus"></i>
                                </button>
                            </div>
                        `;
                        row.onclick = () => {
                            if (globalIdx !== -1) {
                                loadTrack(globalIdx);
                                playTrack();
                            }
                        };
                        content.appendChild(row);
                    });
                }
            } catch (err) {
                console.error('Failed to load playlist:', err);
            }
        }

        // Exposed global helpers for simple onclicks in generated HTML
        window.removeSongFromPlaylist = (playlistId, songId, btn) => {
            fetch(`/api/remove_from_playlist/${playlistId}/${songId}`, { method: 'POST' })
                .then(r => r.json())
                .then(() => {
                    const row = btn.closest('.track-row');
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(-20px)';
                    setTimeout(() => row.remove(), 300);
                });
        };

        // Playlist Deletion
        const delPlBtn = document.getElementById('btn-delete-current-playlist');
        delPlBtn?.addEventListener('click', () => {
            const id = delPlBtn.dataset.playlistId;
            if (confirm('Are you sure you want to delete this playlist?')) {
                fetch(`/api/delete_playlist/${id}`, { method: 'POST' })
                    .then(r => r.json())
                    .then(() => {
                        document.querySelector('.track-panel.open')?.classList.remove('open');
                        document.querySelector('.folder-card.active')?.remove();
                    });
            }
        });

        // Close panel via X button
        document.querySelectorAll('.track-panel-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const panelId = btn.dataset.panel;
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.remove('open');
                folderCards.forEach(c => c.classList.remove('active'));
            });
        });

        // Track row click → play
        document.querySelectorAll('.track-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.song-options-btn') ||
                    e.target.closest('.song-options-menu') ||
                    e.target.closest('.track-like-btn') ||
                    e.target.closest('.track-panel-close')) return;
                const idx = parseInt(row.dataset.index);
                if (!isNaN(idx) && window.__appPlayTrack) window.__appPlayTrack(idx);
            });
        });

        // Kebab menu toggle
        document.querySelectorAll('.song-options-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu   = document.getElementById('options-menu-' + btn.dataset.songId);
                if (!menu) return;
                const isOpen = menu.classList.contains('open');
                document.querySelectorAll('.song-options-menu.open').forEach(m => m.classList.remove('open'));
                if (!isOpen) menu.classList.add('open');
            });
        });

        // Delete modal logic
        let pendingDeleteId = null, pendingDeleteCard = null;

        document.querySelectorAll('.options-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingDeleteId   = btn.dataset.songId;
                pendingDeleteCard = btn.closest('.upload-card-item');
                document.querySelectorAll('.song-options-menu.open').forEach(m => m.classList.remove('open'));
                const modal = document.getElementById('delete-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    requestAnimationFrame(() => modal.classList.add('active'));
                }
            });
        });

        const cancelDeleteBtn = document.getElementById('delete-cancel-btn');
        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', hideModal);
        }

        const deleteModalOverlay = document.getElementById('delete-modal');
        if (deleteModalOverlay) {
            deleteModalOverlay.addEventListener('click', e => {
                if (e.target.id === 'delete-modal') hideModal();
            });
        }

        const confirmDeleteBtn = document.getElementById('delete-confirm-btn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                if (!pendingDeleteId || !pendingDeleteCard) return;
                confirmDeleteBtn.disabled = true;
                confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';

                fetch('/api/delete_song/' + pendingDeleteId, { method: 'POST' })
                    .then(r => r.json())
                    .then(data => {
                        if (data.status === 'success') {
                            pendingDeleteCard.style.transition = 'opacity 0.3s, transform 0.3s';
                            pendingDeleteCard.style.opacity = '0';
                            pendingDeleteCard.style.transform = 'translateX(20px)';
                            setTimeout(() => pendingDeleteCard.remove(), 320);
                            hideModal();
                        } else {
                            alert('Error: ' + (data.message || 'Could not delete.'));
                            confirmDeleteBtn.disabled = false; confirmDeleteBtn.innerHTML = 'Delete';
                        }
                    })
                    .catch(() => { 
                        alert('Network error.'); 
                        confirmDeleteBtn.disabled = false; confirmDeleteBtn.innerHTML = 'Delete'; 
                    });
            });
        }

        function hideModal() {
            const modal = document.getElementById('delete-modal');
            if (!modal) return;
            modal.classList.remove('active');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            pendingDeleteId = null; pendingDeleteCard = null;
            const btn = document.getElementById('delete-confirm-btn');
            if (btn) {
                btn.disabled = false; btn.innerHTML = 'Delete';
            }
        }
    }

    // Initialize events on native page boot
    initDynamicEvents();

    // Shareable Deep Links (SPA Routing)
    const handleDeepLink = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const playId = urlParams.get('play');
        if (playId) {
            const id = parseInt(playId);
            const idx = musicData.findIndex(s => s.id === id);
            if (idx !== -1) {
                setTimeout(() => {
                    loadTrack(idx);
                    playTrack();
                }, 300);
            }
            // Clear URL parameter so it doesn't replay on manual reload cleanly if we had History APi
        }
    };
    handleDeepLink();

    // Expose play function globally (used by profile page track rows)
    window.__appPlayTrack = function(index) {
        loadTrack(index);
        playTrack();
    };

    const mainLikeIcon = document.querySelector('#btn-main-like i');
    const expLikeIcon = document.querySelector('#btn-expanded-like i');

    function syncGlobalLikeIcons(is_liked) {
        const className = is_liked ? 'fa-solid fa-heart fa-lg shadow-heart liked' : 'fa-regular fa-heart fa-lg shadow-heart';
        if (mainLikeIcon) mainLikeIcon.className = className;
        if (expLikeIcon) expLikeIcon.className = className;
    }

    // Global Like Buttons (Main Player & Expanded Player)
    document.querySelectorAll('.global-like-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentTrackIndex < 0) return;
            const track = musicData[currentTrackIndex];
            if (track.id) {
                fetch(`/api/toggle_like/${track.id}`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    track.is_liked = data.liked;
                    syncGlobalLikeIcons(track.is_liked);
                    
                    // Magically update the DOM icon on the literal page if sitting in DOM
                    const cardBtn = document.querySelector(`.card-like-btn[data-index="${currentTrackIndex}"] i`);
                    if (cardBtn) {
                        cardBtn.className = track.is_liked ? 'fa-solid fa-heart liked' : 'fa-regular fa-heart';
                    }
                });
            }
        });
    });

    // Expand & Minimize functionality
    playerBar.addEventListener('click', (e) => {
        if (e.target.closest('.player-controls') ||
            e.target.closest('.player-volume') ||
            e.target.closest('.global-like-btn') ||
            e.target.closest('#btn-expand-player') ||
            e.target.closest('#btn-queue-toggle')) return;
        expandedPlayer.classList.add('active');
    });

    const btnExpandPlayer = document.getElementById('btn-expand-player');
    if (btnExpandPlayer) {
        btnExpandPlayer.addEventListener('click', () => {
             expandedPlayer.classList.add('active');
        });
    }

    minimizeBtn.addEventListener('click', () => {
        expandedPlayer.classList.remove('active');
    });

    function loadTrack(index) {
        if (index < 0 || index >= musicData.length) return;
        
        currentTrackIndex = index;
        const track = musicData[index];
        
        // Background Tracking Analytics Log
        if (track.id) {
            fetch(`/api/record_play/${track.id}`, { method: 'POST' })
            .catch(e => console.error('Silent tracking failed:', e));
        }
        
        // Sync Global Like Status Icons Graphically
        syncGlobalLikeIcons(track.is_liked);
        
        audio.src = track.file;
        
        // Update Mini Player
        playerCover.src = track.cover;
        playerTitle.innerText = track.title;
        playerArtist.innerText = track.artist;
        
        // Update Expanded Player
        expCover.src = track.cover;
        expTitle.innerText = track.title;
        expArtist.innerText = track.artist;

        playerBar.classList.add('active');
        const aceternityDock = document.querySelector('.aceternity-dock');
        if (aceternityDock) aceternityDock.classList.add('dock-shifted');
        
        // --- Dynamic Theme Color Extraction ---
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = track.cover;
        img.onload = () => {
             const color = getDominantColor(img);
             document.documentElement.style.setProperty('--accent-dynamic', color);
        };

        const lyricsContainer = document.getElementById('lyrics-container');
        if (lyricsContainer) {
            parsedLyrics = parseLRC(track.lyrics);
            lyricsContainer.innerHTML = '';
            if (parsedLyrics.length > 0) {
                parsedLyrics.forEach((line, i) => {
                    const div = document.createElement('div');
                    div.className = 'lyric-line';
                    div.dataset.index = i;
                    div.innerText = line.text;
                    div.onclick = () => {
                        audio.currentTime = line.time;
                        if (!isPlaying) playTrack();
                    };
                    lyricsContainer.appendChild(div);
                });
            } else {
                lyricsContainer.innerHTML = '<div class="lyric-line placeholder">♫ Instrumental / No Lyrics ♫</div>';
            }
        }

        // Reset progress UI
        progressBar.value = 0;
        expProgressBar.value = 0;
        timeCurrent.innerText = "0:00";
        expTimeCurrent.innerText = "0:00";
    }

    function togglePlayState(playStatus) {
        isPlaying = playStatus;
        if (isPlaying) {
            initAudioContext();
            audio.play();
            drawWaveforms();
            playIcon.classList.remove('fa-play');
            playIcon.classList.add('fa-pause');
            expPlayIcon.classList.remove('fa-play');
            expPlayIcon.classList.add('fa-pause');
        } else {
            audio.pause();
            playIcon.classList.remove('fa-pause');
            playIcon.classList.add('fa-play');
            expPlayIcon.classList.remove('fa-pause');
            expPlayIcon.classList.add('fa-play');
        }
    }

    function playTrack() {
        if (currentTrackIndex === -1 && musicData.length > 0) {
            loadTrack(0);
        }
        if (currentTrackIndex !== -1) {
            togglePlayState(true);
        }
    }

    function pauseTrack() {
        togglePlayState(false);
    }

    // Handlers for both mini and expanded play buttons
    const handlePlayPauseClick = () => {
        if (isPlaying) pauseTrack();
        else playTrack();
    };
    playPauseBtn.addEventListener('click', handlePlayPauseClick);
    expPlayPauseBtn.addEventListener('click', handlePlayPauseClick);

    // Handlers for Next/Prev
    const handlePrev = () => {
        let index = currentTrackIndex - 1;
        if (index < 0) index = musicData.length - 1;
        loadTrack(index);
        playTrack();
    };
    prevBtn.addEventListener('click', handlePrev);
    expPrevBtn.addEventListener('click', handlePrev);

    const handleNext = () => {
        // Priority 1: Queue Array
        if (userQueue.length > 0) {
            const index = userQueue.shift(); // Pop first item
            renderQueueUI();
            loadTrack(index);
            playTrack();
        } 
        // Priority 2: Shuffle Toggle
        else if (isShuffle && musicData.length > 1) {
            let randIndex;
            do {
                randIndex = Math.floor(Math.random() * musicData.length);
            } while (randIndex === currentTrackIndex); // Don't pick exact same song randomly
            loadTrack(randIndex);
            playTrack();
        } 
        // Default: Sequential Progression
        else {
            let index = currentTrackIndex + 1;
            if (index >= musicData.length) index = 0;
            loadTrack(index);
            playTrack();
        }
    };
    nextBtn.addEventListener('click', handleNext);
    expNextBtn.addEventListener('click', handleNext);

    // Update progress natively
    audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        const duration = audio.duration;
        
        if (!isNaN(duration)) {
            progressBar.max = duration;
            progressBar.value = currentTime;
            expProgressBar.max = duration;
            expProgressBar.value = currentTime;
            
            const curFormatted = formatTime(currentTime);
            const totalFormatted = formatTime(duration);
            
            timeCurrent.innerText = curFormatted;
            expTimeCurrent.innerText = curFormatted;
            timeTotal.innerText = totalFormatted;
            expTimeTotal.innerText = totalFormatted;
            
            // Sync Lyrics
            if (parsedLyrics && parsedLyrics.length > 0) {
                let activeIdx = -1;
                for (let i = 0; i < parsedLyrics.length; i++) {
                    // 0.3s offset for anticipation
                    if (currentTime >= parsedLyrics[i].time - 0.3) {
                        activeIdx = i;
                    } else {
                        break;
                    }
                }
                
                if (activeIdx !== -1) {
                    const lines = document.querySelectorAll('.lyric-line:not(.placeholder)');
                    lines.forEach((l, i) => {
                        if (i === activeIdx) {
                            if (!l.classList.contains('active')) {
                                l.classList.add('active');
                                const lyricsPanel = document.getElementById('expanded-lyrics-panel');
                                if (lyricsPanel) {
                                    lyricsPanel.scrollTo({
                                        top: l.offsetTop - lyricsPanel.clientHeight / 2,
                                        behavior: 'smooth'
                                    });
                                }
                            }
                        } else {
                            l.classList.remove('active');
                        }
                    });
                }
            }
        }
    });

    // Set progress from either bar
    const seeker = (e) => {
        audio.currentTime = e.target.value;
    };
    progressBar.addEventListener('input', seeker);
    expProgressBar.addEventListener('input', seeker);

    // Auto next track
    audio.addEventListener('ended', handleNext);

    // Volume control with Glass Fill Mechanics
    volumeBar.addEventListener('input', (e) => {
        audio.volume = e.target.value / 100;
        updateVolumeIcon(audio.volume);
        // Map slider to CSS webkit fill 
        e.target.style.setProperty('--volume-fill', `${e.target.value}%`);
    });

    function updateVolumeIcon(vol) {
        volumeIcon.className = '';
        if (vol === 0) {
            volumeIcon.classList.add('fa-solid', 'fa-volume-xmark');
        } else if (vol < 0.5) {
            volumeIcon.classList.add('fa-solid', 'fa-volume-low');
        } else {
            volumeIcon.classList.add('fa-solid', 'fa-volume-high');
        }
    }

    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // --- Queue & Shuffle System Integration ---
    
    // Shuffle Toggle Event
    if (btnShuffle && expShuffle) {
        const toggleShuffle = () => {
            isShuffle = !isShuffle;
            const colorState = isShuffle ? 'var(--accent)' : '';
            btnShuffle.style.color = colorState;
            expShuffle.style.color = colorState;
        };
        btnShuffle.addEventListener('click', toggleShuffle);
        expShuffle.addEventListener('click', toggleShuffle);
    }

    // Repeat Toggle Event
    if (btnRepeat && expRepeat) {
        const toggleRepeat = () => {
            isRepeat = !isRepeat;
            audio.loop = isRepeat;
            const colorState = isRepeat ? 'var(--accent)' : '';
            btnRepeat.style.color = colorState;
            expRepeat.style.color = colorState;
        };
        btnRepeat.addEventListener('click', toggleRepeat);
        expRepeat.addEventListener('click', toggleRepeat);
    }

    // Queue Toggle Event
    if (btnQueueToggle && queueTray) {
        btnQueueToggle.addEventListener('click', () => {
            queueTray.classList.toggle('active');
            btnQueueToggle.style.color = queueTray.classList.contains('active') ? 'var(--accent)' : '';
        });
    }

    // Queue Add events are now delegated and mapped inside initDynamicEvents() above.
    // Clear Queue Binding
    if (btnClearQueue) {
        btnClearQueue.addEventListener('click', () => {
            userQueue = [];
            renderQueueUI();
        });
    }

    // UI State Renderer
    function renderQueueUI() {
        if (!queueList) return;
        queueList.innerHTML = '';
        if (userQueue.length === 0) {
            queueList.innerHTML = '<li class="empty-tray">Your queue is empty</li>';
            return;
        }
        
        userQueue.forEach((datasetIndex, arrayPosition) => {
            const track = musicData[datasetIndex];
            const li = document.createElement('li');
            li.innerHTML = `
                <img src="${track.cover}" alt="cover">
                <div class="q-list-info">
                    <h4>${track.title}</h4>
                    <p>${track.artist}</p>
                </div>
                <button class="q-remove-btn" title="Remove" data-pos="${arrayPosition}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            queueList.appendChild(li);
        });

        // Re-bind removal events dynamically
        document.querySelectorAll('.q-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pos = parseInt(btn.getAttribute('data-pos'));
                userQueue.splice(pos, 1);
                renderQueueUI();
            });
        });
    }

    // ==========================================
    // SPA Universal Modals (Lyrics)
    // ==========================================
    let currentEditingSongId = null;
    document.addEventListener('click', (e) => {
        // Open Modal
        const editBtn = e.target.closest('.edit-lyrics-btn');
        if (editBtn) {
            currentEditingSongId = editBtn.getAttribute('data-song-id');
            const lrcInput = document.getElementById('lrc-input');
            const lyricsModal = document.getElementById('lyrics-modal');
            if (lrcInput && lyricsModal) {
                lrcInput.value = editBtn.getAttribute('data-lyrics') || '';
                lyricsModal.style.display = 'flex';
                setTimeout(() => lyricsModal.classList.add('active'), 10);
            }
        }

        // Close Modal
        const closeBtn = e.target.closest('#close-lyrics-modal');
        if (closeBtn) {
            const lyricsModal = document.getElementById('lyrics-modal');
            if (lyricsModal) {
                lyricsModal.classList.remove('active');
                setTimeout(() => lyricsModal.style.display = 'none', 300);
            }
        }

        // Save Lyrics
        const saveBtn = e.target.closest('#save-lyrics-btn');
        if (saveBtn) {
            if (!currentEditingSongId) return;
            const lrcInput = document.getElementById('lrc-input');
            if (!lrcInput) return;
            const newLyrics = lrcInput.value;
            saveBtn.innerText = 'Saving...';
            saveBtn.disabled = true;

            fetch('/api/update_lyrics/' + currentEditingSongId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lyrics: newLyrics })
            })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    const btn = document.querySelector(`.edit-lyrics-btn[data-song-id="${currentEditingSongId}"]`);
                    if (btn) btn.setAttribute('data-lyrics', newLyrics);
                    const lyricsModal = document.getElementById('lyrics-modal');
                    if (lyricsModal) {
                        lyricsModal.classList.remove('active');
                        setTimeout(() => lyricsModal.style.display = 'none', 300);
                    }
                } else {
                    alert('Failed to save lyrics.');
                }
            })
            .catch(err => {
                alert('Network error while saving lyrics.');
            })
            .finally(() => {
                saveBtn.innerText = 'Save Lyrics';
                saveBtn.disabled = false;
            });
        }
    });

    // ==========================================
    // PJAX SPA Navigation Engine
    // ==========================================
    document.addEventListener('click', async (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        
        const url = link.getAttribute('href');
        // Bypass native navigation for external, anchors, or explicit logout destruction
        if (!url || url.startsWith('http') || url.startsWith('#') || url === '/logout' || link.getAttribute('target') === '_blank') return;

        e.preventDefault();

        try {
            const response = await fetch(url);
            if (!response.ok) { window.location.href = url; return; }
            
            const htmlString = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');

            const newMain = doc.querySelector('main.content-area');
            const currentMain = document.querySelector('main.content-area');

            if (newMain && currentMain) {
                // Morph core container
                currentMain.innerHTML = newMain.innerHTML;
                
                // Hydrate Javascript Engine Arrays
                const scripts = doc.querySelectorAll('script');
                scripts.forEach(script => {
                    if (script.textContent.includes('window.MUSIC_DATA')) {
                        try { eval(script.textContent); } catch(err) {}
                    }
                });

                // Re-bind click interceptors
                initDynamicEvents();

                // Fake Browser Navigation
                window.history.pushState({url: url}, '', url);
                
                // Active State Management on the Dock
                document.querySelectorAll('.dock-item').forEach(navLink => {
                    const navUrl = navLink.getAttribute('href');
                    if (navUrl && url.includes(navUrl) && navUrl !== '/') {
                        navLink.classList.add('active');
                    } else if (url === '/' && navUrl === '/') {
                        navLink.classList.add('active');
                    } else {
                        navLink.classList.remove('active');
                    }
                });

            } else {
                window.location.href = url; // Fallback
            }
        } catch (error) {
            console.error('PJAX Nav Error:', error);
            window.location.href = url;
        }
    });

    // Back/Forward Button handler
    window.addEventListener('popstate', async (e) => {
        const url = location.pathname;
        if(url === '/logout') { window.location.href=url; return; }
        try {
            const response = await fetch(url);
            const htmlString = await response.text();
            const doc = new DOMParser().parseFromString(htmlString, 'text/html');
            const newMain = doc.querySelector('main.content-area');
            if (newMain) {
                document.querySelector('main.content-area').innerHTML = newMain.innerHTML;
                const scripts = doc.querySelectorAll('script');
                scripts.forEach(script => {
                    if (script.textContent.includes('window.MUSIC_DATA')) {
                        try { eval(script.textContent); } catch(err) {}
                    }
                });
                initDynamicEvents();
            }
        } catch(err) {
            window.location.href = url;
        }
    });

    function getDominantColor(img) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1; canvas.height = 1;
            ctx.drawImage(img, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
        } catch (e) {
            return '#8b5cf6';
        }
    }

    function parseLRC(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const parsed = [];
        const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/;
        
        for (let line of lines) {
            const match = timeRegex.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseFloat(match[2]);
                const text = line.replace(timeRegex, '').trim();
                // We keep lines even if text is empty to allow for timed breaks
                parsed.push({ time: minutes * 60 + seconds, text: text });
            }
        }
        return parsed;
    }
});
