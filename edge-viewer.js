class EdgeViewer {
    constructor() {
        this.canvas = document.getElementById('edgeCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.edges = [];
        
        // Display settings
        this.showEdgeIds = true;
        this.showLengths = false;
        this.showNodes = true;
        this.showUnderlyingGrid = true;
        this.flipY = true;
        this.lineWidth = 2;
        this.nodeSize = 4;
        
        // World bounds
        this.worldMinX = 0;
        this.worldMaxX = 100;
        this.worldMinY = 0;
        this.worldMaxY = 100;
        this.baseScale = 1;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        
        // Zoom and pan
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.extensionAmount = 0; // meters to extend edges
        this.clusterRadius = 0.15; // meters for clustering
        
        // Underlying grid data
        this.gridX = [];
        this.gridY = [];
        this.gridNodes = []; // all unique node positions
        
        this.setupCanvas();
        this.setupEventListeners();
        this.setupZoomPan();
        this.loadDefaultCSV();
    }

    setupCanvas() {
        const resize = () => {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.calculateBounds();
            this.draw();
        };
        
        window.addEventListener('resize', resize);
        resize();
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => {
            document.getElementById('csvFileInput').click();
        });

        document.getElementById('csvFileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadCSVFile(e.target.files[0]);
            }
        });

        document.getElementById('showEdgeIds').addEventListener('change', (e) => {
            this.showEdgeIds = e.target.checked;
            this.draw();
        });

        document.getElementById('showLengths').addEventListener('change', (e) => {
            this.showLengths = e.target.checked;
            this.draw();
        });

        document.getElementById('showNodes').addEventListener('change', (e) => {
            this.showNodes = e.target.checked;
            this.draw();
        });

        document.getElementById('showUnderlyingGrid').addEventListener('change', (e) => {
            this.showUnderlyingGrid = e.target.checked;
            this.draw();
        });

        document.getElementById('flipY').addEventListener('change', (e) => {
            this.flipY = e.target.checked;
            this.draw();
        });

        document.getElementById('lineWidth').addEventListener('input', (e) => {
            this.lineWidth = parseInt(e.target.value);
            document.getElementById('lineWidthValue').textContent = this.lineWidth;
            this.draw();
        });

        document.getElementById('nodeSize').addEventListener('input', (e) => {
            this.nodeSize = parseInt(e.target.value);
            document.getElementById('nodeSizeValue').textContent = this.nodeSize;
            this.draw();
        });

        document.getElementById('extensionAmount').addEventListener('input', (e) => {
            this.extensionAmount = parseFloat(e.target.value);
            document.getElementById('extensionValue').textContent = this.extensionAmount.toFixed(2);
            if (this.edges.length > 0) {
                this.analyzeExtendedEdges();
                this.updateStats();
                this.draw();
            }
        });

        document.getElementById('clusterRadius').addEventListener('input', (e) => {
            this.clusterRadius = parseFloat(e.target.value);
            document.getElementById('clusterRadiusValue').textContent = this.clusterRadius.toFixed(2);
            if (this.edges.length > 0) {
                this.analyzeExtendedEdges();
                this.updateStats();
            }
        });
    }

    setupZoomPan() {
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Store old zoom level
            const oldZoom = this.zoomLevel;
            
            // Adjust zoom level (less aggressive, min 1x, max 20x)
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.93;
            this.zoomLevel = Math.max(1, Math.min(20, this.zoomLevel * zoomFactor));
            
            // Calculate the zoom ratio
            const zoomRatio = this.zoomLevel / oldZoom;
            
            // Adjust pan to keep mouse position as zoom center
            // The mouse position relative to the current view origin
            const viewOriginX = this.offsetX + this.panX;
            const viewOriginY = this.offsetY + this.panY;
            
            // Distance from mouse to view origin
            const dx = mouseX - viewOriginX;
            const dy = mouseY - viewOriginY;
            
            // After zoom, we need to adjust pan so the world point under mouse stays there
            this.panX -= dx * (zoomRatio - 1);
            this.panY -= dy * (zoomRatio - 1);
            
            this.updateZoomDisplay();
            this.draw();
        });

        // Mouse drag pan
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                this.isPanning = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.canvas.style.cursor = 'grabbing';
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.draw();
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.canvas.style.cursor = 'grab';
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isPanning = false;
            this.canvas.style.cursor = 'grab';
        });

        // Double-click to reset zoom
        this.canvas.addEventListener('dblclick', () => {
            this.resetView();
        });

        // Reset view button
        document.getElementById('resetViewBtn').addEventListener('click', () => {
            this.resetView();
        });

        // Set initial cursor
        this.canvas.style.cursor = 'grab';
    }

    resetView() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.updateZoomDisplay();
        this.draw();
    }

    updateZoomDisplay() {
        const zoomPercent = Math.round(this.zoomLevel * 100);
        document.getElementById('zoomLevelDisplay').textContent = `${zoomPercent}%`;
    }

    canvasToWorld(canvasX, canvasY) {
        // Reverse the worldToCanvas transformation
        const effectiveScale = this.baseScale * this.zoomLevel;
        const x = (canvasX - this.offsetX - this.panX) / effectiveScale + this.worldMinX;
        let worldY;
        if (this.flipY) {
            worldY = this.worldMaxY - (canvasY - this.offsetY - this.panY) / effectiveScale;
        } else {
            worldY = (canvasY - this.offsetY - this.panY) / effectiveScale + this.worldMinY;
        }
        return { x, y: worldY };
    }

    async loadDefaultCSV() {
        try {
            const response = await fetch('./data/003-s.csv');
            if (!response.ok) throw new Error('File not found');
            const text = await response.text();
            this.parseCSV(text);
        } catch (error) {
            console.log('Default CSV not found, please upload a file');
            document.getElementById('statsInfo').textContent = 'Default CSV not found. Please load a file.';
        }
    }

    loadCSVFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.parseCSV(e.target.result);
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        this.edges = [];
        
        // Parse header to find column indices
        const header = lines[0].split(',').map(h => h.trim());
        const idIdx = header.findIndex(h => h.toLowerCase() === 'id');
        const startXIdx = header.findIndex(h => h.toLowerCase() === 'start_x');
        const startYIdx = header.findIndex(h => h.toLowerCase() === 'start_y');
        const startZIdx = header.findIndex(h => h.toLowerCase() === 'start_z');
        const endXIdx = header.findIndex(h => h.toLowerCase() === 'end_x');
        const endYIdx = header.findIndex(h => h.toLowerCase() === 'end_y');
        const endZIdx = header.findIndex(h => h.toLowerCase() === 'end_z');
        const lengthIdx = header.findIndex(h => h.toLowerCase().includes('length'));

        console.log('CSV Header:', header);
        console.log('Column indices:', { idIdx, startXIdx, startYIdx, startZIdx, endXIdx, endYIdx, endZIdx, lengthIdx });

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            
            const id = idIdx >= 0 ? parseInt(values[idIdx]) : i - 1;
            const startX = parseFloat(values[startXIdx]);
            const startY = parseFloat(values[startYIdx]);
            const startZ = parseFloat(values[startZIdx]);
            const endX = parseFloat(values[endXIdx]);
            const endY = parseFloat(values[endYIdx]);
            const endZ = parseFloat(values[endZIdx]);
            const csvLength = lengthIdx >= 0 ? parseFloat(values[lengthIdx]) : null;

            // Skip invalid rows
            if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) continue;

            // Calculate 3D length
            const dx = endX - startX;
            const dy = endY - startY;
            const dz = endZ - startZ;
            const calculatedLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

            this.edges.push({
                id: id,
                startX: startX,
                startY: startY,
                startZ: startZ,
                endX: endX,
                endY: endY,
                endZ: endZ,
                csvLength: csvLength,
                calculatedLength: calculatedLength
            });
        }

        console.log(`Loaded ${this.edges.length} edges from CSV`);
        
        this.calculateBounds();
        this.analyzeGridStructure();
        this.verifyLengths();
        this.analyzeExtendedEdges();
        this.updateStats();
        this.draw();
    }

    analyzeGridStructure() {
        if (this.edges.length === 0) return;
        
        // Collect all unique X and Y coordinates from node positions
        const xCoords = new Set();
        const yCoords = new Set();
        const nodeMap = new Map(); // key: "x,y" -> {x, y, z, count}
        
        for (const edge of this.edges) {
            // Round to 2 decimal places for grouping
            const startKey = `${edge.startX.toFixed(2)},${edge.startY.toFixed(2)}`;
            const endKey = `${edge.endX.toFixed(2)},${edge.endY.toFixed(2)}`;
            
            if (!nodeMap.has(startKey)) {
                nodeMap.set(startKey, { x: edge.startX, y: edge.startY, z: edge.startZ, count: 0 });
            }
            nodeMap.get(startKey).count++;
            
            if (!nodeMap.has(endKey)) {
                nodeMap.set(endKey, { x: edge.endX, y: edge.endY, z: edge.endZ, count: 0 });
            }
            nodeMap.get(endKey).count++;
            
            xCoords.add(edge.startX);
            xCoords.add(edge.endX);
            yCoords.add(edge.startY);
            yCoords.add(edge.endY);
        }
        
        // Store unique nodes
        this.gridNodes = Array.from(nodeMap.values());
        
        // Sort and find unique grid lines
        const sortedX = Array.from(xCoords).sort((a, b) => a - b);
        const sortedY = Array.from(yCoords).sort((a, b) => a - b);
        
        // Cluster nearby coordinates (within 0.5m tolerance) to find grid lines
        this.gridX = this.clusterGridCoordinates(sortedX, 0.5);
        this.gridY = this.clusterGridCoordinates(sortedY, 0.5);
        
        // Analyze grid spacing
        const xSpacings = [];
        const ySpacings = [];
        
        for (let i = 1; i < this.gridX.length; i++) {
            xSpacings.push(this.gridX[i] - this.gridX[i-1]);
        }
        for (let i = 1; i < this.gridY.length; i++) {
            ySpacings.push(this.gridY[i] - this.gridY[i-1]);
        }
        
        // Find the most common spacing
        const avgXSpacing = xSpacings.length > 0 ? xSpacings.reduce((a,b) => a+b, 0) / xSpacings.length : 0;
        const avgYSpacing = ySpacings.length > 0 ? ySpacings.reduce((a,b) => a+b, 0) / ySpacings.length : 0;
        
        console.log('=== GRID STRUCTURE ANALYSIS ===');
        console.log(`Unique X grid lines: ${this.gridX.length}`);
        console.log(`Unique Y grid lines: ${this.gridY.length}`);
        console.log(`X grid lines: ${this.gridX.map(x => x.toFixed(2)).join(', ')}`);
        console.log(`Y grid lines: ${this.gridY.map(y => y.toFixed(2)).join(', ')}`);
        console.log(`Average X spacing: ${avgXSpacing.toFixed(3)} m`);
        console.log(`Average Y spacing: ${avgYSpacing.toFixed(3)} m`);
        console.log(`Total unique nodes: ${this.gridNodes.length}`);
        
        // Store grid info for display
        this.gridInfo = {
            xLines: this.gridX.length,
            yLines: this.gridY.length,
            avgXSpacing: avgXSpacing,
            avgYSpacing: avgYSpacing,
            totalNodes: this.gridNodes.length
        };
    }

    clusterGridCoordinates(coords, tolerance) {
        if (coords.length === 0) return [];
        
        const clustered = [];
        let currentCluster = [coords[0]];
        
        for (let i = 1; i < coords.length; i++) {
            if (coords[i] - coords[i-1] < tolerance) {
                currentCluster.push(coords[i]);
            } else {
                // Finish current cluster with average value
                const avg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
                clustered.push(avg);
                currentCluster = [coords[i]];
            }
        }
        
        // Don't forget the last cluster
        if (currentCluster.length > 0) {
            const avg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
            clustered.push(avg);
        }
        
        return clustered;
    }

    calculateBounds() {
        if (this.edges.length === 0) return;

        const allX = this.edges.flatMap(e => [e.startX, e.endX]);
        const allY = this.edges.flatMap(e => [e.startY, e.endY]);

        this.worldMinX = Math.min(...allX);
        this.worldMaxX = Math.max(...allX);
        this.worldMinY = Math.min(...allY);
        this.worldMaxY = Math.max(...allY);

        const worldWidth = this.worldMaxX - this.worldMinX;
        const worldHeight = this.worldMaxY - this.worldMinY;

        const padding = 50;
        const scaleX = (this.canvas.width - 2 * padding) / worldWidth;
        const scaleY = (this.canvas.height - 2 * padding) / worldHeight;
        this.baseScale = Math.min(scaleX, scaleY);

        this.offsetX = padding + (this.canvas.width - 2 * padding - worldWidth * this.baseScale) / 2;
        this.offsetY = padding + (this.canvas.height - 2 * padding - worldHeight * this.baseScale) / 2;
    }

    worldToCanvas(x, y) {
        const effectiveScale = this.baseScale * this.zoomLevel;
        let canvasY;
        if (this.flipY) {
            // Flipped: higher world Y values appear at top of canvas (mathematical coordinates)
            canvasY = this.offsetY + this.panY + (this.worldMaxY - y) * effectiveScale;
        } else {
            // Normal: higher world Y values appear at bottom of canvas (screen coordinates)
            canvasY = this.offsetY + this.panY + (y - this.worldMinY) * effectiveScale;
        }
        return {
            x: this.offsetX + this.panX + (x - this.worldMinX) * effectiveScale,
            y: canvasY
        };
    }

    verifyLengths() {
        const lengthInfo = document.getElementById('lengthInfo');
        
        if (this.edges.length === 0) {
            lengthInfo.textContent = 'No edges loaded';
            return;
        }

        let mismatches = [];
        let maxError = 0;
        let totalError = 0;

        for (const edge of this.edges) {
            if (edge.csvLength !== null) {
                const error = Math.abs(edge.calculatedLength - edge.csvLength);
                totalError += error;
                
                if (error > maxError) {
                    maxError = error;
                }
                
                // Report significant mismatches (> 0.01 meters = 1cm)
                if (error > 0.01) {
                    mismatches.push({
                        id: edge.id,
                        csv: edge.csvLength,
                        calculated: edge.calculatedLength,
                        error: error
                    });
                }
            }
        }

        const avgError = totalError / this.edges.length;

        if (mismatches.length === 0) {
            lengthInfo.className = 'info-box success';
            lengthInfo.textContent = `✓ All ${this.edges.length} edge lengths verified!\n\nMax error: ${(maxError * 1000).toFixed(3)} mm\nAvg error: ${(avgError * 1000).toFixed(3)} mm`;
        } else {
            lengthInfo.className = 'info-box error';
            let text = `⚠ ${mismatches.length} length mismatches (>1cm):\n\n`;
            for (const m of mismatches.slice(0, 10)) {
                text += `Edge ${m.id}: CSV=${m.csv.toFixed(3)}, Calc=${m.calculated.toFixed(3)}, Err=${(m.error * 1000).toFixed(1)}mm\n`;
            }
            if (mismatches.length > 10) {
                text += `\n... and ${mismatches.length - 10} more`;
            }
            lengthInfo.textContent = text;
        }

        // Log detailed comparison to console
        console.log('=== LENGTH VERIFICATION ===');
        console.log(`Total edges: ${this.edges.length}`);
        console.log(`Mismatches (>1cm): ${mismatches.length}`);
        console.log(`Max error: ${(maxError * 1000).toFixed(3)} mm`);
        console.log(`Avg error: ${(avgError * 1000).toFixed(3)} mm`);
        
        if (mismatches.length > 0) {
            console.table(mismatches);
        }
    }

    analyzeExtendedEdges() {
        if (this.edges.length === 0) return;

        console.log('=== EXTENDED EDGE ANALYSIS ===');
        console.log(`Extension amount: ${this.extensionAmount} m in each direction`);

        // Calculate extended endpoints for each edge
        const extendedPoints = [];
        
        for (const edge of this.edges) {
            // Calculate 3D direction vector
            const dx = edge.endX - edge.startX;
            const dy = edge.endY - edge.startY;
            const dz = edge.endZ - edge.startZ;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            // Normalize direction
            const nx = dx / length;
            const ny = dy / length;
            const nz = dz / length;
            
            // Extend start point backwards (opposite to edge direction)
            const extStartX = edge.startX - nx * this.extensionAmount;
            const extStartY = edge.startY - ny * this.extensionAmount;
            const extStartZ = edge.startZ - nz * this.extensionAmount;
            
            // Extend end point forwards (in edge direction)
            const extEndX = edge.endX + nx * this.extensionAmount;
            const extEndY = edge.endY + ny * this.extensionAmount;
            const extEndZ = edge.endZ + nz * this.extensionAmount;
            
            extendedPoints.push({
                edgeId: edge.id,
                type: 'start',
                origX: edge.startX, origY: edge.startY, origZ: edge.startZ,
                extX: extStartX, extY: extStartY, extZ: extStartZ
            });
            
            extendedPoints.push({
                edgeId: edge.id,
                type: 'end',
                origX: edge.endX, origY: edge.endY, origZ: edge.endZ,
                extX: extEndX, extY: extEndY, extZ: extEndZ
            });
        }

        // Cluster the extended points to find common nodes
        const clusters = this.clusterPoints(extendedPoints, this.clusterRadius, 'ext');
        
        // Also cluster original points for comparison
        const origClusters = this.clusterPoints(extendedPoints, this.clusterRadius, 'orig');
        
        console.log(`\nOriginal endpoints: ${extendedPoints.length} points`);
        console.log(`Original clusters (${this.clusterRadius}m radius): ${origClusters.length} unique nodes`);
        console.log(`Extended clusters (${this.clusterRadius}m radius): ${clusters.length} unique nodes`);
        
        // Analyze cluster quality
        const origClusterSizes = origClusters.map(c => c.points.length);
        const extClusterSizes = clusters.map(c => c.points.length);
        
        console.log(`\nOriginal cluster sizes: min=${Math.min(...origClusterSizes)}, max=${Math.max(...origClusterSizes)}, avg=${(origClusterSizes.reduce((a,b)=>a+b,0)/origClusterSizes.length).toFixed(1)}`);
        console.log(`Extended cluster sizes: min=${Math.min(...extClusterSizes)}, max=${Math.max(...extClusterSizes)}, avg=${(extClusterSizes.reduce((a,b)=>a+b,0)/extClusterSizes.length).toFixed(1)}`);
        
        // Calculate average distance from cluster center for each
        let origTotalDist = 0, extTotalDist = 0;
        
        for (const cluster of origClusters) {
            for (const p of cluster.points) {
                const dist = Math.sqrt(
                    (p.origX - cluster.centerX) ** 2 + 
                    (p.origY - cluster.centerY) ** 2 + 
                    (p.origZ - cluster.centerZ) ** 2
                );
                origTotalDist += dist;
            }
        }
        
        for (const cluster of clusters) {
            for (const p of cluster.points) {
                const dist = Math.sqrt(
                    (p.extX - cluster.centerX) ** 2 + 
                    (p.extY - cluster.centerY) ** 2 + 
                    (p.extZ - cluster.centerZ) ** 2
                );
                extTotalDist += dist;
            }
        }
        
        const origAvgDist = origTotalDist / extendedPoints.length;
        const extAvgDist = extTotalDist / extendedPoints.length;
        
        console.log(`\nOriginal avg distance to cluster center: ${(origAvgDist * 1000).toFixed(1)} mm`);
        console.log(`Extended avg distance to cluster center: ${(extAvgDist * 1000).toFixed(1)} mm`);
        
        if (extAvgDist < origAvgDist) {
            console.log(`\n✓ Extended edges converge BETTER! (${((1 - extAvgDist/origAvgDist) * 100).toFixed(1)}% improvement)`);
        } else {
            console.log(`\n✗ Extended edges converge WORSE. Try different extension amount.`);
        }
        
        // Store for display
        this.extendedAnalysis = {
            extensionAmount: this.extensionAmount,
            origClusters: origClusters.length,
            extClusters: clusters.length,
            origAvgDist: origAvgDist,
            extAvgDist: extAvgDist,
            improvement: origAvgDist > 0 ? (1 - extAvgDist/origAvgDist) * 100 : 0
        };
        
        // Log some sample cluster comparisons
        console.log('\n=== SAMPLE CLUSTERS ===');
        for (let i = 0; i < Math.min(5, clusters.length); i++) {
            const c = clusters[i];
            console.log(`Cluster ${i+1}: ${c.points.length} points at (${c.centerX.toFixed(3)}, ${c.centerY.toFixed(3)}, ${c.centerZ.toFixed(3)})`);
            for (const p of c.points) {
                console.log(`  Edge ${p.edgeId} ${p.type}: orig(${p.origX.toFixed(3)}, ${p.origY.toFixed(3)}) -> ext(${p.extX.toFixed(3)}, ${p.extY.toFixed(3)})`);
            }
        }
    }

    clusterPoints(points, radius, coordPrefix) {
        // Simple clustering using Union-Find
        const n = points.length;
        const parent = new Array(n).fill(0).map((_, i) => i);
        
        const find = (x) => {
            if (parent[x] !== x) parent[x] = find(parent[x]);
            return parent[x];
        };
        
        const union = (x, y) => {
            const px = find(x), py = find(y);
            if (px !== py) parent[px] = py;
        };
        
        // Compare all pairs
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const xi = coordPrefix === 'ext' ? points[i].extX : points[i].origX;
                const yi = coordPrefix === 'ext' ? points[i].extY : points[i].origY;
                const zi = coordPrefix === 'ext' ? points[i].extZ : points[i].origZ;
                const xj = coordPrefix === 'ext' ? points[j].extX : points[j].origX;
                const yj = coordPrefix === 'ext' ? points[j].extY : points[j].origY;
                const zj = coordPrefix === 'ext' ? points[j].extZ : points[j].origZ;
                
                const dist = Math.sqrt((xi-xj)**2 + (yi-yj)**2 + (zi-zj)**2);
                if (dist <= radius) {
                    union(i, j);
                }
            }
        }
        
        // Group by cluster
        const clusterMap = new Map();
        for (let i = 0; i < n; i++) {
            const root = find(i);
            if (!clusterMap.has(root)) clusterMap.set(root, []);
            clusterMap.get(root).push(points[i]);
        }
        
        // Calculate cluster centers
        const clusters = [];
        for (const [root, pts] of clusterMap) {
            let sumX = 0, sumY = 0, sumZ = 0;
            for (const p of pts) {
                sumX += coordPrefix === 'ext' ? p.extX : p.origX;
                sumY += coordPrefix === 'ext' ? p.extY : p.origY;
                sumZ += coordPrefix === 'ext' ? p.extZ : p.origZ;
            }
            clusters.push({
                centerX: sumX / pts.length,
                centerY: sumY / pts.length,
                centerZ: sumZ / pts.length,
                points: pts
            });
        }
        
        return clusters;
    }

    updateStats() {
        const statsInfo = document.getElementById('statsInfo');
        
        if (this.edges.length === 0) {
            statsInfo.textContent = 'No data loaded';
            return;
        }

        const lengths = this.edges.map(e => e.calculatedLength);
        const minLength = Math.min(...lengths);
        const maxLength = Math.max(...lengths);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const totalLength = lengths.reduce((a, b) => a + b, 0);

        // Collect unique nodes
        const nodes = new Set();
        for (const edge of this.edges) {
            nodes.add(`${edge.startX.toFixed(3)},${edge.startY.toFixed(3)},${edge.startZ.toFixed(3)}`);
            nodes.add(`${edge.endX.toFixed(3)},${edge.endY.toFixed(3)},${edge.endZ.toFixed(3)}`);
        }

        let text = `Edges: ${this.edges.length}
Unique nodes: ${nodes.size}

Length Statistics:
  Min: ${minLength.toFixed(3)} m
  Max: ${maxLength.toFixed(3)} m
  Avg: ${avgLength.toFixed(3)} m
  Total: ${totalLength.toFixed(2)} m

World Bounds:
  X: ${this.worldMinX.toFixed(2)} to ${this.worldMaxX.toFixed(2)}
  Y: ${this.worldMinY.toFixed(2)} to ${this.worldMaxY.toFixed(2)}`;

        // Add grid structure info
        if (this.gridInfo) {
            text += `\n\n=== Grid Structure ===
X grid lines: ${this.gridInfo.xLines}
Y grid lines: ${this.gridInfo.yLines}
Avg X spacing: ${this.gridInfo.avgXSpacing.toFixed(3)} m
Avg Y spacing: ${this.gridInfo.avgYSpacing.toFixed(3)} m
Grid nodes: ${this.gridInfo.totalNodes}`;
        }

        // Add extended edge analysis
        if (this.extendedAnalysis) {
            const a = this.extendedAnalysis;
            text += `\n\n=== Edge Extension Analysis ===
Extension: ${a.extensionAmount} m each direction

Original endpoints:
  Clusters: ${a.origClusters}
  Avg dist to center: ${(a.origAvgDist * 1000).toFixed(1)} mm

Extended endpoints:
  Clusters: ${a.extClusters}
  Avg dist to center: ${(a.extAvgDist * 1000).toFixed(1)} mm

${a.improvement > 0 ? `✓ ${a.improvement.toFixed(1)}% improvement` : `✗ No improvement`}`;
        }

        statsInfo.textContent = text;
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.edges.length === 0) {
            this.ctx.fillStyle = '#999';
            this.ctx.font = '16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Load a CSV file to visualize edges', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Draw underlying node grid structure
        this.drawUnderlyingGrid();

        // Draw edges
        this.drawEdges();

        // Draw nodes
        if (this.showNodes) {
            this.drawNodes();
        }

        // Draw title
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Edge Viewer - ${this.edges.length} edges`, 10, 20);
    }

    drawGrid() {
        // Light background grid at 10m intervals
        const gridSpacing = 10;
        
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;

        // Vertical lines
        for (let x = Math.floor(this.worldMinX / gridSpacing) * gridSpacing; x <= this.worldMaxX; x += gridSpacing) {
            const pos = this.worldToCanvas(x, this.worldMinY);
            const posEnd = this.worldToCanvas(x, this.worldMaxY);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
            this.ctx.lineTo(posEnd.x, posEnd.y);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = Math.floor(this.worldMinY / gridSpacing) * gridSpacing; y <= this.worldMaxY; y += gridSpacing) {
            const pos = this.worldToCanvas(this.worldMinX, y);
            const posEnd = this.worldToCanvas(this.worldMaxX, y);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
            this.ctx.lineTo(posEnd.x, posEnd.y);
            this.ctx.stroke();
        }
    }

    drawUnderlyingGrid() {
        if (!this.showUnderlyingGrid || this.gridX.length === 0 || this.gridY.length === 0) return;

        // Draw grid lines where nodes actually exist
        this.ctx.strokeStyle = 'rgba(70, 130, 180, 0.25)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);

        // Draw vertical grid lines at detected X positions
        for (const x of this.gridX) {
            const pos = this.worldToCanvas(x, this.worldMinY - 2);
            const posEnd = this.worldToCanvas(x, this.worldMaxY + 2);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
            this.ctx.lineTo(posEnd.x, posEnd.y);
            this.ctx.stroke();
        }

        // Draw horizontal grid lines at detected Y positions
        for (const y of this.gridY) {
            const pos = this.worldToCanvas(this.worldMinX - 2, y);
            const posEnd = this.worldToCanvas(this.worldMaxX + 2, y);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
            this.ctx.lineTo(posEnd.x, posEnd.y);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);

        // Draw grid intersection points (potential node positions)
        this.ctx.fillStyle = 'rgba(70, 130, 180, 0.12)';
        for (const x of this.gridX) {
            for (const y of this.gridY) {
                const pos = this.worldToCanvas(x, y);
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Highlight actual node positions with rings
        this.ctx.strokeStyle = 'rgba(30, 100, 170, 0.5)';
        this.ctx.lineWidth = 2;
        
        for (const node of this.gridNodes) {
            const pos = this.worldToCanvas(node.x, node.y);
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // Draw grid coordinate labels at edges when zoomed in enough
        if (this.zoomLevel >= 1.5) {
            this.ctx.font = '9px sans-serif';
            this.ctx.fillStyle = 'rgba(70, 130, 180, 0.7)';
            this.ctx.textAlign = 'center';
            
            // X labels at bottom
            for (const x of this.gridX) {
                const pos = this.worldToCanvas(x, this.worldMinY);
                this.ctx.fillText(x.toFixed(1), pos.x, pos.y + 12);
            }
            
            // Y labels at left
            this.ctx.textAlign = 'right';
            for (const y of this.gridY) {
                const pos = this.worldToCanvas(this.worldMinX, y);
                this.ctx.fillText(y.toFixed(1), pos.x - 4, pos.y + 3);
            }
        }
    }

    drawEdges() {
        for (const edge of this.edges) {
            // Calculate extended endpoints
            const dx = edge.endX - edge.startX;
            const dy = edge.endY - edge.startY;
            const dz = edge.endZ - edge.startZ;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            // Normalize direction (use 2D for display)
            const length2D = Math.sqrt(dx * dx + dy * dy);
            const nx = length2D > 0 ? dx / length2D : 0;
            const ny = length2D > 0 ? dy / length2D : 0;
            
            // Calculate extended start and end points
            const extStartX = edge.startX - nx * this.extensionAmount;
            const extStartY = edge.startY - ny * this.extensionAmount;
            const extEndX = edge.endX + nx * this.extensionAmount;
            const extEndY = edge.endY + ny * this.extensionAmount;
            
            // Get canvas positions
            const origStartPos = this.worldToCanvas(edge.startX, edge.startY);
            const origEndPos = this.worldToCanvas(edge.endX, edge.endY);
            const extStartPos = this.worldToCanvas(extStartX, extStartY);
            const extEndPos = this.worldToCanvas(extEndX, extEndY);

            // Draw original edge in gray (thinner)
            this.ctx.beginPath();
            this.ctx.moveTo(origStartPos.x, origStartPos.y);
            this.ctx.lineTo(origEndPos.x, origEndPos.y);
            this.ctx.strokeStyle = '#aaaaaa';
            this.ctx.lineWidth = Math.max(1, this.lineWidth - 1);
            this.ctx.stroke();

            // Draw extension portions in color
            if (this.extensionAmount > 0) {
                // Start extension (blue)
                this.ctx.beginPath();
                this.ctx.moveTo(extStartPos.x, extStartPos.y);
                this.ctx.lineTo(origStartPos.x, origStartPos.y);
                this.ctx.strokeStyle = '#0066ff';
                this.ctx.lineWidth = this.lineWidth;
                this.ctx.stroke();
                
                // End extension (red)
                this.ctx.beginPath();
                this.ctx.moveTo(origEndPos.x, origEndPos.y);
                this.ctx.lineTo(extEndPos.x, extEndPos.y);
                this.ctx.strokeStyle = '#ff3300';
                this.ctx.lineWidth = this.lineWidth;
                this.ctx.stroke();
            }

            // Draw label at midpoint
            if (this.showEdgeIds || this.showLengths) {
                const midX = (origStartPos.x + origEndPos.x) / 2;
                const midY = (origStartPos.y + origEndPos.y) / 2;

                this.ctx.font = '10px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                let label = '';
                if (this.showEdgeIds) {
                    label = `${edge.id}`;
                }
                if (this.showLengths) {
                    if (label) label += ': ';
                    label += `${edge.calculatedLength.toFixed(2)}m`;
                }

                // Background for readability
                const metrics = this.ctx.measureText(label);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.fillRect(midX - metrics.width / 2 - 2, midY - 6, metrics.width + 4, 12);

                this.ctx.fillStyle = '#0066cc';
                this.ctx.fillText(label, midX, midY);
            }
        }
    }

    drawNodes() {
        // Collect unique extended endpoints
        const extendedNodes = new Map();
        
        for (const edge of this.edges) {
            // Calculate extended endpoints
            const dx = edge.endX - edge.startX;
            const dy = edge.endY - edge.startY;
            const length2D = Math.sqrt(dx * dx + dy * dy);
            const nx = length2D > 0 ? dx / length2D : 0;
            const ny = length2D > 0 ? dy / length2D : 0;
            
            const extStartX = edge.startX - nx * this.extensionAmount;
            const extStartY = edge.startY - ny * this.extensionAmount;
            const extEndX = edge.endX + nx * this.extensionAmount;
            const extEndY = edge.endY + ny * this.extensionAmount;
            
            // Use rounded keys for clustering visualization
            const precision = 2; // Round to 2 decimal places for grouping
            const startKey = `${extStartX.toFixed(precision)},${extStartY.toFixed(precision)}`;
            const endKey = `${extEndX.toFixed(precision)},${extEndY.toFixed(precision)}`;
            
            if (!extendedNodes.has(startKey)) {
                extendedNodes.set(startKey, { x: extStartX, y: extStartY, type: 'start', count: 0 });
            }
            extendedNodes.get(startKey).count++;
            
            if (!extendedNodes.has(endKey)) {
                extendedNodes.set(endKey, { x: extEndX, y: extEndY, type: 'end', count: 0 });
            }
            extendedNodes.get(endKey).count++;
        }

        // Draw extended endpoint nodes
        for (const [key, node] of extendedNodes) {
            const pos = this.worldToCanvas(node.x, node.y);
            
            // Size based on how many edges meet here
            const size = this.nodeSize + Math.min(node.count - 1, 5);
            
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            
            // Color: green if multiple edges meet, otherwise blue/red based on type
            if (node.count > 1) {
                this.ctx.fillStyle = '#00cc00'; // Green for convergence
            } else {
                this.ctx.fillStyle = node.type === 'start' ? '#0066ff' : '#ff3300';
            }
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Show count if > 1
            if (node.count > 1) {
                this.ctx.font = 'bold 9px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(node.count.toString(), pos.x, pos.y);
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.edgeViewer = new EdgeViewer();
});


