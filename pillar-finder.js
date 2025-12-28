// Pillar Center Finder
// Clusters nearby XY points to find pillar center locations

class PillarFinder {
    constructor() {
        this.canvas = document.getElementById('pillarCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Data
        this.rawPoints = [];  // All XY points from CSV
        this.clusters = [];   // Grouped points
        this.centroids = [];  // Calculated pillar centers

        // Settings
        this.clusterRadius = 1.5;
        this.pointSize = 4;
        this.showRawPoints = true;
        this.showCentroids = true;
        this.showClusterCircles = true;
        this.showLabels = true;

        // Transform
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.worldMinX = 0;
        this.worldMaxX = 0;
        this.worldMinY = 0;
        this.worldMaxY = 0;

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupEventListeners();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.loadDefaultCSV();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.draw();
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => {
            document.getElementById('csvFileInput').click();
        });

        document.getElementById('csvFileInput').addEventListener('change', (e) => {
            this.loadCSVFile(e.target.files[0]);
        });

        document.getElementById('findPillarsBtn').addEventListener('click', () => {
            this.findPillarCenters();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportCentroids();
        });

        document.getElementById('clusterRadius').addEventListener('input', (e) => {
            this.clusterRadius = parseFloat(e.target.value);
            document.getElementById('radiusValue').textContent = this.clusterRadius.toFixed(1);
            if (this.rawPoints.length > 0) {
                this.findPillarCenters();
            }
        });

        document.getElementById('pointSize').addEventListener('input', (e) => {
            this.pointSize = parseInt(e.target.value);
            document.getElementById('pointSizeValue').textContent = this.pointSize;
            this.draw();
        });

        document.getElementById('showRawPoints').addEventListener('change', (e) => {
            this.showRawPoints = e.target.checked;
            this.draw();
        });

        document.getElementById('showCentroids').addEventListener('change', (e) => {
            this.showCentroids = e.target.checked;
            this.draw();
        });

        document.getElementById('showClusterCircles').addEventListener('change', (e) => {
            this.showClusterCircles = e.target.checked;
            this.draw();
        });

        document.getElementById('showLabels').addEventListener('change', (e) => {
            this.showLabels = e.target.checked;
            this.draw();
        });
    }

    async loadDefaultCSV() {
        try {
            const response = await fetch('./data/Dec-27-stephan.csv');
            const text = await response.text();
            this.parseCSV(text);
            this.findPillarCenters();
        } catch (error) {
            console.log('Default CSV not found, please upload a file');
        }
    }

    loadCSVFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.parseCSV(e.target.result);
            this.findPillarCenters();
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        this.rawPoints = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            if (values.length < 7) continue;

            const startX = parseFloat(values[1]);
            const startY = parseFloat(values[2]);
            const startZ = parseFloat(values[3]);
            const endX = parseFloat(values[4]);
            const endY = parseFloat(values[5]);
            const endZ = parseFloat(values[6]);

