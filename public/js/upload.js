document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadPrompt = document.querySelector('.upload-prompt');
    const uploadProgress = document.querySelector('.upload-progress');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const uploadList = document.querySelector('.upload-list');
    const completedContainer = document.querySelector('.completed-container');
    const completedList = document.querySelector('.completed-list');
    const uploadContainer = document.getElementById('upload-container');

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropZone.classList.add('border-primary', 'bg-primary/10');
        dropZone.classList.remove('border-primary/30');
    }

    function unhighlight(e) {
        dropZone.classList.remove('border-primary', 'bg-primary/10');
        dropZone.classList.add('border-primary/30');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles({ target: { files } });
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function handleFiles(e) {
        const files = [...e.target.files];
        if (files.length === 0) return;

        uploadPrompt.classList.add('hidden');
        uploadProgress.classList.remove('hidden');
        uploadList.innerHTML = '';
        completedList.innerHTML = '';
        completedContainer.classList.add('hidden');

        const uploadPromises = files.map(file => uploadFile(file));
        
        try {
            const results = await Promise.all(uploadPromises);
            showCompletedUploads(results);
        } catch (error) {
            console.error('Upload failed:', error);
            progressText.textContent = 'Upload failed! Please try again.';
            progressText.classList.add('text-red-500');
        }
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadItem = document.createElement('div');
        uploadItem.className = 'bg-gray-50 rounded-xl p-4 flex items-center gap-4 animate-fade-in';
        uploadItem.innerHTML = `
            <i class="fas fa-file text-2xl text-primary"></i>
            <div class="flex-1">
                <div class="font-semibold text-gray-700">${file.name}</div>
                <div class="text-sm text-gray-500">${formatBytes(file.size)}</div>
            </div>
            <i class="fas fa-spinner fa-spin text-primary text-xl"></i>
        `;
        uploadList.appendChild(uploadItem);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            uploadItem.querySelector('.fa-spinner').className = 'fas fa-check text-green-500 text-xl';
            return {
                name: file.name,
                size: file.size,
                url: data.url
            };
        } catch (error) {
            uploadItem.querySelector('.fa-spinner').className = 'fas fa-times text-red-500 text-xl';
            throw error;
        }
    }

    function showCompletedUploads(results) {
        uploadContainer.classList.add('opacity-0');
        setTimeout(() => {
            uploadContainer.classList.add('hidden');
            completedContainer.classList.remove('hidden');
            completedContainer.classList.add('animate-fade-in');
        }, 300);

        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'bg-white rounded-xl p-4 shadow-lg flex items-center gap-4 transform transition-all duration-300 hover:scale-[1.02] hover:shadow-xl';
            item.innerHTML = `
                <i class="fas fa-check-circle text-2xl text-green-500"></i>
                <div class="flex-1">
                    <div class="font-semibold text-gray-700">${result.name}</div>
                    <div class="text-sm text-gray-500 mb-1">${formatBytes(result.size)}</div>
                    <a href="${result.url}" target="_blank" class="text-primary hover:text-secondary transition-colors duration-300 text-sm break-all">
                        ${result.url}
                    </a>
                </div>
            `;
            completedList.appendChild(item);
        });
    }
});

function resetUploader() {
    const uploadContainer = document.getElementById('upload-container');
    const completedContainer = document.querySelector('.completed-container');
    
    completedContainer.classList.add('opacity-0');
    setTimeout(() => {
        uploadContainer.classList.remove('hidden', 'opacity-0');
        completedContainer.classList.add('hidden');
        document.querySelector('.upload-prompt').classList.remove('hidden');
        document.querySelector('.upload-progress').classList.add('hidden');
        document.querySelector('.upload-list').innerHTML = '';
        document.getElementById('fileInput').value = '';
        completedContainer.classList.remove('opacity-0');
    }, 300);
} 