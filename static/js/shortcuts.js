/**
 * Sreedhar Play: Power User Keyboard Shortcuts
 * Part of Phase 6: The Ultimate Studio Update
 */
document.addEventListener('keydown', (e) => {
    // 1. Ignore if typing in inputs or textareas
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
    }

    const audio = document.getElementById('audio-player');
    if (!audio) return;

    // 2. Control Logic
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            const playBtn = document.getElementById('btn-play-pause');
            if (playBtn) playBtn.click();
            break;
        
        case 'ArrowRight':
            e.preventDefault();
            const nextBtn = document.getElementById('btn-next');
            if (nextBtn) nextBtn.click();
            break;
        
        case 'ArrowLeft':
            e.preventDefault();
            const prevBtn = document.getElementById('btn-prev');
            if (prevBtn) prevBtn.click();
            break;

        case 'KeyL':
            e.preventDefault();
            const likeBtn = document.getElementById('btn-main-like');
            if (likeBtn) likeBtn.click();
            break;

        case 'KeyM':
            e.preventDefault();
            const volumeIcon = document.getElementById('volume-icon');
            if (volumeIcon) volumeIcon.click();
            break;
        
        case 'KeyF':
            e.preventDefault();
            const expandBtn = document.getElementById('btn-expand-player');
            const expandedPlayer = document.getElementById('expanded-player');
            if (expandedPlayer) {
                if (expandedPlayer.classList.contains('active')) {
                    const minimizeBtn = document.getElementById('minimize-btn');
                    if (minimizeBtn) minimizeBtn.click();
                } else if (expandBtn) {
                    expandBtn.click();
                }
            }
            break;
    }
});
