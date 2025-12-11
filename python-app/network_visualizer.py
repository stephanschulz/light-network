import sys
import math
import csv
import pandas as pd
from PySide6.QtWidgets import (QApplication, QMainWindow, QGraphicsScene, 
                               QGraphicsView, QVBoxLayout, QHBoxLayout, 
                               QWidget, QLabel, QSpinBox, QSlider, QGroupBox, QPushButton, QDoubleSpinBox, QToolTip)
from PySide6.QtCore import Qt, QRectF, QRect
from PySide6.QtGui import QPen, QBrush, QColor, QPainter
from artnet_optimizer import optimize_led_network
# Power optimizer removed - no longer needed


class NetworkVisualizer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Network Visualizer")
        self.setGeometry(100, 100, 900, 600)
        
        # Initialize data
        self.nodes = set()
        self.edges = []
        self.node_diameter = 0.2
        self.line_width = 0.1
        self.arrow_width = 0.2
        self.arrow_length_percent = 50  # Percentage of edge length
        self.font_size = 3  # Font size for connection counts
        self.artnet_optimization = None
        self.show_artnet_nodes = False
        self.show_data_cables = False  # Toggle for data cables
        self.show_grid = False  # Toggle for grid display
        self.show_edges = True  # Always show edges (controlled by length filter)
        self.total_cable_length = 0  # Total length of all data cables
        self.selected_length_group = -1  # -1 = show all, 0+ = show specific length group
        self.length_groups = []  # Will store [(min, max, count), ...]
        self.node_ids = {}  # Dictionary to store node IDs
        self.next_node_id = 1  # Counter for node IDs
        
        # Intercom data (loaded from CSV Type column)
        self.intercom_nodes = set()  # Set of nodes that are part of intercom edges
        self.intercom_edges = []  # List of edges marked as Type=Intercom
        
        # Edge IDs from CSV
        self.edge_ids = {}  # Maps edge tuple to its ID from CSV
        
        # Load data
        self.load_data()
        
        # Setup UI
        self.setup_ui()
        
        # Calculate edge length groups
        self.calculate_length_groups()
        
        # Auto-optimize ArtNet on startup
        print("Auto-optimizing ArtNet on startup...")
        self.optimize_artnet()
        
        # Enable smart nodes display
        self.show_artnet_nodes = True
        self.show_artnet_checkbox.setChecked(True)
        
        # Draw network
        self.draw_network()
    
    def load_data(self):
        """Load and parse the CSV file"""
        try:
            # Read the CSV file
            df = pd.read_csv('../data/Oct10_003_stephan.csv')
            
            # Clear existing data
            self.nodes.clear()
            self.edges.clear()
            self.intercom_nodes.clear()
            self.intercom_edges.clear()
            self.edge_ids.clear()
            
            # Extract start and end coordinates using column names
            for _, row in df.iterrows():
                try:
                    # Read edge ID from CSV
                    edge_id = int(row['ID'])
                    
                    # Start point coordinates
                    start_x = float(row['start_X'])
                    start_y = float(row['start_Y'])
                    start_z = float(row['start_Z'])
                    
                    # End point coordinates
                    end_x = float(row['end_X'])
                    end_y = float(row['end_Y'])
                    end_z = float(row['end_Z'])
                    
                    # Check edge type
                    edge_type = str(row.get('Type', 'Normal')).strip()
                    
                    # Create unique node identifiers
                    start_node = (start_x, start_y, start_z)
                    end_node = (end_x, end_y, end_z)
                    
                    # Add nodes to set (automatically handles duplicates)
                    self.nodes.add(start_node)
                    self.nodes.add(end_node)
                    
                    # Track intercom edges and nodes
                    edge = (start_node, end_node)
                    if edge_type.lower() == 'intercom':
                        self.intercom_edges.append(edge)
                    
                    # Store edge ID from CSV
                    self.edge_ids[edge] = edge_id
                    
                    # Assign IDs to nodes if not already assigned
                    if start_node not in self.node_ids:
                        self.node_ids[start_node] = self.next_node_id
                        self.next_node_id += 1
                    if end_node not in self.node_ids:
                        self.node_ids[end_node] = self.next_node_id
                        self.next_node_id += 1
                    
                    # Add edge
                    self.edges.append(edge)
                    
                except (ValueError, TypeError) as e:
                    print(f"Skipping row due to conversion error: {e}")
                    continue
                
            # Identify pure intercom nodes (nodes that ONLY appear in intercom edges)
            # These are the actual intercom endpoint devices
            all_intercom_nodes = set()
            for edge in self.intercom_edges:
                all_intercom_nodes.add(edge[0])
                all_intercom_nodes.add(edge[1])
            
            normal_edges = [e for e in self.edges if e not in self.intercom_edges]
            mixed_nodes = set()  # Nodes that appear in both intercom AND normal edges
            for edge in normal_edges:
                if edge[0] in all_intercom_nodes:
                    mixed_nodes.add(edge[0])
                if edge[1] in all_intercom_nodes:
                    mixed_nodes.add(edge[1])
            
            # Pure intercom nodes = nodes ONLY in intercom edges
            self.intercom_nodes = all_intercom_nodes - mixed_nodes
            
            print(f"Successfully loaded {len(self.nodes)} nodes and {len(self.edges)} edges")
            print(f"Identified {len(self.intercom_nodes)} pure intercom nodes and {len(self.intercom_edges)} intercom edges")
            if mixed_nodes:
                print(f"Found {len(mixed_nodes)} nodes shared between normal and intercom edges")
                
        except Exception as e:
            print(f"Error loading data: {e}")
            # Create some sample data for testing
            self.nodes = {(0.0, 0.0, 0.0), (10.0, 0.0, 0.0), (5.0, 5.0, 0.0), (10.0, 10.0, 0.0)}
            self.edges = [((0.0, 0.0, 0.0), (10.0, 0.0, 0.0)), ((10.0, 0.0, 0.0), (5.0, 5.0, 0.0)), 
                         ((5.0, 5.0, 0.0), (10.0, 10.0, 0.0)), ((0.0, 0.0, 0.0), (5.0, 5.0, 0.0))]
    
    def setup_ui(self):
        """Setup the user interface"""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        layout = QHBoxLayout(central_widget)
        
        # Graphics view for network
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(QPainter.Antialiasing)
        self.view.setMouseTracking(True)  # Enable mouse tracking for tooltips
        self.view.mouseMoveEvent = self.view_mouse_move_event  # Override mouse move event
        layout.addWidget(self.view, stretch=5)
        
        # Control panel - streamlined without group boxes
        control_panel = QWidget()
        control_layout = QVBoxLayout(control_panel)
        control_layout.setSpacing(3)  # Minimal spacing
        control_layout.setContentsMargins(5, 5, 5, 5)  # Reduce margins
        layout.addWidget(control_panel, stretch=1)
        
        # Node Diameter
        control_layout.addWidget(QLabel("Node Diameter:"))
        self.node_spinbox = QDoubleSpinBox()
        self.node_spinbox.setRange(0.1, 10.0)
        self.node_spinbox.setSingleStep(0.1)
        self.node_spinbox.setDecimals(1)
        self.node_spinbox.setValue(self.node_diameter)
        self.node_spinbox.valueChanged.connect(self.on_node_diameter_changed)
        control_layout.addWidget(self.node_spinbox)
        
        # Line Width
        control_layout.addWidget(QLabel("Line Width:"))
        self.line_spinbox = QDoubleSpinBox()
        self.line_spinbox.setRange(0.1, 5.0)
        self.line_spinbox.setSingleStep(0.1)
        self.line_spinbox.setDecimals(1)
        self.line_spinbox.setValue(self.line_width)
        self.line_spinbox.valueChanged.connect(self.on_line_width_changed)
        control_layout.addWidget(self.line_spinbox)
        
        # Arrow Width
        control_layout.addWidget(QLabel("Arrow Width:"))
        self.arrow_width_spinbox = QDoubleSpinBox()
        self.arrow_width_spinbox.setRange(0.1, 5.0)
        self.arrow_width_spinbox.setSingleStep(0.1)
        self.arrow_width_spinbox.setDecimals(1)
        self.arrow_width_spinbox.setValue(self.arrow_width)
        self.arrow_width_spinbox.valueChanged.connect(self.on_arrow_width_changed)
        control_layout.addWidget(self.arrow_width_spinbox)
        
        # Arrow Length - compact slider with inline value
        arrow_length_container = QHBoxLayout()
        arrow_length_container.addWidget(QLabel("Arrow %:"))
        self.arrow_length_slider = QSlider(Qt.Horizontal)
        self.arrow_length_slider.setRange(10, 100)
        self.arrow_length_slider.setValue(self.arrow_length_percent)
        self.arrow_length_slider.valueChanged.connect(self.on_arrow_length_changed)
        arrow_length_container.addWidget(self.arrow_length_slider)
        self.arrow_length_value_label = QLabel(f"{self.arrow_length_percent}%")
        self.arrow_length_value_label.setMinimumWidth(35)
        self.arrow_length_slider.valueChanged.connect(
            lambda value: self.arrow_length_value_label.setText(f"{value}%")
        )
        arrow_length_container.addWidget(self.arrow_length_value_label)
        control_layout.addLayout(arrow_length_container)
        
        # Font Size - compact slider with inline value
        font_size_container = QHBoxLayout()
        font_size_container.addWidget(QLabel("Font:"))
        self.font_size_slider = QSlider(Qt.Horizontal)
        self.font_size_slider.setRange(1, 6)
        self.font_size_slider.setValue(self.font_size)
        self.font_size_slider.valueChanged.connect(self.on_font_size_changed)
        font_size_container.addWidget(self.font_size_slider)
        self.font_size_value_label = QLabel(f"{self.font_size}")
        self.font_size_value_label.setMinimumWidth(35)
        self.font_size_slider.valueChanged.connect(
            lambda value: self.font_size_value_label.setText(f"{value}")
        )
        font_size_container.addWidget(self.font_size_value_label)
        control_layout.addLayout(font_size_container)
        
        # Separator
        control_layout.addWidget(QLabel(""))
        
        # Network Info
        self.node_count_label = QLabel(f"Nodes: {len(self.nodes)}")
        self.edge_count_label = QLabel(f"Edges: {len(self.edges)}")
        control_layout.addWidget(self.node_count_label)
        control_layout.addWidget(self.edge_count_label)
        
        # Separator
        control_layout.addWidget(QLabel(""))
        
        # Buttons
        self.reload_button = QPushButton("Reload CSV Data")
        self.reload_button.clicked.connect(self.reload_data)
        control_layout.addWidget(self.reload_button)
        
        self.export_edges_button = QPushButton("Export Edge Data")
        self.export_edges_button.clicked.connect(self.export_edge_data)
        control_layout.addWidget(self.export_edges_button)
        
        self.print_results_button = QPushButton("Print Node Results")
        self.print_results_button.clicked.connect(self.print_all_node_results)
        control_layout.addWidget(self.print_results_button)
        
        # Separator
        control_layout.addWidget(QLabel(""))
        
        # ArtNet Optimization
        self.optimize_button = QPushButton("Optimize ArtNet")
        self.optimize_button.clicked.connect(self.optimize_artnet)
        control_layout.addWidget(self.optimize_button)
        
        self.show_artnet_checkbox = QPushButton("Show Smart Nodes (□ + #)")
        self.show_artnet_checkbox.setCheckable(True)
        self.show_artnet_checkbox.clicked.connect(self.toggle_artnet_display)
        control_layout.addWidget(self.show_artnet_checkbox)
        
        # Grid Display (right under smart nodes)
        self.show_grid_checkbox = QPushButton("Show Grid")
        self.show_grid_checkbox.setCheckable(True)
        self.show_grid_checkbox.clicked.connect(self.toggle_grid)
        control_layout.addWidget(self.show_grid_checkbox)
        
        self.artnet_info_label = QLabel("Click 'Optimize' to analyze")
        self.artnet_info_label.setWordWrap(True)
        control_layout.addWidget(self.artnet_info_label)
        
        # Separator
        control_layout.addWidget(QLabel(""))
        
        # Data Cables
        self.show_cables_checkbox = QPushButton("Show Data Cables")
        self.show_cables_checkbox.setCheckable(True)
        self.show_cables_checkbox.clicked.connect(self.toggle_data_cables)
        control_layout.addWidget(self.show_cables_checkbox)
        
        self.cable_info_label = QLabel("Cable: 0.00m")
        control_layout.addWidget(self.cable_info_label)
        
        # Edge Length Filter
        length_filter_container = QHBoxLayout()
        length_filter_container.addWidget(QLabel("Edge Length:"))
        self.length_filter_slider = QSlider(Qt.Horizontal)
        self.length_filter_slider.setRange(-1, 0)  # Will update after calculating groups
        self.length_filter_slider.setValue(-1)
        self.length_filter_slider.setMinimumWidth(150)  # Make slider wider
        self.length_filter_slider.setTickPosition(QSlider.TicksBelow)
        self.length_filter_slider.setTickInterval(1)
        self.length_filter_slider.setSingleStep(1)
        self.length_filter_slider.setPageStep(1)
        self.length_filter_slider.valueChanged.connect(self.on_length_filter_changed)
        length_filter_container.addWidget(self.length_filter_slider)
        self.length_filter_label = QLabel("All")
        self.length_filter_label.setMinimumWidth(100)
        length_filter_container.addWidget(self.length_filter_label)
        control_layout.addLayout(length_filter_container)
        
        control_layout.addStretch()
    
    def on_node_diameter_changed(self, value):
        """Handle node diameter change"""
        self.node_diameter = value
        self.draw_network()
    
    def on_line_width_changed(self, value):
        """Handle line width change"""
        self.line_width = value
        self.draw_network()
    
    def on_arrow_width_changed(self, value):
        """Handle arrow width change"""
        self.arrow_width = value
        self.draw_network()
    
    def on_arrow_length_changed(self, value):
        """Handle arrow length percentage change"""
        self.arrow_length_percent = value
        self.draw_network()
    
    def on_font_size_changed(self, value):
        """Handle font size change"""
        self.font_size = value
        self.draw_network()
    
    def view_mouse_move_event(self, event):
        """Handle mouse move events to show tooltips"""
        # Get the scene position
        scene_pos = self.view.mapToScene(event.pos())
        
        # Find the closest node within a reasonable distance
        closest_node = None
        min_distance = float('inf')
        node_radius = self.node_diameter / 2
        
        for node in self.nodes:
            node_x, node_y = node[0], node[1]
            distance = math.sqrt((scene_pos.x() - node_x)**2 + (scene_pos.y() - node_y)**2)
            
            # Check if mouse is within a very large hover area (20x the node radius for easy triggering)
            if distance <= node_radius * 20:  # Very large hover area - easy to trigger
                if distance < min_distance:
                    min_distance = distance
                    closest_node = node
        
        if closest_node:
            # Calculate tooltip information
            x, y = closest_node[0], closest_node[1]
            node_id = self.node_ids.get(closest_node, "Unknown")
            arrows_drawn = 0
            total_count = 0
            edge_ids = []
            
            # Count total edges and build edge ID list
            for edge in self.edges:
                start_node, end_node = edge
                if start_node == closest_node or end_node == closest_node:
                    total_count += 1
                    edge_ids.append(str(self.edge_ids.get(edge, "?")))  # Edge ID from CSV
            
            # Count arrows - USE EXACT SAME LOGIC AS ARROW DRAWING
            if (self.artnet_optimization and self.show_artnet_nodes):
                artnet_nodes_set = set(self.artnet_optimization['artnet_nodes'])
                
                for edge in self.edges:
                    start_node, end_node = edge
                    arrow_from = None
                    
                    # EXACT SAME LOGIC AS ARROW DRAWING
                    if edge in self.intercom_edges:
                        if start_node in self.intercom_nodes:
                            arrow_from = end_node
                        elif end_node in self.intercom_nodes:
                            arrow_from = start_node
                    elif start_node in artnet_nodes_set and end_node in artnet_nodes_set:
                        if 'edge_directions' in self.artnet_optimization:
                            data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
                            if (data_start == start_node and data_end == end_node) or \
                               (data_start == end_node and data_end == start_node):
                                arrow_from = data_start
                            # If redirected, don't count (arrow_from stays None)
                        else:
                            arrow_from = start_node
                    elif start_node in artnet_nodes_set:
                        arrow_from = start_node
                    elif end_node in artnet_nodes_set:
                        arrow_from = end_node
                    
                    if arrow_from == closest_node:
                        arrows_drawn += 1
            
            # Check if this is an ArtNet node
            is_artnet = (self.artnet_optimization and 
                        self.show_artnet_nodes and 
                        closest_node in self.artnet_optimization['artnet_nodes'])
            
            # Check if this is an intercom node
            is_intercom = closest_node in self.intercom_nodes
            
            # Determine node type
            if is_intercom:
                node_type = "Intercom Node"
            elif is_artnet:
                node_type = "ArtNet Node"
            else:
                node_type = "Regular Node"
            
            tooltip_text = f"Node ID: {node_id}\n"
            tooltip_text += f"Position: ({x:.2f}, {y:.2f})\n"
            tooltip_text += f"Total edges: {total_count}\n"
            tooltip_text += f"Arrows drawn: {arrows_drawn}\n"
            tooltip_text += f"Edge IDs: {', '.join(edge_ids[:5])}"
            if len(edge_ids) > 5:
                tooltip_text += f" (+{len(edge_ids)-5} more)"
            tooltip_text += f"\nType: {node_type}"
            
            # Show tooltip at cursor position - persistent until new node is hovered
            QToolTip.showText(event.globalPos(), tooltip_text, self.view, QRect(), 60000)  # 60 second timeout
        # Don't hide tooltip when mouse moves away - let it stay visible for reading
    
    def calculate_length_groups(self):
        """Calculate all unique edge lengths"""
        import math
        
        # Calculate all edge lengths with counts
        length_counts = {}
        for edge in self.edges:
            start_node, end_node = edge
            dx = end_node[0] - start_node[0]
            dy = end_node[1] - start_node[1]
            dz = end_node[2] - start_node[2]
            length = math.sqrt(dx*dx + dy*dy + dz*dz)
            length_rounded = round(length, 2)  # Round to 2 decimal places
            length_counts[length_rounded] = length_counts.get(length_rounded, 0) + 1
        
        if not length_counts:
            self.length_groups = []
            return
        
        # Sort unique lengths and create list of (length, count)
        self.length_groups = [(length, count) for length, count in sorted(length_counts.items())]
        
        # Update slider range
        if self.length_groups:
            self.length_filter_slider.setRange(-1, len(self.length_groups) - 1)
        
        print(f"Unique edge lengths: {len(self.length_groups)}")
        for i, (length, count) in enumerate(self.length_groups[:10]):  # Show first 10
            print(f"  Length {i}: {length:.2f}m ({count} edges)")
        if len(self.length_groups) > 10:
            print(f"  ... and {len(self.length_groups) - 10} more")
    
    def on_length_filter_changed(self, value):
        """Handle edge length filter change"""
        self.selected_length_group = value
        
        if value == -1:
            self.length_filter_label.setText(f"All ({len(self.edges)})")
        elif 0 <= value < len(self.length_groups):
            length, count = self.length_groups[value]
            self.length_filter_label.setText(f"{length:.2f}m ({count})")
        
        self.draw_network()
    
    def reload_data(self):
        """Reload and reparse the CSV data"""
        print("Reloading CSV data...")
        self.load_data()
        self.calculate_length_groups()
        self.draw_network()
        print(f"Reloaded: {len(self.nodes)} nodes, {len(self.edges)} edges")
    
    def optimize_artnet(self):
        """Run ArtNet optimization"""
        try:
            print("Optimizing ArtNet distribution...")
            
            # Include ALL edges in optimization (including intercom edges)
            # This ensures nodes connecting to intercom endpoints become smart nodes
            self.artnet_optimization = optimize_led_network(self.nodes, self.edges)
            
            # After optimization, ensure nodes connecting to intercom nodes are ArtNet nodes
            # and that pure intercom nodes are NOT ArtNet nodes
            artnet_set = set(self.artnet_optimization['artnet_nodes'])
            
            # Remove pure intercom nodes from ArtNet nodes if they were selected
            artnet_set = artnet_set - self.intercom_nodes
            
            # Force nodes that connect to intercom nodes to be ArtNet nodes
            for edge in self.intercom_edges:
                start_node, end_node = edge
                # The node that's NOT a pure intercom node must be an ArtNet node
                if start_node not in self.intercom_nodes:
                    artnet_set.add(start_node)
                if end_node not in self.intercom_nodes:
                    artnet_set.add(end_node)
            
            self.artnet_optimization['artnet_nodes'] = list(artnet_set)
            print(f"ArtNet optimization: {len(artnet_set)} nodes (including nodes connecting to {len(self.intercom_nodes)} intercom endpoints)")
            
            # Calculate total edge length
            total_edge_length = 0
            for edge in self.edges:
                start_node, end_node = edge
                start_x, start_y, start_z = start_node
                end_x, end_y, end_z = end_node
                edge_length = math.sqrt((end_x - start_x)**2 + (end_y - start_y)**2 + (end_z - start_z)**2)
                total_edge_length += edge_length
            
            # Update info display
            info_text = f"ArtNet Nodes: {len(self.artnet_optimization['artnet_nodes'])}\n"
            info_text += f"End Nodes: {len(self.artnet_optimization['end_nodes'])}\n"
            info_text += f"Max Distance: {self.artnet_optimization['max_distance']:.2f}m\n"
            info_text += f"Total Edge Length: {total_edge_length:.2f}m\n"
            
            # Only show output counts if there are violations
            if 'artnet_output_counts' in self.artnet_optimization:
                if self.artnet_optimization.get('direction_violations'):
                    max_outputs = max(self.artnet_optimization['artnet_output_counts'].values())
                    violations = len(self.artnet_optimization['direction_violations'])
                    info_text += f"Max Outputs/Node: {max_outputs}\n"
                    info_text += f"⚠️ {violations} nodes > 4 ports\n"
            
            # Show total amp usage and violations if any
            if 'row_power' in self.artnet_optimization:
                row_amps = self.artnet_optimization['row_power']
                total_amps = sum(row_amps.values())
                info_text += f"Total Amps: {total_amps}A\n"
                
                row_violations = [y for y, a in row_amps.items() if a > 20]
                if row_violations:
                    info_text += f"⚠️ {len(row_violations)} rows > 20A"
            
            self.artnet_info_label.setText(info_text)
            
            # Redraw network to show ArtNet nodes if enabled
            if self.show_artnet_nodes:
                self.draw_network()
            
            print("ArtNet optimization completed successfully!")
            
        except Exception as e:
            print(f"Error during ArtNet optimization: {e}")
            self.artnet_info_label.setText(f"Error: {str(e)}")
    
    def toggle_artnet_display(self):
        """Toggle display of ArtNet nodes"""
        self.show_artnet_nodes = self.show_artnet_checkbox.isChecked()
        self.draw_network()
    
    def toggle_data_cables(self):
        """Toggle display of data cables"""
        self.show_data_cables = self.show_cables_checkbox.isChecked()
        
        if self.show_data_cables and not self.artnet_optimization:
            print("Data cables require ArtNet optimization. Please run 'Optimize ArtNet Distribution' first.")
            self.cable_info_label.setText("Run ArtNet Optimization First")
            self.show_cables_checkbox.setChecked(False)
            self.show_data_cables = False
            return
            
        self.draw_network()
    
    def toggle_grid(self):
        """Toggle display of grid"""
        self.show_grid = self.show_grid_checkbox.isChecked()
        self.draw_network()
    
    def print_all_node_results(self):
        """Print detailed information for all nodes"""
        if not self.artnet_optimization:
            print("No ArtNet optimization results available. Run optimization first.")
            return
        
        print("\n=== ALL NODE RESULTS ===")
        print(f"{'Node ID':<8} {'Coordinates':<20} {'Type':<12} {'Total':<6} {'Arrows':<9} {'Edge IDs':<30}")
        print("-" * 85)
        
        for node in sorted(self.nodes, key=lambda n: self.node_ids.get(n, 0)):
            node_id = self.node_ids.get(node, 0)
            x, y = node[0], node[1]
            coords = f"({x:.1f}, {y:.1f})"
            
            # Calculate connections and collect edge IDs
            total_connections = 0
            arrows_drawn = 0
            edge_ids = []
            
            # Count total edges and build edge ID list
            for edge in self.edges:
                start_node, end_node = edge
                if start_node == node or end_node == node:
                    total_connections += 1
                    edge_ids.append(str(self.edge_ids.get(edge, "?")))  # Edge ID from CSV
            
            # Count arrows - USE EXACT SAME LOGIC AS ARROW DRAWING
            artnet_nodes_set = set(self.artnet_optimization['artnet_nodes'])
            
            for edge in self.edges:
                start_node, end_node = edge
                arrow_from = None
                
                # EXACT SAME LOGIC AS ARROW DRAWING
                if edge in self.intercom_edges:
                    if start_node in self.intercom_nodes:
                        arrow_from = end_node
                    elif end_node in self.intercom_nodes:
                        arrow_from = start_node
                elif start_node in artnet_nodes_set and end_node in artnet_nodes_set:
                    if 'edge_directions' in self.artnet_optimization:
                        data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
                        if (data_start == start_node and data_end == end_node) or \
                           (data_start == end_node and data_end == start_node):
                            arrow_from = data_start
                        # If redirected, don't count (arrow_from stays None)
                    else:
                        arrow_from = start_node
                elif start_node in artnet_nodes_set:
                    arrow_from = start_node
                elif end_node in artnet_nodes_set:
                    arrow_from = end_node
                
                if arrow_from == node:
                    arrows_drawn += 1
            
            # Determine node type
            is_artnet = node in self.artnet_optimization['artnet_nodes']
            node_type = "ArtNet Node" if is_artnet else "Regular Node"
            
            # Get ArtNet count (red number) - this is the number of arrows drawn FROM this ArtNet node
            artnet_count = arrows_drawn if is_artnet else "-"
            
            # Format edge IDs (limit to first 10 to avoid too wide output)
            edge_ids_str = ",".join(edge_ids[:10])
            if len(edge_ids) > 10:
                edge_ids_str += f"...(+{len(edge_ids)-10} more)"
            
            print(f"{node_id:<8} {coords:<20} {node_type:<12} {total_connections:<6} {arrows_drawn:<9} {edge_ids_str:<30}")
        
        print("-" * 85)
        print(f"Total nodes: {len(self.nodes)}")
        print(f"ArtNet nodes: {len(self.artnet_optimization['artnet_nodes'])}")
        print(f"Regular nodes: {len(self.nodes) - len(self.artnet_optimization['artnet_nodes'])}")
        print("=" * 85)
    
    def export_edge_data(self):
        """Export edge data to CSV file"""
        if not self.artnet_optimization:
            print("No ArtNet optimization results available. Run optimization first.")
            return
        
        # Read original CSV to get Type column
        edge_types = {}
        try:
            df = pd.read_csv('Oct10_003_stephan.csv')
            for i, row in df.iterrows():
                start_node = (float(row['start_X']), float(row['start_Y']), float(row['start_Z']))
                end_node = (float(row['end_X']), float(row['end_Y']), float(row['end_Z']))
                edge = (start_node, end_node)
                edge_types[edge] = str(row.get('Type', 'Normal')).strip()
        except Exception as e:
            print(f"Warning: Could not read Type column from CSV: {e}")
        
        filename = "edge_data_export.csv"
        
        try:
            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                
                # Write header
                writer.writerow(['Edge ID', 'Edge Length', 'Start X', 'Start Y', 'Start Z', 'End X', 'End Y', 'End Z', 'Data Flow Start Node ID', 'Data Flow End Node ID', 'Type'])
                
                # Process each edge
                for edge in self.edges:
                    start_node, end_node = edge
                    edge_id = self.edge_ids.get(edge, "?")  # Edge ID from CSV
                    
                    # Calculate edge length (Euclidean distance)
                    start_x, start_y, start_z = start_node
                    end_x, end_y, end_z = end_node
                    edge_length = math.sqrt((end_x - start_x)**2 + (end_y - start_y)**2 + (end_z - start_z)**2)
                    
                    # Get edge type from original CSV first
                    edge_type = edge_types.get(edge, "Normal")
                    
                    # Determine data flow direction
                    # Special case: Intercom nodes can only be data flow ENDS, never STARTS
                    if edge_type.lower() == 'intercom':
                        # For intercom edges, data flows TO the intercom node
                        # Find which node is the intercom node
                        if start_node in self.intercom_nodes and end_node not in self.intercom_nodes:
                            # Start is intercom, data flows FROM end TO start
                            flow_start_id = self.node_ids.get(end_node, "Unknown")
                            flow_end_id = self.node_ids.get(start_node, "Unknown")
                        elif end_node in self.intercom_nodes and start_node not in self.intercom_nodes:
                            # End is intercom, data flows FROM start TO end
                            flow_start_id = self.node_ids.get(start_node, "Unknown")
                            flow_end_id = self.node_ids.get(end_node, "Unknown")
                        else:
                            # Both or neither are intercom - no flow for intercom-to-intercom
                            flow_start_id = "No Flow"
                            flow_end_id = "No Flow"
                    elif 'edge_directions' in self.artnet_optimization:
                        # Use balanced directions that respect 4-port limit
                        data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
                        if data_start is not None:
                            flow_start_id = self.node_ids.get(data_start, "Unknown")
                            flow_end_id = self.node_ids.get(data_end, "Unknown")
                        else:
                            flow_start_id = "No Flow"
                            flow_end_id = "No Flow"
                    else:
                        # Fallback to old logic if edge_directions not available
                        if start_node in self.artnet_optimization['artnet_nodes']:
                            flow_start_id = self.node_ids.get(start_node, "Unknown")
                            flow_end_id = self.node_ids.get(end_node, "Unknown")
                        elif end_node in self.artnet_optimization['artnet_nodes']:
                            flow_start_id = self.node_ids.get(end_node, "Unknown")
                            flow_end_id = self.node_ids.get(start_node, "Unknown")
                        else:
                            flow_start_id = "No Flow"
                            flow_end_id = "No Flow"
                    
                    # Write edge data
                    writer.writerow([edge_id, f"{edge_length:.2f}", 
                                   start_x, start_y, start_z, 
                                   end_x, end_y, end_z, 
                                   flow_start_id, flow_end_id, edge_type])
            
            print(f"Edge data exported to: {filename}")
            print(f"Exported {len(self.edges)} edges")
            
            # Now create the edge length frequency CSV
            self._export_edge_length_frequency()
            
        except Exception as e:
            print(f"Error exporting edge data: {e}")
    
    def _export_edge_length_frequency(self):
        """Export edge length frequency distribution to CSV"""
        filename = "edge_length_frequency.csv"
        
        try:
            # Calculate all edge lengths and count frequencies
            length_counts = {}
            
            for edge in self.edges:
                start_node, end_node = edge
                start_x, start_y, start_z = start_node
                end_x, end_y, end_z = end_node
                edge_length = math.sqrt((end_x - start_x)**2 + (end_y - start_y)**2 + (end_z - start_z)**2)
                
                # Round to 2 decimal places for grouping
                rounded_length = round(edge_length, 2)
                
                if rounded_length in length_counts:
                    length_counts[rounded_length] += 1
                else:
                    length_counts[rounded_length] = 1
            
            # Sort by length
            sorted_lengths = sorted(length_counts.items())
            
            # Write to CSV
            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                
                # Write header
                writer.writerow(['Edge Length', 'Count'])
                
                # Write length frequencies
                for length, count in sorted_lengths:
                    writer.writerow([f"{length:.2f}", count])
            
            print(f"Edge length frequency exported to: {filename}")
            print(f"Found {len(sorted_lengths)} unique edge lengths")
            
        except Exception as e:
            print(f"Error exporting edge length frequency: {e}")
    
    def _get_window_bounds(self):
        """Calculate window boundaries based on network area"""
        if not self.nodes:
            return 0, 0, 0, 0
        
        # Get network bounds
        all_coords = list(self.nodes)
        x_coords = [coord[0] for coord in all_coords]
        y_coords = [coord[1] for coord in all_coords]
        
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)
        
        return min_x, max_x, min_y, max_y
    
    def _calculate_grid_coordinates(self):
        """Calculate coordinates for grid based on unique start_X and start_Y values from CSV"""
        try:
            # Read the CSV file to get all coordinate values
            df = pd.read_csv('Oct10_003_stephan.csv')
            
            # Extract all unique X and Y coordinates from START points only
            # Exclude intercom edges from grid generation
            all_x = set()
            all_y = set()
            
            for _, row in df.iterrows():
                # Skip intercom edges - don't use them for grid generation
                edge_type = str(row.get('Type', 'Normal')).strip()
                if edge_type.lower() != 'intercom':
                    all_x.add(row['start_X'])
                    all_y.add(row['start_Y'])
            
            # Sort coordinates to get ordered grid positions
            sorted_x = sorted(all_x)
            sorted_y = sorted(all_y)
            
            print(f"Grid: Found {len(sorted_x)} unique start_X coordinates, {len(sorted_y)} unique start_Y coordinates (excluding intercom edges)")
            
            # Create grid points from all combinations of actual coordinates
            grid_points = []
            for y in sorted_y:
                for x in sorted_x:
                    grid_points.append((x, y))
            
            return grid_points
            
        except Exception as e:
            print(f"Error reading CSV for grid: {e}")
            return []
    
    def _find_closest_window_center(self, node):
        """Find the closest center point of the 4 window edges to a given node"""
        x, y = node[0], node[1]
        min_x, max_x, min_y, max_y = self._get_window_bounds()
        
        # Calculate center points of each window edge
        center_points = []
        
        # Left edge center
        left_center = (min_x, (min_y + max_y) / 2)
        center_points.append(left_center)
        
        # Right edge center
        right_center = (max_x, (min_y + max_y) / 2)
        center_points.append(right_center)
        
        # Bottom edge center
        bottom_center = ((min_x + max_x) / 2, min_y)
        center_points.append(bottom_center)
        
        # Top edge center
        top_center = ((min_x + max_x) / 2, max_y)
        center_points.append(top_center)
        
        # Calculate Euclidean distances to each center point
        distances = []
        for center_x, center_y in center_points:
            distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
            distances.append(distance)
        
        # Find minimum distance and corresponding center point
        min_distance = min(distances)
        closest_center = center_points[distances.index(min_distance)]
        
        return closest_center, min_distance
    
    def _draw_grid(self):
        """Draw the complete 17x13 grid as background"""
        if not self.show_grid:
            return
            
        grid_points = self._calculate_grid_coordinates()
        
        # Grid node appearance - small black circles using same diameter as network nodes
        grid_pen = QPen(QColor(0, 0, 0), 1)  # Black outline, same width as nodes
        grid_brush = QBrush(QColor(0, 0, 0))  # Black fill
        grid_diameter = self.node_diameter  # Same size as network nodes
        grid_radius = grid_diameter / 2
        for x, y in grid_points:
            # Draw grid point as small circle
            self.scene.addEllipse(x - grid_radius, y - grid_radius,
                                grid_diameter, grid_diameter, grid_pen, grid_brush)
     
        # Calculate actual grid dimensions from the coordinate data
        if len(grid_points) > 0:
            # Get unique coordinates to determine grid size
            unique_x = sorted(set(point[0] for point in grid_points))
            unique_y = sorted(set(point[1] for point in grid_points))
            grid_cols = len(unique_x)
            grid_rows = len(unique_y)
            
            print(f"Grid: Drew {len(grid_points)} grid points ({grid_cols}x{grid_rows})")
            print(f"Grid bounds: X({unique_x[0]:.1f} to {unique_x[-1]:.1f}), Y({unique_y[0]:.1f} to {unique_y[-1]:.1f})")
            print(f"First grid point: ({grid_points[0][0]:.1f}, {grid_points[0][1]:.1f})")
            print(f"Last grid point: ({grid_points[-1][0]:.1f}, {grid_points[-1][1]:.1f})")
    
    def _draw_window_frame(self):
        """Draw window boundary frame (always visible)"""
        if not self.nodes:
            return
            
        # Draw window boundary rectangle
        min_x, max_x, min_y, max_y = self._get_window_bounds()
        window_pen = QPen(QColor(100, 100, 100), self.line_width * 3)  # Gray window outline
        window_pen.setStyle(Qt.DashLine)  # Dashed line
        self.scene.addRect(min_x, min_y, max_x - min_x, max_y - min_y, window_pen)
        
        # Add window edge length labels
        window_width = max_x - min_x
        window_height = max_y - min_y
        
        # Calculate center points for label positioning
        left_center = (min_x, (min_y + max_y) / 2)
        right_center = (max_x, (min_y + max_y) / 2)
        bottom_center = ((min_x + max_x) / 2, min_y)
        top_center = ((min_x + max_x) / 2, max_y)
        
        # Create smaller font for window measurements
        edge_text_color = QColor(0, 0, 0)  # Black text
        edge_font_size = max(1, int(self.font_size * 0.5))  # 50% smaller than normal font
        spacing = 2.0  # Distance outside window edge
        
        # Top edge label (outside, above the window)
        top_text = self.scene.addText(f"{window_width:.1f}m")
        top_text.setDefaultTextColor(edge_text_color)
        font = top_text.font()
        font.setPointSize(edge_font_size)
        top_text.setFont(font)
        top_rect = top_text.boundingRect()
        top_text.setPos(top_center[0] - top_rect.width()/2, max_y + spacing)
        
        # Bottom edge label (outside, below the window)
        bottom_text = self.scene.addText(f"{window_width:.1f}m")
        bottom_text.setDefaultTextColor(edge_text_color)
        font = bottom_text.font()
        font.setPointSize(edge_font_size)
        bottom_text.setFont(font)
        bottom_rect = bottom_text.boundingRect()
        bottom_text.setPos(bottom_center[0] - bottom_rect.width()/2, min_y - spacing - bottom_rect.height())
        
        # Left edge label (outside, left of the window, rotated)
        left_text = self.scene.addText(f"{window_height:.1f}m")
        left_text.setDefaultTextColor(edge_text_color)
        font = left_text.font()
        font.setPointSize(edge_font_size)
        left_text.setFont(font)
        left_text.setRotation(-90)  # Rotate for vertical text
        left_rect = left_text.boundingRect()
        left_text.setPos(min_x - spacing - left_rect.height(), left_center[1] + left_rect.width()/2)
        
        # Right edge label (outside, right of the window, rotated)
        right_text = self.scene.addText(f"{window_height:.1f}m")
        right_text.setDefaultTextColor(edge_text_color)
        font = right_text.font()
        font.setPointSize(edge_font_size)
        right_text.setFont(font)
        right_text.setRotation(90)  # Rotate for vertical text
        right_rect = right_text.boundingRect()
        right_text.setPos(max_x + spacing, right_center[1] - right_rect.width()/2)
    
    def _draw_grid_labels(self):
        """Draw row letters (left side) and column numbers (top) - excluding intercom nodes"""
        if not self.nodes:
            return
        
        # Get window bounds
        min_x, max_x, min_y, max_y = self._get_window_bounds()
        
        # Get all unique Y coordinates (rows) and X coordinates (columns)
        # Exclude intercom nodes from grid
        grid_nodes = self.nodes - self.intercom_nodes
        if not grid_nodes:
            return
        
        # Sort Y ascending so lowest Y (top-left, like 0,0) = row A
        all_y_coords = sorted(set(node[1] for node in grid_nodes))  # Ascending: low Y at top
        all_x_coords = sorted(set(node[0] for node in grid_nodes))  # Left to right
        
        # Use same font and size as rectangle edge distance labels
        label_color = QColor(0, 0, 0)  # Black text
        label_font_size = max(1, int(self.font_size * 0.5))  # Same as edge labels
        
        # Draw row labels (letters) on the left side
        # Start with A at lowest Y (top row)
        for i, y_coord in enumerate(all_y_coords):
            # Convert index to letter (A, B, C, ..., Z, AA, AB, ...)
            if i < 26:
                letter = chr(65 + i)  # A-Z
            else:
                # For more than 26 rows: AA, AB, AC, ...
                first = chr(65 + (i // 26) - 1)
                second = chr(65 + (i % 26))
                letter = first + second
            
            row_label = self.scene.addText(letter)
            row_label.setDefaultTextColor(label_color)
            font = row_label.font()
            font.setPointSize(label_font_size)
            row_label.setFont(font)
            
            # Position to the left of the frame, centered on the row (very close)
            label_rect = row_label.boundingRect()
            row_label.setPos(min_x - label_rect.width() - 0.3, y_coord - label_rect.height() / 2)
        
        # Draw column labels (numbers) at the top (above min_y, which is the top)
        for i, x_coord in enumerate(all_x_coords):
            col_number = str(i + 1)  # Start from 1
            
            col_label = self.scene.addText(col_number)
            col_label.setDefaultTextColor(label_color)
            font = col_label.font()
            font.setPointSize(label_font_size)
            col_label.setFont(font)
            
            # Position above the top of frame (at min_y, which is visually at top, very close)
            label_rect = col_label.boundingRect()
            col_label.setPos(x_coord - label_rect.width() / 2, min_y - label_rect.height() - 0.3)
        
        print(f"Grid labels: {len(all_y_coords)} rows (A-{chr(65 + len(all_y_coords) - 1) if len(all_y_coords) <= 26 else '...'}) × {len(all_x_coords)} columns (1-{len(all_x_coords)}) [excluding {len(self.intercom_nodes)} intercom nodes]")
    
    def _draw_row_power_consumption(self):
        """Draw power consumption per horizontal row (grid row)"""
        if not self.artnet_optimization:
            print("Row power: No ArtNet optimization found")
            return
        
        if 'edge_directions' not in self.artnet_optimization:
            print("Row power: No edge_directions found - run ArtNet optimization first")
            return
        
        print("Drawing row power consumption...")
        
        # Get window bounds
        min_x, max_x, min_y, max_y = self._get_window_bounds()
        print(f"Window bounds: x=[{min_x}, {max_x}], y=[{min_y}, {max_y}]")
        
        # Group edges by the Y coordinate of the ArtNet node that powers them
        # Each edge requires 1 amp, so count edges per row
        row_amps = {}  # Maps Y coordinate to amp count
        
        for edge in self.edges:
            data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
            
            if data_start is not None:
                # Get the Y coordinate of the ArtNet node powering this edge
                source_y = data_start[1]
                
                if source_y not in row_amps:
                    row_amps[source_y] = 0
                row_amps[source_y] += 1  # 1 amp per edge
        
        # Sort rows by Y coordinate (top to bottom)
        sorted_rows = sorted(row_amps.items(), key=lambda x: -x[0])  # Negative for top-to-bottom
        
        print(f"Found {len(row_amps)} rows with power consumption")
        for row_y, amps in sorted_rows[:5]:  # Show first 5
            print(f"  Y={row_y:.1f}: {amps}A")
        
        # Display text to the right of the frame (just outside the dashed rectangle)
        text_x = max_x + 1.5  # Position just to the right of dashed outline
        max_amps = 20  # 20 amp limit per row
        # Use same small font as grid labels
        amp_font_size = max(1, int(self.font_size * 0.5))
        
        print(f"Displaying at x={text_x}, font_size={amp_font_size}")
        
        # Draw each row's power consumption aligned with the actual row Y coordinate
        for row_y, amps in sorted_rows:
            # Determine color based on amp usage
            if amps > max_amps:
                color = QColor(255, 0, 0)  # Red - exceeds limit
            elif amps > max_amps * 0.9:
                color = QColor(255, 165, 0)  # Orange - near limit
            else:
                color = QColor(0, 150, 0)  # Green - OK
            
            # Create text showing just the amp value
            row_text = self.scene.addText(f"{amps}A")
            row_text.setDefaultTextColor(color)
            font = row_text.font()
            font.setPointSize(amp_font_size)  # Same as grid labels
            row_text.setFont(font)
            
            # Position text at the ACTUAL Y coordinate of the row (centered vertically)
            text_rect = row_text.boundingRect()
            row_text.setPos(text_x, row_y - text_rect.height() / 2)
        
        # Check for violations and print summary
        violations = [y for y, amps in row_amps.items() if amps > max_amps]
        if violations:
            print(f"\n⚠️  Power Warning: {len(violations)} row(s) exceed 20A limit:")
            for row_y in sorted(violations, reverse=True):
                amps = row_amps[row_y]
                excess = amps - max_amps
                print(f"   Y={row_y:.1f}: {amps}A (excess: {excess}A)")
        else:
            print(f"\n✅ All rows within 20A limit (max: {max(row_amps.values())}A)")
    
    def _draw_data_cables(self):
        """Draw data cables from ArtNet nodes to closest window edges"""
        print(f"Debug: artnet_optimization={self.artnet_optimization is not None}, show_data_cables={self.show_data_cables}")
        
        if not self.artnet_optimization:
            print("Data cables: No ArtNet optimization found. Run 'Optimize ArtNet Distribution' first.")
            return
            
        if not self.show_data_cables:
            return
        
        cable_pen = QPen(QColor(255, 165, 0), self.line_width * 2)  # Orange cables, thicker
        
        total_length = 0
        
        # Draw center points on each window edge
        min_x, max_x, min_y, max_y = self._get_window_bounds()
        center_pen = QPen(QColor(0, 0, 255), self.line_width * 2)  # Blue markers
        center_brush = QBrush(QColor(0, 0, 255))  # Blue fill
        center_radius = self.node_diameter * 0.7  # Slightly smaller than nodes
        
        # Calculate and draw the 4 center points
        left_center = (min_x, (min_y + max_y) / 2)
        right_center = (max_x, (min_y + max_y) / 2)
        bottom_center = ((min_x + max_x) / 2, min_y)
        top_center = ((min_x + max_x) / 2, max_y)
        
        for center_x, center_y in [left_center, right_center, bottom_center, top_center]:
            self.scene.addEllipse(center_x - center_radius/2, center_y - center_radius/2,
                                center_radius, center_radius, center_pen, center_brush)
        
        # Draw cables from ArtNet nodes to window edge centers
        for artnet_node in self.artnet_optimization['artnet_nodes']:
            node_x, node_y = artnet_node[0], artnet_node[1]
            
            # Find closest window center point
            closest_point, cable_length = self._find_closest_window_center(artnet_node)
            closest_x, closest_y = closest_point
            
            # Draw cable line
            self.scene.addLine(node_x, node_y, closest_x, closest_y, cable_pen)
            
            # Add length text at midpoint of cable
            mid_x = (node_x + closest_x) / 2
            mid_y = (node_y + closest_y) / 2
            
            length_text = self.scene.addText(f"{cable_length:.1f}m")
            length_text.setDefaultTextColor(QColor(0, 0, 0))  # Black text
            
            # Set font size to 50% of current font size
            font = length_text.font()
            font.setPointSize(max(1, int(self.font_size * 0.5)))  # 50% smaller, minimum size 1
            length_text.setFont(font)
            
            # Position text at midpoint
            text_rect = length_text.boundingRect()
            text_x = mid_x - text_rect.width() / 2
            text_y = mid_y - text_rect.height() / 2
            length_text.setPos(text_x, text_y)
            
            total_length += cable_length
        
        self.total_cable_length = total_length
        self.cable_info_label.setText(f"Total Cable Length: {total_length:.2f}m")
        
        print(f"Data cables: {len(self.artnet_optimization['artnet_nodes'])} cables, total length: {total_length:.2f}m")
    
    def _draw_arrow(self, start_node, end_node, pen):
        """Draw an arrow from start_node to end_node"""
        start_x, start_y = start_node[0], start_node[1]
        end_x, end_y = end_node[0], end_node[1]
        
        # Calculate arrow direction
        dx = end_x - start_x
        dy = end_y - start_y
        length = math.sqrt(dx*dx + dy*dy)
        
        if length == 0:
            return
        
        # Normalize direction
        dx /= length
        dy /= length
        
        # Start arrow from node edge (not center)
        node_radius = self.node_diameter / 2
        arrow_start_x = start_x + dx * node_radius
        arrow_start_y = start_y + dy * node_radius
        
        # Calculate arrow length based on percentage of edge length
        arrow_length = (length - 2 * node_radius) * (self.arrow_length_percent / 100.0)
        
        # End arrow at the calculated length
        arrow_end_x = arrow_start_x + dx * arrow_length
        arrow_end_y = arrow_start_y + dy * arrow_length
        
        # Draw the arrow line
        self.scene.addLine(arrow_start_x, arrow_start_y, arrow_end_x, arrow_end_y, pen)
        
        # Draw arrowhead
        arrowhead_length = 1.0
        arrowhead_angle = 0.5  # radians
        
        # Calculate arrowhead points
        angle = math.atan2(dy, dx)
        angle1 = angle + arrowhead_angle
        angle2 = angle - arrowhead_angle
        
        arrowhead_x1 = arrow_end_x - arrowhead_length * math.cos(angle1)
        arrowhead_y1 = arrow_end_y - arrowhead_length * math.sin(angle1)
        arrowhead_x2 = arrow_end_x - arrowhead_length * math.cos(angle2)
        arrowhead_y2 = arrow_end_y - arrowhead_length * math.sin(angle2)
        
        # Draw arrowhead lines
        self.scene.addLine(arrow_end_x, arrow_end_y, arrowhead_x1, arrowhead_y1, pen)
        self.scene.addLine(arrow_end_x, arrow_end_y, arrowhead_x2, arrowhead_y2, pen)
    
    def resizeEvent(self, event):
        """Handle window resize events"""
        super().resizeEvent(event)
        # Redraw network when window is resized
        self.draw_network()
    
    def draw_network(self):
        """Draw the network on the graphics scene"""
        self.scene.clear()
        
        if not self.nodes:
            return
        
        # Draw grid first (background layer)
        self._draw_grid()
        
        # Calculate bounds for scaling
        all_coords = list(self.nodes)
        x_coords = [coord[0] for coord in all_coords]
        y_coords = [coord[1] for coord in all_coords]
        
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)
        
        # Add minimal padding
        padding = 5
        # Add extra space for labels
        right_margin = 25  # Space for row power text
        left_margin = 8   # Space for row letters
        top_margin = 8    # Space for column numbers
        
        scene_width = max_x - min_x + 2 * padding + right_margin + left_margin
        scene_height = max_y - min_y + 2 * padding + top_margin
        
        # Set scene rect (adjusted for left and top margins)
        self.scene.setSceneRect(QRectF(min_x - padding - left_margin, min_y - padding, 
                                     scene_width, scene_height))
        
        # Draw edges first (so they appear behind nodes)
        # Always draw highlighted edges if a length is selected, optionally draw all edges
        normal_pen = QPen(QColor(100, 100, 100), self.line_width)
        highlighted_pen = QPen(QColor(255, 0, 0), self.line_width * 8)  # Bright red, 8x thicker
        
        # Get selected length if any
        selected_length = None
        if self.selected_length_group >= 0 and self.selected_length_group < len(self.length_groups):
            selected_length, _ = self.length_groups[self.selected_length_group]
        
        for start_node, end_node in self.edges:
            start_x, start_y = start_node[0], start_node[1]
            end_x, end_y = end_node[0], end_node[1]
            
            # Check if this edge should be highlighted
            use_highlighted = False
            if selected_length is not None:
                dx = end_node[0] - start_node[0]
                dy = end_node[1] - start_node[1]
                dz = end_node[2] - start_node[2]
                edge_length = round(math.sqrt(dx*dx + dy*dy + dz*dz), 2)
                use_highlighted = (abs(edge_length - selected_length) < 0.01)
            
            # Draw edge if: (show_edges is on) OR (this edge is highlighted)
            if self.show_edges or use_highlighted:
                pen = highlighted_pen if use_highlighted else normal_pen
                self.scene.addLine(start_x, start_y, end_x, end_y, pen)
        
        # Draw nodes
        node_brush = QBrush(QColor(255, 0, 0))  # Red nodes
        node_pen = QPen(QColor(0, 0, 0), 1)
        
        # ArtNet node colors
        artnet_brush = QBrush(QColor(0, 255, 0))  # Green for ArtNet nodes
        artnet_pen = QPen(QColor(0, 0, 0), 2)
        
        # Rectangle pen for ArtNet nodes
        rect_pen = QPen(QColor(0, 0, 255), 2)  # Blue rectangle
        
        for node in self.nodes:
            x, y = node[0], node[1]
            radius = self.node_diameter / 2
            
            # Check if this is an ArtNet node
            is_artnet = (self.artnet_optimization and 
                        self.show_artnet_nodes and 
                        node in self.artnet_optimization['artnet_nodes'])
            
            # Choose brush and pen based on node type
            brush = artnet_brush if is_artnet else node_brush
            pen = artnet_pen if is_artnet else node_pen
            
            # Draw circle for node
            ellipse = self.scene.addEllipse(x - radius, y - radius, 
                                 self.node_diameter, self.node_diameter,
                                 pen, brush)
            
            # Draw special marker for intercom nodes (orange circle)
            if node in self.intercom_nodes:
                intercom_pen = QPen(QColor(255, 140, 0), 3)  # Orange border, thick
                intercom_size = self.node_diameter * 1.5
                self.scene.addEllipse(x - intercom_size/2, y - intercom_size/2,
                                     intercom_size, intercom_size, intercom_pen)
            
            # Draw rectangle around ArtNet nodes
            if is_artnet:
                rect_size = self.node_diameter
                self.scene.addRect(x - rect_size/2, y - rect_size/2, 
                                  rect_size, rect_size, rect_pen)
                
                # Count arrows drawn FROM this ArtNet node - USE EXACT SAME LOGIC AS ARROW DRAWING
                arrow_count = 0
                if self.artnet_optimization and self.show_artnet_nodes:
                    artnet_nodes_set = set(self.artnet_optimization['artnet_nodes'])
                    
                    for edge in self.edges:
                        start_node, end_node = edge
                        arrow_from = None  # Will be set to the node the arrow starts from
                        
                        # EXACT SAME LOGIC AS ARROW DRAWING
                        if edge in self.intercom_edges:
                            # Intercom edge
                            if start_node in self.intercom_nodes:
                                arrow_from = end_node  # Arrow FROM end_node TO start_node
                            elif end_node in self.intercom_nodes:
                                arrow_from = start_node  # Arrow FROM start_node TO end_node
                        elif start_node in artnet_nodes_set and end_node in artnet_nodes_set:
                            # Both endpoints are ArtNet
                            if 'edge_directions' in self.artnet_optimization:
                                data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
                                if (data_start == start_node and data_end == end_node) or \
                                   (data_start == end_node and data_end == start_node):
                                    arrow_from = data_start
                                # If redirected, don't count (arrow_from stays None)
                            else:
                                arrow_from = start_node
                        elif start_node in artnet_nodes_set:
                            arrow_from = start_node  # Only start is ArtNet
                        elif end_node in artnet_nodes_set:
                            arrow_from = end_node  # Only end is ArtNet
                        
                        # Count if arrow starts from this node
                        if arrow_from == node:
                            arrow_count += 1
                
                # Display the count ONLY for ArtNet nodes
                if is_artnet and self.artnet_optimization and self.show_artnet_nodes:
                    count_text = self.scene.addText(str(arrow_count))
                    count_text.setDefaultTextColor(QColor(0, 100, 255))  # Blue text
                    # Set font size
                    font = count_text.font()
                    font.setPointSize(self.font_size)
                    count_text.setFont(font)
                    # Center the text on the ArtNet node
                    text_rect = count_text.boundingRect()
                    text_x = x - text_rect.width() / 2
                    text_x = text_x + 2
                    text_y = y - text_rect.height() / 2
                    count_text.setPos(text_x, text_y)
        
        # Draw directional arrows from ArtNet nodes
        if self.artnet_optimization and self.show_artnet_nodes and self.show_edges:
            arrow_pen = QPen(QColor(255, 0, 255), self.arrow_width)  # Magenta arrows with adjustable width
            
            # Draw arrows along PHYSICAL edges based on which endpoint is ArtNet node
            for edge in self.edges:
                start_node, end_node = edge
                artnet_nodes_set = set(self.artnet_optimization['artnet_nodes'])
                
                # Special case: For intercom edges, arrow from smart node to intercom node
                if edge in self.intercom_edges:
                    # Draw arrow FROM non-intercom node TO intercom node
                    if start_node in self.intercom_nodes:
                        # Intercom node is at start, arrow goes TO it
                        self._draw_arrow(end_node, start_node, arrow_pen)
                    elif end_node in self.intercom_nodes:
                        # Intercom node is at end, arrow goes TO it
                        self._draw_arrow(start_node, end_node, arrow_pen)
                # Normal edges: Draw arrow FROM ArtNet node
                elif start_node in artnet_nodes_set and end_node in artnet_nodes_set:
                    # Both endpoints are ArtNet - use balanced direction if available
                    if 'edge_directions' in self.artnet_optimization:
                        data_start, data_end = self.artnet_optimization['edge_directions'].get(edge, (None, None))
                        # Only draw if the direction is along this physical edge
                        if (data_start == start_node and data_end == end_node) or \
                           (data_start == end_node and data_end == start_node):
                            self._draw_arrow(data_start, data_end, arrow_pen)
                        # If redirected, DON'T draw an arrow on this physical edge
                    else:
                        self._draw_arrow(start_node, end_node, arrow_pen)
                elif start_node in artnet_nodes_set:
                    # Only start is ArtNet - arrow goes from start to end
                    self._draw_arrow(start_node, end_node, arrow_pen)
                elif end_node in artnet_nodes_set:
                    # Only end is ArtNet - arrow goes from end to start
                    self._draw_arrow(end_node, start_node, arrow_pen)
        
        # Draw window cables if enabled
        # Always draw window frame
        self._draw_window_frame()
        
        # Draw row and column labels
        self._draw_grid_labels()
        
        # Draw row power consumption (amps per row)
        self._draw_row_power_consumption()
        
        # Draw data cables if enabled
        self._draw_data_cables()
        
        # Draw power cables if enabled
        
        # Fit view to scene with a small margin
        self.view.fitInView(self.scene.sceneRect(), Qt.KeepAspectRatio)
        
        # Add a small margin by scaling slightly
        self.view.scale(0.95, 0.95)
        
        # Update info labels
        self.node_count_label.setText(f"Nodes: {len(self.nodes)}")
        self.edge_count_label.setText(f"Edges: {len(self.edges)}")


def main():
    app = QApplication(sys.argv)
    window = NetworkVisualizer()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main() 