document.addEventListener("DOMContentLoaded", () => {
    // Navigation elements
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".content-section");
    
    // Upload & Queue elements
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const uploadPrompt = document.getElementById("upload-prompt");
    const analyzeBtn = document.getElementById("analyze-btn");
    const browseBtn = document.querySelector(".browse-btn");
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
    const modelStatusText = document.getElementById("model-status-badge").querySelector("span");
    
    // History elements
    const historyTbody = document.getElementById("history-tbody");
    
    // Sample items
    const sampleItems = document.querySelectorAll(".sample-item");
    
    // App State
    let uploadQueue = []; // Array of { id, file, name, size, type, samplePath, status: 'pending'|'analyzing'|'completed'|'failed', result: null|data }
    let scanHistory = JSON.parse(localStorage.getItem("neuro_scan_history") || "[]");
    let activeInspectedItemId = null;
    let isAnalyzing = false;
    
    // Check model status initially
    checkModelStatus();
    loadHistoryTable();

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

    // 2. File Selection & Drag-and-Drop
    browseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isAnalyzing) return;
        fileInput.click();
    });
    
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
        // Clear active states on sample cards since user is uploading files
        sampleItems.forEach(card => card.classList.remove("active"));
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Validate type
            if (!file.type.match("image/jpeg") && !file.type.match("image/png") && !file.type.match("image/jpg")) {
                alert(`"${file.name}" is not a valid format. Please upload JPEG or PNG images.`);
                continue;
            }
            
            // Validate size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert(`"${file.name}" exceeds 5MB size limit.`);
                continue;
            }
            
            // Avoid duplicate additions
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
        
        // Hide result view if open
        resultsContent.style.display = "none";
        resultsEmpty.style.display = "flex";
        batchStatsBanner.style.display = "none";
    }

    // 3. Multiple Sample Scans Selection
    sampleItems.forEach(item => {
        item.addEventListener("click", () => {
            if (isAnalyzing) return;
            
            const fileUrl = item.getAttribute("data-file");
            const sampleName = fileUrl.split("/").pop();
            
            // Check if this sample is already in the queue
            const index = uploadQueue.findIndex(q => q.samplePath === fileUrl);
            
            if (index > -1) {
                // Remove it
                uploadQueue.splice(index, 1);
                item.classList.remove("active");
            } else {
                // Add it
                const queueItem = {
                    id: 'sample_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    file: null,
                    name: sampleName,
                    size: 0,
                    samplePath: fileUrl,
                    status: 'pending',
                    result: null
                };
                uploadQueue.push(queueItem);
                item.classList.add("active");
            }
            
            renderQueueList();
        });
    });

    // 4. Render the Queue List UI
    function renderQueueList() {
        if (uploadQueue.length === 0) {
            batchQueueContainer.style.display = "none";
            analyzeBtn.disabled = true;
            return;
        }
        
        batchQueueContainer.style.display = "block";
        queueCountText.innerText = uploadQueue.length;
        analyzeBtn.disabled = false;
        
        queueList.innerHTML = "";
        
        uploadQueue.forEach(item => {
            const div = document.createElement("div");
            div.className = `queue-item ${activeInspectedItemId === item.id ? 'active' : ''}`;
            div.setAttribute("data-id", item.id);
            
            // Status label mapping
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
            
            // Right-side result pill
            let badgeHtml = '';
            if (item.status === 'completed' && item.result) {
                badgeHtml = `<span class="queue-item-badge ${item.result.prediction}">${item.result.prediction.replace('_', ' ')}</span>`;
            }
            
            div.innerHTML = `
                <div class="queue-item-info">
                    <span class="queue-item-name" title="${item.name}">${item.name}</span>
                    <span class="queue-item-status ${statusClass}">
                        ${iconHtml} ${statusText}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${badgeHtml}
                    <button class="queue-item-remove" data-id="${item.id}" ${isAnalyzing ? 'disabled style="opacity: 0.3;"' : ''}>
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            
            // Clicking item loads its details (only if completed/failed)
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
            
            queueList.appendChild(div);
        });
        
        // Add delete button events
        document.querySelectorAll(".queue-item-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (isAnalyzing) return;
                
                const id = btn.getAttribute("data-id");
                const item = uploadQueue.find(q => q.id === id);
                
                // Toggle off active state in sample card if it was a sample scan
                if (item && item.samplePath) {
                    const card = document.querySelector(`.sample-item[data-file="${item.samplePath}"]`);
                    if (card) card.classList.remove("active");
                }
                
                uploadQueue = uploadQueue.filter(q => q.id !== id);
                
                // Handle deleting the currently inspected item
                if (activeInspectedItemId === id) {
                    activeInspectedItemId = null;
                    resultsContent.style.display = "none";
                    resultsEmpty.style.display = "flex";
                }
                
                renderQueueList();
            });
        });
    }

    // 5. Run Batch DL Analysis sequentially
    analyzeBtn.addEventListener("click", async () => {
        if (uploadQueue.length === 0 || isAnalyzing) return;
        
        isAnalyzing = true;
        analyzeBtn.disabled = true;
        clearQueueBtn.disabled = true;
        
        // Setup stats banner
        batchStatsBanner.style.display = "grid";
        batchTotalCnt.innerText = uploadQueue.length;
        batchProcessedCnt.innerText = "0";
        batchGliomaCnt.innerText = "0";
        batchMeningiomaCnt.innerText = "0";
        batchPituitaryCnt.innerText = "0";
        batchNoTumorCnt.innerText = "0";
        
        // Show loading screen
        resultsEmpty.style.display = "none";
        resultsContent.style.display = "none";
        resultsLoading.style.display = "flex";
        
        let processedCount = 0;
        let gliomaCount = 0;
        let meningiomaCount = 0;
        let pituitaryCount = 0;
        let notumorCount = 0;
        
        // Process each queue item in sequence
        for (let i = 0; i < uploadQueue.length; i++) {
            const item = uploadQueue[i];
            
            // Skip already completed runs if needed, but here we run everything fresh
            item.status = 'analyzing';
            renderQueueList();
            
            loadingTitle.innerText = `Processing Scan ${i + 1} of ${uploadQueue.length}`;
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
                    
                    // Increment batch counters
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
                    } else { // notumor
                        notumorCount++;
                        batchNoTumorCnt.innerText = notumorCount;
                    }
                    
                    // Save to history list
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
        
        // Batch completed
        isAnalyzing = false;
        analyzeBtn.disabled = false;
        clearQueueBtn.disabled = false;
        resultsLoading.style.display = "none";
        
        // Select the first completed/failed item to display details
        const firstProcessedItem = uploadQueue.find(q => q.status === 'completed' || q.status === 'failed');
        if (firstProcessedItem) {
            activeInspectedItemId = firstProcessedItem.id;
            renderQueueList(); // to apply active class
            
            if (firstProcessedItem.status === 'completed') {
                renderResults(firstProcessedItem.result, firstProcessedItem.name);
            } else {
                showErrorState(firstProcessedItem.result.error);
            }
        } else {
            resultsEmpty.style.display = "flex";
            const emptyTitle = resultsEmpty.querySelector("p");
            const emptyDesc = resultsEmpty.querySelector("span");
            emptyTitle.innerText = "Batch Processing Failed";
            emptyDesc.innerText = "All uploaded scans failed DL analysis. Please check your PHP server connection.";
        }
        
        loadHistoryTable();
    });

    // Render prediction and Grad-CAM outputs
    function renderResults(data, filename) {
        resultsEmpty.style.display = "none";
        resultsLoading.style.display = "none";
        resultsContent.style.display = "block";
        
        // Display custom filename in details pane
        inspectedFileName.innerText = filename;
        
        // Handle warning (e.g. model not trained)
        if (data.warning || !data.model_trained) {
            modelWarningBanner.style.display = "flex";
            warningText.innerText = data.warning || "Model is untrained. Predictions are randomized.";
        } else {
            modelWarningBanner.style.display = "none";
        }
        
        // Primary predicted class and confidence
        const predClass = data.prediction;
        const confidencePct = (data.confidence * 100).toFixed(1) + "%";
        
        predClassBadge.innerText = predClass.replace("_", " ");
        predClassBadge.className = "result-badge " + predClass; // for color theme styles
        predConfVal.innerText = confidencePct;
        
        // Dynamic color changes for badge matching tumor class
        if (predClass === "notumor") {
            predClassBadge.style.color = "var(--success)";
            predClassBadge.style.backgroundColor = "var(--success-light)";
            predClassBadge.innerText = "NORMAL (NO TUMOR)";
        } else {
            predClassBadge.style.color = "var(--danger)";
            predClassBadge.style.backgroundColor = "var(--danger-light)";
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
            
            row.innerHTML = `
                <span class="prob-name">${displayName}</span>
                <div class="prob-bar-container">
                    <div class="prob-bar" style="width: ${prob * 100}%; background-color: ${clsName === 'notumor' ? 'var(--success)' : 'var(--primary)'}"></div>
                </div>
                <span class="prob-val">${probPct}</span>
            `;
            probList.appendChild(row);
        });
        
        // Set raw image and Grad-CAM overlay image paths
        resultRawImg.src = "../" + data.raw_image_url;
        resultHeatmapImg.src = "../" + data.heatmap_image_url;
        
        // Generate clinical findings narrative
        renderFindingsNarrative(predClass, confidencePct);
    }
    
    // Display error messages in the output panel
    function showErrorState(errorMsg) {
        resultsEmpty.style.display = "flex";
        resultsContent.style.display = "none";
        resultsLoading.style.display = "none";
        
        const emptyTitle = resultsEmpty.querySelector("p");
        const emptyDesc = resultsEmpty.querySelector("span");
        
        emptyTitle.innerText = "Analysis Failed";
        emptyTitle.style.color = "var(--danger)";
        emptyDesc.innerText = errorMsg;
    }

    // Dynamic clinical findings explanation creator
    function renderFindingsNarrative(predClass, confidencePct) {
        let title = "";
        let desc = "";
        
        switch (predClass) {
            case "glioma":
                title = "Infiltrative Glioma Mass Characteristics Detected";
                desc = `The convolutional neural network identified features heavily aligned with a <strong>Glioma</strong> with ${confidencePct} confidence. The Grad-CAM explainability highlights localized regional signal intensities showing infiltrating margins. Gliomas originate from glial tissue and are characterized on T1w-contrast MRI by variable hyperintense masses. Clinical staging is recommended via immunohistochemical (IDH mutation / 1p19q codeletion) tests.`;
                break;
            case "meningioma":
                title = "Extra-Axial Dural-Based Meningioma Signature Detected";
                desc = `Features mapping to a <strong>Meningioma</strong> have been classified with ${confidencePct} confidence. The Grad-CAM heatmap outlines a focal dural-based highlight. Meningiomas are typically benign, slow-growing tumors arising from meningeal layers. In contrast-enhanced T1 scans, they exhibit uniform, intense enhancement. Mas effect check on the adjacent brain parenchyma is advised.`;
                break;
            case "pituitary":
                title = "Sellar/Sella Turcica Pituitary Expansion Detected";
                desc = `A <strong>Pituitary Tumor</strong> has been classified with ${confidencePct} confidence. The Grad-CAM focuses on the basal/infundibular region of the sella turcica. Pituitary adenomas can cause hormonal imbalances and optic chiasm compression. Further T1-coronal imaging and endocrine hormone screening panel tests are standard clinical procedures.`;
                break;
            default: // notumor
                title = "No Abnormal Brain Mass/Lesion Detected";
                desc = `No signs of tumorous growths or tissue deviations were classified (${confidencePct} confidence). The structures in the ventricles, midline alignment, and cerebral gray-white matter mapping appear normal. Please verify with a full sequence screening (T2, FLAIR, and DWI) to confirm negative clinical diagnosis.`;
        }
        
        findingsCard.innerHTML = `
            <h5>${title}</h5>
            <p>${desc}</p>
        `;
    }

    // Check model training status on server startup
    function checkModelStatus() {
        // We ping backend with empty request to check if custom best_model.pth is present
        fetch("../backend/upload.php", {
            method: "POST"
        })
        .then(response => response.json())
        .catch(() => {
            // Silence connection errors on status badges
        })
        .then(data => {
            if (data && data.error && data.error.includes("No image file")) {
                modelStatusText.innerText = "Model Ready (PyTorch)";
                const indicator = document.querySelector(".status-indicator");
                indicator.className = "status-indicator connected";
            } else {
                modelStatusText.innerText = "Demo Mode (Local)";
                const indicator = document.querySelector(".status-indicator");
                indicator.className = "status-indicator";
            }
        });
    }

    // Local Storage History Management
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
                    <td colspan="5" class="no-history-text">No scans analyzed in this session yet.</td>
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
                    <button class="btn btn-secondary btn-sm view-history-btn" data-index="${index}">
                        <i class="fa-solid fa-eye"></i> View Results
                    </button>
                </td>
            `;
            historyTbody.appendChild(tr);
        });
        
        // Add click events to buttons
        document.querySelectorAll(".view-history-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-index"));
                const historicalData = scanHistory[idx];
                
                // Clear any current queue to avoid UI confusion
                resetQueue();
                
                // Load results back into the analyzer view
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
                
                // Navigate back to analyzer tab
                document.getElementById("nav-analyzer").click();
            });
        });
    }
});