            // Skip empty rows
            if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) continue;

            // Add both start and end points (using XY only for clustering)
            this.rawPoints.push({ x: startX, y: startY, z: startZ, type: 'start', edgeId: parseInt(values[0]) });
            this.rawPoints.push({ x: endX, y: endY, z: endZ, type: 'end', edgeId: parseInt(values[0]) });
        }

        console.log(`Loaded ${this.rawPoints.length} points from CSV`);
        this.calculateBounds();
        this.draw();
    }

    calculateBounds() {
        if (this.rawPoints.length === 0) return;

        this.worldMinX = Math.min(...this.rawPoints.map(p => p.x));
        this.worldMaxX = Math.max(...this.rawPoints.map(p => p.x));
        this.worldMinY = Math.min(...this.rawPoints.map(p => p.y));
        this.worldMaxY = Math.max(...this.rawPoints.map(p => p.y));

        const worldWidth = this.worldMaxX - this.worldMinX;
        const worldHeight = this.worldMaxY - this.worldMinY;

        const padding = 50;
        const scaleX = (this.canvas.width - 2 * padding) / worldWidth;
        const scaleY = (this.canvas.height - 2 * padding) / worldHeight;
        this.scale = Math.min(scaleX, scaleY);

        this.offsetX = padding + (this.canvas.width - 2 * padding - worldWidth * this.scale) / 2;
        this.offsetY = padding + (this.canvas.height - 2 * padding - worldHeight * this.scale) / 2;
    }

    worldToCanvas(x, y) {
        return {
            x: this.offsetX + (x - this.worldMinX) * this.scale,
            y: this.offsetY + (y - this.worldMinY) * this.scale
        };
    }

    findPillarCenters() {
        if (this.rawPoints.length === 0) {
            document.getElementById('resultsInfo').textContent = 'No data loaded';
            return;
        }

        // Use Union-Find to cluster nearby points
        const n = this.rawPoints.length;
        const parent = new Array(n).fill(0).map((_, i) => i);
        const rank = new Array(n).fill(0);

        const find = (x) => {
            if (parent[x] !== x) {
                parent[x] = find(parent[x]);
            }
            return parent[x];
        };

        const union = (x, y) => {
            const px = find(x);
            const py = find(y);
            if (px === py) return;
            if (rank[px] < rank[py]) {
                parent[px] = py;
            } else if (rank[px] > rank[py]) {
                parent[py] = px;
            } else {
                parent[py] = px;
                rank[px]++;
            }
        };

        // Compare all pairs and union if within radius
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = this.rawPoints[i].x - this.rawPoints[j].x;
                const dy = this.rawPoints[i].y - this.rawPoints[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.clusterRadius) {
                    union(i, j);
                }
            }
        }

        // Group points by cluster
        const clusterMap = new Map();
        for (let i = 0; i < n; i++) {
            const root = find(i);
            if (!clusterMap.has(root)) {
                clusterMap.set(root, []);
            }
            clusterMap.get(root).push(this.rawPoints[i]);
        }

        // Calculate centroids for each cluster
        this.clusters = [];
        this.centroids = [];

        let pillarId = 1;
        for (const [root, points] of clusterMap) {
            const sumX = points.reduce((acc, p) => acc + p.x, 0);
            const sumY = points.reduce((acc, p) => acc + p.y, 0);
            const centroidX = sumX / points.length;
            const centroidY = sumY / points.length;

            // Calculate actual radius of this cluster
            let maxDist = 0;
            for (const p of points) {
                const dist = Math.sqrt((p.x - centroidX) ** 2 + (p.y - centroidY) ** 2);
                maxDist = Math.max(maxDist, dist);
            }

            // Get Z values for this pillar
            const zValues = points.map(p => p.z).filter(z => !isNaN(z));
            const minZ = Math.min(...zValues);
            const maxZ = Math.max(...zValues);

            this.clusters.push({
                id: pillarId,
                points: points,
                centroid: { x: centroidX, y: centroidY },
                radius: maxDist,
                minZ: minZ,
                maxZ: maxZ
            });

            this.centroids.push({
                id: pillarId,
                x: centroidX,
                y: centroidY,
                pointCount: points.length,
                actualRadius: maxDist,
                minZ: minZ,
                maxZ: maxZ
            });

            pillarId++;
        }

        // Sort centroids by position (top-left to bottom-right)
        this.centroids.sort((a, b) => {
            const rowA = Math.round(a.y / 5);
            const rowB = Math.round(b.y / 5);
            if (rowA !== rowB) return rowA - rowB;
            return a.x - b.x;
        });

        // Reassign IDs after sorting
        this.centroids.forEach((c, i) => {
            c.id = i + 1;
        });
        this.clusters.forEach((cluster, i) => {
            cluster.id = i + 1;
        });

        this.updateResultsDisplay();
        this.draw();
    }

    updateResultsDisplay() {
        const info = document.getElementById('resultsInfo');
        
        let text = `Found ${this.centroids.length} pillars from ${this.rawPoints.length} points\n`;
        text += `Cluster radius: ${this.clusterRadius} units\n\n`;
        text += `Pillar Centroids:\n`;
        text += `─────────────────────────────\n`;
        
        for (const c of this.centroids) {
            text += `#${c.id}: (${c.x.toFixed(2)}, ${c.y.toFixed(2)}) - ${c.pointCount} pts, r=${c.actualRadius.toFixed(2)}\n`;
        }

        info.textContent = text;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.rawPoints.length === 0) {
            this.ctx.fillStyle = '#888';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Load CSV data to visualize', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        this.calculateBounds();

        // Draw grid
        this.drawGrid();

        // Draw cluster circles
        if (this.showClusterCircles && this.clusters.length > 0) {
            for (const cluster of this.clusters) {
                const pos = this.worldToCanvas(cluster.centroid.x, cluster.centroid.y);
                const radius = Math.max(cluster.radius, this.clusterRadius) * this.scale;

                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(0, 102, 255, 0.4)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                this.ctx.fillStyle = 'rgba(0, 102, 255, 0.05)';
                this.ctx.fill();
            }
        }

        // Draw raw points
        if (this.showRawPoints) {
            for (const point of this.rawPoints) {
                const pos = this.worldToCanvas(point.x, point.y);
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, this.pointSize, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                this.ctx.fill();
            }
        }

        // Draw centroids
        if (this.showCentroids && this.centroids.length > 0) {
            for (const centroid of this.centroids) {
                const pos = this.worldToCanvas(centroid.x, centroid.y);

                // Draw centroid marker
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, this.pointSize + 4, 0, Math.PI * 2);
                this.ctx.fillStyle = '#00aa00';
                this.ctx.fill();
                this.ctx.strokeStyle = '#006600';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // Draw crosshair
                this.ctx.beginPath();
                this.ctx.moveTo(pos.x - 8, pos.y);
                this.ctx.lineTo(pos.x + 8, pos.y);
                this.ctx.moveTo(pos.x, pos.y - 8);
                this.ctx.lineTo(pos.x, pos.y + 8);
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // Draw label
                if (this.showLabels) {
                    this.ctx.fillStyle = '#000';
                    this.ctx.font = 'bold 12px Arial';
                    this.ctx.textAlign = 'left';
                    this.ctx.textBaseline = 'bottom';
                    this.ctx.fillText(`P${centroid.id} (${centroid.pointCount} pts)`, pos.x + 10, pos.y - 5);
                    
                    this.ctx.font = '10px Arial';
                    this.ctx.fillStyle = '#666';
                    this.ctx.textBaseline = 'top';
                    this.ctx.fillText(`(${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})`, pos.x + 10, pos.y + 2);
                }
            }
        }

        // Draw title
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`Pillar Centers: ${this.centroids.length} found`, 10, 10);
    }

    drawGrid() {
        const gridSpacing = 10; // 10 unit grid
        
        this.ctx.strokeStyle = '#eee';
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

    exportCentroids() {
        if (this.centroids.length === 0) {
            alert('No centroids to export. Run "Find Pillar Centers" first.');
            return;
        }

        let csv = 'Pillar_ID,Center_X,Center_Y,Point_Count,Actual_Radius,Min_Z,Max_Z\n';
        for (const c of this.centroids) {
            csv += `${c.id},${c.x.toFixed(4)},${c.y.toFixed(4)},${c.pointCount},${c.actualRadius.toFixed(4)},${c.minZ.toFixed(4)},${c.maxZ.toFixed(4)}\n`;
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pillar_centroids.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Exported pillar centroids:');
        console.table(this.centroids);
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    window.pillarFinder = new PillarFinder();
});
