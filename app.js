// Network Visualizer - Fixed to match Python version exactly
// This version replicates the exact visual appearance from the Python Qt application

class NetworkVisualizer {
    constructor() {
        this.canvas = document.getElementById('networkCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Network data
        this.nodes = new Set();
        this.edges = [];
        this.nodeIds = new Map();
        this.edgeIds = new Map();
        this.nextNodeId = 1;

        // Intercom data
        this.intercomNodes = new Set();
        this.intercomEdges = [];
        this.intercomEditMode = false;
        this.edgeFlipMode = false;
        this.yFlipped = false;
        this.nodeDiameterOffset = 0.8; // meters
        this.wattsPerMeter = 12; // watts per meter of LED strip
        this.voltage = 120; // voltage for amp calculation
        this.ledRingLength = 2.5; // meters per LED ring around each node
        this.showEdgeLengths = true;
        this.showNodeTotalLength = false;
        this.showLedRings = true;

        // Visual settings
        this.nodeDiameter = 2;  // Only applies to ArtNet nodes
        this.lineWidth = 0.1;
        this.arrowWidth = 0.3;  // Hardcoded
        this.arrowLengthPercent = 50;
        this.fontSize = 20;  // Default 20

        // Display options
        this.showArtnetNodes = false;
        this.showDataCables = false;
        this.showGrid = true;
        this.showEdges = true;
        this.showNodeIds = true;
        this.showPSUCount = true;
        this.showEdgeCount = true;
        this.selectedLengthGroup = -1;

        // Optimization results
        this.artnetOptimization = null;
        this.lengthGroups = [];

        // Cable routing points
        this.cableEdgePoints = [];       // 8 edge points (2 per stage side)
        this.cableIntermediatePoints = []; // 8 intermediate points (2 each on col 1, col 17, row A, row M)
        this.draggingPoint = null;
        this.dragOffset = { x: 0, y: 0 };
        this.hoveredPoint = null;
        this.wasDragging = false;

        // Grid data
        this.gridPoints = [];
        this.gridColumnsX = [];  // Binned X coordinates
        this.gridRowsY = [];     // Binned Y coordinates
        this.nodeGridLabels = new Map(); // nodeStr → "A2", "B5", etc.

        // Transform for coordinate system
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.worldMinX = 0;
        this.worldMaxX = 0;
        this.worldMinY = 0;
        this.worldMaxY = 0;

        // Initialize
        this.init();
    }

    init() {
        this.setupEventListeners();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Initial canvas setup - wait for DOM to be ready
        setTimeout(() => {
            this.resizeCanvas();
            if (!this._projectLoaded) {
                this.loadDefaultCSV();
            }
        }, 100);
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
        // Only draw if we have data
        if (this.nodes.size > 0) {
            this.drawNetwork();
        }
    }

    setupEventListeners() {
        // Visual controls
        document.getElementById('nodeDiameter').addEventListener('input', (e) => {
            this.nodeDiameter = parseFloat(e.target.value);
            document.getElementById('nodeDiameterValue').textContent = this.nodeDiameter.toFixed(1);
            this.drawNetwork();
        });

        // Line width is now hardcoded to 0.1
        // Arrow width is now hardcoded to 0.3

        document.getElementById('arrowLength').addEventListener('input', (e) => {
            this.arrowLengthPercent = parseInt(e.target.value);
            document.getElementById('arrowLengthValue').textContent = this.arrowLengthPercent;
            this.drawNetwork();
        });

        document.getElementById('fontSize').addEventListener('input', (e) => {
            this.fontSize = parseInt(e.target.value);
            document.getElementById('fontSizeValue').textContent = this.fontSize;
            this.drawNetwork();
        });

        // Display options
        document.getElementById('showArtnetNodes').addEventListener('change', (e) => {
            this.showArtnetNodes = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.showGrid = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('showNodeIds').addEventListener('change', (e) => {
            this.showNodeIds = e.target.checked;
            this.drawNetwork();
        });
        document.getElementById('showPSUCount').addEventListener('change', (e) => {
            this.showPSUCount = e.target.checked;
            this.drawNetwork();
        });
        document.getElementById('showEdgeCount').addEventListener('change', (e) => {
            this.showEdgeCount = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('showDataCables').addEventListener('change', (e) => {
            this.showDataCables = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('lengthFilter').addEventListener('input', (e) => {
            this.selectedLengthGroup = parseInt(e.target.value);
            this.updateLengthFilterLabel();
            this.drawNetwork();
        });

        document.getElementById('nodeDiameterOffset').addEventListener('input', (e) => {
            this.nodeDiameterOffset = parseFloat(e.target.value);
            document.getElementById('nodeDiameterOffsetValue').textContent = this.nodeDiameterOffset.toFixed(2);
            if (this.showEdgeLengths) {
                this.drawNetwork();
            }
        });

        document.getElementById('showEdgeLengths').addEventListener('change', (e) => {
            this.showEdgeLengths = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('showNodeTotalLength').addEventListener('change', (e) => {
            this.showNodeTotalLength = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('showLedRings').addEventListener('change', (e) => {
            this.showLedRings = e.target.checked;
            this.drawNetwork();
        });

        // Buttons
        document.getElementById('loadDataBtn').addEventListener('click', () => {
            document.getElementById('csvFileInput').click();
        });

        document.getElementById('csvFileInput').addEventListener('change', (e) => {
            this.loadCSVFile(e.target.files[0]);
        });

        document.getElementById('optimizeBtn').addEventListener('click', () => {
            this.optimizeArtNet();
        });

        document.getElementById('exportEdgesBtn').addEventListener('click', () => {
            this.exportEdgeData();
        });

        document.getElementById('exportLengthsBtn').addEventListener('click', () => {
            this.exportLengthSummary();
        });

        document.getElementById('printResultsBtn').addEventListener('click', () => {
            this.printNodeResults();
        });

        document.getElementById('saveProjectBtn').addEventListener('click', () => {
            this.saveProject();
        });

        document.getElementById('loadProjectBtn').addEventListener('click', () => {
            document.getElementById('projectFileInput').click();
        });

        document.getElementById('projectFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.loadProject(ev.target.result);
            };
            reader.readAsText(file);
            e.target.value = ''; // allow re-selecting same file
        });

        document.getElementById('flipYToggle').addEventListener('change', (e) => {
            this.yFlipped = e.target.checked;
            console.log(`Y display: ${this.yFlipped ? 'Flipped' : 'Normal'}`);
            this.drawNetwork();
        });

        document.getElementById('exportCablesBtn').addEventListener('click', () => {
            this.exportDataCables();
        });

        document.getElementById('exportPdfBtn').addEventListener('click', () => {
            this.exportPDF();
        });

        document.getElementById('exportSvgBtn').addEventListener('click', () => {
            this.exportSVG();
        });

        document.getElementById('resetCablePointsBtn').addEventListener('click', () => {
            this.cableEdgePoints = [];
            this.cableIntermediatePoints = [];
            this.drawNetwork();
        });

        // Mouse events for tooltips and dragging
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // Click to toggle intercom nodes
        this.canvas.addEventListener('click', (e) => this.handleNodeClick(e));

        // Intercom edit mode toggle
        document.getElementById('intercomEditMode').addEventListener('change', (e) => {
            this.intercomEditMode = e.target.checked;
            this.canvas.style.cursor = this.intercomEditMode ? 'crosshair' : 'default';
        });

        // Edge flip mode toggle
        document.getElementById('edgeFlipMode').addEventListener('change', (e) => {
            this.edgeFlipMode = e.target.checked;
            document.getElementById('edgeFlipHelp').style.display = this.edgeFlipMode ? 'block' : 'none';
            if (this.edgeFlipMode) {
                this.canvas.style.cursor = 'pointer';
            } else if (!this.intercomEditMode) {
                this.canvas.style.cursor = 'default';
            }
        });

        // Clear all intercoms button
        document.getElementById('clearIntercomsBtn').addEventListener('click', () => {
            this.intercomNodes.clear();
            this.intercomEdges = [];
            this.updateIntercomInfo();
            // Don't re-optimize - preserve manual edge direction changes
            this.drawNetwork();
        });
    }

    updateIntercomInfo() {
        const info = document.getElementById('intercomInfo');
        const count = this.intercomNodes.size;
        const edgeCount = this.intercomEdges.length;
        info.textContent = `Intercoms: ${count} nodes, ${edgeCount} edges`;
    }

    handleNodeClick(e) {
        // Prevent click actions after a drag operation
        if (this.wasDragging) {
            this.wasDragging = false;
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Handle edge flip mode
        if (this.edgeFlipMode && this.artnetOptimization) {
            this.handleEdgeFlipClick(x, y);
            return;
        }

        // Only handle node clicks in intercom edit mode
        if (!this.intercomEditMode) return;

        // Find clicked node
        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);
            const radius = 1.0 * this.scale; // Click radius
            
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            if (dist <= radius * 2) { // Generous click area
                // Toggle intercom status
                if (this.intercomNodes.has(nodeStr)) {
                    this.intercomNodes.delete(nodeStr);
                    // Remove from intercom edges
                    this.intercomEdges = this.intercomEdges.filter(edge => 
                        edge.start !== nodeStr && edge.end !== nodeStr
                    );
                    console.log(`Removed intercom: ${nodeStr}`);
                } else {
                    this.intercomNodes.add(nodeStr);
                    // Add edges that connect to this node as intercom edges
                    for (const edge of this.edges) {
                        if ((edge.start === nodeStr || edge.end === nodeStr) && 
                            !this.intercomEdges.includes(edge)) {
                            this.intercomEdges.push(edge);
                        }
                    }
                    console.log(`Added intercom: ${nodeStr}`);
                }
                
                // Update info display
                this.updateIntercomInfo();
                
                // Don't re-optimize - preserve manual edge direction changes
                this.drawNetwork();
                return;
            }
        }
    }

    handleEdgeFlipClick(canvasX, canvasY) {
        // Find edge that is close to the click (check distance to edge line)
        const clickThreshold = 15; // pixels
        let closestEdge = null;
        let closestDist = Infinity;

        console.log(`Edge flip click at canvas (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)})`);

        for (const edge of this.edges) {
            const dir = this.artnetOptimization.edgeDirections.get(edge);
            if (!dir) continue;

            // Get both endpoints in canvas coordinates
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const startPos = this.worldToCanvas(start.x, start.y);
            const endPos = this.worldToCanvas(end.x, end.y);

            // Calculate distance from click to edge line segment
            const dist = this.pointToLineDistance(canvasX, canvasY, startPos.x, startPos.y, endPos.x, endPos.y);

            if (dist < closestDist) {
                closestDist = dist;
                closestEdge = edge;
            }
        }

        console.log(`Closest edge: ${closestEdge ? closestEdge.id : 'none'}, distance: ${closestDist.toFixed(1)}px`);

        if (closestEdge && closestDist <= clickThreshold) {
            this.flipEdgeDirection(closestEdge);
        } else {
            console.log(`No edge within ${clickThreshold}px threshold`);
        }
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        // Calculate perpendicular distance from point to line segment
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        
        if (lenSq === 0) {
            // Line segment is a point
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }

        // Project point onto line, clamped to segment
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }

    flipEdgeDirection(edge) {
        const dir = this.artnetOptimization.edgeDirections.get(edge);
        if (!dir) return;

        const oldStart = dir.start;
        const oldEnd = dir.end;
        const oldStartY = this.parseNode(oldStart).y;
        const newStartY = this.parseNode(oldEnd).y;

        // Flip the direction
        this.artnetOptimization.edgeDirections.set(edge, {
            start: oldEnd,
            end: oldStart
        });

        // Update row power
        const rowPower = this.artnetOptimization.rowPower;
        rowPower.set(oldStartY, (rowPower.get(oldStartY) || 1) - 1);
        rowPower.set(newStartY, (rowPower.get(newStartY) || 0) + 1);

        // Update node output counts
        const outputs = this.artnetOptimization.artnetOutputCounts;
        if (outputs) {
            outputs.set(oldStart, (outputs.get(oldStart) || 1) - 1);
            outputs.set(oldEnd, (outputs.get(oldEnd) || 0) + 1);
        }

        // Update artnetNodes list based on output counts
        // A node is a smart node if it has > 0 outputs
        const artnetNodes = this.artnetOptimization.artnetNodes;
        
        // Check if oldStart should be removed (now has 0 outputs)
        const oldStartOutputs = outputs.get(oldStart) || 0;
        if (oldStartOutputs <= 0) {
            const idx = artnetNodes.indexOf(oldStart);
            if (idx !== -1) {
                artnetNodes.splice(idx, 1);
                console.log(`Node ${this.getNodeLabel(oldStart)} is no longer a smart node (0 outputs)`);
            }
        }

        // Check if oldEnd should be added (now has outputs)
        const oldEndOutputs = outputs.get(oldEnd) || 0;
        if (oldEndOutputs > 0 && !artnetNodes.includes(oldEnd)) {
            artnetNodes.push(oldEnd);
            console.log(`Node ${this.getNodeLabel(oldEnd)} is now a smart node (${oldEndOutputs} outputs)`);
        }

        const edgeWatts = this.calculateEdgePower(edge);
        console.log(`Flipped edge ${edge.id}: ${oldStart} → ${oldEnd} becomes ${oldEnd} → ${oldStart}`);
        console.log(`Edge power: ${edgeWatts.toFixed(1)}W moved from row Y=${oldStartY.toFixed(1)} to Y=${newStartY.toFixed(1)}`);
        console.log(`Smart nodes: ${artnetNodes.length}`);

        // Update display
        this.updateArtNetInfo();
        this.drawNetwork();
    }

    async loadDefaultCSV() {
        try {
            const response = await fetch('./data/Dec-29-edge_data_export-snapped.csv');
            if (!response.ok) {
                console.log('Default CSV not found (HTTP ' + response.status + '), please upload a file');
                return;
            }
            const text = await response.text();
            console.log('Loaded default CSV, parsing...');
            this.parseCSV(text);
        } catch (error) {
            console.log('Default CSV not found, please upload a file', error);
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
        this.lastCSVText = csvText;
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Find column indices dynamically
        const idIdx = headers.findIndex(h => h === 'id');
        const startXIdx = headers.findIndex(h => h === 'start_x');
        const startYIdx = headers.findIndex(h => h === 'start_y');
        const startZIdx = headers.findIndex(h => h === 'start_z');
        const endXIdx = headers.findIndex(h => h === 'end_x');
        const endYIdx = headers.findIndex(h => h === 'end_y');
        const endZIdx = headers.findIndex(h => h === 'end_z');
        const typeIdx = headers.findIndex(h => h === 'type');
        const flowStartNodeIdx = headers.findIndex(h => h === 'data_flow_start_node_id');
        const flowEndNodeIdx = headers.findIndex(h => h === 'data_flow_end_node_id');

        console.log('CSV column indices:', { idIdx, startXIdx, startYIdx, startZIdx, endXIdx, endYIdx, endZIdx, typeIdx, flowStartNodeIdx, flowEndNodeIdx });
        
        // Track intercom node IDs from CSV (if present)
        const intercomNodeIds = new Set();
        
        // Track edge flow directions from CSV for restoration
        const csvEdgeFlows = new Map(); // edgeId -> { flowStartNodeId, flowEndNodeId }

        // Clear existing data
        this.nodes.clear();
        this.edges = [];
        this.intercomNodes.clear();
        this.intercomEdges = [];
        this.edgeIds.clear();
        this.nodeIds.clear();
        this.nextNodeId = 1;
        this.gridPoints = [];
        this.gridColumnsX = [];
        this.gridRowsY = [];
        this.cableEdgePoints = [];
        this.cableIntermediatePoints = [];
        this.nodeGridLabels = new Map();

        // Parse edges
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            if (values.length < 7) continue;

            const edgeId = idIdx >= 0 ? parseInt(values[idIdx]) : i;
            const startX = parseFloat(values[startXIdx >= 0 ? startXIdx : 1]);
            const startY = parseFloat(values[startYIdx >= 0 ? startYIdx : 2]);
            const startZ = parseFloat(values[startZIdx >= 0 ? startZIdx : 3]);
            const endX = parseFloat(values[endXIdx >= 0 ? endXIdx : 4]);
            const endY = parseFloat(values[endYIdx >= 0 ? endYIdx : 5]);
            const endZ = parseFloat(values[endZIdx >= 0 ? endZIdx : 6]);
            const edgeType = typeIdx >= 0 ? values[typeIdx].trim() : 'Normal';

            if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) continue;

            const startNode = `${startX},${startY},${startZ}`;
            const endNode = `${endX},${endY},${endZ}`;

            this.nodes.add(startNode);
            this.nodes.add(endNode);

            const edge = { start: startNode, end: endNode };
            this.edges.push(edge);
            this.edgeIds.set(edge, edgeId);

            // Track intercom edges based on Type column
            if (edgeType.toLowerCase() === 'intercom') {
                this.intercomEdges.push(edge);
                // If CSV has Data_Flow_End_Node_ID, use that to identify the intercom node ID
                if (flowEndNodeIdx >= 0) {
                    const intercomNodeId = parseInt(values[flowEndNodeIdx]);
                    if (!isNaN(intercomNodeId)) {
                        intercomNodeIds.add(intercomNodeId);
                    }
                }
            }
            
            // Store edge flow direction from CSV for later restoration
            if (flowStartNodeIdx >= 0 && flowEndNodeIdx >= 0) {
                const flowStartId = parseInt(values[flowStartNodeIdx]);
                const flowEndId = parseInt(values[flowEndNodeIdx]);
                if (!isNaN(flowStartId) && !isNaN(flowEndId)) {
                    csvEdgeFlows.set(edgeId, { flowStartId, flowEndId });
                }
            }

            // Assign node IDs
            if (!this.nodeIds.has(startNode)) {
                this.nodeIds.set(startNode, this.nextNodeId++);
            }
            if (!this.nodeIds.has(endNode)) {
                this.nodeIds.set(endNode, this.nextNodeId++);
            }
        }

        // Calculate grid points from unique start_X and start_Y (excluding intercom)
        const allX = new Set();
        const allY = new Set();

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            if (values.length < 7) continue;

            const edgeType = typeIdx >= 0 ? values[typeIdx].trim() : 'Normal';
            if (edgeType.toLowerCase() !== 'intercom') {
                const x = parseFloat(values[startXIdx >= 0 ? startXIdx : 1]);
                const y = parseFloat(values[startYIdx >= 0 ? startYIdx : 2]);
                if (!isNaN(x) && !isNaN(y)) {
                    allX.add(x);
                    allY.add(y);
                }
            }
        }

        // Bin coordinates with 0.25m tolerance
        const gridTolerance = 0.25;
        
        const binCoordinates = (coords) => {
            const sorted = Array.from(coords).sort((a, b) => a - b);
            const binned = [];
            
            for (const coord of sorted) {
                // Check if this coordinate is close to an existing bin
                let foundBin = false;
                for (let i = 0; i < binned.length; i++) {
                    if (Math.abs(binned[i].center - coord) < gridTolerance) {
                        // Add to existing bin and recalculate center
                        binned[i].values.push(coord);
                        binned[i].center = binned[i].values.reduce((a, b) => a + b, 0) / binned[i].values.length;
                        foundBin = true;
                        break;
                    }
                }
                if (!foundBin) {
                    binned.push({ center: coord, values: [coord] });
                }
            }
            
            return binned.map(b => b.center).sort((a, b) => a - b);
        };
        
        // Create grid from binned coordinates
        const sortedX = binCoordinates(allX);
        const sortedY = binCoordinates(allY);
        
        // Store binned coordinates for labels
        this.gridColumnsX = sortedX;
        this.gridRowsY = sortedY;
        
        console.log(`Grid binning: ${allX.size} unique X → ${sortedX.length} columns, ${allY.size} unique Y → ${sortedY.length} rows (tolerance: ${gridTolerance}m)`);

        for (const y of sortedY) {
            for (const x of sortedX) {
                this.gridPoints.push({ x, y });
            }
        }

        // Compute grid labels (e.g. "A2") for every node
        this.nodeGridLabels = new Map();
        const gridTol = 0.5; // tolerance for matching node to grid position
        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            // Find closest column
            let colIdx = -1, minColDist = Infinity;
            for (let i = 0; i < sortedX.length; i++) {
                const d = Math.abs(node.x - sortedX[i]);
                if (d < minColDist) { minColDist = d; colIdx = i; }
            }
            // Find closest row
            let rowIdx = -1, minRowDist = Infinity;
            for (let i = 0; i < sortedY.length; i++) {
                const d = Math.abs(node.y - sortedY[i]);
                if (d < minRowDist) { minRowDist = d; rowIdx = i; }
            }
            if (minColDist < gridTol && minRowDist < gridTol) {
                const flippedRowIdx = sortedY.length - 1 - rowIdx;
                const rowLetter = flippedRowIdx < 26 ? String.fromCharCode(65 + flippedRowIdx) : 'A' + String.fromCharCode(65 + flippedRowIdx - 26);
                const colNumber = sortedX.length - colIdx;
                this.nodeGridLabels.set(nodeStr, `${rowLetter}${colNumber}`);
            } else {
                // Off-grid node: fall back to numeric ID
                this.nodeGridLabels.set(nodeStr, `#${this.nodeIds.get(nodeStr)}`);
            }
        }

        // Identify intercom nodes from CSV
        // If CSV has Data_Flow_End_Node_ID column, use those IDs directly
        // Otherwise fall back to using end coordinates of intercom edges
        this.intercomNodes = new Set();
        
        if (intercomNodeIds.size > 0) {
            // Use node IDs from CSV - find nodes by their assigned ID
            for (const [nodeStr, nodeId] of this.nodeIds) {
                if (intercomNodeIds.has(nodeId)) {
                    this.intercomNodes.add(nodeStr);
                }
            }
            console.log(`Found ${this.intercomEdges.length} intercom edges, ${this.intercomNodes.size} intercom nodes from CSV (using Data_Flow_End_Node_ID)`);
            console.log('Intercom node IDs:', Array.from(intercomNodeIds).sort((a,b) => a-b).join(', '));
        } else {
            // Fallback: use end coordinates of intercom edges
            for (const edge of this.intercomEdges) {
                this.intercomNodes.add(edge.end);
            }
            console.log(`Found ${this.intercomEdges.length} intercom edges, ${this.intercomNodes.size} intercom nodes from CSV (using end coordinates)`);
        }

        console.log(`Loaded ${this.nodes.size} nodes and ${this.edges.length} edges`);
        console.log(`Grid: ${sortedX.length}×${sortedY.length} = ${this.gridPoints.length} points`);
        
        // Debug: Show all unique Y coordinates (rows) and their spacing
        console.log('=== GRID ROW ANALYSIS ===');
        for (let i = 0; i < sortedY.length; i++) {
            const spacing = i > 0 ? (sortedY[i] - sortedY[i-1]).toFixed(3) : '-';
            const row = String.fromCharCode(65 + i); // A, B, C...
            console.log(`Row ${row}: Y=${sortedY[i].toFixed(3)} (spacing: ${spacing})`);
        }
        
        // Debug: Show all unique X coordinates (columns) and their spacing  
        console.log('=== GRID COLUMN ANALYSIS ===');
        for (let i = 0; i < sortedX.length; i++) {
            const spacing = i > 0 ? (sortedX[i] - sortedX[i-1]).toFixed(3) : '-';
            console.log(`Col ${i+1}: X=${sortedX[i].toFixed(3)} (spacing: ${spacing})`);
        }

        // Restore edge directions from CSV if present
        if (csvEdgeFlows.size > 0) {
            this.restoreEdgeDirectionsFromCSV(csvEdgeFlows);
        }

        this.calculateLengthGroups();
        this.updateNetworkInfo();
        this.updateIntercomInfo();
        
        // Ensure canvas is properly sized and draw after a small delay
        // to allow the DOM to fully render
        setTimeout(() => {
            const container = this.canvas.parentElement;
            if (container) {
                this.canvas.width = container.clientWidth;
                this.canvas.height = container.clientHeight;
            }
            this.drawNetwork();
        }, 50);
    }

    restoreEdgeDirectionsFromCSV(csvEdgeFlows) {
        // Build reverse lookup: nodeId -> nodeStr
        const nodeIdToStr = new Map();
        for (const [nodeStr, nodeId] of this.nodeIds.entries()) {
            nodeIdToStr.set(nodeId, nodeStr);
        }

        // Create edge directions map and track smart nodes
        const edgeDirections = new Map();
        const artnetOutputCounts = new Map();
        const rowPower = new Map();
        const artnetNodesSet = new Set();

        for (const edge of this.edges) {
            const edgeId = this.edgeIds.get(edge);
            const flowData = csvEdgeFlows.get(edgeId);
            
            if (flowData) {
                const dataStartStr = nodeIdToStr.get(flowData.flowStartId);
                const dataEndStr = nodeIdToStr.get(flowData.flowEndId);
                
                if (dataStartStr && dataEndStr) {
                    edgeDirections.set(edge, { start: dataStartStr, end: dataEndStr });
                    
                    // Count outputs per node
                    artnetOutputCounts.set(dataStartStr, (artnetOutputCounts.get(dataStartStr) || 0) + 1);
                    
                    // Track row power
                    const startY = this.parseNode(dataStartStr).y;
                    rowPower.set(startY, (rowPower.get(startY) || 0) + 1);
                    
                    // Mark as smart node
                    artnetNodesSet.add(dataStartStr);
                }
            }
        }

        // Assign default direction for edges without flow data in CSV
        for (const edge of this.edges) {
            if (!edgeDirections.has(edge)) {
                edgeDirections.set(edge, { start: edge.start, end: edge.end });
            }
        }

        // Build artnetNodes array
        const artnetNodes = Array.from(artnetNodesSet);

        // Calculate end nodes (nodes that only receive data, not send)
        const endNodesSet = new Set();
        for (const edge of this.edges) {
            const dir = edgeDirections.get(edge);
            if (dir) {
                // End node is the data destination
                if (!artnetNodesSet.has(dir.end)) {
                    endNodesSet.add(dir.end);
                }
            }
        }

        // Create artnetOptimization structure
        this.artnetOptimization = {
            artnetNodes: artnetNodes,
            endNodes: Array.from(endNodesSet),
            edgeDirections: edgeDirections,
            artnetOutputCounts: artnetOutputCounts,
            rowPower: rowPower,
            rowViolations: [],
            directionViolations: []
        };

        console.log(`Restored edge directions from CSV: ${edgeDirections.size} edges, ${artnetNodes.length} smart nodes`);
        
        // Show smart nodes checkbox
        this.showArtnetNodes = true;
        document.getElementById('showArtnetNodes').checked = true;
    }

    getNodeLabel(nodeStr) {
        return this.nodeGridLabels.get(nodeStr) || `#${this.nodeIds.get(nodeStr) || '?'}`;
    }

    parseNode(nodeStr) {
        const [x, y, z] = nodeStr.split(',').map(parseFloat);
        return { x, y, z };
    }

    calculateDistance(node1Str, node2Str) {
        const n1 = this.parseNode(node1Str);
        const n2 = this.parseNode(node2Str);
        return Math.sqrt(
            Math.pow(n2.x - n1.x, 2) +
            Math.pow(n2.y - n1.y, 2) +
            Math.pow(n2.z - n1.z, 2)
        );
    }

    calculateEdgeLength(edge) {
        return this.calculateDistance(edge.start, edge.end);
    }

    calculateEdgePower(edge) {
        // Calculate power in watts for an edge (adjusted length * watts per meter)
        const length = this.calculateEdgeLength(edge);
        const adjustedLength = Math.max(0, length - this.nodeDiameterOffset);
        return adjustedLength * this.wattsPerMeter;
    }

    calculateLengthGroups() {
        const lengthCounts = new Map();

        for (const edge of this.edges) {
            const length = this.calculateEdgeLength(edge);
            const rounded = Math.round(length * 100) / 100;
            lengthCounts.set(rounded, (lengthCounts.get(rounded) || 0) + 1);
        }

        this.lengthGroups = Array.from(lengthCounts.entries())
            .map(([length, count]) => ({ length, count }))
            .sort((a, b) => a.length - b.length);

        const slider = document.getElementById('lengthFilter');
        slider.max = this.lengthGroups.length - 1;

        console.log(`Found ${this.lengthGroups.length} unique edge lengths`);
    }

    updateLengthFilterLabel() {
        const label = document.getElementById('lengthFilterLabel');
        if (this.selectedLengthGroup === -1) {
            label.textContent = `All (${this.edges.length})`;
        } else if (this.selectedLengthGroup >= 0 && this.selectedLengthGroup < this.lengthGroups.length) {
            const group = this.lengthGroups[this.selectedLengthGroup];
            label.textContent = `${group.length.toFixed(2)}m (${group.count})`;
        }
    }

    updateNetworkInfo() {
        // Now combined with updateArtNetInfo()
        this.updateArtNetInfo();
    }

    // Coordinate transformation functions
    worldToCanvas(worldX, worldY) {
        const x = (worldX - this.worldMinX) * this.scale + this.offsetX;
        let y;
        if (this.yFlipped) {
            // Flip Y: map worldMaxY to top, worldMinY to bottom
            y = (this.worldMaxY - worldY) * this.scale + this.offsetY;
        } else {
            y = (worldY - this.worldMinY) * this.scale + this.offsetY;
        }
        return { x, y };
    }

    canvasToWorld(canvasX, canvasY) {
        const x = (canvasX - this.offsetX) / this.scale + this.worldMinX;
        let y;
        if (this.yFlipped) {
            y = this.worldMaxY - (canvasY - this.offsetY) / this.scale;
        } else {
            y = (canvasY - this.offsetY) / this.scale + this.worldMinY;
        }
        return { x, y };
    }

    // === DRAWING FUNCTIONS === //

    drawNetwork() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.nodes.size === 0) return;

        // Calculate world bounds
        const nodesArray = Array.from(this.nodes).map(n => this.parseNode(n));
        this.worldMinX = Math.min(...nodesArray.map(n => n.x));
        this.worldMaxX = Math.max(...nodesArray.map(n => n.x));
        this.worldMinY = Math.min(...nodesArray.map(n => n.y));
        this.worldMaxY = Math.max(...nodesArray.map(n => n.y));

        // Calculate scale to fit canvas with padding
        const padding = 80;  // Extra padding for labels
        const worldWidth = this.worldMaxX - this.worldMinX;
        const worldHeight = this.worldMaxY - this.worldMinY;

        const scaleX = (this.canvas.width - 2 * padding) / worldWidth;
        const scaleY = (this.canvas.height - 2 * padding) / worldHeight;
        this.scale = Math.min(scaleX, scaleY);

        // Center the network
        this.offsetX = (this.canvas.width - worldWidth * this.scale) / 2;
        this.offsetY = (this.canvas.height - worldHeight * this.scale) / 2;

        // Initialize cable routing points if not yet done
        if (this.cableEdgePoints.length === 0 && this.gridColumnsX.length > 0) {
            this.initCableRoutingPoints();
        }

        // Draw in correct order (arrows behind labels/numbers)
        if (this.showGrid) this.drawGrid();
        this.drawEdges();
        if (this.showArtnetNodes && this.artnetOptimization) this.drawArrows();
        this.drawEdgeLengthLabels();
        this.drawNodes();
        if (this.showNodeIds) this.drawNodeIds();
        if (this.showArtnetNodes && this.artnetOptimization) this.drawSmartNodeLabels();
        if (this.showNodeTotalLength && this.artnetOptimization) this.drawNodeTotalLengths();
        this.drawWindowFrame();
        this.drawGridLabels();
        if (this.artnetOptimization) this.drawRowPower();
        if (this.showDataCables && this.artnetOptimization) this.drawDataCables();
    }

    drawGrid() {
        // Draw small black circles at each grid point (fixed diameter = 1)
        // Skip points that are intercom nodes
        this.ctx.fillStyle = '#000000';

        let drawnCount = 0;
        for (const gridPoint of this.gridPoints) {
            // Check if this grid point matches an intercom node
            const isIntercomPoint = Array.from(this.intercomNodes).some(nodeStr => {
                const node = this.parseNode(nodeStr);
                const dist = Math.sqrt((node.x - gridPoint.x) ** 2 + (node.y - gridPoint.y) ** 2);
                return dist < 0.5; // Within 0.5m tolerance
            });
            
            if (isIntercomPoint) continue; // Skip intercom grid points
            
            const pos = this.worldToCanvas(gridPoint.x, gridPoint.y);
            const radius = (1.0 / 2) * this.scale;  // Fixed diameter of 1

            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            drawnCount++;
        }

        console.log(`Drew ${drawnCount} grid points (skipped ${this.gridPoints.length - drawnCount} intercom points)`);
    }

    drawEdges() {
        const selectedLength = this.selectedLengthGroup >= 0 && this.selectedLengthGroup < this.lengthGroups.length
            ? this.lengthGroups[this.selectedLengthGroup].length
            : null;

        for (const edge of this.edges) {
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const startPos = this.worldToCanvas(start.x, start.y);
            const endPos = this.worldToCanvas(end.x, end.y);

            const edgeLength = this.calculateEdgeLength(edge);
            const rounded = Math.round(edgeLength * 100) / 100;
            const isHighlighted = selectedLength !== null && rounded === selectedLength;

            if (this.showEdges || isHighlighted) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = isHighlighted ? '#ff0000' : '#666666';
                this.ctx.lineWidth = (isHighlighted ? this.lineWidth * 8 : this.lineWidth) * this.scale;
                this.ctx.moveTo(startPos.x, startPos.y);
                this.ctx.lineTo(endPos.x, endPos.y);
                this.ctx.stroke();
            }

        }
    }

    drawEdgeLengthLabels() {
        if (!this.showEdgeLengths) return;
        
        for (const edge of this.edges) {
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const startPos = this.worldToCanvas(start.x, start.y);
            const endPos = this.worldToCanvas(end.x, end.y);

            const edgeLength = this.calculateEdgeLength(edge);
            const adjustedLength = Math.max(0, edgeLength - this.nodeDiameterOffset);
            
            const midX = (startPos.x + endPos.x) / 2;
            const midY = (startPos.y + endPos.y) / 2;
            
            this.ctx.font = `${Math.max(9, this.fontSize * 0.5)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Background for readability
            const text = adjustedLength.toFixed(2);
            const textWidth = this.ctx.measureText(text).width;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.ctx.fillRect(midX - textWidth/2 - 2, midY - 7, textWidth + 4, 14);
            
            // Text: adjusted length (edge length minus node diameter)
            this.ctx.fillStyle = '#333';
            this.ctx.fillText(text, midX, midY);
        }
    }

    drawNodes() {
        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();

        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);

            const isArtnet = this.showArtnetNodes && artnetSet.has(nodeStr);
            const isIntercom = this.intercomNodes.has(nodeStr);

            // Draw LED ring circle if enabled (1.5x larger than smart node diameter)
            if (this.showLedRings) {
                const ledRingDiameter = this.nodeDiameter * 1.5;
                const ledRingRadius = (ledRingDiameter / 2) * this.scale;
                
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, ledRingRadius, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#ff00ff'; // Magenta for LED ring
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }

            // Use different diameters: 1.0 for normal nodes, nodeDiameter for ArtNet nodes
            const diameter = isArtnet ? this.nodeDiameter : 1.0;
            const radius = (diameter / 2) * this.scale;

            // Draw main circle - blue for intercom, green for artnet, red for regular
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            if (isIntercom) {
                this.ctx.fillStyle = '#0066ff'; // Blue for intercom
            } else if (isArtnet) {
                this.ctx.fillStyle = '#00ff00'; // Green for artnet
            } else {
                this.ctx.fillStyle = '#ff0000'; // Red for regular
            }
            this.ctx.fill();
            this.ctx.strokeStyle = isIntercom ? '#003399' : '#000000';
            this.ctx.lineWidth = isIntercom ? 2 : (isArtnet ? 2 : 1);
            this.ctx.stroke();

            // Draw rectangle for ArtNet nodes
            if (isArtnet) {
                const rectSize = this.nodeDiameter * this.scale;
                this.ctx.strokeStyle = '#0000ff';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(pos.x - rectSize/2, pos.y - rectSize/2, rectSize, rectSize);
            }
        }
    }

    drawNodeIds() {
        // Draw grid-based ID labels for all nodes (smart and normal)
        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();

        this.ctx.font = `${Math.max(8, this.fontSize * 0.5)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';

        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);
            const label = this.getNodeLabel(nodeStr);

            const isArtnet = artnetSet.has(nodeStr);
            const diameter = (this.showArtnetNodes && isArtnet) ? this.nodeDiameter : 1.0;
            const offset = (diameter / 2) * this.scale + 3;

            const tw = this.ctx.measureText(label).width;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(pos.x - tw / 2 - 1, pos.y - offset - 11, tw + 2, 11);
            this.ctx.fillStyle = isArtnet ? '#006600' : '#333333';
            this.ctx.fillText(label, pos.x, pos.y - offset);
        }
    }

    drawSmartNodeLabels() {
        // Draw connection count labels for ArtNet nodes - drawn AFTER arrows so they appear on top
        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();
        const psuMeters = 20;

        for (const nodeStr of this.nodes) {
            const isArtnet = artnetSet.has(nodeStr);
            if (!isArtnet) continue;

            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);
            const rectSize = this.nodeDiameter * this.scale;

            const arrowCount = this.countArrowsFromNode(nodeStr);
            const baseX = pos.x + rectSize/2 + 3;

            this.ctx.font = `${this.fontSize}px Arial`;
            const edgeCountWidth = this.ctx.measureText(arrowCount.toString()).width;

            if (this.showEdgeCount) {
                this.ctx.fillStyle = '#000000';
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(arrowCount.toString(), baseX, pos.y);
            }

            // PSU count always uses the same x position (right of where edge count would be)
            const psuX = baseX + edgeCountWidth + 3;

            // Calculate PSU count: ceil(total adjusted length / 20m)
            let totalLength = 0;
            for (const edge of this.edges) {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && dir.start === nodeStr) {
                    const edgeLength = this.calculateEdgeLength(edge);
                    totalLength += Math.max(0, edgeLength - this.nodeDiameterOffset);
                }
            }
            const psuCount = Math.ceil(totalLength / psuMeters);

            if (this.showPSUCount) {
                this.ctx.font = `${Math.max(10, this.fontSize * 0.75)}px Arial`;
                this.ctx.fillStyle = '#000000';
                this.ctx.fillText(`${psuCount}p`, psuX, pos.y);
            }
        }
    }

