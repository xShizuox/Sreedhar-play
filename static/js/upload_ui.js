document.addEventListener('DOMContentLoaded', () => {
    const musicInput = document.getElementById('music_file');
    const coverInput = document.getElementById('cover_file');
    const musicZone = document.getElementById('music_zone');
    const coverZone = document.getElementById('cover_zone');
    const coverPreview = document.getElementById('cover_preview');
    const vinylCard = document.querySelector('.vinyl-card');
    const musicPulse = document.getElementById('music_pulse');
    const uploadForm = document.getElementById('upload_form');
    const progressContainer = document.querySelector('.upload-progress-container');
    const progressBar = document.getElementById('upload_progress_bar');
    const progressText = document.getElementById('progress_text');
    const titleInput = document.querySelector('input[name="title"]');
    const artistInput = document.querySelector('input[name="artist"]');

    // --- Drag & Drop Style Sync ---
    // Instead of handling events on the zone and passing to the input,
    // we let the input (which is on top) handle natively and use JS for visual feedback on the parent zone.
    
    const setupZone = (input, zone, selectHandler) => {
        ['dragenter', 'dragover'].forEach(eventName => {
            input.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // For drop, we want the browser to natively handle it (set the input files)
        // so we don't preventDefault, but we still trigger visual highlights
        input.addEventListener('drop', (e) => {
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });

        ['dragenter', 'dragover'].forEach(e => {
            input.addEventListener(e, () => zone.classList.add('drag-over'));
        });
        ['dragleave', 'drop'].forEach(e => {
            input.addEventListener(e, () => zone.classList.remove('drag-over'));
        });
        
        input.addEventListener('change', (e) => selectHandler(e.target.files[0]));
    };

    setupZone(musicInput, musicZone, handleMusicSelect);
    setupZone(coverInput, coverZone, handleCoverSelect);

    // --- Form Submission with Progress Bar ---

    function handleMusicSelect(file) {
        if (!file) return;
        musicPulse.classList.add('active');
        const filenameLabel = musicZone.querySelector('.file-label');
        filenameLabel.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${file.name}`;
        filenameLabel.style.color = 'var(--accent)';

        // --- Auto-Metadata Extraction ---
        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const tags = tag.tags;
                    if (tags.title && titleInput) {
                        titleInput.value = tags.title;
                        titleInput.classList.add('highlight-success');
                        setTimeout(() => titleInput.classList.remove('highlight-success'), 2000);
                    }
                    if (tags.artist && artistInput) {
                        artistInput.value = tags.artist;
                        artistInput.classList.add('highlight-success');
                        setTimeout(() => artistInput.classList.remove('highlight-success'), 2000);
                    }
                },
                onError: function(error) {
                    console.warn("Could not read ID3 tags:", error);
                }
            });
        }
    }

    function handleCoverSelect(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            coverPreview.src = e.target.result;
            vinylCard.classList.add('active'); // Start rotating vinyl animation
            const filenameLabel = coverZone.querySelector('.file-label');
            filenameLabel.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${file.name}`;
            filenameLabel.style.color = 'var(--accent)';
        };
        reader.readAsDataURL(file);
    }

    // --- Form Submission with Progress Bar ---
    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(uploadForm);
        const xhr = new XMLHttpRequest();

        // Show progress UI
        progressContainer.classList.add('active');
        uploadForm.classList.add('submitting');
        
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = percent + '%';
                progressText.innerText = `Uploading: ${percent}%`;
                
                if (percent === 100) {
                    progressText.innerText = "Processing on server...";
                }
            }
        });

        xhr.onload = () => {
            try {
                const response = JSON.parse(xhr.responseText);
                if (xhr.status === 200 && response.status === 'success') {
                    window.location.href = '/home';
                } else {
                    alert('Upload failed: ' + (response.message || 'Unknown error'));
                    progressContainer.classList.remove('active');
                    uploadForm.classList.remove('submitting');
                }
            } catch (e) {
                // Fallback for non-JSON or unexpected errors
                if (xhr.status === 200) {
                    window.location.href = '/home';
                } else {
                    alert('Upload failed. Please check file sizes and try again.');
                    progressContainer.classList.remove('active');
                    uploadForm.classList.remove('submitting');
                }
            }
        };

        xhr.onerror = () => {
            alert('A network error occurred.');
            progressContainer.classList.remove('active');
            uploadForm.classList.remove('submitting');
        };

        xhr.open('POST', uploadForm.action || window.location.pathname, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.send(formData);
    });
});
