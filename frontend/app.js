document.addEventListener("DOMContentLoaded", () => {
    // Session Verification - Run immediately before loading other logic
    checkSessionAndInitialize();

    function checkSessionAndInitialize() {
        fetch("../backend/auth.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check_session" })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.logged_in) {
                // Doctor is authenticated. Initialize application.
                initializeDashboard(data.name);
            } else {
                // Doctor is not authenticated, redirect to login page.
                window.location.href = "login.html";
            }
        })
        .catch(() => {
            // Server error, fallback to demo mode
            initializeDashboard("Demo Doctor");
        });
    }

    function initializeDashboard(doctorName) {
        // Navigation elements
        const navItems = document.querySelectorAll(".nav-tab");
        const navLogout = document.getElementById("nav-logout");
        const sections = document.querySelectorAll(".content-panel");
        
        // Upload & Queue elements
        const dropZone = document.getElementById("drop-zone");
        const fileInput = document.getElementById("file-input");
        const uploadPrompt = document.getElementById("upload-prompt");
        const analyzeBtn = document.getElementById("analyze-btn");
        const browseBtn = document.querySelector(".browse-link");
        const batchQueueContainer = document.getElementById("batch-queue-container");
        const queueList = document.getElementById("queue-list");
        const queueCountText = document.getElementById("queue-count");
        const clearQueueBtn = document.getElementById("clear-queue-btn");
        
        // Batch Banner elements
        const batchStatsBanner = document.getElementById("batch-stats-banner");
        const batchTotalCnt = document.getElementById("batch-total-cnt");
        const batchProcessedCnt = document.getElementById("batch-processed-cnt");
        const batchGliomaCnt = document.getElementById("batch-glioma-cnt");
        const batchMeningiomaCnt = document.getElementById("batch-meningioma-cnt");
        const batchPituitaryCnt = document.getElementById("batch-pituitary-cnt");
        const batchNoTumorCnt = document.getElementById("batch-notumor-cnt");

        // Batch Controls (Pause/Cancel)
        const batchControlActions = document.getElementById("batch-control-actions");
        const pauseBtn = document.getElementById("pause-btn");
        const cancelBtn = document.getElementById("cancel-btn");
        
        // HUD Overlay elements
        const hudPrediction = document.getElementById("hud-prediction");
        const hudPredClass = document.getElementById("hud-pred-class");
        
        // Result elements
        const resultsEmpty = document.getElementById("results-empty");
        const resultsLoading = document.getElementById("results-loading");
        const loadingTitle = document.getElementById("loading-title");
        const loadingSubtitle = document.getElementById("loading-subtitle");
        const resultsContent = document.getElementById("results-content");
        const modelWarningBanner = document.getElementById("model-warning-banner");
        const warningText = document.getElementById("warning-text");
        const inspectedFileName = document.getElementById("inspected-file-name");
        const predClassBadge = document.getElementById("prediction-class-badge");
        const predConfVal = document.getElementById("prediction-confidence-val");
        const probList = document.getElementById("prob-list");
        const resultRawImg = document.getElementById("result-raw-img");
        const resultHeatmapImg = document.getElementById("result-heatmap-img");
        const findingsCard = document.getElementById("findings-card");
        const modelStatusText = document.getElementById("model-status-text");
        
        // History elements
        const historyTbody = document.getElementById("history-tbody");
        
        // Sample items
        const sampleItems = document.querySelectorAll(".sample-item");
        
        // App State
        let uploadQueue = []; // Array of { id, file, name, size, type, samplePath, status: 'pending'|'analyzing'|'completed'|'failed', selected: true/false, result: null|data }
        let scanHistory = JSON.parse(localStorage.getItem("neuro_scan_history") || "[]");
        let activeInspectedItemId = null;
        let isAnalyzing = false;
        let isScanningPaused = false;
        let isScanningCancelled = false;
        
        // Welcome message with doctor name
        document.getElementById("doctor-display-name").innerText = `Dr. ${doctorName}`;
        
        checkModelStatus();
        loadHistoryTable();

        // ----------------------------------------------------
        // THREE.JS 3D BRAIN ROTATION & HOVER ANIMATION
        // ----------------------------------------------------
        let pointMaterial, lineMaterial, update3DBrainColor;
        
        init3DBrain();

        function init3DBrain() {
            const container = document.getElementById("brain-3d-canvas-container");
            if (!container || typeof THREE === "undefined") return;

            const width = container.clientWidth || 360;
            const height = container.clientHeight || 420;

            // 1. Scene setup
            const scene = new THREE.Scene();

            // 2. Camera setup
            const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
            camera.position.z = 3.9;

            // 3. Renderer setup (with transparency)
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            container.appendChild(renderer.domElement);

            // 4. Create Brain particle-grid group
            const brainGroup = new THREE.Group();
            scene.add(brainGroup);

            const numPoints = 1400;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(numPoints * 3);
            const originalPositions = [];
            const brainPoints = [];

            // Draw two wrinkled lobes mathematically (ellipsoid distribution + organic noise)
            for (let i = 0; i < numPoints; i++) {
                const u = Math.random();
                const v = Math.random();
                const theta = u * 2 * Math.PI;
                const phi = Math.acos(2 * v - 1);

                // Lobe diameters
                const rx = 1.35;
                const ry = 1.1;
                const rz = 0.95;

                const isLeft = Math.random() > 0.5;
                const offsetX = isLeft ? -0.28 : 0.28;

                let x = rx * Math.sin(phi) * Math.cos(theta);
                let y = ry * Math.sin(phi) * Math.sin(theta);
                let z = rz * Math.cos(phi);

                // Add organic displacement wrinkles using high freq sine waves
                const wrinkle = 0.14 * Math.sin(x * 6.5) * Math.sin(y * 6.5) * Math.sin(z * 6.5);
                x += x * wrinkle + offsetX;
                y += y * wrinkle;
                z += z * wrinkle;

                // Pinch bottom points to form a brain stem
                if (y < -0.5) {
                    const stemFactor = Math.max(0.2, (y + 1.1) / 0.6);
                    x *= stemFactor * 0.9;
                    z *= stemFactor * 0.9;
                }

                positions[i * 3] = x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = z;

                const posVector = new THREE.Vector3(x, y, z);
                brainPoints.push(posVector);
                originalPositions.push({ x, y, z, offset: Math.random() * Math.PI * 2 });
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // 5. Connect nearby nodes with high-tech neural lines
            const linePositions = [];
            for (let i = 0; i < numPoints; i++) {
                const p1 = brainPoints[i];
                let connections = 0;
                for (let j = i + 1; j < numPoints; j++) {
                    if (connections > 2) break; // Keep lines clean and sparse (minimalist B-side style)
                    const p2 = brainPoints[j];
                    const dist = p1.distanceTo(p2);
                    if (dist < 0.26) {
                        linePositions.push(p1.x, p1.y, p1.z);
                        linePositions.push(p2.x, p2.y, p2.z);
                        connections++;
                    }
                }
            }

            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            
            lineMaterial = new THREE.LineBasicMaterial({
                color: 0x00b4d8, // Teal default
                transparent: true,
                opacity: 0.14
            });

            const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
            brainGroup.add(lineSegments);

            // 6. Point particle systems
            pointMaterial = new THREE.PointsMaterial({
                color: 0x00b4d8,
                size: 0.05,
                transparent: true,
                opacity: 0.8,
                sizeAttenuation: true
            });

            const pointsSystem = new THREE.Points(geometry, pointMaterial);
            brainGroup.add(pointsSystem);

            // 7. Mouse drag interaction for custom rotation
            let isDragging = false;
            let previousMousePosition = { x: 0, y: 0 };
            
            container.addEventListener('mousedown', (e) => {
                isDragging = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const deltaMove = {
                    x: e.clientX - previousMousePosition.x,
                    y: e.clientY - previousMousePosition.y
                };

                brainGroup.rotation.y += deltaMove.x * 0.007;
                brainGroup.rotation.x += deltaMove.y * 0.007;

                previousMousePosition = { x: e.clientX, y: e.clientY };
            });

            // 8. Animation loop (rotating & hovering)
            const clock = new THREE.Clock();

            function animate() {
                requestAnimationFrame(animate);

                const time = clock.getElapsedTime();

                // Gentle hover translation
                brainGroup.position.y = Math.sin(time * 1.2) * 0.11;

                // Slow default Y rotation if not dragging
                if (!isDragging) {
                    brainGroup.rotation.y += 0.004;
                }

                // Breathing/twinkling effect on nodes
                const positionAttr = pointsSystem.geometry.attributes.position;
                for (let i = 0; i < numPoints; i++) {
                    const orig = originalPositions[i];
                    // Pulse distance slightly over time
                    const pulse = 1.0 + 0.02 * Math.sin(time * 2.0 + orig.offset);
                    positionAttr.array[i * 3] = orig.x * pulse;
                    positionAttr.array[i * 3 + 1] = orig.y * pulse;
                    positionAttr.array[i * 3 + 2] = orig.z * pulse;
                }
                positionAttr.needsUpdate = true;

                renderer.render(scene, camera);
            }
            animate();

            // 9. Resize handler
            window.addEventListener('resize', () => {
                const newWidth = container.clientWidth;
                const newHeight = container.clientHeight;
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(newWidth, newHeight);
            });

            // 10. Color updating function
            update3DBrainColor = function(predClass) {
                const colors = {
                    'glioma': 0x1b75ff,      // Soft Blue
                    'meningioma': 0x9b30ff,  // Purple
                    'pituitary': 0xff2e7e,   // Pink-Red
                    'notumor': 0x00c864,     // Teal-Green
                    'default': 0x00b4d8      // Teal default
                };
                const activeColor = colors[predClass] || colors['default'];
                
                pointMaterial.color.setHex(activeColor);
                lineMaterial.color.setHex(activeColor);
            };
        }

        // 1. Navigation Controller
        navItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                const targetId = item.getAttribute("href").replace("#", "") + "-section";
                
                navItems.forEach(nav => nav.classList.remove("active"));
                item.classList.add("active");
                
                sections.forEach(section => {
                    if (section.id === targetId) {
                        section.classList.add("active");
                    } else {
                        section.classList.remove("active");
                    }
                });
            });
        });

        // Logout Controller
        navLogout.addEventListener("click", (e) => {
            e.preventDefault();
            if (isAnalyzing && !confirm("Scanning is in progress. Are you sure you want to log out?")) {
                return;
            }
            
            fetch("../backend/auth.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" })
            })
            .then(() => {
                window.location.href = "login.html";
            });
        });

        // 2. File Selection & Drag-and-Drop
        if (browseBtn) {
            browseBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (isAnalyzing) return;
                fileInput.click();
            });
        }
        
        dropZone.addEventListener("click", () => {
            if (isAnalyzing) return;
            fileInput.click();
        });
        
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (isAnalyzing) return;
            dropZone.classList.add("dragover");
        });
        
        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("dragover");
        });
        
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");
            if (isAnalyzing) return;
            
            if (e.dataTransfer.files.length > 0) {
                handleMultipleFilesSelect(e.dataTransfer.files);
            }
        });
        
        fileInput.addEventListener("change", (e) => {
            if (isAnalyzing) return;
            if (e.target.files.length > 0) {
                handleMultipleFilesSelect(e.target.files);
            }
        });
        
        clearQueueBtn.addEventListener("click", () => {
            if (isAnalyzing) return;
            resetQueue();
        });

        function handleMultipleFilesSelect(files) {
            sampleItems.forEach(card => card.classList.remove("active"));
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                if (!file.type.match("image/jpeg") && !file.type.match("image/png") && !file.type.match("image/jpg")) {
                    alert(`"${file.name}" is not a valid format. Please upload JPEG or PNG images.`);
                    continue;
                }
                
                if (file.size > 5 * 1024 * 1024) {
                    alert(`"${file.name}" exceeds 5MB size limit.`);
                    continue;
                }
                
                if (uploadQueue.some(item => item.name === file.name && item.size === file.size)) {
                    continue;
                }
                
                const queueItem = {
                    id: 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    file: file,
                    name: file.name,
                    size: file.size,
                    samplePath: null,
                    status: 'pending',
                    selected: true,
                    result: null
                };
                
                uploadQueue.push(queueItem);
            }
            
            renderQueueList();
        }
        
        function resetQueue() {
            uploadQueue = [];
            fileInput.value = "";
            batchQueueContainer.style.display = "none";
            analyzeBtn.disabled = true;
            sampleItems.forEach(card => card.classList.remove("active"));
            
            resultsContent.style.display = "none";
            resultsEmpty.style.display = "flex";
            batchStatsBanner.style.display = "none";
            batchControlActions.style.display = "none";
            hudPrediction.style.display = "none";
            
            // Reset brain color to default
            if (update3DBrainColor) update3DBrainColor('default');
        }

        // 3. Multiple Sample Scans Selection
        sampleItems.forEach(item => {
            item.addEventListener("click", () => {
                if (isAnalyzing) return;
                
                const fileUrl = item.getAttribute("data-file");
                const sampleName = fileUrl.split("/").pop();
                
                const index = uploadQueue.findIndex(q => q.samplePath === fileUrl);
                
                if (index > -1) {
                    uploadQueue.splice(index, 1);
                    item.classList.remove("active");
                } else {
                    const queueItem = {
                        id: 'sample_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        file: null,
                        name: sampleName,
                        size: 0,
                        samplePath: fileUrl,
                        status: 'pending',
                        selected: true,
                        result: null
                    };
                    uploadQueue.push(queueItem);
                    item.classList.add("active");
                }
                
                renderQueueList();
            });
        });

        // 4. Update the Batch Analyze Button Text based on Checkboxes
        function updateAnalyzeButtonText() {
            const selectedCount = uploadQueue.filter(q => q.selected && q.status === 'pending').length;
            if (selectedCount === 0) {
                analyzeBtn.disabled = true;
                analyzeBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Run Deep Learning Inference`;
            } else {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Run Inference on ${selectedCount} selected scan${selectedCount > 1 ? 's' : ''}`;
            }
        }

        // 5. Render the Queue List UI (With Checkboxes & Play buttons)
        function renderQueueList() {
            if (uploadQueue.length === 0) {
                batchQueueContainer.style.display = "none";
                analyzeBtn.disabled = true;
                return;
            }
            
            batchQueueContainer.style.display = "block";
            queueCountText.innerText = uploadQueue.length;
            
            queueList.innerHTML = "";
            
            uploadQueue.forEach(item => {
                const div = document.createElement("div");
                div.className = `queue-item ${activeInspectedItemId === item.id ? 'active' : ''}`;
                div.setAttribute("data-id", item.id);
                
                let statusText = "Ready";
                let statusClass = "pending";
                let iconHtml = '<i class="fa-regular fa-clock"></i>';
                
                if (item.status === 'analyzing') {
                    statusText = "Analyzing...";
                    statusClass = "analyzing";
                    iconHtml = '<i class="fa-solid fa-spinner fa-spin"></i>';
                } else if (item.status === 'completed') {
                    statusText = "Completed";
                    statusClass = "completed";
                    iconHtml = '<i class="fa-solid fa-circle-check"></i>';
                } else if (item.status === 'failed') {
                    statusText = "Failed";
                    statusClass = "failed";
                    iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
                }
                
                let badgeHtml = '';
                if (item.status === 'completed' && item.result) {
                    badgeHtml = `<span class="queue-item-badge ${item.result.prediction}">${item.result.prediction.replace('_', ' ')}</span>`;
                }
                
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; width: 62%;">
                        <input type="checkbox" class="queue-item-checkbox" data-id="${item.id}" ${item.selected ? 'checked' : ''} ${isAnalyzing ? 'disabled' : ''}>
                        <div class="queue-item-info" style="width: calc(100% - 25px);">
                            <span class="queue-item-name" title="${item.name}">${item.name}</span>
                            <span class="queue-item-status ${statusClass}">
                                ${iconHtml} ${statusText}
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${badgeHtml}
                        ${item.status === 'pending' ? `
                            <button class="queue-item-run-btn" data-id="${item.id}" ${isAnalyzing ? 'disabled style="opacity: 0.3;"' : ''} title="Run individual scan">
                                <i class="fa-solid fa-play"></i>
                            </button>
                        ` : ''}
                        <button class="queue-item-remove" data-id="${item.id}" ${isAnalyzing ? 'disabled style="opacity: 0.3;"' : ''}>
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `;
                
                // Active file click
                div.addEventListener("click", () => {
                    if (item.status === 'completed') {
                        activeInspectedItemId = item.id;
                        document.querySelectorAll(".queue-item").forEach(el => el.classList.remove("active"));
                        div.classList.add("active");
                        renderResults(item.result, item.name);
                    } else if (item.status === 'failed') {
                        activeInspectedItemId = item.id;
                        document.querySelectorAll(".queue-item").forEach(el => el.classList.remove("active"));
                        div.classList.add("active");
                        showErrorState(item.result.error);
                    }
                });
                
                // Select checkbox events
                const checkbox = div.querySelector(".queue-item-checkbox");
                checkbox.addEventListener("click", (e) => e.stopPropagation());
                checkbox.addEventListener("change", (e) => {
                    item.selected = checkbox.checked;
                    updateAnalyzeButtonText();
                });
                
                // Run individual scan events
                const runBtn = div.querySelector(".queue-item-run-btn");
                if (runBtn) {
                    runBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (isAnalyzing) return;
                        runIndividualScan(item.id);
                    });
                }
                
                queueList.appendChild(div);
            });
            
            // Item delete events
            document.querySelectorAll(".queue-item-remove").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isAnalyzing) return;
                    
                    const id = btn.getAttribute("data-id");
                    const item = uploadQueue.find(q => q.id === id);
                    
                    if (item && item.samplePath) {
                        const card = document.querySelector(`.sample-item[data-file="${item.samplePath}"]`);
                        if (card) card.classList.remove("active");
                    }
                    
                    uploadQueue = uploadQueue.filter(q => q.id !== id);
                    
                    if (activeInspectedItemId === id) {
                        activeInspectedItemId = null;
                        resultsContent.style.display = "none";
                        resultsEmpty.style.display = "flex";
                        hudPrediction.style.display = "none";
                        if (update3DBrainColor) update3DBrainColor('default');
                    }
                    
                    renderQueueList();
                });
            });

            updateAnalyzeButtonText();
        }

        // 6. Run Individual Scan Immediately
        async function runIndividualScan(itemId) {
            const item = uploadQueue.find(q => q.id === itemId);
            if (!item || isAnalyzing) return;

            isAnalyzing = true;
            analyzeBtn.disabled = true;
            clearQueueBtn.disabled = true;

            item.status = 'analyzing';
            renderQueueList();

            resultsEmpty.style.display = "none";
            resultsContent.style.display = "none";
            resultsLoading.style.display = "flex";
            loadingTitle.innerText = "Analyzing Target Scan";
            loadingSubtitle.innerText = `Running model inference: ${item.name}`;
            hudPrediction.style.display = "none";
            if (update3DBrainColor) update3DBrainColor('default');

            const formData = new FormData();
            if (item.samplePath) {
                formData.append("sample_path", item.samplePath);
            } else {
                formData.append("mri_image", item.file);
            }

            try {
                const response = await fetch("../backend/upload.php", {
                    method: "POST",
                    body: formData
                });
                
                if (!response.ok) throw new Error("HTTP connection error.");
                
                const data = await response.json();
                
                if (data.success) {
                    item.status = 'completed';
                    item.result = data;
                    
                    saveToHistory(data, item.name);
                    activeInspectedItemId = item.id;
                    renderQueueList();
                    renderResults(data, item.name);
                } else {
                    item.status = 'failed';
                    item.result = { error: data.error };
                    renderQueueList();
                    showErrorState(data.error);
                }
            } catch (err) {
                item.status = 'failed';
                item.result = { error: err.message || "Network request failed." };
                renderQueueList();
                showErrorState(err.message || "Network request failed.");
            }

            isAnalyzing = false;
            clearQueueBtn.disabled = false;
            loadHistoryTable();
            renderQueueList();
        }

        // 7. Pause & Cancel Checking state
        pauseBtn.addEventListener("click", () => {
            isScanningPaused = !isScanningPaused;
            if (isScanningPaused) {
                pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
                pauseBtn.style.backgroundColor = 'var(--primary-light)';
                pauseBtn.style.color = 'var(--primary)';
                loadingTitle.innerText = `Scan Paused`;
                loadingSubtitle.innerText = `Processing is frozen. Click Resume to continue.`;
            } else {
                pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
                pauseBtn.style.backgroundColor = '';
                pauseBtn.style.color = '';
            }
        });

        cancelBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to cancel the remaining batch scanning queue?")) {
                isScanningCancelled = true;
                isScanningPaused = false; // Release pause lock if active
            }
        });

        function checkScanPauseState() {
            return new Promise(resolve => {
                const interval = setInterval(() => {
                    if (!isScanningPaused || isScanningCancelled) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });
        }

        // 8. Run Batch DL Analysis for selected items sequentially
        analyzeBtn.addEventListener("click", async () => {
            const selectedItems = uploadQueue.filter(q => q.selected && q.status === 'pending');
            if (selectedItems.length === 0 || isAnalyzing) return;
            
            isAnalyzing = true;
            isScanningPaused = false;
            isScanningCancelled = false;
            
            analyzeBtn.disabled = true;
            clearQueueBtn.disabled = true;
            
            // Show pause/cancel control bar
            batchControlActions.style.display = "flex";
            pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
            pauseBtn.style.backgroundColor = '';
            pauseBtn.style.color = '';
            
            // Setup stats banner
            batchStatsBanner.style.display = "grid";
            batchTotalCnt.innerText = selectedItems.length;
            batchProcessedCnt.innerText = "0";
            batchGliomaCnt.innerText = "0";
            batchMeningiomaCnt.innerText = "0";
            batchPituitaryCnt.innerText = "0";
            batchNoTumorCnt.innerText = "0";
            
            resultsEmpty.style.display = "none";
            resultsContent.style.display = "none";
            resultsLoading.style.display = "flex";
            hudPrediction.style.display = "none";
            if (update3DBrainColor) update3DBrainColor('default');
            
            let processedCount = 0;
            let gliomaCount = 0;
            let meningiomaCount = 0;
            let pituitaryCount = 0;
            let notumorCount = 0;
            
            for (let i = 0; i < selectedItems.length; i++) {
                const item = selectedItems[i];
                
                if (isScanningCancelled) break;
                if (isScanningPaused) await checkScanPauseState();
                if (isScanningCancelled) break;
                
                item.status = 'analyzing';
                renderQueueList();
                
                loadingTitle.innerText = `Processing Scan ${i + 1} of ${selectedItems.length}`;
                loadingSubtitle.innerText = `Analyzing: ${item.name}...`;
                
                const formData = new FormData();
                if (item.samplePath) {
                    formData.append("sample_path", item.samplePath);
                } else {
                    formData.append("mri_image", item.file);
                }
                
                try {
                    const response = await fetch("../backend/upload.php", {
                        method: "POST",
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error("HTTP connection error.");
                    }
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        item.status = 'completed';
                        item.result = data;
                        
                        processedCount++;
                        batchProcessedCnt.innerText = processedCount;
                        
                        if (data.prediction === "glioma") {
                            gliomaCount++;
                            batchGliomaCnt.innerText = gliomaCount;
                        } else if (data.prediction === "meningioma") {
                            meningiomaCount++;
                            batchMeningiomaCnt.innerText = meningiomaCount;
                        } else if (data.prediction === "pituitary") {
                            pituitaryCount++;
                            batchPituitaryCnt.innerText = pituitaryCount;
                        } else {
                            notumorCount++;
                            batchNoTumorCnt.innerText = notumorCount;
                        }
                        
                        saveToHistory(data, item.name);
                    } else {
                        item.status = 'failed';
                        item.result = { error: data.error };
                    }
                } catch (err) {
                    item.status = 'failed';
                    item.result = { error: err.message || "Network request failed." };
                }
                
                renderQueueList();
            }
            
            isAnalyzing = false;
            analyzeBtn.disabled = false;
            clearQueueBtn.disabled = false;
            batchControlActions.style.display = "none";
            resultsLoading.style.display = "none";
            
            if (isScanningCancelled) {
                selectedItems.forEach(q => {
                    if (q.status === 'analyzing' || q.status === 'pending') {
                        q.status = 'pending';
                    }
                });
                renderQueueList();
                
                resultsEmpty.style.display = "flex";
                const emptyTitle = resultsEmpty.querySelector("p");
                const emptyDesc = resultsEmpty.querySelector("span");
                emptyTitle.innerText = "Batch Scan Cancelled";
                emptyDesc.innerText = `Scanning was cancelled. ${processedCount} of ${selectedItems.length} selected files completed analysis.`;
            } else {
                const firstProcessedItem = selectedItems.find(q => q.status === 'completed' || q.status === 'failed');
                if (firstProcessedItem) {
                    activeInspectedItemId = firstProcessedItem.id;
                    renderQueueList();
                    
                    if (firstProcessedItem.status === 'completed') {
                        renderResults(firstProcessedItem.result, firstProcessedItem.name);
                    } else {
                        showErrorState(firstProcessedItem.result.error);
                    }
                } else {
                    resultsEmpty.style.display = "flex";
                }
            }
            
            loadHistoryTable();
        });

        // Render prediction and Grad-CAM outputs
        function renderResults(data, filename) {
            resultsEmpty.style.display = "none";
            resultsLoading.style.display = "none";
            resultsContent.style.display = "block";
            
            inspectedFileName.innerText = filename;
            
            if (data.warning || !data.model_trained) {
                modelWarningBanner.style.display = "flex";
                warningText.innerText = data.warning || "Model is untrained. Predictions are randomized.";
            } else {
                modelWarningBanner.style.display = "none";
            }
            
            const predClass = data.prediction;
            const confidencePct = (data.confidence * 100).toFixed(1) + "%";
            
            predClassBadge.innerText = predClass.replace("_", " ");
            predClassBadge.className = "m-value " + predClass.toUpperCase();
            predConfVal.innerText = confidencePct;
            
            // Dynamic color changes for badge matching tumor class
            if (predClass === "notumor") {
                predClassBadge.style.color = "var(--success)";
                predClassBadge.innerText = "NORMAL (NO TUMOR)";
            } else if (predClass === "glioma") {
                predClassBadge.style.color = "var(--color-glioma)";
            } else if (predClass === "meningioma") {
                predClassBadge.style.color = "var(--color-meningioma)";
            } else if (predClass === "pituitary") {
                predClassBadge.style.color = "var(--color-pituitary)";
            }
            
            // Update Holographic floating HUD badge on left column brain view
            hudPrediction.style.display = "flex";
            hudPrediction.className = `hud-badge hud-bottom-right ${predClass}`;
            
            let displayClassHUD = predClass.replace("_", " ");
            if (predClass === "notumor") displayClassHUD = "No Tumor";
            hudPredClass.innerText = `${displayClassHUD} (${confidencePct})`;
            
            // Update the 3D Brain model color code in real time!
            if (update3DBrainColor) {
                update3DBrainColor(predClass);
            }
            
            // Build probability bars
            probList.innerHTML = "";
            const classesSorted = Object.entries(data.probabilities).sort((a, b) => b[1] - a[1]);
            
            classesSorted.forEach(([clsName, prob]) => {
                const probPct = (prob * 100).toFixed(1) + "%";
                
                const row = document.createElement("div");
                row.className = "prob-row";
                
                let displayName = clsName.replace("_", " ");
                if (clsName === "notumor") displayName = "No Tumor";
                
                let barColor = "var(--primary)";
                if (clsName === "notumor") barColor = "var(--success)";
                else if (clsName === "glioma") barColor = "var(--color-glioma)";
                else if (clsName === "meningioma") barColor = "var(--color-meningioma)";
                else if (clsName === "pituitary") barColor = "var(--color-pituitary)";
                
                row.innerHTML = `
                    <span class="prob-name">${displayName}</span>
                    <div class="prob-bar-container">
                        <div class="prob-bar" style="width: ${prob * 100}%; background-color: ${barColor}"></div>
                    </div>
                    <span class="prob-val">${probPct}</span>
                `;
                probList.appendChild(row);
            });
            
            resultRawImg.src = "../" + data.raw_image_url;
            resultHeatmapImg.src = "../" + data.heatmap_image_url;
            
            renderFindingsNarrative(predClass, confidencePct);
        }
        
        function showErrorState(errorMsg) {
            resultsEmpty.style.display = "flex";
            resultsContent.style.display = "none";
            resultsLoading.style.display = "none";
            hudPrediction.style.display = "none";
            if (update3DBrainColor) update3DBrainColor('default');
            
            const emptyTitle = resultsEmpty.querySelector("p");
            const emptyDesc = resultsEmpty.querySelector("span");
            
            emptyTitle.innerText = "Analysis Failed";
            emptyTitle.style.color = "var(--danger)";
            emptyDesc.innerText = errorMsg;
        }

        function renderFindingsNarrative(predClass, confidencePct) {
            let title = "";
            let desc = "";
            
            switch (predClass) {
                case "glioma":
                    title = "Infiltrative Glioma Mass Characteristics Detected";
                    desc = `The convolutional neural network identified features heavily aligned with a <strong>Glioma</strong> with ${confidencePct} confidence. The Grad-CAM explainability highlights localized regional signal intensities showing infiltrating margins. Gliomas originate from glial tissue and are characterized on T1w-contrast MRI by variable hyperintense masses. Staging is recommended via immunohistochemical (IDH mutation / 1p19q codeletion) tests.`;
                    break;
                case "meningioma":
                    title = "Extra-Axial Dural-Based Meningioma Signature Detected";
                    desc = `Features mapping to a <strong>Meningioma</strong> have been classified with ${confidencePct} confidence. The Grad-CAM heatmap outlines a focal dural-based highlight. Meningiomas are typically benign, slow-growing tumors arising from meningeal layers. In contrast-enhanced T1 scans, they exhibit uniform, intense enhancement. Mass effect check on the adjacent brain parenchyma is advised.`;
                    break;
                case "pituitary":
                    title = "Sellar/Sella Turcica Pituitary Expansion Detected";
                    desc = `A <strong>Pituitary Tumor</strong> has been classified with ${confidencePct} confidence. The Grad-CAM focuses on the basal/infundibular region of the sella turcica. Pituitary adenomas can cause hormonal imbalances and optic chiasm compression. Further T1-coronal imaging and endocrine hormone screening panel tests are standard clinical procedures.`;
                    break;
                default:
                    title = "No Abnormal Brain Mass/Lesion Detected";
                    desc = `No signs of tumorous growths or tissue deviations were classified (${confidencePct} confidence). The structures in the ventricles, midline alignment, and cerebral gray-white matter mapping appear normal. Please verify with a full sequence screening (T2, FLAIR, and DWI) to confirm negative clinical diagnosis.`;
            }
            
            findingsCard.innerHTML = `
                <h5>${title}</h5>
                <p>${desc}</p>
            `;
        }

        function checkModelStatus() {
            fetch("../backend/upload.php", {
                method: "POST"
            })
            .then(response => response.json())
            .catch(() => {})
            .then(data => {
                if (data && data.error && data.error.includes("No image file")) {
                    modelStatusText.innerText = "Model Active";
                } else {
                    modelStatusText.innerText = "Offline/Demo Mode";
                }
            });
        }

        function saveToHistory(data, name) {
            const historyItem = {
                id: Date.now(),
                timestamp: new Date().toLocaleString(),
                filename: name,
                prediction: data.prediction,
                confidence: data.confidence,
                probabilities: data.probabilities,
                raw_image_url: data.raw_image_url,
                heatmap_image_url: data.heatmap_image_url,
                model_trained: data.model_trained,
                warning: data.warning || null
            };
            
            scanHistory.unshift(historyItem);
            if (scanHistory.length > 30) {
                scanHistory.pop();
            }
            
            localStorage.setItem("neuro_scan_history", JSON.stringify(scanHistory));
        }
        
        function loadHistoryTable() {
            if (scanHistory.length === 0) {
                historyTbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="no-records">No patient records registered in this session.</td>
                    </tr>
                `;
                return;
            }
            
            historyTbody.innerHTML = "";
            
            scanHistory.forEach((item, index) => {
                const tr = document.createElement("tr");
                
                let classDisplay = item.prediction.replace("_", " ");
                if (item.prediction === "notumor") classDisplay = "No Tumor";
                
                const confPct = (item.confidence * 100).toFixed(1) + "%";
                
                tr.innerHTML = `
                    <td>${item.timestamp}</td>
                    <td style="font-family: monospace; font-size: 0.8rem;">${item.filename}</td>
                    <td><span class="history-class ${item.prediction}">${classDisplay}</span></td>
                    <td><strong>${confPct}</strong></td>
                    <td>
                        <button class="ehr-btn ehr-btn-secondary btn-sm view-history-btn" data-index="${index}" style="padding: 6px 12px; font-size: 0.7rem; border-radius: 8px;">
                            <i class="fa-solid fa-eye"></i> View Results
                        </button>
                    </td>
                `;
                historyTbody.appendChild(tr);
            });
            
            document.querySelectorAll(".view-history-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const idx = parseInt(btn.getAttribute("data-index"));
                    const historicalData = scanHistory[idx];
                    
                    resetQueue();
                    
                    renderResults({
                        success: true,
                        prediction: historicalData.prediction,
                        confidence: historicalData.confidence,
                        probabilities: historicalData.probabilities,
                        raw_image_url: historicalData.raw_image_url,
                        heatmap_image_url: historicalData.heatmap_image_url,
                        model_trained: historicalData.model_trained,
                        warning: historicalData.warning
                    }, historicalData.filename);
                    
                    document.getElementById("tab-analyzer").click();
                });
            });
        }
    }
});