    drawNodeTotalLengths() {
        // Draw total adjusted edge length for each smart node (sum of outgoing edges)
        if (!this.artnetOptimization) return;
        
        const artnetSet = new Set(this.artnetOptimization.artnetNodes);
        
        for (const nodeStr of artnetSet) {
            // Calculate total adjusted length of edges starting from this node
            let totalLength = 0;
            let edgeCount = 0;
            
            for (const edge of this.edges) {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && dir.start === nodeStr) {
                    const edgeLength = this.calculateEdgeLength(edge);
                    const adjustedLength = Math.max(0, edgeLength - this.nodeDiameterOffset);
                    totalLength += adjustedLength;
                    edgeCount++;
                }
            }
            
            if (edgeCount === 0) continue;
            
            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);
            
            // Draw total length below the node
            this.ctx.font = `${Math.max(9, this.fontSize * 0.6)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            
            const text = `${totalLength.toFixed(1)}m`;
            const textWidth = this.ctx.measureText(text).width;
            
            // Background for readability
            const yOffset = this.nodeDiameter * this.scale / 2 + 2;
            this.ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
            this.ctx.fillRect(pos.x - textWidth/2 - 2, pos.y + yOffset, textWidth + 4, 12);
            
            // Text
            this.ctx.fillStyle = '#006600';
            this.ctx.fillText(text, pos.x, pos.y + yOffset + 1);
        }
    }

    countArrowsFromNode(nodeStr) {
        // Count how many UNIQUE VISIBLE arrows originate from this node
        // Multiple edges between the same two nodes appear as one arrow
        // This represents power consumption - each data START = 1 amp
        // Maximum allowed = 4 data starts per ArtNet node
        if (!this.artnetOptimization) return 0;

        const nodeId = this.nodeIds.get(nodeStr);
        const uniqueDestinations = new Set(); // Track unique (start, end) pairs
        const matchingEdges = [];

        for (const edge of this.edges) {
            // Use the optimized edge direction to determine the source
            const dir = this.artnetOptimization.edgeDirections.get(edge);
            // IMPORTANT: Only count edges that would actually be drawn as arrows
            // Must have BOTH start AND end defined (matching drawArrows logic)
            if (dir && dir.start && dir.end && dir.start === nodeStr) {
                // Arrow must follow the physical edge
                const dirMatchesEdge = (dir.start === edge.start && dir.end === edge.end) ||
                                      (dir.start === edge.end && dir.end === edge.start);
                if (!dirMatchesEdge) continue;

                // Check if the arrow would actually be drawn (skip zero-length edges in WORLD coordinates)
                const from = this.parseNode(dir.start);
                const to = this.parseNode(dir.end);
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dz = to.z - from.z;
                const worldLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Skip zero-length edges in world space (same as drawArrow does)
                if (worldLength < 0.001) {
                    console.log(`Skipping zero-length edge from node ${nodeId}:`, this.edgeIds.get(edge));
                    continue;
                }
                
                // Only count unique destination pairs (deduplicates overlapping arrows)
                uniqueDestinations.add(dir.end);
                
                matchingEdges.push({
                    edgeId: this.edgeIds.get(edge),
                    from: dir.start,
                    to: dir.end,
                    worldLength: worldLength.toFixed(3)
                });
            }
        }

        const count = uniqueDestinations.size;

        // Enhanced debug logging - show for ALL ArtNet nodes
        if (this.artnetOptimization.artnetNodes.includes(nodeStr)) {
            console.log(`Node ${nodeId}: Counted ${count} unique arrows (${matchingEdges.length} total edges), Edges:`, matchingEdges);
        }

        return count;
    }

    drawArrows() {
        if (!this.showEdges) return;

        this.ctx.strokeStyle = '#ff00ff';  // Magenta
        this.ctx.lineWidth = this.arrowWidth * this.scale;

        const drawnArrows = new Map(); // Track arrows drawn from each node
        let skippedCount = 0;

        for (const edge of this.edges) {
            // Use the optimized edge direction to determine arrow direction
            const dir = this.artnetOptimization.edgeDirections.get(edge);
            if (dir && dir.start && dir.end) {
                // Arrow must follow the physical edge
                const dirMatchesEdge = (dir.start === edge.start && dir.end === edge.end) ||
                                      (dir.start === edge.end && dir.end === edge.start);
                if (!dirMatchesEdge) continue;

                // Check if it will actually be drawn (not zero-length)
                const from = this.parseNode(dir.start);
                const to = this.parseNode(dir.end);
                const fromPos = this.worldToCanvas(from.x, from.y);
                const toPos = this.worldToCanvas(to.x, to.y);
                const dx = toPos.x - fromPos.x;
                const dy = toPos.y - fromPos.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length === 0) {
                    skippedCount++;
                    continue;
                }
                
                this.drawArrow(dir.start, dir.end);
                
                // Track for debugging
                if (!drawnArrows.has(dir.start)) {
                    drawnArrows.set(dir.start, []);
                }
                drawnArrows.get(dir.start).push({
                    edgeId: this.edgeIds.get(edge),
                    to: dir.end
                });
            }
        }

        if (skippedCount > 0) {
            console.log(`Skipped ${skippedCount} zero-length arrows`);
        }

        // Debug logging for ALL ArtNet nodes
        if (this.artnetOptimization) {
            for (const [nodeStr, arrows] of drawnArrows) {
                if (this.artnetOptimization.artnetNodes.includes(nodeStr)) {
                    const nodeId = this.nodeIds.get(nodeStr);
                    console.log(`Node ${nodeId}: Actually drew ${arrows.length} arrows:`, arrows);
                }
            }
        }
    }

    drawArrow(fromStr, toStr) {
        const from = this.parseNode(fromStr);
        const to = this.parseNode(toStr);
        const fromPos = this.worldToCanvas(from.x, from.y);
        const toPos = this.worldToCanvas(to.x, to.y);

        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return;

        const ndx = dx / length;
        const ndy = dy / length;

        // Determine node sizes for start and end
        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();
        const fromDiameter = artnetSet.has(fromStr) ? this.nodeDiameter : 1.0;
        const toDiameter = artnetSet.has(toStr) ? this.nodeDiameter : 1.0;

        const fromRadius = (fromDiameter / 2) * this.scale;
        const toRadius = (toDiameter / 2) * this.scale;

        const arrowStartX = fromPos.x + ndx * fromRadius;
        const arrowStartY = fromPos.y + ndy * fromRadius;

        const availableLength = Math.max(0, length - fromRadius - toRadius);
        const arrowLength = availableLength > 0
            ? Math.min(availableLength, Math.max(8, availableLength * (this.arrowLengthPercent / 100)))
            : 8;
        const arrowEndX = arrowStartX + ndx * arrowLength;
        const arrowEndY = arrowStartY + ndy * arrowLength;

        // Draw arrow line
        this.ctx.beginPath();
        this.ctx.moveTo(arrowStartX, arrowStartY);
        this.ctx.lineTo(arrowEndX, arrowEndY);
        this.ctx.stroke();

        // Draw arrowhead
        const headLength = 10 * (this.scale / 10);  // Scale arrowhead
        const angle = Math.atan2(ndy, ndx);

        this.ctx.beginPath();
        this.ctx.moveTo(arrowEndX, arrowEndY);
        this.ctx.lineTo(
            arrowEndX - headLength * Math.cos(angle - Math.PI / 6),
            arrowEndY - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(arrowEndX, arrowEndY);
        this.ctx.lineTo(
            arrowEndX - headLength * Math.cos(angle + Math.PI / 6),
            arrowEndY - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
    }

    drawWindowFrame() {
        const topLeft = this.worldToCanvas(this.worldMinX, this.worldMinY);
        const bottomRight = this.worldToCanvas(this.worldMaxX, this.worldMaxY);

        // Dashed rectangle (fixed line width, not affected by slider)
        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = 0.3 * this.scale;  // Fixed line width for window frame
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        this.ctx.setLineDash([]);

        // Dimensions
        const width = this.worldMaxX - this.worldMinX;
        const height = this.worldMaxY - this.worldMinY;

        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${this.fontSize * 0.7}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';

        // Top & bottom width - moved further away from rectangle
        this.ctx.fillText(`${width.toFixed(1)}m`, (topLeft.x + bottomRight.x) / 2, topLeft.y - 15);
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${width.toFixed(1)}m`, (topLeft.x + bottomRight.x) / 2, bottomRight.y + 15);

        // Left height (rotated) - moved further away from rectangle
        // Right side omitted to avoid overlap with power amperage values
        this.ctx.save();
        this.ctx.translate(topLeft.x - 25, (topLeft.y + bottomRight.y) / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${height.toFixed(1)}m`, 0, 0);
        this.ctx.restore();

        // "ENTRANCE" label on the right side (rotated vertical)
        this.ctx.save();
        this.ctx.fillStyle = '#333333';
        this.ctx.font = `bold ${this.fontSize}px Arial`;
        this.ctx.translate(bottomRight.x + 10, (topLeft.y + bottomRight.y) / 2);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText('ENTRANCE', 0, 0);
        this.ctx.restore();
    }

    drawGridLabels() {
        // Use binned grid coordinates for labels
        if (this.gridRowsY.length === 0 || this.gridColumnsX.length === 0) return;

        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${this.fontSize * 0.7}px Arial`;

        // Row labels (letters) - A at bottom, ascending upward
        const rowCount = this.gridRowsY.length;
        this.gridRowsY.forEach((y, i) => {
            const letterIdx = rowCount - 1 - i;
            const letter = letterIdx < 26 ? String.fromCharCode(65 + letterIdx) : 'AA';
            const pos = this.worldToCanvas(this.worldMinX, y);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(letter, pos.x - 5, pos.y);
        });

        // Column labels (numbers) - 1 at right, ascending leftward
        const colCount = this.gridColumnsX.length;
        this.gridColumnsX.forEach((x, i) => {
            const pos = this.worldToCanvas(x, this.worldMinY);
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText((colCount - i).toString(), pos.x, pos.y - 5);
        });
    }

    drawRowPower() {
        // Display power consumption per row in Watts (based on edge length * 12W/m)
        // Power = (edge length - node diameter) * wattsPerMeter
        if (!this.artnetOptimization || !this.artnetOptimization.edgeDirections) return;

        const maxAmps = 20;  // Maximum 20 amps per row
        
        this.ctx.font = `${this.fontSize * 0.7}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        // Calculate actual watts per row based on edge lengths
        const rowWatts = new Map();
        const rowNodes = new Map(); // Track unique nodes per row for LED ring power
        
        for (const edge of this.edges) {
            const dir = this.artnetOptimization.edgeDirections.get(edge);
            if (dir && dir.start) {
                const startNode = this.parseNode(dir.start);
                const watts = this.calculateEdgePower(edge);
                
                // Find the closest binned row Y
                let binnedY = startNode.y;
                if (this.gridRowsY && this.gridRowsY.length > 0) {
                    let minDist = Infinity;
                    for (const gridY of this.gridRowsY) {
                        const dist = Math.abs(startNode.y - gridY);
                        if (dist < minDist) {
                            minDist = dist;
                            binnedY = gridY;
                        }
                    }
                }
                
                rowWatts.set(binnedY, (rowWatts.get(binnedY) || 0) + watts);
                
                // Track nodes per row for LED ring power
                if (!rowNodes.has(binnedY)) {
                    rowNodes.set(binnedY, new Set());
                }
                rowNodes.get(binnedY).add(dir.start);
            }
        }
        
        // Add LED ring power for all nodes if enabled (2.5m * 12W/m = 30W per node)
        if (this.showLedRings) {
            const ledRingWatts = this.ledRingLength * this.wattsPerMeter;
            
            // Add power for all nodes (smart, normal, and end nodes) in each row
            for (const nodeStr of this.nodes) {
                const node = this.parseNode(nodeStr);
                
                // Find the closest binned row Y
                let binnedY = node.y;
                if (this.gridRowsY && this.gridRowsY.length > 0) {
                    let minDist = Infinity;
                    for (const gridY of this.gridRowsY) {
                        const dist = Math.abs(node.y - gridY);
                        if (dist < minDist) {
                            minDist = dist;
                            binnedY = gridY;
                        }
                    }
                }
                
                rowWatts.set(binnedY, (rowWatts.get(binnedY) || 0) + ledRingWatts);
            }
        }

        // Draw header at top showing voltage reference
        const headerPos = this.worldToCanvas(this.worldMaxX, this.worldMaxY);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = `bold ${this.fontSize * 0.6}px Arial`;
        this.ctx.fillText(`@${this.voltage}V`, headerPos.x + 15, headerPos.y - 20);
        this.ctx.fillText(`Amps`, headerPos.x + 15, headerPos.y - 8);
        this.ctx.fillText(`Watts`, headerPos.x + 55, headerPos.y - 8);

        this.ctx.font = `${this.fontSize * 0.7}px Arial`;

        for (const [y, watts] of rowWatts.entries()) {
            const pos = this.worldToCanvas(this.worldMaxX, y);
            const amps = watts / this.voltage;

            // Color code: Green (OK), Orange (warning >90%), Red (violation >100%)
            if (amps > maxAmps) {
                this.ctx.fillStyle = '#ff0000';  // Red - over limit
            } else if (amps > maxAmps * 0.9) {
                this.ctx.fillStyle = '#ffa500';  // Orange - warning
            } else {
                this.ctx.fillStyle = '#009600';  // Green - OK
            }

            // Draw amps column
            this.ctx.fillText(`${amps.toFixed(1)}A`, pos.x + 15, pos.y);
            // Draw watts column
            this.ctx.fillText(`${watts.toFixed(0)}W`, pos.x + 55, pos.y);
        }
    }

    initCableRoutingPoints() {
        // 8 edge points: 2 per stage side at 1/3 and 2/3 positions
        const minX = this.worldMinX;
        const maxX = this.worldMaxX;
        const minY = this.worldMinY;
        const maxY = this.worldMaxY;
        const w = maxX - minX;
        const h = maxY - minY;

        this.cableEdgePoints = [
            // Top side (2 points)
            { id: 'et0', label: 'T1', x: minX + w / 3, y: minY, side: 'top', type: 'edge' },
            { id: 'et1', label: 'T2', x: minX + 2 * w / 3, y: minY, side: 'top', type: 'edge' },
            // Bottom side (2 points)
            { id: 'eb0', label: 'B1', x: minX + w / 3, y: maxY, side: 'bottom', type: 'edge' },
            { id: 'eb1', label: 'B2', x: minX + 2 * w / 3, y: maxY, side: 'bottom', type: 'edge' },
            // Left side (2 points)
            { id: 'el0', label: 'L1', x: minX, y: minY + h / 3, side: 'left', type: 'edge' },
            { id: 'el1', label: 'L2', x: minX, y: minY + 2 * h / 3, side: 'left', type: 'edge' },
            // Right side (2 points)
            { id: 'er0', label: 'R1', x: maxX, y: minY + h / 3, side: 'right', type: 'edge' },
            { id: 'er1', label: 'R2', x: maxX, y: minY + 2 * h / 3, side: 'right', type: 'edge' },
        ];

        // 8 intermediate points: 2 each on col 1, col 17 (last col), row A (first row), row M (last row)
        const cols = this.gridColumnsX;
        const rows = this.gridRowsY;
        const col1X = cols[0];                         // Column 1
        const colLastX = cols[cols.length - 1];        // Last column
        const rowAY = rows[0];                         // Row A
        const rowLastY = rows[rows.length - 1];        // Last row

        this.cableIntermediatePoints = [
            // On column 1 (left inner edge)
            { id: 'ic0', x: col1X, y: minY + h / 3, gridLine: 'col1', type: 'intermediate' },
            { id: 'ic1', x: col1X, y: minY + 2 * h / 3, gridLine: 'col1', type: 'intermediate' },
            // On last column (right inner edge)
            { id: 'ic2', x: colLastX, y: minY + h / 3, gridLine: 'colLast', type: 'intermediate' },
            { id: 'ic3', x: colLastX, y: minY + 2 * h / 3, gridLine: 'colLast', type: 'intermediate' },
            // On row A (top inner edge)
            { id: 'ir0', x: minX + w / 3, y: rowAY, gridLine: 'rowA', type: 'intermediate' },
            { id: 'ir1', x: minX + 2 * w / 3, y: rowAY, gridLine: 'rowA', type: 'intermediate' },
            // On last row (bottom inner edge)
            { id: 'ir2', x: minX + w / 3, y: rowLastY, gridLine: 'rowLast', type: 'intermediate' },
            { id: 'ir3', x: minX + 2 * w / 3, y: rowLastY, gridLine: 'rowLast', type: 'intermediate' },
        ];
    }

    computeManhattanCorner(interPt, edgePt) {
        // For top/bottom edge points: H-then-V → corner at (edgePt.x, interPt.y)
        // For left/right edge points: V-then-H → corner at (interPt.x, edgePt.y)
        if (edgePt.side === 'top' || edgePt.side === 'bottom') {
            return { x: edgePt.x, y: interPt.y };
        } else {
            return { x: interPt.x, y: edgePt.y };
        }
    }

    drawCablePointMarkers() {
        // Draw edge points as yellow diamonds with labels
        for (const pt of this.cableEdgePoints) {
            const pos = this.worldToCanvas(pt.x, pt.y);
            const size = 8;
            const isHovered = this.hoveredPoint === pt;
            const isDragging = this.draggingPoint === pt;

            this.ctx.save();
            this.ctx.translate(pos.x, pos.y);
            this.ctx.rotate(Math.PI / 4);

            this.ctx.beginPath();
            this.ctx.rect(-size / 2, -size / 2, size, size);

            if (isDragging) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.lineWidth = 3;
            } else if (isHovered) {
                this.ctx.fillStyle = '#ffffaa';
                this.ctx.strokeStyle = '#ff4500';
                this.ctx.lineWidth = 3;
            } else {
                this.ctx.fillStyle = '#ffff00';
                this.ctx.strokeStyle = '#ff8c00';
                this.ctx.lineWidth = 2;
            }
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();

            // Draw label outside the stage edge, with cable count
            const count = (this.edgePointCableCounts && this.edgePointCableCounts.get(pt.label)) || 0;
            const labelText = `${pt.label} (${count})`;
            this.ctx.font = `bold ${Math.max(9, this.fontSize * 0.5)}px Arial`;
            this.ctx.fillStyle = '#cc6600';
            const labelOffset = 14;
            if (pt.side === 'top') {
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(labelText, pos.x, pos.y - labelOffset);
            } else if (pt.side === 'bottom') {
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(labelText, pos.x, pos.y + labelOffset);
            } else if (pt.side === 'left') {
                this.ctx.textAlign = 'right';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(labelText, pos.x - labelOffset, pos.y);
            } else {
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(labelText, pos.x + labelOffset, pos.y);
            }
        }

        // Draw intermediate points as cyan circles
        for (const pt of this.cableIntermediatePoints) {
            const pos = this.worldToCanvas(pt.x, pt.y);
            const radius = 6;
            const isHovered = this.hoveredPoint === pt;
            const isDragging = this.draggingPoint === pt;

            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

            if (isDragging) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.lineWidth = 3;
            } else if (isHovered) {
                this.ctx.fillStyle = '#aaffff';
                this.ctx.strokeStyle = '#ff4500';
                this.ctx.lineWidth = 3;
            } else {
                this.ctx.fillStyle = '#00ffff';
                this.ctx.strokeStyle = '#ff8c00';
                this.ctx.lineWidth = 2;
            }
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    drawDataCables() {
        if (this.cableEdgePoints.length === 0 || this.cableIntermediatePoints.length === 0) return;

        let totalCableLength = 0;
        this.lastCableData = []; // collect per-cable info for labels + export
        this.edgePointCableCounts = new Map(); // count cables per edge point label

        this.ctx.lineWidth = this.lineWidth * 2 * this.scale;

        let cableIndex = 1; // sequential cable ID

        for (const artnetNodeStr of this.artnetOptimization.artnetNodes) {
            const node = this.parseNode(artnetNodeStr);
            const nodeId = this.nodeIds.get(artnetNodeStr);

            // 1. Find nearest intermediate point (Euclidean)
            let minInterDist = Infinity;
            let nearestInter = this.cableIntermediatePoints[0];

            for (const ip of this.cableIntermediatePoints) {
                const d = Math.sqrt((node.x - ip.x) ** 2 + (node.y - ip.y) ** 2);
                if (d < minInterDist) {
                    minInterDist = d;
                    nearestInter = ip;
                }
            }

            // 2. Find nearest edge point from that intermediate point
            let minEdgeDist = Infinity;
            let nearestEdge = this.cableEdgePoints[0];

            for (const ep of this.cableEdgePoints) {
                const d = Math.sqrt((nearestInter.x - ep.x) ** 2 + (nearestInter.y - ep.y) ** 2);
                if (d < minEdgeDist) {
                    minEdgeDist = d;
                    nearestEdge = ep;
                }
            }

            // 3. Compute Manhattan corner
            const corner = this.computeManhattanCorner(nearestInter, nearestEdge);

            // Convert to canvas coords
            const nodePos = this.worldToCanvas(node.x, node.y);
            const interPos = this.worldToCanvas(nearestInter.x, nearestInter.y);
            const cornerPos = this.worldToCanvas(corner.x, corner.y);
            const edgePos = this.worldToCanvas(nearestEdge.x, nearestEdge.y);

            // Draw straight line: node → intermediate
            this.ctx.strokeStyle = '#ffa500';
            this.ctx.beginPath();
            this.ctx.moveTo(nodePos.x, nodePos.y);
            this.ctx.lineTo(interPos.x, interPos.y);
            this.ctx.stroke();

            // Draw Manhattan L-path: intermediate → corner → edge point
            this.ctx.beginPath();
            this.ctx.moveTo(interPos.x, interPos.y);
            this.ctx.lineTo(cornerPos.x, cornerPos.y);
            this.ctx.lineTo(edgePos.x, edgePos.y);
            this.ctx.stroke();

            // Each cable runs its own full route: straight + Manhattan (not shared)
            const straightDist = Math.sqrt((node.x - nearestInter.x) ** 2 + (node.y - nearestInter.y) ** 2);
            const manhattanDist = Math.abs(nearestInter.x - corner.x) + Math.abs(nearestInter.y - corner.y)
                                + Math.abs(corner.x - nearestEdge.x) + Math.abs(corner.y - nearestEdge.y);
            const cableLength = straightDist + manhattanDist;
            totalCableLength += cableLength;

            // Intermediate label derived from its paired edge point
            const intermediateLabel = nearestEdge.label + '_i';

            // Count cables per edge point
            this.edgePointCableCounts.set(nearestEdge.label,
                (this.edgePointCableCounts.get(nearestEdge.label) || 0) + 1);

            // Store for label drawing pass and export
            this.lastCableData.push({
                cableId: cableIndex,
                nodeId,
                nodeLabel: this.getNodeLabel(artnetNodeStr),
                nodeStr: artnetNodeStr,
                cableLength,
                edgePointId: nearestEdge.id,
                edgePointLabel: nearestEdge.label,
                intermediateLabel,
                // Label at midpoint of straight segment
                labelX: (nodePos.x + interPos.x) / 2,
                labelY: (nodePos.y + interPos.y) / 2,
            });

            cableIndex++;
        }

        // Draw per-cable labels (ID + length) on top of cable lines
        this.ctx.font = `${Math.max(8, this.fontSize * 0.45)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        for (const c of this.lastCableData) {
            const label = `${c.nodeLabel}: ${c.cableLength.toFixed(1)}m`;
            const tw = this.ctx.measureText(label).width;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.ctx.fillRect(c.labelX - tw / 2 - 2, c.labelY - 6, tw + 4, 12);
            this.ctx.fillStyle = '#cc6600';
            this.ctx.fillText(label, c.labelX, c.labelY);
        }

        // Draw all 16 markers on top of cables
        this.drawCablePointMarkers();

        document.getElementById('cableInfo').textContent =
            `Total Cable: ${totalCableLength.toFixed(2)}m (${this.lastCableData.length} cables)`;
    }

    // === MOUSE INTERACTION === //

    handleMouseDown(e) {
        if (!this.showDataCables) return;
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const hitRadius = 12;

        const allPoints = [...this.cableEdgePoints, ...this.cableIntermediatePoints];
        for (const pt of allPoints) {
            const pos = this.worldToCanvas(pt.x, pt.y);
            const dist = Math.sqrt((canvasX - pos.x) ** 2 + (canvasY - pos.y) ** 2);
            if (dist <= hitRadius) {
                this.draggingPoint = pt;
                const world = this.canvasToWorld(canvasX, canvasY);
                this.dragOffset = { x: pt.x - world.x, y: pt.y - world.y };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }
        }
    }

    handleMouseUp(e) {
        if (this.draggingPoint) {
            this.wasDragging = true;
            this.draggingPoint = null;
            this.canvas.style.cursor = this.hoveredPoint ? 'grab' : 'default';
            if (this.intercomEditMode) this.canvas.style.cursor = 'crosshair';
            if (this.edgeFlipMode) this.canvas.style.cursor = 'pointer';
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Handle dragging cable routing points
        if (this.draggingPoint) {
            const world = this.canvasToWorld(canvasX, canvasY);
            this.draggingPoint.x = world.x + this.dragOffset.x;
            this.draggingPoint.y = world.y + this.dragOffset.y;
            this.drawNetwork();
            return;
        }

        // Handle hover detection for cable routing points
        if (this.showDataCables) {
            const hitRadius = 12;
            let foundHover = null;
            const allPoints = [...this.cableEdgePoints, ...this.cableIntermediatePoints];
            for (const pt of allPoints) {
                const pos = this.worldToCanvas(pt.x, pt.y);
                const dist = Math.sqrt((canvasX - pos.x) ** 2 + (canvasY - pos.y) ** 2);
                if (dist <= hitRadius) {
                    foundHover = pt;
                    break;
                }
            }
            if (foundHover !== this.hoveredPoint) {
                this.hoveredPoint = foundHover;
                if (foundHover) {
                    this.canvas.style.cursor = 'grab';
                } else if (!this.intercomEditMode && !this.edgeFlipMode) {
                    this.canvas.style.cursor = 'default';
                }
                this.drawNetwork();
            }
            if (foundHover) return; // Don't show node tooltips when hovering cable points
        }

        // Find closest node for tooltip
        let closestNode = null;
        let minDist = Infinity;

        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();

        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.worldToCanvas(node.x, node.y);
            const dist = Math.sqrt(Math.pow(canvasX - pos.x, 2) + Math.pow(canvasY - pos.y, 2));

            // Use actual node radius + small buffer (10 pixels)
            const isArtnet = this.showArtnetNodes && artnetSet.has(nodeStr);
            const diameter = isArtnet ? this.nodeDiameter : 1.0;
            const radius = (diameter / 2) * this.scale;
            const threshold = radius + 10;  // Node radius + 10 pixel buffer

            if (dist < threshold && dist < minDist) {
                minDist = dist;
                closestNode = nodeStr;
            }
        }

        if (closestNode) {
            this.showTooltip(e.clientX, e.clientY, closestNode);
        } else {
            this.hideTooltip();
        }
    }

    showTooltip(x, y, nodeStr) {
        const node = this.parseNode(nodeStr);
        const label = this.getNodeLabel(nodeStr);
        const arrowCount = this.countArrowsFromNode(nodeStr);

        let totalEdges = 0;
        const edgeIdList = [];
        for (const edge of this.edges) {
            if (edge.start === nodeStr || edge.end === nodeStr) {
                totalEdges++;
                edgeIdList.push(this.edgeIds.get(edge) || '?');
            }
        }

        const isArtnet = this.artnetOptimization && this.artnetOptimization.artnetNodes.includes(nodeStr);
        const isIntercom = this.intercomNodes.has(nodeStr);
        const nodeType = isIntercom ? 'Intercom Node' : (isArtnet ? 'ArtNet Node' : 'Regular Node');

        let text = `Node: ${label}\n`;
        text += `Position: (${node.x.toFixed(2)}, ${node.y.toFixed(2)})\n`;
        text += `Total edges: ${totalEdges}\n`;
        text += `Arrows drawn: ${arrowCount}\n`;
        text += `Edge IDs: ${edgeIdList.slice(0, 5).join(', ')}`;
        if (edgeIdList.length > 5) text += ` (+${edgeIdList.length - 5} more)`;
        text += `\nType: ${nodeType}`;

        const tooltip = document.getElementById('tooltip');
        tooltip.textContent = text;
        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y + 10}px`;
        tooltip.style.display = 'block';
    }

    hideTooltip() {
        document.getElementById('tooltip').style.display = 'none';
    }

    // === OPTIMIZATION === //

    optimizeArtNet() {
        console.log('Starting ArtNet optimization...');

        // Build adjacency list
        const adjacency = new Map();
        for (const node of this.nodes) {
            adjacency.set(node, []);
        }
        for (const edge of this.edges) {
            adjacency.get(edge.start).push(edge.end);
            adjacency.get(edge.end).push(edge.start);
        }

        // Find minimal ArtNet coverage using greedy algorithm
        const uncoveredEdges = new Set(this.edges);
        const artnetNodes = [];

        while (uncoveredEdges.size > 0) {
            let bestNode = null;
            let maxCoverage = 0;

            for (const node of this.nodes) {
                if (artnetNodes.includes(node)) continue;

                let coverage = 0;
                for (const edge of uncoveredEdges) {
                    if (edge.start === node || edge.end === node) {
                        coverage++;
                    }
                }

                if (coverage > maxCoverage) {
                    maxCoverage = coverage;
                    bestNode = node;
                }
            }

            if (!bestNode) break;

            artnetNodes.push(bestNode);

            const toRemove = [];
            for (const edge of uncoveredEdges) {
                if (edge.start === bestNode || edge.end === bestNode) {
                    toRemove.push(edge);
                }
            }
            for (const edge of toRemove) {
                uncoveredEdges.delete(edge);
            }
        }

        // Remove pure intercom nodes from ArtNet nodes
        const artnetSet = new Set(artnetNodes.filter(n => !this.intercomNodes.has(n)));

        // Add nodes that connect to intercom nodes
        for (const edge of this.intercomEdges) {
            if (!this.intercomNodes.has(edge.start)) {
                artnetSet.add(edge.start);
            }
            if (!this.intercomNodes.has(edge.end)) {
                artnetSet.add(edge.end);
            }
        }

        const finalArtnetNodes = Array.from(artnetSet);
        console.log(`ArtNet optimization complete: ${finalArtnetNodes.length} nodes`);

        // Balance edge directions with full optimization
        const edgeDirections = this.balanceEdgeDirections(finalArtnetNodes);

        // Run iterative dual-constraint optimization (1000 iterations max)
        const optimizedResult = this.balanceRowPowerAndPorts(
            finalArtnetNodes,
            edgeDirections.edgeDirections,
            edgeDirections.artnetOutputCounts,
            20,  // max amps per row
            4    // max outputs per node
        );

        // Calculate statistics
        const endNodes = Array.from(this.nodes).filter(n => !finalArtnetNodes.includes(n));
        let maxDistance = 0;
        let totalDistance = 0;

        for (const node of this.nodes) {
            let minDist = Infinity;
            for (const artnetNode of finalArtnetNodes) {
                const dist = this.calculateDistance(node, artnetNode);
                minDist = Math.min(minDist, dist);
            }
            maxDistance = Math.max(maxDistance, minDist);
            totalDistance += minDist;
        }

        const avgDistance = totalDistance / this.nodes.size;

        // Use OPTIMIZED results, not initial results
        this.artnetOptimization = {
            artnetNodes: finalArtnetNodes,
            endNodes: endNodes,
            edgeDirections: optimizedResult.edgeDirections,
            artnetOutputCounts: optimizedResult.nodeOutputs,
            directionViolations: optimizedResult.nodeViolations,
            rowPower: optimizedResult.rowPower,
            rowViolations: optimizedResult.rowViolations,
            maxDistance: maxDistance,
            avgDistance: avgDistance
        };

        this.updateArtNetInfo();
        this.updateNetworkInfo();
        this.drawNetwork();
    }

    balanceEdgeDirections(artnetNodes) {
        // OPTIMIZATION GOAL: Balance amp power usage per row by optimizing edge data directions
        // - Each edge data START consumes power (1 amp per edge)
        // - Arrows point in data direction (from START to END)
        // - Numbers beside smart nodes = count of edge data STARTS attached (max 4 allowed)
        // - We flip edge directions to minimize violations and balance row power consumption

        const artnetSet = new Set(artnetNodes);
        const edgeDirections = new Map();
        const artnetOutputs = new Map();  // Count of data STARTS per ArtNet node (max 4)

        for (const node of artnetNodes) {
            artnetOutputs.set(node, 0);
        }

        // Build node-to-artnet-neighbors map
        const nodeToArtnetNeighbors = new Map();
        for (const edge of this.edges) {
            if (artnetSet.has(edge.start)) {
                if (!nodeToArtnetNeighbors.has(edge.end)) {
                    nodeToArtnetNeighbors.set(edge.end, []);
                }
                if (!nodeToArtnetNeighbors.get(edge.end).includes(edge.start)) {
                    nodeToArtnetNeighbors.get(edge.end).push(edge.start);
                }
            }
            if (artnetSet.has(edge.end)) {
                if (!nodeToArtnetNeighbors.has(edge.start)) {
                    nodeToArtnetNeighbors.set(edge.start, []);
                }
                if (!nodeToArtnetNeighbors.get(edge.start).includes(edge.end)) {
                    nodeToArtnetNeighbors.get(edge.start).push(edge.end);
                }
            }
        }

        // Initial assignment
        for (const edge of this.edges) {
            if (this.intercomEdges.includes(edge)) {
                // Intercom edges: data flows TO the intercom node
                if (this.intercomNodes.has(edge.start)) {
                    edgeDirections.set(edge, { start: edge.end, end: edge.start });
                    // Count this in artnetOutputs if the source is an ArtNet node
                    if (artnetSet.has(edge.end)) {
                        artnetOutputs.set(edge.end, (artnetOutputs.get(edge.end) || 0) + 1);
                    }
                } else if (this.intercomNodes.has(edge.end)) {
                    edgeDirections.set(edge, { start: edge.start, end: edge.end });
                    // Count this in artnetOutputs if the source is an ArtNet node
                    if (artnetSet.has(edge.start)) {
                        artnetOutputs.set(edge.start, (artnetOutputs.get(edge.start) || 0) + 1);
                    }
                } else {
                    edgeDirections.set(edge, { start: null, end: null });
                }
            } else if (artnetSet.has(edge.start) && artnetSet.has(edge.end)) {
                const startOutputs = artnetOutputs.get(edge.start) || 0;
                const endOutputs = artnetOutputs.get(edge.end) || 0;

                if (startOutputs <= endOutputs) {
                    edgeDirections.set(edge, { start: edge.start, end: edge.end });
                    artnetOutputs.set(edge.start, startOutputs + 1);
                } else {
                    edgeDirections.set(edge, { start: edge.end, end: edge.start });
                    artnetOutputs.set(edge.end, endOutputs + 1);
                }
            } else if (artnetSet.has(edge.start)) {
                edgeDirections.set(edge, { start: edge.start, end: edge.end });
                artnetOutputs.set(edge.start, (artnetOutputs.get(edge.start) || 0) + 1);
            } else if (artnetSet.has(edge.end)) {
                edgeDirections.set(edge, { start: edge.end, end: edge.start });
                artnetOutputs.set(edge.end, (artnetOutputs.get(edge.end) || 0) + 1);
            } else {
                // Both endpoints are regular nodes: use edge's natural direction for arrow display
                edgeDirections.set(edge, { start: edge.start, end: edge.end });
            }
        }

        // Calculate row power
        const rowPower = new Map();
        for (const edge of this.edges) {
            const dir = edgeDirections.get(edge);
            if (dir && dir.start) {
                const y = this.parseNode(dir.start).y;
                rowPower.set(y, (rowPower.get(y) || 0) + 1);
            }
        }

        const nodeViolations = Array.from(artnetOutputs.entries())
            .filter(([node, count]) => count > 4);
        const rowViolations = Array.from(rowPower.entries())
            .filter(([y, amps]) => amps > 20);

        console.log(`Edge balancing: ${nodeViolations.length} node violations, ${rowViolations.length} row violations`);

        return {
            edgeDirections: edgeDirections,
            artnetOutputCounts: artnetOutputs,
            violations: nodeViolations,
            rowPower: rowPower,
            rowViolations: rowViolations
        };
    }

    balanceRowPowerAndPorts(artnetNodes, initialEdgeDirections, initialArtnetOutputs, maxAmpsPerRow, maxOutputsPerNode) {
        // DUAL-CONSTRAINT OPTIMIZATION: Balance BOTH row power (≤20A) and node ports (≤4)
        // Three-phase iterative algorithm up to 1000 iterations

        const artnetSet = new Set(artnetNodes);
        const edgeDirections = new Map(initialEdgeDirections);
        const maxIterations = 1000;

        console.log('='.repeat(70));
        console.log(`DUAL-CONSTRAINT OPTIMIZATION: Row Power (≤${maxAmpsPerRow}A) + Node Ports (≤${maxOutputsPerNode})`);
        console.log('='.repeat(70));

        // Helper functions
        const calculateRowPower = () => {
            const rowAmps = new Map();
            for (const edge of this.edges) {
                const dir = edgeDirections.get(edge);
                if (dir && dir.start && artnetSet.has(dir.start)) {
                    const y = this.parseNode(dir.start).y;
                    rowAmps.set(y, (rowAmps.get(y) || 0) + 1);
                }
            }
            return rowAmps;
        };

        const calculateNodeOutputs = () => {
            const nodeOutputs = new Map();
            for (const node of artnetNodes) {
                nodeOutputs.set(node, 0);
            }
            for (const edge of this.edges) {
                const dir = edgeDirections.get(edge);
                if (dir && dir.start && artnetSet.has(dir.start)) {
                    nodeOutputs.set(dir.start, (nodeOutputs.get(dir.start) || 0) + 1);
                }
            }
            return nodeOutputs;
        };

        const getViolations = () => {
            const rowAmps = calculateRowPower();
            const nodeOutputs = calculateNodeOutputs();

            const rowViolations = Array.from(rowAmps.entries())
                .filter(([y, amps]) => amps > maxAmpsPerRow);
            const nodeViolations = Array.from(nodeOutputs.entries())
                .filter(([node, count]) => count > maxOutputsPerNode);

            return { rowViolations, nodeViolations, rowAmps, nodeOutputs };
        };

        // Build node-to-artnet-neighbors map for finding alternative routes
        const nodeToArtnetNeighbors = new Map();
        for (const edge of this.edges) {
            if (artnetSet.has(edge.start)) {
                if (!nodeToArtnetNeighbors.has(edge.end)) {
                    nodeToArtnetNeighbors.set(edge.end, []);
                }
                if (!nodeToArtnetNeighbors.get(edge.end).includes(edge.start)) {
                    nodeToArtnetNeighbors.get(edge.end).push(edge.start);
                }
            }
            if (artnetSet.has(edge.end)) {
                if (!nodeToArtnetNeighbors.has(edge.start)) {
                    nodeToArtnetNeighbors.set(edge.start, []);
                }
                if (!nodeToArtnetNeighbors.get(edge.start).includes(edge.end)) {
                    nodeToArtnetNeighbors.get(edge.start).push(edge.end);
                }
            }
        }

        // Iterative optimization with 3 phases
        let iteration = 0;
        let improvements = 0;
        let phase = 1;
        let bestMaxRow = Infinity;
        let iterationsWithoutMaxImprovement = 0;

        while (iteration < maxIterations) {
            const { rowViolations, nodeViolations, rowAmps, nodeOutputs } = getViolations();

            // Phase transitions
            if (phase === 1 && rowViolations.length === 0 && nodeViolations.length === 0) {
                console.log(`✅ Hard constraints satisfied after ${iteration} iterations!`);
                console.log(`Phase 2: Balancing power across rows (redirections)...`);
                phase = 2;
                bestMaxRow = rowAmps.size > 0 ? Math.max(...Array.from(rowAmps.values())) : Infinity;
                iterationsWithoutMaxImprovement = 0;
                continue;
            } else if (phase === 2 && iterationsWithoutMaxImprovement >= 30) {
                console.log(`Phase 3: Aggressive balancing (edge reversals)...`);
                phase = 3;
                bestMaxRow = rowAmps.size > 0 ? Math.max(...Array.from(rowAmps.values())) : Infinity;
                iterationsWithoutMaxImprovement = 0;
                continue;
            }

            // Progress logging
            if (iteration % 100 === 0 && phase === 1) {
                console.log(`  Iteration ${iteration}: ${rowViolations.length} row violations, ${nodeViolations.length} node violations`);
            } else if (iteration % 100 === 0 && phase >= 2) {
                const maxRow = rowAmps.size > 0 ? Math.max(...Array.from(rowAmps.values())) : 0;
                const avgRow = rowAmps.size > 0 ? Array.from(rowAmps.values()).reduce((a,b) => a+b, 0) / rowAmps.size : 0;
                console.log(`  Iteration ${iteration}: Max row=${maxRow}A, Avg=${avgRow.toFixed(1)}A`);
            }

            // Track if max row power is improving (Phases 2 & 3)
            if (phase >= 2 && rowAmps.size > 0) {
                const currentMaxRow = Math.max(...Array.from(rowAmps.values()));
                if (currentMaxRow < bestMaxRow) {
                    bestMaxRow = currentMaxRow;
                    iterationsWithoutMaxImprovement = 0;
                } else {
                    iterationsWithoutMaxImprovement++;
                }

                const maxWait = phase === 2 ? 30 : 50;
                if (phase === 3 && iterationsWithoutMaxImprovement >= maxWait) {
                    console.log(`  No more improvements possible`);
                    break;
                }
            }

            let madeImprovement = false;

            // PHASE 2: Balance power across rows (reduce peak usage and variance)
            if (phase === 2 && !madeImprovement) {
                if (rowAmps.size > 0) {
                    const avgAmps = Array.from(rowAmps.values()).reduce((a,b) => a+b, 0) / rowAmps.size;
                    const maxRowAmps = Math.max(...Array.from(rowAmps.values()));

                    const sortedByLoad = Array.from(rowAmps.entries()).sort((a, b) => b[1] - a[1]);

                    for (const [highRowY, highAmps] of sortedByLoad) {
                        if (highAmps <= avgAmps && highAmps < maxRowAmps) {
                            continue;
                        }

                        const sortedRows = Array.from(rowAmps.keys()).sort((a, b) => a - b);
                        const rowIdx = sortedRows.indexOf(highRowY);

                        const neighborRows = [];
                        if (rowIdx > 0) neighborRows.push(sortedRows[rowIdx - 1]);
                        if (rowIdx < sortedRows.length - 1) neighborRows.push(sortedRows[rowIdx + 1]);

                        const edgesInRow = this.edges.filter(edge => {
                            const dir = edgeDirections.get(edge);
                            return dir && dir.start && this.parseNode(dir.start).y === highRowY;
                        });

                        for (const edge of edgesInRow) {
                            const dir = edgeDirections.get(edge);
                            const dataStart = dir.start;
                            const dataEnd = dir.end;

                            if (!artnetSet.has(dataStart) || !artnetSet.has(dataEnd)) continue;

                            const targetRow = this.parseNode(dataEnd).y;
                            const targetRowAmps = rowAmps.get(targetRow) || 0;
                            const targetNodeOutputs = nodeOutputs.get(dataEnd) || 0;

                            if (targetRowAmps < maxAmpsPerRow &&
                                targetNodeOutputs < maxOutputsPerNode &&
                                targetRowAmps < highAmps) {

                                edgeDirections.set(edge, { start: dataEnd, end: dataStart });
                                rowAmps.set(highRowY, rowAmps.get(highRowY) - 1);
                                rowAmps.set(targetRow, (rowAmps.get(targetRow) || 0) + 1);
                                nodeOutputs.set(dataStart, nodeOutputs.get(dataStart) - 1);
                                nodeOutputs.set(dataEnd, (nodeOutputs.get(dataEnd) || 0) + 1);
                                improvements++;
                                madeImprovement = true;
                                break;
                            }
                        }

                        if (madeImprovement) break;
                    }
                }
            }

            // PHASE 3: Try direct edge reversals for aggressive balancing
            if (phase === 3 && !madeImprovement) {
                if (rowAmps.size > 0) {
                    const maxRowAmps = Math.max(...Array.from(rowAmps.values()));
                    const sortedByLoad = Array.from(rowAmps.entries()).sort((a, b) => b[1] - a[1]);

                    for (const [highRowY, highAmps] of sortedByLoad) {
                        if (highAmps < maxRowAmps) continue;

                        const edgesFromRow = [];
                        for (const edge of this.edges) {
                            const dir = edgeDirections.get(edge);
                            if (dir && dir.start && this.parseNode(dir.start).y === highRowY) {
                                edgesFromRow.push({ edge, dataStart: dir.start, dataEnd: dir.end });
                            }
                        }

                        for (const { edge, dataStart, dataEnd } of edgesFromRow) {
                            if (!artnetSet.has(dataStart) || !artnetSet.has(dataEnd)) continue;

                            const targetRow = this.parseNode(dataEnd).y;
                            const targetRowAmps = rowAmps.get(targetRow) || 0;
                            const targetNodeOutputs = nodeOutputs.get(dataEnd) || 0;

                            if (targetRowAmps < maxAmpsPerRow &&
                                targetNodeOutputs < maxOutputsPerNode &&
                                targetRowAmps < highAmps) {

                                edgeDirections.set(edge, { start: dataEnd, end: dataStart });
                                rowAmps.set(highRowY, rowAmps.get(highRowY) - 1);
                                rowAmps.set(targetRow, (rowAmps.get(targetRow) || 0) + 1);
                                nodeOutputs.set(dataStart, nodeOutputs.get(dataStart) - 1);
                                nodeOutputs.set(dataEnd, (nodeOutputs.get(dataEnd) || 0) + 1);
                                improvements++;
                                madeImprovement = true;
                                break;
                            }
                        }

                        if (madeImprovement) break;
                    }
                }
            }

            // PHASE 1: Try to fix hard constraint violations
            if (phase === 1 && !madeImprovement) {
                // Fix row violations
                for (const [rowY, amps] of rowViolations) {
                    if (amps <= maxAmpsPerRow) continue;

                    const edgesInRow = this.edges.filter(edge => {
                        const dir = edgeDirections.get(edge);
                        return dir && dir.start && this.parseNode(dir.start).y === rowY;
                    });

                    for (const edge of edgesInRow) {
                        const dir = edgeDirections.get(edge);
                        const dataStart = dir.start;
                        const dataEnd = dir.end;

                        if (!artnetSet.has(dataStart) || !artnetSet.has(dataEnd)) continue;

                        const targetRow = this.parseNode(dataEnd).y;
                        const targetRowAmps = rowAmps.get(targetRow) || 0;
                        const targetNodeOutputs = nodeOutputs.get(dataEnd) || 0;

                        if (targetRowAmps < maxAmpsPerRow &&
                            targetNodeOutputs < maxOutputsPerNode &&
                            targetRowAmps < rowAmps.get(rowY)) {

                            edgeDirections.set(edge, { start: dataEnd, end: dataStart });
                            rowAmps.set(rowY, rowAmps.get(rowY) - 1);
                            rowAmps.set(targetRow, (rowAmps.get(targetRow) || 0) + 1);
                            nodeOutputs.set(dataStart, nodeOutputs.get(dataStart) - 1);
                            nodeOutputs.set(dataEnd, (nodeOutputs.get(dataEnd) || 0) + 1);
                            improvements++;
                            madeImprovement = true;
                            break;
                        }
                    }

                    if (madeImprovement) break;
                }

                // Fix node violations by flipping edges where both endpoints are ArtNet
                if (!madeImprovement) {
                    for (const [node, count] of nodeViolations) {
                        if (count <= maxOutputsPerNode) continue;

                        const nodeEdges = this.edges.filter(edge => {
                            const dir = edgeDirections.get(edge);
                            return dir && dir.start === node;
                        });

                        for (const edge of nodeEdges) {
                            const dir = edgeDirections.get(edge);
                            const dataStart = dir.start;
                            const dataEnd = dir.end;

                            if (!artnetSet.has(dataStart) || !artnetSet.has(dataEnd)) continue;

                            const targetRow = this.parseNode(dataEnd).y;
                            const targetRowAmps = rowAmps.get(targetRow) || 0;
                            const targetNodeOutputs = nodeOutputs.get(dataEnd) || 0;

                            if (targetNodeOutputs < maxOutputsPerNode &&
                                targetRowAmps < maxAmpsPerRow) {

                                edgeDirections.set(edge, { start: dataEnd, end: dataStart });
                                rowAmps.set(this.parseNode(dataStart).y, rowAmps.get(this.parseNode(dataStart).y) - 1);
                                rowAmps.set(targetRow, (rowAmps.get(targetRow) || 0) + 1);
                                nodeOutputs.set(dataStart, nodeOutputs.get(dataStart) - 1);
                                nodeOutputs.set(dataEnd, (nodeOutputs.get(dataEnd) || 0) + 1);
                                improvements++;
                                madeImprovement = true;
                                break;
                            }
                        }

                        if (madeImprovement) break;
                    }
                }
            }

            if (!madeImprovement) {
                if (phase === 1) {
                    console.log(`  Cannot resolve all violations after ${iteration} iterations`);
                    break;
                } else if (phase === 2) {
                    console.log(`  Power distribution balanced after ${iteration} iterations`);
                    break;
                }
            }

            iteration++;
        }

        // Final report
        const final = getViolations();

        console.log('='.repeat(70));
        console.log('DUAL-CONSTRAINT OPTIMIZATION COMPLETE');
        console.log('='.repeat(70));
        console.log(`Iterations: ${iteration}`);
        console.log(`Improvements: ${improvements}`);
        console.log(`\nRow Power:`);
        console.log(`  Max row: ${final.rowAmps.size > 0 ? Math.max(...Array.from(final.rowAmps.values())) : 0}A (limit: ${maxAmpsPerRow}A)`);
        console.log(`  Violations: ${final.rowViolations.length} rows exceed limit`);
        if (final.rowViolations.length > 0) {
            final.rowViolations.slice(0, 5).forEach(([y, amps]) => {
                console.log(`    Y=${y.toFixed(1)}: ${amps}A (excess: ${amps - maxAmpsPerRow}A)`);
            });
        }
        console.log(`\nNode Ports:`);
        console.log(`  Max outputs: ${final.nodeOutputs.size > 0 ? Math.max(...Array.from(final.nodeOutputs.values())) : 0} (limit: ${maxOutputsPerNode})`);
        console.log(`  Violations: ${final.nodeViolations.length} nodes exceed limit`);
        if (final.nodeViolations.length > 0) {
            final.nodeViolations.slice(0, 5).forEach(([node, count]) => {
                console.log(`    Node ${node}: ${count} outputs (excess: ${count - maxOutputsPerNode})`);
            });
        }
        if (final.rowViolations.length === 0 && final.nodeViolations.length === 0) {
            console.log(`\n✅ All constraints satisfied!`);
        }

        // Verification: Check that row power equals sum of node outputs in each row
        console.log(`\nVERIFICATION: Row power vs sum of node outputs`);
        const rowToNodes = new Map();
        for (const node of artnetNodes) {
            const y = this.parseNode(node).y;
            if (!rowToNodes.has(y)) {
                rowToNodes.set(y, []);
            }
            rowToNodes.get(y).push(node);
        }

        for (const [y, nodes] of Array.from(rowToNodes.entries()).sort((a, b) => a[0] - b[0])) {
            const rowPower = final.rowAmps.get(y) || 0;
            const sumOfNodeOutputs = nodes.reduce((sum, node) => sum + (final.nodeOutputs.get(node) || 0), 0);
            const match = rowPower === sumOfNodeOutputs ? '✅' : '❌';
            console.log(`  Y=${y.toFixed(1)}: Row power=${rowPower}A, Sum of nodes=${sumOfNodeOutputs}A ${match}`);
        }

        return {
            edgeDirections: edgeDirections,
            rowPower: final.rowAmps,
            nodeOutputs: final.nodeOutputs,
            rowViolations: final.rowViolations,
            nodeViolations: final.nodeViolations
        };
    }

    updateArtNetInfo() {
        // Calculate total power based on edge lengths (12W/m * adjusted length)
        let totalWatts = 0;
        
        if (this.artnetOptimization && this.artnetOptimization.edgeDirections) {
            for (const edge of this.edges) {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && dir.start) {
                    totalWatts += this.calculateEdgePower(edge);
                }
            }
        }
        
        // Add LED ring power if enabled (2.5m * 12W/m = 30W per node)
        if (this.showLedRings) {
            const ledRingWatts = this.ledRingLength * this.wattsPerMeter;
            totalWatts += this.nodes.size * ledRingWatts;
        }
        
        const totalAmps = totalWatts / this.voltage;

        // Network Info at top
        let info = `Network Info\n`;
        info += `Nodes: ${this.nodes.size}\n`;
        info += `Edges: ${this.edges.length}\n`;
        info += `Total Power: ${totalWatts.toFixed(0)}W (${totalAmps.toFixed(1)}A)\n`;

        // Add optimization info if available
        if (this.artnetOptimization) {
            const artnetCount = this.artnetOptimization.artnetNodes ? this.artnetOptimization.artnetNodes.length : 0;
            const endCount = this.artnetOptimization.endNodes ? this.artnetOptimization.endNodes.length : 0;
            // Calculate total PSUs across all smart nodes
            let totalPSUs = 0;
            const psuMeters = 20;
            for (const nodeStr of this.artnetOptimization.artnetNodes) {
                let nodeLength = 0;
                for (const edge of this.edges) {
                    const dir = this.artnetOptimization.edgeDirections.get(edge);
                    if (dir && dir.start === nodeStr) {
                        const edgeLength = this.calculateEdgeLength(edge);
                        nodeLength += Math.max(0, edgeLength - this.nodeDiameterOffset);
                    }
                }
                totalPSUs += Math.ceil(nodeLength / psuMeters);
            }

            info += `\nArtNet Nodes: ${artnetCount}\n`;
            info += `End Nodes: ${endCount}\n`;
            info += `PSUs (${psuMeters}m each): ${totalPSUs}\n`;

            if (this.artnetOptimization.directionViolations && this.artnetOptimization.directionViolations.length > 0) {
                info += `⚠️ ${this.artnetOptimization.directionViolations.length} nodes > 4 ports\n`;
            }

            if (this.artnetOptimization.rowViolations && this.artnetOptimization.rowViolations.length > 0) {
                info += `⚠️ ${this.artnetOptimization.rowViolations.length} rows > 20A`;
            }
        } else {
            info += `\nClick 'Optimize' to analyze`;
        }

        document.getElementById('artnetInfo').textContent = info;
    }

    // === EXPORT FUNCTIONS === //

    exportDataCables() {
        if (!this.lastCableData || this.lastCableData.length === 0) {
            console.log('Enable Show Data Cables first');
            return;
        }

        let csv = 'Cable_ID,Smart_Node,Smart_Node_X,Smart_Node_Y,Cable_Length_m,Edge_Point_Label,Intermediate_Point\n';

        for (const c of this.lastCableData) {
            const node = this.parseNode(c.nodeStr);
            csv += `C${c.cableId},${c.nodeLabel},${node.x.toFixed(3)},${node.y.toFixed(3)},${c.cableLength.toFixed(2)},${c.edgePointLabel},${c.intermediateLabel}\n`;
        }

        const total = this.lastCableData.reduce((s, c) => s + c.cableLength, 0);
        csv += `\nTOTAL,,,,${total.toFixed(2)},,\n`;
        csv += `Cable_Count,,,,${this.lastCableData.length},,\n`;

        this.downloadCSV('data_cable_export.csv', csv);
        console.log(`Exported ${this.lastCableData.length} data cables, total length: ${total.toFixed(2)}m`);
    }

    exportEdgeData() {
        if (!this.artnetOptimization) {
            console.log('Run optimization first');
            return;
        }

        let csv = 'ID,start_X,start_Y,start_Z,end_X,end_Y,end_Z,Edge_Length,Data_Flow_Start_Node_ID,Data_Flow_End_Node_ID,Type\n';

        // Calculate center Y for flipping
        const centerY = (this.worldMinY + this.worldMaxY) / 2;

        for (const edge of this.edges) {
            const edgeId = this.edgeIds.get(edge) || '?';
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const length = this.calculateEdgeLength(edge);

            // Apply Y flip if toggle is on
            const startY = this.yFlipped ? (2 * centerY - start.y) : start.y;
            const endY = this.yFlipped ? (2 * centerY - end.y) : end.y;

            const isIntercom = this.intercomEdges.includes(edge);
            let flowStartId, flowEndId;

            if (isIntercom) {
                if (this.intercomNodes.has(edge.start)) {
                    flowStartId = this.nodeIds.get(edge.end);
                    flowEndId = this.nodeIds.get(edge.start);
                } else if (this.intercomNodes.has(edge.end)) {
                    flowStartId = this.nodeIds.get(edge.start);
                    flowEndId = this.nodeIds.get(edge.end);
                } else {
                    flowStartId = 'No Flow';
                    flowEndId = 'No Flow';
                }
            } else {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && dir.start) {
                    flowStartId = this.nodeIds.get(dir.start);
                    flowEndId = this.nodeIds.get(dir.end);
                } else {
                    flowStartId = 'No Flow';
                    flowEndId = 'No Flow';
                }
            }

            const edgeType = isIntercom ? 'Intercom' : 'Normal';

            csv += `${edgeId},${start.x},${startY},${start.z},${end.x},${endY},${end.z},${length.toFixed(2)},${flowStartId},${flowEndId},${edgeType}\n`;
        }

        this.downloadCSV('edge_data_export.csv', csv);
    }

    exportLengthSummary() {
        // Collect all edge lengths and count occurrences
        const lengthData = new Map(); // length -> { total: count, intercom: count, edgeIds: [] }
        
        for (const edge of this.edges) {
            const length = this.calculateEdgeLength(edge);
            const rounded = Math.round(length * 100) / 100; // Round to 2 decimal places
            const edgeId = this.edgeIds.get(edge) || '?';
            const isIntercom = this.intercomEdges.includes(edge);
            
            if (!lengthData.has(rounded)) {
                lengthData.set(rounded, { total: 0, intercom: 0, normalEdgeIds: [], intercomEdgeIds: [] });
            }
            
            const data = lengthData.get(rounded);
            data.total++;
            if (isIntercom) {
                data.intercom++;
                data.intercomEdgeIds.push(edgeId);
            } else {
                data.normalEdgeIds.push(edgeId);
            }
        }
        
        // Sort by length
        const sortedLengths = Array.from(lengthData.entries()).sort((a, b) => a[0] - b[0]);
        
        // Build CSV with adjusted length (minus node diameter)
        const diameter = this.nodeDiameterOffset;
        let csv = `Length_m,Length_Adjusted_m,Total_Count,Normal_Count,Intercom_Count,Normal_Edge_IDs,Intercom_Edge_IDs\n`;
        csv += `# Node Diameter: ${diameter.toFixed(2)}m (subtracted from Length to get Length_Adjusted)\n`;
        
        for (const [length, data] of sortedLengths) {
            const adjustedLength = Math.max(0, length - diameter); // Don't go negative
            const normalCount = data.total - data.intercom;
            const normalIds = data.normalEdgeIds.join(';');
            const intercomIds = data.intercomEdgeIds.join(';');
            csv += `${length.toFixed(2)},${adjustedLength.toFixed(2)},${data.total},${normalCount},${data.intercom},"${normalIds}","${intercomIds}"\n`;
        }
        
        // Add summary row
        const totalEdges = this.edges.length;
        const totalIntercom = this.intercomEdges.length;
        const totalNormal = totalEdges - totalIntercom;
        csv += `\nSUMMARY,,${totalEdges},${totalNormal},${totalIntercom},,\n`;
        csv += `Unique_Lengths,,${sortedLengths.length},,,,\n`;
        csv += `Node_Diameter,${diameter.toFixed(2)}m,,,,,\n`;
        
        this.downloadCSV('edge_length_summary.csv', csv);
        console.log(`Exported length summary: ${sortedLengths.length} unique lengths, ${totalEdges} total edges (${totalIntercom} intercom), diameter: ${diameter}m`);
    }

    saveProject() {
        if (!this.lastCSVText) {
            console.log('No CSV data loaded yet');
            return;
        }

        // Serialize edge directions: [edgeId, startNodeId, endNodeId]
        const edgeDirectionTuples = [];
        if (this.artnetOptimization && this.artnetOptimization.edgeDirections) {
            for (const [edge, dir] of this.artnetOptimization.edgeDirections.entries()) {
                const edgeId = this.edgeIds.get(edge);
                const startId = dir.start ? this.nodeIds.get(dir.start) : null;
                const endId = dir.end ? this.nodeIds.get(dir.end) : null;
                if (edgeId !== undefined) {
                    edgeDirectionTuples.push([edgeId, startId, endId]);
                }
            }
        }

        // Serialize intercom node IDs
        const intercomNodeIds = [];
        for (const nodeStr of this.intercomNodes) {
            const id = this.nodeIds.get(nodeStr);
            if (id !== undefined) intercomNodeIds.push(id);
        }

        const project = {
            csvText: this.lastCSVText,
            settings: {
                nodeDiameter: this.nodeDiameter,
                arrowLengthPercent: this.arrowLengthPercent,
                fontSize: this.fontSize,
                nodeDiameterOffset: this.nodeDiameterOffset,
                wattsPerMeter: this.wattsPerMeter,
                voltage: this.voltage,
                ledRingLength: this.ledRingLength,
            },
            toggles: {
                yFlipped: this.yFlipped,
                showArtnetNodes: this.showArtnetNodes,
                showGrid: this.showGrid,
                showNodeIds: this.showNodeIds,
                showPSUCount: this.showPSUCount,
                showEdgeCount: this.showEdgeCount,
                showDataCables: this.showDataCables,
                showEdges: this.showEdges,
                showEdgeLengths: this.showEdgeLengths,
                showNodeTotalLength: this.showNodeTotalLength,
                showLedRings: this.showLedRings,
                intercomEditMode: this.intercomEditMode,
                edgeFlipMode: this.edgeFlipMode,
                selectedLengthGroup: this.selectedLengthGroup,
            },
            intercomNodeIds: intercomNodeIds,
            cableEdgePoints: this.cableEdgePoints,
            cableIntermediatePoints: this.cableIntermediatePoints,
            edgeDirections: edgeDirectionTuples,
        };

        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.json';
        a.click();
        URL.revokeObjectURL(url);
        console.log('Project saved');
    }

    loadProject(jsonText) {
        let json;
        try {
            json = JSON.parse(jsonText);
        } catch (e) {
            console.error('Invalid JSON:', e);
            return;
        }

        // 1. Rebuild network from CSV
        this.parseCSV(json.csvText);

        // 2. Restore intercom nodes
        if (json.intercomNodeIds && json.intercomNodeIds.length > 0) {
            const nodeIdToStr = new Map();
            for (const [nodeStr, nodeId] of this.nodeIds.entries()) {
                nodeIdToStr.set(nodeId, nodeStr);
            }
            this.intercomNodes = new Set();
            this.intercomEdges = [];
            for (const id of json.intercomNodeIds) {
                const nodeStr = nodeIdToStr.get(id);
                if (nodeStr) {
                    this.intercomNodes.add(nodeStr);
                    for (const edge of this.edges) {
                        if ((edge.start === nodeStr || edge.end === nodeStr) &&
                            !this.intercomEdges.includes(edge)) {
                            this.intercomEdges.push(edge);
                        }
                    }
                }
            }
        }

        // 3. Restore edge directions
        if (json.edgeDirections && json.edgeDirections.length > 0) {
            const nodeIdToStr = new Map();
            for (const [nodeStr, nodeId] of this.nodeIds.entries()) {
                nodeIdToStr.set(nodeId, nodeStr);
            }
            // Build edgeId → edge reverse map
            const edgeIdToEdge = new Map();
            for (const [edge, edgeId] of this.edgeIds.entries()) {
                edgeIdToEdge.set(edgeId, edge);
            }

            const edgeDirections = new Map();
            const artnetOutputCounts = new Map();
            const rowPower = new Map();
            const artnetNodesSet = new Set();

            for (const [edgeId, startId, endId] of json.edgeDirections) {
                const edge = edgeIdToEdge.get(edgeId);
                if (!edge) continue;

                const startStr = startId != null ? nodeIdToStr.get(startId) : null;
                const endStr = endId != null ? nodeIdToStr.get(endId) : null;

                edgeDirections.set(edge, { start: startStr || null, end: endStr || null });

                if (startStr) {
                    artnetOutputCounts.set(startStr, (artnetOutputCounts.get(startStr) || 0) + 1);
                    const startY = this.parseNode(startStr).y;
                    rowPower.set(startY, (rowPower.get(startY) || 0) + 1);
                    artnetNodesSet.add(startStr);
                }
            }

            const artnetNodes = Array.from(artnetNodesSet);
            const endNodesSet = new Set();
            for (const edge of this.edges) {
                const dir = edgeDirections.get(edge);
                if (dir && dir.end && !artnetNodesSet.has(dir.end)) {
                    endNodesSet.add(dir.end);
                }
            }

            this.artnetOptimization = {
                artnetNodes: artnetNodes,
                endNodes: Array.from(endNodesSet),
                edgeDirections: edgeDirections,
                artnetOutputCounts: artnetOutputCounts,
                rowPower: rowPower,
                rowViolations: [],
                directionViolations: [],
            };
        }

        // 4. Restore cable routing points
        if (json.cableEdgePoints) {
            this.cableEdgePoints = json.cableEdgePoints;
        }
        if (json.cableIntermediatePoints) {
            this.cableIntermediatePoints = json.cableIntermediatePoints;
        }

        // 5. Restore settings and sync HTML inputs
        if (json.settings) {
            const s = json.settings;
            if (s.nodeDiameter !== undefined) {
                this.nodeDiameter = s.nodeDiameter;
                document.getElementById('nodeDiameter').value = s.nodeDiameter;
                document.getElementById('nodeDiameterValue').textContent = s.nodeDiameter.toFixed(1);
            }
            if (s.arrowLengthPercent !== undefined) {
                this.arrowLengthPercent = s.arrowLengthPercent;
                document.getElementById('arrowLength').value = s.arrowLengthPercent;
                document.getElementById('arrowLengthValue').textContent = s.arrowLengthPercent;
            }
            if (s.fontSize !== undefined) {
                this.fontSize = s.fontSize;
                document.getElementById('fontSize').value = s.fontSize;
                document.getElementById('fontSizeValue').textContent = s.fontSize;
            }
            if (s.nodeDiameterOffset !== undefined) {
                this.nodeDiameterOffset = s.nodeDiameterOffset;
                document.getElementById('nodeDiameterOffset').value = s.nodeDiameterOffset;
                document.getElementById('nodeDiameterOffsetValue').textContent = s.nodeDiameterOffset.toFixed(2);
            }
            if (s.wattsPerMeter !== undefined) this.wattsPerMeter = s.wattsPerMeter;
            if (s.voltage !== undefined) this.voltage = s.voltage;
            if (s.ledRingLength !== undefined) this.ledRingLength = s.ledRingLength;
        }

        // 6. Restore toggles and sync HTML inputs
        if (json.toggles) {
            const t = json.toggles;
            if (t.yFlipped !== undefined) {
                this.yFlipped = t.yFlipped;
                document.getElementById('flipYToggle').checked = t.yFlipped;
            }
            if (t.showArtnetNodes !== undefined) {
                this.showArtnetNodes = t.showArtnetNodes;
                document.getElementById('showArtnetNodes').checked = t.showArtnetNodes;
            }
            if (t.showGrid !== undefined) {
                this.showGrid = t.showGrid;
                document.getElementById('showGrid').checked = t.showGrid;
            }
            if (t.showNodeIds !== undefined) {
                this.showNodeIds = t.showNodeIds;
                document.getElementById('showNodeIds').checked = t.showNodeIds;
            }
            if (t.showPSUCount !== undefined) {
                this.showPSUCount = t.showPSUCount;
                document.getElementById('showPSUCount').checked = t.showPSUCount;
            }
            if (t.showEdgeCount !== undefined) {
                this.showEdgeCount = t.showEdgeCount;
                document.getElementById('showEdgeCount').checked = t.showEdgeCount;
            }
            if (t.showDataCables !== undefined) {
                this.showDataCables = t.showDataCables;
                document.getElementById('showDataCables').checked = t.showDataCables;
            }
            if (t.showEdges !== undefined) {
                this.showEdges = t.showEdges;
            }
            if (t.showEdgeLengths !== undefined) {
                this.showEdgeLengths = t.showEdgeLengths;
                document.getElementById('showEdgeLengths').checked = t.showEdgeLengths;
            }
            if (t.showNodeTotalLength !== undefined) {
                this.showNodeTotalLength = t.showNodeTotalLength;
                document.getElementById('showNodeTotalLength').checked = t.showNodeTotalLength;
            }
            if (t.showLedRings !== undefined) {
                this.showLedRings = t.showLedRings;
                document.getElementById('showLedRings').checked = t.showLedRings;
            }
            if (t.intercomEditMode !== undefined) {
                this.intercomEditMode = t.intercomEditMode;
                document.getElementById('intercomEditMode').checked = t.intercomEditMode;
            }
            if (t.edgeFlipMode !== undefined) {
                this.edgeFlipMode = t.edgeFlipMode;
                document.getElementById('edgeFlipMode').checked = t.edgeFlipMode;
                document.getElementById('edgeFlipHelp').style.display = t.edgeFlipMode ? 'block' : 'none';
            }
            if (t.selectedLengthGroup !== undefined) {
                this.selectedLengthGroup = t.selectedLengthGroup;
                document.getElementById('lengthFilter').value = t.selectedLengthGroup;
            }
        }

        // 7. Recalculate and redraw
        this.calculateLengthGroups();
        this.updateLengthFilterLabel();
        this.updateArtNetInfo();
        this.updateIntercomInfo();
        this.drawNetwork();

        console.log('Project loaded');
    }

    downloadCSV(filename, content) {
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    printNodeResults() {
        if (!this.artnetOptimization) {
            alert('Run optimization first');
            return;
        }

        let output = '=== ALL NODE RESULTS ===\n';
        output += 'Node     | Coordinates      | Type        | Total | Arrows | Edge IDs\n';
        output += '---------|------------------|-------------|-------|--------|----------\n';

        const sortedNodes = Array.from(this.nodes).sort((a, b) => {
            return (this.nodeIds.get(a) || 0) - (this.nodeIds.get(b) || 0);
        });

        for (const nodeStr of sortedNodes) {
            const node = this.parseNode(nodeStr);
            const label = this.getNodeLabel(nodeStr);
            const arrowCount = this.countArrowsFromNode(nodeStr);

            let totalEdges = 0;
            const edgeIdList = [];
            for (const edge of this.edges) {
                if (edge.start === nodeStr || edge.end === nodeStr) {
                    totalEdges++;
                    edgeIdList.push(this.edgeIds.get(edge) || '?');
                }
            }

            const isArtnet = this.artnetOptimization.artnetNodes.includes(nodeStr);
            const nodeType = isArtnet ? 'ArtNet Node' : 'Regular Node';

            output += `${label.padEnd(8)} | (${node.x.toFixed(1)},${node.y.toFixed(1)})${' '.repeat(8)} | ${nodeType.padEnd(11)} | ${totalEdges.toString().padEnd(5)} | ${arrowCount.toString().padEnd(6)} | ${edgeIdList.slice(0, 10).join(',')}\n`;
        }

        output += '='.repeat(85) + '\n';
        output += `Total nodes: ${this.nodes.size}\n`;
        output += `ArtNet nodes: ${this.artnetOptimization.artnetNodes.length}\n`;

        // Download as text file
        this.downloadTextFile('node_results.txt', output);
    }

    _patchSvgContext(svgCtx) {
        let currentDash = [];
        svgCtx.setLineDash = function(pattern) { currentDash = pattern || []; };
        svgCtx.getLineDash = function() { return currentDash; };

        const originalStroke = svgCtx.stroke.bind(svgCtx);
        svgCtx.stroke = function() {
            originalStroke();
            if (currentDash.length > 0) {
                const svg = svgCtx.getSvg();
                const lastEl = svg.querySelector(':scope > :last-child')
                    || svg.lastElementChild;
                if (lastEl) {
                    const deepest = lastEl.querySelector(':last-child') || lastEl;
                    deepest.setAttribute('stroke-dasharray', currentDash.join(','));
                }
            }
        };
    }

    _renderToSvgContext() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const extraRight = this.artnetOptimization ? 120 : 0;
        const exportWidth = width + extraRight;
        const svgCtx = new C2S(exportWidth, height);
        this._patchSvgContext(svgCtx);

        const originalCtx = this.ctx;
        this.ctx = svgCtx;
        try {
            this.drawNetwork();
        } finally {
            this.ctx = originalCtx;
        }
        return { svgCtx, exportWidth, exportHeight: height };
    }

    exportSVG() {
        if (this.nodes.size === 0) {
            alert('No data to export. Load CSV data first.');
            return;
        }

        const { svgCtx } = this._renderToSvgContext();
        const svgString = svgCtx.getSerializedSvg(true);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'network-visualization.svg';
        a.click();
        URL.revokeObjectURL(url);
    }

    async exportPDF() {
        if (this.nodes.size === 0) {
            alert('No data to export. Load CSV data first.');
            return;
        }

        if (typeof C2S === 'undefined' || typeof window.jspdf === 'undefined') {
            alert('PDF export libraries not loaded. Check your internet connection and reload.');
            return;
        }

        const { svgCtx, exportWidth, exportHeight } = this._renderToSvgContext();
        const svgElement = svgCtx.getSvg();
        svgElement.setAttribute('viewBox', `0 0 ${exportWidth} ${exportHeight}`);
        svgElement.setAttribute('width', `${exportWidth}`);
        svgElement.setAttribute('height', `${exportHeight}`);

        const pxToMm = 25.4 / 96;
        const pdfWidth = exportWidth * pxToMm;
        const pdfHeight = exportHeight * pxToMm;
        const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';
        const pageW = orientation === 'landscape' ? Math.max(pdfWidth, pdfHeight) : Math.min(pdfWidth, pdfHeight);
        const pageH = orientation === 'landscape' ? Math.min(pdfWidth, pdfHeight) : Math.max(pdfWidth, pdfHeight);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH] });

        try {
            await doc.svg(svgElement, { x: 0, y: 0, width: pageW, height: pageH });
            doc.save('network-visualization.pdf');
        } catch (err) {
            console.error('PDF export failed, falling back to SVG:', err);
            alert('PDF export failed. Downloading as SVG instead (opens in all vector editors).');
            this.exportSVG();
        }
    }

    downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new NetworkVisualizer();

    fetch('project-default.json')
        .then(r => r.ok ? r.text() : Promise.reject('No default project'))
        .then(text => {
            window.visualizer._projectLoaded = true;
            window.visualizer.loadProject(text);
        })
        .catch(() => console.log('No default project found, starting empty'));
});
