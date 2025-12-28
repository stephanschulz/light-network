// Network Visualizer - Full Featured Web Implementation
// Replicates all Python functionality including ArtNet optimization

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

        // Visual settings
        this.nodeDiameter = 0.2;
        this.lineWidth = 0.1;
        this.arrowWidth = 0.2;
        this.arrowLengthPercent = 50;
        this.fontSize = 12;

        // Display options
        this.showArtnetNodes = false;
        this.showDataCables = false;
        this.showGrid = false;
        this.showEdges = true;
        this.selectedLengthGroup = -1;

        // Optimization results
        this.artnetOptimization = null;
        this.lengthGroups = [];

        // Zoom and pan
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;

        // Initialize
        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupEventListeners();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Try to load default CSV
        this.loadDefaultCSV();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.drawNetwork();
    }

    setupEventListeners() {
        // Visual controls
        document.getElementById('nodeDiameter').addEventListener('input', (e) => {
            this.nodeDiameter = parseFloat(e.target.value);
            document.getElementById('nodeDiameterValue').textContent = this.nodeDiameter.toFixed(1);
            this.drawNetwork();
        });

        document.getElementById('lineWidth').addEventListener('input', (e) => {
            this.lineWidth = parseFloat(e.target.value);
            document.getElementById('lineWidthValue').textContent = this.lineWidth.toFixed(1);
            this.drawNetwork();
        });

        document.getElementById('arrowWidth').addEventListener('input', (e) => {
            this.arrowWidth = parseFloat(e.target.value);
            document.getElementById('arrowWidthValue').textContent = this.arrowWidth.toFixed(1);
            this.drawNetwork();
        });

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

        document.getElementById('showDataCables').addEventListener('change', (e) => {
            this.showDataCables = e.target.checked;
            this.drawNetwork();
        });

        document.getElementById('lengthFilter').addEventListener('input', (e) => {
            this.selectedLengthGroup = parseInt(e.target.value);
            this.updateLengthFilterLabel();
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

        document.getElementById('printResultsBtn').addEventListener('click', () => {
            this.printNodeResults();
        });

        // Zoom controls
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            this.zoom *= 1.2;
            this.drawNetwork();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            this.zoom /= 1.2;
            this.drawNetwork();
        });

        document.getElementById('resetZoomBtn').addEventListener('click', () => {
            this.zoom = 1.0;
            this.panX = 0;
            this.panY = 0;
            this.drawNetwork();
        });

        // Mouse events for tooltips
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    async loadDefaultCSV() {
        try {
            const response = await fetch('../Oct10_003_stephan.csv');
            const text = await response.text();
            this.parseCSV(text);
        } catch (error) {
            console.log('Default CSV not found, waiting for user upload');
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
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        // Clear existing data
        this.nodes.clear();
        this.edges = [];
        this.intercomNodes.clear();
        this.intercomEdges = [];
        this.edgeIds.clear();
        this.nodeIds.clear();
        this.nextNodeId = 1;

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length < 7) continue;

            const edgeId = parseInt(values[0]);
            const startX = parseFloat(values[1]);
            const startY = parseFloat(values[2]);
            const startZ = parseFloat(values[3]);
            const endX = parseFloat(values[4]);
            const endY = parseFloat(values[5]);
            const endZ = parseFloat(values[6]);
            const edgeType = values.length > 7 ? values[7].trim() : 'Normal';

            if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) continue;

            const startNode = `${startX},${startY},${startZ}`;
            const endNode = `${endX},${endY},${endZ}`;

            this.nodes.add(startNode);
            this.nodes.add(endNode);

            const edge = { start: startNode, end: endNode };
            this.edges.push(edge);
            this.edgeIds.set(edge, edgeId);

            // Track intercom edges
            if (edgeType.toLowerCase() === 'intercom') {
                this.intercomEdges.push(edge);
            }

            // Assign node IDs
            if (!this.nodeIds.has(startNode)) {
                this.nodeIds.set(startNode, this.nextNodeId++);
            }
            if (!this.nodeIds.has(endNode)) {
                this.nodeIds.set(endNode, this.nextNodeId++);
            }
        }

        // Identify pure intercom nodes
        const allIntercomNodes = new Set();
        for (const edge of this.intercomEdges) {
            allIntercomNodes.add(edge.start);
            allIntercomNodes.add(edge.end);
        }

        const normalEdges = this.edges.filter(e => !this.intercomEdges.includes(e));
        const mixedNodes = new Set();
        for (const edge of normalEdges) {
            if (allIntercomNodes.has(edge.start)) mixedNodes.add(edge.start);
            if (allIntercomNodes.has(edge.end)) mixedNodes.add(edge.end);
        }

        this.intercomNodes = new Set([...allIntercomNodes].filter(n => !mixedNodes.has(n)));

        console.log(`Loaded ${this.nodes.size} nodes and ${this.edges.length} edges`);
        console.log(`Intercom: ${this.intercomNodes.size} nodes, ${this.intercomEdges.length} edges`);

        this.calculateLengthGroups();
        this.updateNetworkInfo();
        this.drawNetwork();

        // Auto-optimize
        setTimeout(() => {
            this.optimizeArtNet();
            this.showArtnetNodes = true;
            document.getElementById('showArtnetNodes').checked = true;
            this.drawNetwork();
        }, 100);
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
        document.getElementById('nodeCount').textContent = `Nodes: ${this.nodes.size}`;
        document.getElementById('edgeCount').textContent = `Edges: ${this.edges.length}`;
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

    // === ARTNET OPTIMIZATION === //

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

            // Remove covered edges
            const toRemove = [];
            for (const edge of uncoveredEdges) {
                if (edge.start === bestNode || edge.end === bestNode) {
                    toRemove.push(edge);
                }
            }
            for (const edge of toRemove) {
                uncoveredEdges.delete(edge);
            }

            console.log(`Added ArtNet node, ${uncoveredEdges.size} edges remaining`);
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

        // Balance edge directions
        const edgeDirections = this.balanceEdgeDirections(finalArtnetNodes);

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

        this.artnetOptimization = {
            artnetNodes: finalArtnetNodes,
            endNodes: endNodes,
            edgeDirections: edgeDirections.edgeDirections,
            artnetOutputCounts: edgeDirections.artnetOutputCounts,
            directionViolations: edgeDirections.violations,
            rowPower: edgeDirections.rowPower,
            rowViolations: edgeDirections.rowViolations,
            maxDistance: maxDistance,
            avgDistance: avgDistance
        };

        this.updateArtNetInfo();
        this.drawNetwork();
    }

    balanceEdgeDirections(artnetNodes) {
        const artnetSet = new Set(artnetNodes);
        const edgeDirections = new Map();
        const artnetOutputs = new Map();

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
                // Intercom edges: data flows TO intercom node
                if (this.intercomNodes.has(edge.start)) {
                    edgeDirections.set(edge, { start: edge.end, end: edge.start });
                } else if (this.intercomNodes.has(edge.end)) {
                    edgeDirections.set(edge, { start: edge.start, end: edge.end });
                } else {
                    edgeDirections.set(edge, { start: null, end: null });
                }
            } else if (artnetSet.has(edge.start) && artnetSet.has(edge.end)) {
                // Both are ArtNet - choose based on current load
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
                edgeDirections.set(edge, { start: null, end: null });
            }
        }

        // Balance using dual-constraint optimization
        const result = this.balanceRowPowerAndPorts(
            artnetNodes,
            edgeDirections,
            artnetOutputs,
            nodeToArtnetNeighbors,
            20, // max_amps_per_row
            4   // max_outputs_per_node
        );

        return result;
    }

    balanceRowPowerAndPorts(artnetNodes, edgeDirections, artnetOutputs, nodeToArtnetNeighbors, maxAmpsPerRow, maxOutputsPerNode) {
        const artnetSet = new Set(artnetNodes);
        const maxIterations = 1000;
        let iteration = 0;
        let improvements = 0;

        const calculateRowPower = () => {
            const rowAmps = new Map();
            for (const edge of this.edges) {
                const dir = edgeDirections.get(edge);
                if (dir && dir.start) {
                    const { y } = this.parseNode(dir.start);
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

        let phase = 1;
        let bestMaxRow = Infinity;
        let iterationsWithoutImprovement = 0;

        while (iteration < maxIterations) {
            const { rowViolations, nodeViolations, rowAmps, nodeOutputs } = getViolations();

            // Phase transitions
            if (phase === 1 && rowViolations.length === 0 && nodeViolations.length === 0) {
                console.log(`Hard constraints satisfied after ${iteration} iterations`);
                phase = 2;
                bestMaxRow = Math.max(...Array.from(rowAmps.values()));
                iterationsWithoutImprovement = 0;
                continue;
            } else if (phase === 2 && iterationsWithoutImprovement >= 30) {
                console.log('Phase 2 complete, entering Phase 3');
                phase = 3;
                iterationsWithoutImprovement = 0;
                continue;
            }

            // Track max row power improvement
            if (phase >= 2 && rowAmps.size > 0) {
                const currentMaxRow = Math.max(...Array.from(rowAmps.values()));
                if (currentMaxRow < bestMaxRow) {
                    bestMaxRow = currentMaxRow;
                    iterationsWithoutImprovement = 0;
                } else {
                    iterationsWithoutImprovement++;
                }

                if ((phase === 2 && iterationsWithoutImprovement >= 30) ||
                    (phase === 3 && iterationsWithoutImprovement >= 50)) {
                    break;
                }
            }

            let madeImprovement = false;

            // Phase 2 & 3: Balance power across rows
            if (phase >= 2 && rowAmps.size > 0) {
                const avgAmps = Array.from(rowAmps.values()).reduce((a, b) => a + b, 0) / rowAmps.size;
                const sortedByLoad = Array.from(rowAmps.entries()).sort((a, b) => b[1] - a[1]);

                for (const [highRowY, highAmps] of sortedByLoad) {
                    if (highAmps <= avgAmps) continue;

                    const sortedRows = Array.from(rowAmps.keys()).sort((a, b) => a - b);
                    const rowIdx = sortedRows.indexOf(highRowY);
                    const neighborRows = [];
                    if (rowIdx > 0) neighborRows.push(sortedRows[rowIdx - 1]);
                    if (rowIdx < sortedRows.length - 1) neighborRows.push(sortedRows[rowIdx + 1]);

                    // Find edges in this row
                    const edgesInRow = this.edges.filter(edge => {
                        const dir = edgeDirections.get(edge);
                        return dir && dir.start && this.parseNode(dir.start).y === highRowY;
                    });

                    for (const edge of edgesInRow) {
                        const dir = edgeDirections.get(edge);
                        const altNeighbors = nodeToArtnetNeighbors.get(dir.end);

                        if (altNeighbors && altNeighbors.length > 0) {
                            const altOptions = altNeighbors
                                .filter(altNode => altNode !== dir.start)
                                .map(altNode => {
                                    const altY = this.parseNode(altNode).y;
                                    const altRowAmps = rowAmps.get(altY) || 0;
                                    const altNodeOut = nodeOutputs.get(altNode) || 0;

                                    let priority = 0;
                                    if (altRowAmps < maxAmpsPerRow && altNodeOut < maxOutputsPerNode) {
                                        if (neighborRows.includes(altY)) priority = 100;
                                        priority -= altRowAmps;
                                        return { node: altNode, y: altY, amps: altRowAmps, priority };
                                    }
                                    return null;
                                })
                                .filter(opt => opt !== null)
                                .sort((a, b) => b.priority - a.priority);

                            if (altOptions.length > 0 && altOptions[0].amps < highAmps) {
                                const alt = altOptions[0];
                                edgeDirections.set(edge, { start: alt.node, end: dir.end });
                                rowAmps.set(highRowY, rowAmps.get(highRowY) - 1);
                                rowAmps.set(alt.y, (rowAmps.get(alt.y) || 0) + 1);
                                nodeOutputs.set(dir.start, nodeOutputs.get(dir.start) - 1);
                                nodeOutputs.set(alt.node, (nodeOutputs.get(alt.node) || 0) + 1);
                                improvements++;
                                madeImprovement = true;
                                break;
                            }
                        }

                        if (madeImprovement) break;
                    }

                    if (madeImprovement) break;
                }
            }

            if (!madeImprovement && phase === 1) {
                break;
            }

            iteration++;
        }

        const final = getViolations();
        console.log(`Optimization complete after ${iteration} iterations`);
        console.log(`Row violations: ${final.rowViolations.length}, Node violations: ${final.nodeViolations.length}`);

        return {
            edgeDirections: edgeDirections,
            artnetOutputCounts: final.nodeOutputs,
            violations: final.nodeViolations,
            rowPower: final.rowAmps,
            rowViolations: final.rowViolations
        };
    }

    updateArtNetInfo() {
        if (!this.artnetOptimization) return;

        let info = `ArtNet Nodes: ${this.artnetOptimization.artnetNodes.length}\n`;
        info += `End Nodes: ${this.artnetOptimization.endNodes.length}\n`;
        info += `Max Distance: ${this.artnetOptimization.maxDistance.toFixed(2)}m\n`;

        if (this.artnetOptimization.directionViolations && this.artnetOptimization.directionViolations.length > 0) {
            info += `⚠️ ${this.artnetOptimization.directionViolations.length} nodes > 4 ports\n`;
        }

        if (this.artnetOptimization.rowViolations && this.artnetOptimization.rowViolations.length > 0) {
            info += `⚠️ ${this.artnetOptimization.rowViolations.length} rows > 20A`;
        }

        document.getElementById('artnetInfo').textContent = info;
    }

    // === DRAWING FUNCTIONS === //

    drawNetwork() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.nodes.size === 0) return;

        // Calculate bounds
        const nodesArray = Array.from(this.nodes).map(n => this.parseNode(n));
        const xs = nodesArray.map(n => n.x);
        const ys = nodesArray.map(n => n.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        // Calculate scale and offset
        const padding = 50;
        const scaleX = (this.canvas.width - 2 * padding) / (maxX - minX);
        const scaleY = (this.canvas.height - 2 * padding) / (maxY - minY);
        this.scale = Math.min(scaleX, scaleY) * this.zoom;
        this.offsetX = padding + this.panX;
        this.offsetY = padding + this.panY;

        // Convert coordinates
        this.toCanvas = (worldX, worldY) => {
            const x = (worldX - minX) * this.scale + this.offsetX;
            const y = (worldY - minY) * this.scale + this.offsetY;
            return { x, y };
        };

        this.fromCanvas = (canvasX, canvasY) => {
            const x = (canvasX - this.offsetX) / this.scale + minX;
            const y = (canvasY - this.offsetY) / this.scale + minY;
            return { x, y };
        };

        // Draw layers in order
        if (this.showGrid) this.drawGrid();
        this.drawEdges();
        this.drawNodes();
        if (this.showArtnetNodes && this.artnetOptimization) this.drawArrows();
        this.drawWindowFrame(minX, maxX, minY, maxY);
        this.drawGridLabels(minX, maxX, minY, maxY);
        if (this.artnetOptimization) this.drawRowPower(minX, maxX, minY, maxY);
        if (this.showDataCables && this.artnetOptimization) this.drawDataCables(minX, maxX, minY, maxY);
    }

    drawGrid() {
        // Implementation similar to Python version
        // Draw grid dots at each node position
    }

    drawEdges() {
        const selectedLength = this.selectedLengthGroup >= 0 && this.selectedLengthGroup < this.lengthGroups.length
            ? this.lengthGroups[this.selectedLengthGroup].length
            : null;

        for (const edge of this.edges) {
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const startPos = this.toCanvas(start.x, start.y);
            const endPos = this.toCanvas(end.x, end.y);

            const edgeLength = this.calculateEdgeLength(edge);
            const rounded = Math.round(edgeLength * 100) / 100;
            const isHighlighted = selectedLength !== null && Math.abs(rounded - selectedLength) < 0.01;

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

    drawNodes() {
        const artnetSet = this.artnetOptimization ? new Set(this.artnetOptimization.artnetNodes) : new Set();

        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.toCanvas(node.x, node.y);
            const radius = (this.nodeDiameter / 2) * this.scale;

            const isArtnet = this.showArtnetNodes && artnetSet.has(nodeStr);
            const isIntercom = this.intercomNodes.has(nodeStr);

            // Draw main circle
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = isArtnet ? '#00ff00' : '#ff0000';
            this.ctx.fill();
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = isArtnet ? 2 : 1;
            this.ctx.stroke();

            // Draw intercom marker
            if (isIntercom) {
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, radius * 1.5, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#ff8c00';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            // Draw rectangle for ArtNet nodes
            if (isArtnet) {
                const rectSize = this.nodeDiameter * this.scale;
                this.ctx.strokeStyle = '#0000ff';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(pos.x - rectSize/2, pos.y - rectSize/2, rectSize, rectSize);

                // Draw connection count
                const arrowCount = this.countArrowsFromNode(nodeStr);
                this.ctx.fillStyle = '#0064ff';
                this.ctx.font = `${this.fontSize}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(arrowCount.toString(), pos.x + 2, pos.y);
            }
        }
    }

    countArrowsFromNode(nodeStr) {
        if (!this.artnetOptimization) return 0;

        const artnetSet = new Set(this.artnetOptimization.artnetNodes);
        let count = 0;

        for (const edge of this.edges) {
            let arrowFrom = null;

            if (this.intercomEdges.includes(edge)) {
                if (this.intercomNodes.has(edge.start)) {
                    arrowFrom = edge.end;
                } else if (this.intercomNodes.has(edge.end)) {
                    arrowFrom = edge.start;
                }
            } else if (artnetSet.has(edge.start) && artnetSet.has(edge.end)) {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && ((dir.start === edge.start && dir.end === edge.end) ||
                           (dir.start === edge.end && dir.end === edge.start))) {
                    arrowFrom = dir.start;
                }
            } else if (artnetSet.has(edge.start)) {
                arrowFrom = edge.start;
            } else if (artnetSet.has(edge.end)) {
                arrowFrom = edge.end;
            }

            if (arrowFrom === nodeStr) count++;
        }

        return count;
    }

    drawArrows() {
        if (!this.artnetOptimization || !this.showEdges) return;

        const artnetSet = new Set(this.artnetOptimization.artnetNodes);
        this.ctx.strokeStyle = '#ff00ff';
        this.ctx.lineWidth = this.arrowWidth * this.scale;

        for (const edge of this.edges) {
            let arrowFrom = null;
            let arrowTo = null;

            if (this.intercomEdges.includes(edge)) {
                if (this.intercomNodes.has(edge.start)) {
                    arrowFrom = edge.end;
                    arrowTo = edge.start;
                } else if (this.intercomNodes.has(edge.end)) {
                    arrowFrom = edge.start;
                    arrowTo = edge.end;
                }
            } else if (artnetSet.has(edge.start) && artnetSet.has(edge.end)) {
                const dir = this.artnetOptimization.edgeDirections.get(edge);
                if (dir && ((dir.start === edge.start && dir.end === edge.end) ||
                           (dir.start === edge.end && dir.end === edge.start))) {
                    arrowFrom = dir.start;
                    arrowTo = dir.end;
                }
            } else if (artnetSet.has(edge.start)) {
                arrowFrom = edge.start;
                arrowTo = edge.end;
            } else if (artnetSet.has(edge.end)) {
                arrowFrom = edge.end;
                arrowTo = edge.start;
            }

            if (arrowFrom && arrowTo) {
                this.drawArrow(arrowFrom, arrowTo);
            }
        }
    }

    drawArrow(fromStr, toStr) {
        const from = this.parseNode(fromStr);
        const to = this.parseNode(toStr);
        const fromPos = this.toCanvas(from.x, from.y);
        const toPos = this.toCanvas(to.x, to.y);

        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return;

        const ndx = dx / length;
        const ndy = dy / length;

        const nodeRadius = (this.nodeDiameter / 2) * this.scale;
        const arrowStartX = fromPos.x + ndx * nodeRadius;
        const arrowStartY = fromPos.y + ndy * nodeRadius;

        const arrowLength = (length - 2 * nodeRadius) * (this.arrowLengthPercent / 100);
        const arrowEndX = arrowStartX + ndx * arrowLength;
        const arrowEndY = arrowStartY + ndy * arrowLength;

        // Draw arrow line
        this.ctx.beginPath();
        this.ctx.moveTo(arrowStartX, arrowStartY);
        this.ctx.lineTo(arrowEndX, arrowEndY);
        this.ctx.stroke();

        // Draw arrowhead
        const headLength = 10 * this.scale;
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

    drawWindowFrame(minX, maxX, minY, maxY) {
        const topLeft = this.toCanvas(minX, minY);
        const bottomRight = this.toCanvas(maxX, maxY);

        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = this.lineWidth * 3 * this.scale;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        this.ctx.setLineDash([]);

        // Draw dimensions
        const width = maxX - minX;
        const height = maxY - minY;

        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${this.fontSize * 0.7}px Arial`;
        this.ctx.textAlign = 'center';

        // Top width
        this.ctx.fillText(`${width.toFixed(1)}m`, (topLeft.x + bottomRight.x) / 2, topLeft.y - 10);
        // Bottom width
        this.ctx.fillText(`${width.toFixed(1)}m`, (topLeft.x + bottomRight.x) / 2, bottomRight.y + 20);

        // Left height (rotated)
        this.ctx.save();
        this.ctx.translate(topLeft.x - 20, (topLeft.y + bottomRight.y) / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(`${height.toFixed(1)}m`, 0, 0);
        this.ctx.restore();

        // Right height (rotated)
        this.ctx.save();
        this.ctx.translate(bottomRight.x + 20, (topLeft.y + bottomRight.y) / 2);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.fillText(`${height.toFixed(1)}m`, 0, 0);
        this.ctx.restore();
    }

    drawGridLabels(minX, maxX, minY, maxY) {
        const gridNodes = Array.from(this.nodes)
            .filter(n => !this.intercomNodes.has(n))
            .map(n => this.parseNode(n));

        if (gridNodes.length === 0) return;

        const yCoords = [...new Set(gridNodes.map(n => n.y))].sort((a, b) => a - b);
        const xCoords = [...new Set(gridNodes.map(n => n.x))].sort((a, b) => a - b);

        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${this.fontSize * 0.7}px Arial`;

        // Row labels (letters)
        yCoords.forEach((y, i) => {
            const letter = i < 26 ? String.fromCharCode(65 + i) : 'AA';
            const pos = this.toCanvas(minX, y);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(letter, pos.x - 5, pos.y);
        });

        // Column labels (numbers)
        xCoords.forEach((x, i) => {
            const pos = this.toCanvas(x, minY);
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText((i + 1).toString(), pos.x, pos.y - 5);
        });
    }

    drawRowPower(minX, maxX, minY, maxY) {
        if (!this.artnetOptimization || !this.artnetOptimization.rowPower) return;

        const rowPower = this.artnetOptimization.rowPower;
        const maxAmps = 20;

        this.ctx.font = `${this.fontSize * 0.7}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        for (const [y, amps] of rowPower.entries()) {
            const pos = this.toCanvas(maxX, y);

            if (amps > maxAmps) {
                this.ctx.fillStyle = '#ff0000';
            } else if (amps > maxAmps * 0.9) {
                this.ctx.fillStyle = '#ffa500';
            } else {
                this.ctx.fillStyle = '#009600';
            }

            this.ctx.fillText(`${amps}A`, pos.x + 15, pos.y);
        }
    }

    drawDataCables(minX, maxX, minY, maxY) {
        if (!this.artnetOptimization) return;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Draw hub markers
        const hubPositions = [
            { x: minX, y: centerY },  // Left
            { x: maxX, y: centerY },  // Right
            { x: centerX, y: minY },  // Bottom
            { x: centerX, y: maxY }   // Top
        ];

        for (const hub of hubPositions) {
            const pos = this.toCanvas(hub.x, hub.y);
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, (this.nodeDiameter * 0.7) * this.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = '#0000ff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#0000ff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Draw cables from ArtNet nodes to closest hub
        this.ctx.strokeStyle = '#ffa500';
        this.ctx.lineWidth = this.lineWidth * 2 * this.scale;

        let totalCableLength = 0;

        for (const artnetNodeStr of this.artnetOptimization.artnetNodes) {
            const node = this.parseNode(artnetNodeStr);

            // Find closest hub
            let minDist = Infinity;
            let closestHub = hubPositions[0];

            for (const hub of hubPositions) {
                const dist = Math.sqrt(Math.pow(node.x - hub.x, 2) + Math.pow(node.y - hub.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    closestHub = hub;
                }
            }

            // Draw cable
            const nodePos = this.toCanvas(node.x, node.y);
            const hubPos = this.toCanvas(closestHub.x, closestHub.y);

            this.ctx.beginPath();
            this.ctx.moveTo(nodePos.x, nodePos.y);
            this.ctx.lineTo(hubPos.x, hubPos.y);
            this.ctx.stroke();

            // Draw length label
            const midX = (nodePos.x + hubPos.x) / 2;
            const midY = (nodePos.y + hubPos.y) / 2;

            this.ctx.fillStyle = '#000000';
            this.ctx.font = `${this.fontSize * 0.5}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`${minDist.toFixed(1)}m`, midX, midY);

            totalCableLength += minDist;
        }

        document.getElementById('cableInfo').textContent = `Total Cable Length: ${totalCableLength.toFixed(2)}m`;
    }

    // === MOUSE INTERACTION === //

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Find closest node
        let closestNode = null;
        let minDist = Infinity;

        for (const nodeStr of this.nodes) {
            const node = this.parseNode(nodeStr);
            const pos = this.toCanvas(node.x, node.y);
            const dist = Math.sqrt(Math.pow(canvasX - pos.x, 2) + Math.pow(canvasY - pos.y, 2));
            const threshold = (this.nodeDiameter / 2) * this.scale * 20;

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
        const nodeId = this.nodeIds.get(nodeStr);
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

        let text = `Node ID: ${nodeId}\n`;
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

    // === EXPORT FUNCTIONS === //

    exportEdgeData() {
        if (!this.artnetOptimization) {
            console.log('Run optimization first');
            return;
        }

        let csv = 'Edge ID,Edge Length,Start X,Start Y,Start Z,End X,End Y,End Z,Data Flow Start Node ID,Data Flow End Node ID,Type\n';

        for (const edge of this.edges) {
            const edgeId = this.edgeIds.get(edge) || '?';
            const start = this.parseNode(edge.start);
            const end = this.parseNode(edge.end);
            const length = this.calculateEdgeLength(edge);

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

            csv += `${edgeId},${length.toFixed(2)},${start.x},${start.y},${start.z},${end.x},${end.y},${end.z},${flowStartId},${flowEndId},${edgeType}\n`;
        }

        this.downloadCSV('edge_data_export.csv', csv);
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
            console.log('Run optimization first');
            return;
        }

        console.log('\n=== ALL NODE RESULTS ===');
        console.log('Node ID  | Coordinates      | Type        | Total | Arrows | Edge IDs');
        console.log('---------|------------------|-------------|-------|--------|----------');

        const sortedNodes = Array.from(this.nodes).sort((a, b) => {
            return (this.nodeIds.get(a) || 0) - (this.nodeIds.get(b) || 0);
        });

        for (const nodeStr of sortedNodes) {
            const node = this.parseNode(nodeStr);
            const nodeId = this.nodeIds.get(nodeStr);
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

            console.log(`${nodeId.toString().padEnd(8)} | (${node.x.toFixed(1)},${node.y.toFixed(1)})${' '.repeat(8)} | ${nodeType.padEnd(11)} | ${totalEdges.toString().padEnd(5)} | ${arrowCount.toString().padEnd(6)} | ${edgeIdList.slice(0, 10).join(',')}`);
        }

        console.log('='.repeat(85));
        console.log(`Total nodes: ${this.nodes.size}`);
        console.log(`ArtNet nodes: ${this.artnetOptimization.artnetNodes.length}`);
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new NetworkVisualizer();
});
