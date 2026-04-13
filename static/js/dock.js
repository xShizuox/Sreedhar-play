document.addEventListener('DOMContentLoaded', () => {
    // Aceternity MacOS Dock Physics Engine
    const dock = document.querySelector('.aceternity-dock');
    const dockIcons = document.querySelectorAll('.dock-icon-wrapper');
    
    if (dock && dockIcons.length > 0) {
        dock.addEventListener('mousemove', (e) => {
            dockIcons.forEach(icon => {
                const rect = icon.getBoundingClientRect();
                // Find horizontal exact center of the icon
                const center = rect.left + rect.width / 2;
                // Calculate distance from extremely remote mouse
                const dist = Math.abs(e.clientX - center);
                
                // Active range of 150px
                let scale = 1;
                if (dist < 150) {
                    // Framer-motion style bell-curve easing
                    scale = 1 + 0.5 * Math.pow((150 - dist) / 150, 1.5);
                }
                
                icon.style.width = `${50 * scale}px`;
                icon.style.height = `${50 * scale}px`;
                icon.style.fontSize = `${1.3 * scale}rem`;
                icon.style.marginBottom = `${(scale - 1) * 20}px`; 
            });
        });

        dock.addEventListener('mouseleave', () => {
            dockIcons.forEach(icon => {
                icon.style.width = '';
                icon.style.height = '';
                icon.style.fontSize = '';
                icon.style.marginBottom = '';
            });
        });
    }
});
