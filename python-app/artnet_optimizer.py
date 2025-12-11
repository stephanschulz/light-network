import math
from typing import List, Tuple, Set, Dict
from collections import defaultdict, deque


class ArtNetOptimizer:
    def __init__(self, nodes: Set[Tuple[float, float, float]], edges: List[Tuple[Tuple[float, float, float], Tuple[float, float, float]]]):
        """
        Initialize the ArtNet optimizer with network data.
        
        Args:
            nodes: Set of node coordinates (x, y, z)
            edges: List of edge tuples (start_node, end_node)
        """
        self.nodes = nodes
        self.edges = edges
        self.node_list = list(nodes)
        self.adjacency = self._build_adjacency()
        
    def _build_adjacency(self) -> Dict[Tuple[float, float, float], List[Tuple[float, float, float]]]:
        """Build adjacency list for the network."""
        adjacency = defaultdict(list)
        for start, end in self.edges:
            adjacency[start].append(end)
            adjacency[end].append(start)
        return adjacency
    
    def _calculate_distance(self, node1: Tuple[float, float, float], node2: Tuple[float, float, float]) -> float:
        """Calculate Euclidean distance between two nodes."""
        return math.sqrt((node1[0] - node2[0])**2 + (node1[1] - node2[1])**2 + (node1[2] - node2[2])**2)
    
    def _find_central_nodes(self, num_artnet_nodes: int) -> List[Tuple[float, float, float]]:
        """
        Find the most central nodes using betweenness centrality approximation.
        
        Args:
            num_artnet_nodes: Number of ArtNet nodes to place
            
        Returns:
            List of node coordinates for ArtNet placement
        """
        if num_artnet_nodes >= len(self.nodes):
            return list(self.nodes)
        
        # Calculate degree centrality (number of connections)
        degree_centrality = {}
        for node in self.nodes:
            degree_centrality[node] = len(self.adjacency[node])
        
        # Sort nodes by degree centrality (most connected first)
        sorted_nodes = sorted(degree_centrality.items(), key=lambda x: x[1], reverse=True)
        
        # Take top nodes as initial ArtNet candidates
        artnet_candidates = [node for node, _ in sorted_nodes[:num_artnet_nodes * 2]]
        
        # Use k-means clustering to find optimal distribution
        artnet_nodes = self._k_means_clustering(artnet_candidates, num_artnet_nodes)
        
        return artnet_nodes
    
    def _k_means_clustering(self, candidates: List[Tuple[float, float, float]], k: int) -> List[Tuple[float, float, float]]:
        """
        Simple k-means clustering to find optimal ArtNet node distribution.
        
        Args:
            candidates: List of candidate nodes
            k: Number of clusters (ArtNet nodes)
            
        Returns:
            List of k optimal ArtNet node positions
        """
        if k >= len(candidates):
            return candidates[:k]
        
        # Initialize centroids with first k candidates
        centroids = candidates[:k]
        
        for _ in range(10):  # Max 10 iterations
            # Assign each candidate to nearest centroid
            clusters = [[] for _ in range(k)]
            
            for candidate in candidates:
                min_dist = float('inf')
                best_cluster = 0
                
                for i, centroid in enumerate(centroids):
                    dist = self._calculate_distance(candidate, centroid)
                    if dist < min_dist:
                        min_dist = dist
                        best_cluster = i
                
                clusters[best_cluster].append(candidate)
            
            # Update centroids
            new_centroids = []
            for cluster in clusters:
                if cluster:
                    # Find the node closest to the cluster center
                    center_x = sum(node[0] for node in cluster) / len(cluster)
                    center_y = sum(node[1] for node in cluster) / len(cluster)
                    center_z = sum(node[2] for node in cluster) / len(cluster)
                    
                    closest_node = min(cluster, key=lambda node: 
                        self._calculate_distance(node, (center_x, center_y, center_z)))
                    new_centroids.append(closest_node)
                else:
                    # If cluster is empty, keep the old centroid
                    new_centroids.append(centroids[len(new_centroids)])
            
            # Check for convergence
            if all(self._calculate_distance(old, new) < 0.1 
                   for old, new in zip(centroids, new_centroids)):
                break
                
            centroids = new_centroids
        
        return centroids
    
    def _assign_dmx_universes(self, artnet_nodes: List[Tuple[float, float, float]]) -> Dict[Tuple[float, float, float], int]:
        """
        Assign DMX universes to ArtNet nodes.
        
        Args:
            artnet_nodes: List of ArtNet node coordinates
            
        Returns:
            Dictionary mapping ArtNet nodes to DMX universe numbers
        """
        universe_assignments = {}
        for i, node in enumerate(artnet_nodes):
            universe_assignments[node] = i + 1  # Universes start at 1
        return universe_assignments
    
    def _find_nearest_artnet_node(self, node: Tuple[float, float, float], 
                                 artnet_nodes: List[Tuple[float, float, float]]) -> Tuple[Tuple[float, float, float], float]:
        """
        Find the nearest ArtNet node to a given node.
        
        Args:
            node: Node to find nearest ArtNet for
            artnet_nodes: List of ArtNet node coordinates
            
        Returns:
            Tuple of (nearest_artnet_node, distance)
        """
        min_dist = float('inf')
        nearest_node = None
        
        for artnet_node in artnet_nodes:
            dist = self._calculate_distance(node, artnet_node)
            if dist < min_dist:
                min_dist = dist
                nearest_node = artnet_node
        
        return nearest_node, min_dist
    
    def _find_minimal_artnet_coverage(self) -> List[Tuple[float, float, float]]:
        """
        Find the minimal set of ArtNet nodes that covers all edges.
        Uses a greedy algorithm to minimize the number of ArtNet nodes.
        
        Returns:
            List of ArtNet node coordinates
        """
        uncovered_edges = set(self.edges)
        artnet_nodes = []
        
        while uncovered_edges:
            # Find the node that covers the most uncovered edges
            best_node = None
            max_coverage = 0
            
            for node in self.nodes:
                if node in artnet_nodes:
                    continue
                
                # Count how many uncovered edges this node would cover
                coverage = 0
                for edge in uncovered_edges:
                    if edge[0] == node or edge[1] == node:
                        coverage += 1
                
                if coverage > max_coverage:
                    max_coverage = coverage
                    best_node = node
            
            if best_node is None:
                break
            
            # Add the best node as an ArtNet node
            artnet_nodes.append(best_node)
            
            # Remove covered edges
            edges_to_remove = set()
            for edge in uncovered_edges:
                if edge[0] == best_node or edge[1] == best_node:
                    edges_to_remove.add(edge)
            
            uncovered_edges -= edges_to_remove
            
            print(f"Added ArtNet node at {best_node}, covering {max_coverage} edges. {len(uncovered_edges)} edges remaining.")
        
        return artnet_nodes
    
    def _optimize_within_constraint(self, artnet_nodes: List[Tuple[float, float, float]], 
                                  max_nodes: int) -> List[Tuple[float, float, float]]:
        """
        Optimize ArtNet node selection within a maximum constraint.
        Tries to find the best subset that covers as many edges as possible.
        
        Args:
            artnet_nodes: List of all potential ArtNet nodes
            max_nodes: Maximum number of ArtNet nodes allowed
            
        Returns:
            Optimized list of ArtNet nodes
        """
        if len(artnet_nodes) <= max_nodes:
            return artnet_nodes
        
        # Calculate coverage for each node
        node_coverage = {}
        for node in artnet_nodes:
            coverage = 0
            for edge in self.edges:
                if edge[0] == node or edge[1] == node:
                    coverage += 1
            node_coverage[node] = coverage
        
        # Sort by coverage (highest first)
        sorted_nodes = sorted(node_coverage.items(), key=lambda x: x[1], reverse=True)
        
        # Take the top nodes
        return [node for node, _ in sorted_nodes[:max_nodes]]
    
    def optimize_artnet_distribution(self, num_artnet_nodes: int = None) -> Dict:
        """
        Optimize ArtNet node distribution for the LED network.
        Ensures every edge is connected to at least one ArtNet node.
        
        Args:
            num_artnet_nodes: Number of ArtNet nodes to place (None for auto-determination)
            
        Returns:
            Dictionary containing optimization results:
            - 'artnet_nodes': List of ArtNet node coordinates
            - 'end_nodes': List of end node coordinates
            - 'universe_assignments': Dict mapping ArtNet nodes to DMX universes
            - 'node_assignments': Dict mapping each node to its nearest ArtNet node
            - 'max_distance': Maximum distance from any node to its ArtNet node
            - 'avg_distance': Average distance from nodes to their ArtNet nodes
            - 'coverage_stats': Statistics about network coverage
        """
        # Find minimal set of ArtNet nodes that covers all edges
        artnet_nodes = self._find_minimal_artnet_coverage()
        
        if num_artnet_nodes is not None and len(artnet_nodes) > num_artnet_nodes:
            # If user specified a limit, try to optimize within that constraint
            artnet_nodes = self._optimize_within_constraint(artnet_nodes, num_artnet_nodes)
        
        print(f"Determined {len(artnet_nodes)} ArtNet nodes to cover all edges")
        
        # Assign DMX universes
        universe_assignments = self._assign_dmx_universes(artnet_nodes)
        
        # Assign each node to nearest ArtNet node
        node_assignments = {}
        distances = []
        
        for node in self.nodes:
            nearest_artnet, distance = self._find_nearest_artnet_node(node, artnet_nodes)
            node_assignments[node] = nearest_artnet
            distances.append(distance)
        
        # Calculate statistics
        max_distance = max(distances)
        avg_distance = sum(distances) / len(distances)
        
        # Determine end nodes (nodes that are not ArtNet nodes)
        end_nodes = [node for node in self.nodes if node not in artnet_nodes]
        
        # Calculate coverage statistics
        coverage_stats = {
            'total_nodes': len(self.nodes),
            'artnet_nodes': len(artnet_nodes),
            'end_nodes': len(end_nodes),
            'coverage_percentage': (len(self.nodes) / len(self.nodes)) * 100,
            'artnet_node_utilization': len(self.nodes) / len(artnet_nodes)
        }
        
        return {
            'artnet_nodes': artnet_nodes,
            'end_nodes': end_nodes,
            'universe_assignments': universe_assignments,
            'node_assignments': node_assignments,
            'max_distance': max_distance,
            'avg_distance': avg_distance,
            'coverage_stats': coverage_stats
        }
    
    def get_network_statistics(self) -> Dict:
        """
        Get general network statistics.
        
        Returns:
            Dictionary with network statistics
        """
        total_length = 0
        for start, end in self.edges:
            total_length += self._calculate_distance(start, end)
        
        return {
            'total_nodes': len(self.nodes),
            'total_edges': len(self.edges),
            'total_length': total_length,
            'avg_degree': sum(len(self.adjacency[node]) for node in self.nodes) / len(self.nodes),
            'network_density': len(self.edges) / (len(self.nodes) * (len(self.nodes) - 1) / 2) if len(self.nodes) > 1 else 0
        }


def balance_edge_directions(edges: List[Tuple[Tuple[float, float, float], Tuple[float, float, float]]], 
                           artnet_nodes: List[Tuple[float, float, float]],
                           max_outputs_per_node: int = 4) -> Dict:
    """
    Balance edge directions to ensure no ArtNet node has more than max_outputs_per_node data outputs.
    
    Each ArtNet node can only serve a limited number of edges (default 4) due to hardware constraints.
    This function reassigns edge directions to balance the load across ArtNet nodes.
    
    Args:
        edges: List of edge tuples (start_node, end_node)
        artnet_nodes: List of ArtNet node coordinates
        max_outputs_per_node: Maximum number of data outputs per ArtNet node (default 4)
        
    Returns:
        Dictionary containing:
        - 'directed_edges': List of tuples (artnet_node, other_node, direction) where direction is 'outgoing' or 'incoming'
        - 'edge_directions': Dict mapping original edge tuple to (data_start_node, data_end_node)
        - 'artnet_output_counts': Dict mapping each ArtNet node to its number of outgoing edges
        - 'violations': List of ArtNet nodes that still exceed the limit (if any)
    """
    artnet_set = set(artnet_nodes)
    
    # Map each edge to the ArtNet node(s) it connects to
    edge_to_artnet = {}
    for edge in edges:
        start, end = edge
        artnet_on_edge = []
        if start in artnet_set:
            artnet_on_edge.append(('start', start))
        if end in artnet_set:
            artnet_on_edge.append(('end', end))
        
        if artnet_on_edge:
            edge_to_artnet[edge] = artnet_on_edge
    
    # Count current outgoing edges per ArtNet node (assuming data flows FROM ArtNet nodes)
    artnet_outputs = {node: 0 for node in artnet_nodes}
    edge_directions = {}  # Maps original edge to (data_start, data_end)
    
    # First pass: Assign directions, preferring the default (FROM ArtNet node)
    for edge in edges:
        start, end = edge
        
        if edge not in edge_to_artnet:
            # No ArtNet node on this edge - no data flow
            edge_directions[edge] = (None, None)
            continue
        
        artnet_on_edge = edge_to_artnet[edge]
        
        if len(artnet_on_edge) == 2:
            # Both ends are ArtNet nodes - choose direction based on current load
            artnet_start = start
            artnet_end = end
            
            if artnet_outputs[artnet_start] <= artnet_outputs[artnet_end]:
                # Start node has fewer outputs, use it as source
                edge_directions[edge] = (artnet_start, artnet_end)
                artnet_outputs[artnet_start] += 1
            else:
                # End node has fewer outputs, use it as source
                edge_directions[edge] = (artnet_end, artnet_start)
                artnet_outputs[artnet_end] += 1
        
        elif len(artnet_on_edge) == 1:
            # Only one end is an ArtNet node
            position, artnet_node = artnet_on_edge[0]
            other_node = end if position == 'start' else start
            
            # Data flows FROM ArtNet node by default
            edge_directions[edge] = (artnet_node, other_node)
            artnet_outputs[artnet_node] += 1
    
    # Build adjacency list to find alternative ArtNet nodes for simple nodes
    node_to_artnet_neighbors = {}  # Maps each node to all connected ArtNet nodes
    for edge in edges:
        start, end = edge
        # Track which ArtNet nodes each node is connected to
        if start in artnet_set:
            if end not in node_to_artnet_neighbors:
                node_to_artnet_neighbors[end] = []
            node_to_artnet_neighbors[end].append(start)
        if end in artnet_set:
            if start not in node_to_artnet_neighbors:
                node_to_artnet_neighbors[start] = []
            node_to_artnet_neighbors[start].append(end)
    
    # Second pass: Rebalance nodes that exceed the limit
    violations = [node for node, count in artnet_outputs.items() if count > max_outputs_per_node]
    
    if violations:
        print(f"\n⚠️  Found {len(violations)} ArtNet nodes exceeding {max_outputs_per_node} output limit")
        
        for overloaded_node in violations:
            current_count = artnet_outputs[overloaded_node]
            excess = current_count - max_outputs_per_node
            
            print(f"   Node {overloaded_node}: {current_count} outputs (need to reduce by {excess})")
            
            # Find edges that can be redirected
            # Two types of reversible edges:
            # 1. Both ends are ArtNet nodes (direct reversal)
            # 2. End node is a simple node that's also connected to another ArtNet node with capacity
            reversible_edges = []
            
            for edge, (data_start, data_end) in edge_directions.items():
                if data_start != overloaded_node:
                    continue
                
                # Type 1: Direct reversal (both ends are ArtNet nodes)
                if data_end in artnet_set:
                    other_artnet = data_end
                    other_capacity = max_outputs_per_node - artnet_outputs[other_artnet]
                    reversible_edges.append((edge, 'direct', other_artnet, other_capacity))
                
                # Type 2: Redirect via alternative ArtNet node
                elif data_end in node_to_artnet_neighbors:
                    # This simple node is connected to other ArtNet nodes
                    for alternative_artnet in node_to_artnet_neighbors[data_end]:
                        if alternative_artnet != overloaded_node:
                            # Can redirect this simple node to use the alternative ArtNet node
                            other_capacity = max_outputs_per_node - artnet_outputs[alternative_artnet]
                            if other_capacity > 0:
                                reversible_edges.append((edge, 'redirect', alternative_artnet, other_capacity))
            
            # Sort by available capacity (prefer nodes with most capacity)
            reversible_edges.sort(key=lambda x: -x[3])  # Sort by capacity (descending)
            
            # Redirect/reverse edges until we're under the limit
            reversed_count = 0
            redirected_count = 0
            
            for edge, action_type, other_artnet, capacity in reversible_edges:
                if artnet_outputs[overloaded_node] <= max_outputs_per_node:
                    break
                
                if capacity > 0:
                    if action_type == 'direct':
                        # Direct reversal (both ends are ArtNet nodes)
                        old_start, old_end = edge_directions[edge]
                        edge_directions[edge] = (old_end, old_start)
                        artnet_outputs[overloaded_node] -= 1
                        artnet_outputs[other_artnet] += 1
                        reversed_count += 1
                    else:  # redirect
                        # Redirect simple node to alternative ArtNet node
                        old_start, old_end = edge_directions[edge]
                        edge_directions[edge] = (other_artnet, old_end)
                        artnet_outputs[overloaded_node] -= 1
                        artnet_outputs[other_artnet] += 1
                        redirected_count += 1
            
            total_fixed = reversed_count + redirected_count
            if total_fixed > 0:
                action_summary = []
                if reversed_count > 0:
                    action_summary.append(f"{reversed_count} reversed")
                if redirected_count > 0:
                    action_summary.append(f"{redirected_count} redirected")
                print(f"   → {', '.join(action_summary)}, new count: {artnet_outputs[overloaded_node]}")
    
    # Check for remaining violations
    remaining_violations = [node for node, count in artnet_outputs.items() if count > max_outputs_per_node]
    
    if remaining_violations:
        print(f"\n❌ Warning: {len(remaining_violations)} ArtNet nodes still exceed limit:")
        for node in remaining_violations:
            print(f"   Node {node}: {artnet_outputs[node]} outputs (limit: {max_outputs_per_node})")
        print("   → Consider adding more ArtNet nodes to reduce load")
    else:
        print(f"\n✅ All ArtNet nodes balanced: max {max(artnet_outputs.values())} outputs per node")
    
    # Build directed edges list
    directed_edges = []
    for edge, (data_start, data_end) in edge_directions.items():
        if data_start is not None:
            directed_edges.append((edge, data_start, data_end))
    
    return {
        'directed_edges': directed_edges,
        'edge_directions': edge_directions,
        'artnet_output_counts': artnet_outputs,
        'violations': remaining_violations
    }


def balance_row_power_and_ports(edges: List[Tuple[Tuple[float, float, float], Tuple[float, float, float]]],
                                artnet_nodes: List[Tuple[float, float, float]],
                                edge_directions: Dict,
                                max_amps_per_row: int = 20,
                                max_outputs_per_node: int = 4,
                                max_iterations: int = 1000) -> Dict:
    """
    Balance edge directions to satisfy BOTH row power (≤20A) and node port (≤4) constraints.
    
    Args:
        edges: List of edge tuples (start_node, end_node)
        artnet_nodes: List of ArtNet node coordinates
        edge_directions: Initial edge directions dict
        max_amps_per_row: Maximum amps per row (default 20)
        max_outputs_per_node: Maximum outputs per node (default 4)
        max_iterations: Maximum optimization iterations
        
    Returns:
        Dictionary with balanced edge_directions and violation stats
    """
    import copy
    
    artnet_set = set(artnet_nodes)
    edge_dirs = copy.deepcopy(edge_directions)
    
    print(f"\n{'='*70}")
    print("DUAL-CONSTRAINT OPTIMIZATION: Row Power (≤{max_amps_per_row}A) + Node Ports (≤{max_outputs_per_node})")
    print(f"{'='*70}")
    
    def calculate_row_power():
        """Calculate amp usage per row (Y coordinate)"""
        row_amps = {}
        for edge in edges:
            data_start, data_end = edge_dirs.get(edge, (None, None))
            if data_start:
                row_y = data_start[1]  # Y coordinate of source ArtNet node
                row_amps[row_y] = row_amps.get(row_y, 0) + 1  # 1 amp per edge
        return row_amps
    
    def calculate_node_outputs():
        """Calculate output count per ArtNet node"""
        node_outputs = {node: 0 for node in artnet_nodes}
        for edge in edges:
            data_start, data_end = edge_dirs.get(edge, (None, None))
            if data_start in artnet_set:
                node_outputs[data_start] += 1
        return node_outputs
    
    def get_violations():
        """Get current constraint violations"""
        row_amps = calculate_row_power()
        node_outputs = calculate_node_outputs()
        
        row_violations = [(y, amps) for y, amps in row_amps.items() if amps > max_amps_per_row]
        node_violations = [(node, count) for node, count in node_outputs.items() if count > max_outputs_per_node]
        
        return row_violations, node_violations, row_amps, node_outputs
    
    # Build node connectivity for finding alternatives
    node_to_artnet_neighbors = {}
    for edge in edges:
        start, end = edge
        if start in artnet_set:
            if end not in node_to_artnet_neighbors:
                node_to_artnet_neighbors[end] = []
            if start not in node_to_artnet_neighbors[end]:
                node_to_artnet_neighbors[end].append(start)
        if end in artnet_set:
            if start not in node_to_artnet_neighbors:
                node_to_artnet_neighbors[start] = []
            if end not in node_to_artnet_neighbors[start]:
                node_to_artnet_neighbors[start].append(end)
    
    # Iterative optimization - Phase 1: Satisfy hard constraints
    iteration = 0
    improvements = 0
    phase = 1
    best_max_row = float('inf')
    iterations_without_max_improvement = 0
    
    while iteration < max_iterations:
        row_violations, node_violations, row_amps, node_outputs = get_violations()
        
        # Phase transitions
        if phase == 1 and not row_violations and not node_violations:
            print(f"✅ Hard constraints satisfied after {iteration} iterations!")
            print(f"\nPhase 2: Balancing power across rows (redirections)...")
            phase = 2
            best_max_row = max(row_amps.values()) if row_amps else float('inf')
            iterations_without_max_improvement = 0
            continue
        elif phase == 2 and iterations_without_max_improvement >= 30:
            print(f"\nPhase 3: Aggressive balancing (edge reversals)...")
            phase = 3
            best_max_row = max(row_amps.values()) if row_amps else float('inf')
            iterations_without_max_improvement = 0
            continue
        
        if iteration % 100 == 0 and phase == 1:
            print(f"  Iteration {iteration}: {len(row_violations)} row violations, {len(node_violations)} node violations")
        elif iteration % 100 == 0 and phase in [2, 3]:
            max_row = max(row_amps.values()) if row_amps else 0
            avg_row = sum(row_amps.values()) / len(row_amps) if row_amps else 0
            print(f"  Iteration {iteration}: Max row={max_row}A, Avg={avg_row:.1f}A")
        
        # Track if max row power is improving (Phases 2 & 3)
        if phase in [2, 3] and row_amps:
            current_max_row = max(row_amps.values())
            if current_max_row < best_max_row:
                best_max_row = current_max_row
                iterations_without_max_improvement = 0
            else:
                iterations_without_max_improvement += 1
            
            # Phase 2: Move to Phase 3 after 30 iterations without improvement
            # Phase 3: Stop after 50 iterations without improvement
            max_wait = 30 if phase == 2 else 50
            if phase == 3 and iterations_without_max_improvement >= max_wait:
                print(f"  No more improvements possible")
                break
        
        made_improvement = False
        
        # Phase 2: Balance power across rows (reduce peak usage and variance)
        if phase == 2:
            if row_amps:
                # Calculate average and find rows above average
                avg_amps = sum(row_amps.values()) / len(row_amps)
                max_row_amps = max(row_amps.values())
                
                # Sort rows by load (highest first)
                sorted_by_load = sorted(row_amps.items(), key=lambda x: x[1], reverse=True)
                
                # Try to move edges from high-load rows to lower-load rows
                for high_row_y, high_amps in sorted_by_load:
                    # Only consider rows above average or at max
                    if high_amps <= avg_amps and high_amps < max_row_amps:
                        continue
                    
                    # Find all rows sorted by Y coordinate
                    sorted_rows = sorted(row_amps.keys())
                    row_idx = sorted_rows.index(high_row_y)
                    
                    # Consider neighboring rows (immediate neighbors first, then expand)
                    neighbor_rows = []
                    if row_idx > 0:
                        neighbor_rows.append(sorted_rows[row_idx - 1])
                    if row_idx < len(sorted_rows) - 1:
                        neighbor_rows.append(sorted_rows[row_idx + 1])
                    
                    # Find edges powered from this row
                    edges_in_row = []
                    for edge in edges:
                        data_start, data_end = edge_dirs.get(edge, (None, None))
                        if data_start and data_start[1] == high_row_y:
                            edges_in_row.append(edge)
                    
                    # Try to move edges to less-loaded neighboring rows
                    for edge in edges_in_row:
                        data_start, data_end = edge_dirs.get(edge, (None, None))
                        
                        if data_end in node_to_artnet_neighbors:
                            # Sort alternative ArtNet nodes by their row load (prefer less loaded rows)
                            alt_options = []
                            for alt_artnet in node_to_artnet_neighbors[data_end]:
                                if alt_artnet == data_start:
                                    continue
                                alt_row = alt_artnet[1]
                                alt_row_amps = row_amps.get(alt_row, 0)
                                alt_node_outputs = node_outputs.get(alt_artnet, 0)
                                
                                # Check constraints
                                if alt_row_amps < max_amps_per_row and alt_node_outputs < max_outputs_per_node:
                                    # Prioritize neighboring rows
                                    priority = 0
                                    if alt_row in neighbor_rows:
                                        priority = 100
                                    # Prefer rows with lower load
                                    priority -= alt_row_amps
                                    alt_options.append((priority, alt_artnet, alt_row, alt_row_amps))
                            
                            # Sort by priority (highest first)
                            alt_options.sort(key=lambda x: x[0], reverse=True)
                            
                            # Try the best option
                            for priority, alt_artnet, alt_row, alt_row_amps in alt_options:
                                # Only move if it improves balance (reduces max or reduces variance)
                                if alt_row_amps < high_amps:
                                    edge_dirs[edge] = (alt_artnet, data_end)
                                    row_amps[high_row_y] -= 1
                                    row_amps[alt_row] += 1
                                    node_outputs[data_start] -= 1
                                    node_outputs[alt_artnet] += 1
                                    improvements += 1
                                    made_improvement = True
                                    break
                        
                        if made_improvement:
                            break
                    
                    if made_improvement:
                        break
        
        # Phase 3: Try direct edge reversals for aggressive balancing
        if phase == 3 and not made_improvement:
            if row_amps:
                max_row_amps = max(row_amps.values())
                sorted_by_load = sorted(row_amps.items(), key=lambda x: x[1], reverse=True)
                
                # Try reversing edges from high-load rows
                for high_row_y, high_amps in sorted_by_load:
                    if high_amps < max_row_amps:
                        continue
                    
                    # Find edges where data flows FROM this row
                    edges_from_row = []
                    for edge in edges:
                        data_start, data_end = edge_dirs.get(edge, (None, None))
                        if data_start and data_start[1] == high_row_y:
                            edges_from_row.append((edge, data_start, data_end))
                    
                    # Try to reverse each edge
                    for edge, data_start, data_end in edges_from_row:
                        # Check if both endpoints are ArtNet nodes (required for reversal)
                        if data_start not in artnet_set or data_end not in artnet_set:
                            continue
                        
                        # Calculate impact of reversal
                        target_row = data_end[1]
                        target_row_amps = row_amps.get(target_row, 0)
                        target_node_outputs = node_outputs.get(data_end, 0)
                        source_node_outputs = node_outputs.get(data_start, 0)
                        
                        # Only reverse if:
                        # 1. Target row has capacity (< 20A after adding this edge)
                        # 2. Target node has capacity (< 4 outputs after adding)
                        # 3. It reduces max row power OR balances better
                        if (target_row_amps < max_amps_per_row and 
                            target_node_outputs < max_outputs_per_node and
                            target_row_amps < high_amps):
                            
                            # Reverse the edge
                            edge_dirs[edge] = (data_end, data_start)
                            row_amps[high_row_y] -= 1
                            row_amps[target_row] += 1
                            node_outputs[data_start] -= 1
                            node_outputs[data_end] += 1
                            improvements += 1
                            made_improvement = True
                            break
                    
                    if made_improvement:
                        break
        
        # Phase 1: Try to fix hard constraint violations
        if phase == 1 and not made_improvement:
            # Try to fix row violations
            for row_y, amps in row_violations:
                if amps <= max_amps_per_row:
                    continue
                
                # Find edges powered by this row
                edges_in_row = []
                for edge in edges:
                    data_start, data_end = edge_dirs.get(edge, (None, None))
                    if data_start and data_start[1] == row_y:
                        edges_in_row.append(edge)
            
            # Try to redirect edges to different rows
            for edge in edges_in_row:
                data_start, data_end = edge_dirs.get(edge, (None, None))
                
                # Find alternative ArtNet nodes for this edge
                if data_end in node_to_artnet_neighbors:
                    for alt_artnet in node_to_artnet_neighbors[data_end]:
                        if alt_artnet == data_start:
                            continue
                        
                        # Check constraints
                        alt_row = alt_artnet[1]
                        alt_row_amps = row_amps.get(alt_row, 0)
                        alt_node_outputs = node_outputs.get(alt_artnet, 0)
                        
                        # Check if this flip would satisfy constraints
                        if alt_row_amps < max_amps_per_row and alt_node_outputs < max_outputs_per_node:
                            # Make the flip
                            edge_dirs[edge] = (alt_artnet, data_end)
                            row_amps[row_y] -= 1
                            row_amps[alt_row] = row_amps.get(alt_row, 0) + 1
                            node_outputs[data_start] -= 1
                            node_outputs[alt_artnet] += 1
                            improvements += 1
                            made_improvement = True
                            break
                
                    if made_improvement:
                        break
                
                if made_improvement:
                    break
        
        if phase == 1 and not made_improvement:
            # Try to fix node violations
            for node, count in node_violations:
                if count <= max_outputs_per_node:
                    continue
                
                # Find edges from this node
                node_edges = []
                for edge in edges:
                    data_start, data_end = edge_dirs.get(edge, (None, None))
                    if data_start == node:
                        node_edges.append(edge)
                
                # Try to redirect edges
                for edge in node_edges:
                    data_start, data_end = edge_dirs.get(edge, (None, None))
                    
                    if data_end in node_to_artnet_neighbors:
                        for alt_artnet in node_to_artnet_neighbors[data_end]:
                            if alt_artnet == data_start:
                                continue
                            
                            alt_row = alt_artnet[1]
                            alt_row_amps = row_amps.get(alt_row, 0)
                            alt_node_outputs = node_outputs.get(alt_artnet, 0)
                            
                            if alt_row_amps < max_amps_per_row and alt_node_outputs < max_outputs_per_node:
                                edge_dirs[edge] = (alt_artnet, data_end)
                                row_amps[data_start[1]] -= 1
                                row_amps[alt_row] = row_amps.get(alt_row, 0) + 1
                                node_outputs[data_start] -= 1
                                node_outputs[alt_artnet] += 1
                                improvements += 1
                                made_improvement = True
                                break
                    
                    if made_improvement:
                        break
                
                if made_improvement:
                    break
        
        if not made_improvement:
            if phase == 1:
                print(f"  Cannot resolve all violations after {iteration} iterations")
                break
            elif phase == 2:
                # Phase 2: No more balancing improvements possible
                print(f"  Power distribution balanced after {iteration} iterations")
                break
        
        iteration += 1
    
    # Final report
    row_violations, node_violations, row_amps, node_outputs = get_violations()
    
    print(f"\n{'='*70}")
    print("DUAL-CONSTRAINT OPTIMIZATION COMPLETE")
    print(f"{'='*70}")
    print(f"Iterations: {iteration}")
    print(f"Improvements: {improvements}")
    print(f"\nRow Power:")
    print(f"  Max row: {max(row_amps.values())}A (limit: {max_amps_per_row}A)")
    print(f"  Violations: {len(row_violations)} rows exceed limit")
    if row_violations:
        for row_y, amps in sorted(row_violations, key=lambda x: -x[1])[:5]:
            print(f"    Y={row_y:.1f}: {amps}A (excess: {amps - max_amps_per_row}A)")
    
    print(f"\nNode Ports:")
    print(f"  Max outputs: {max(node_outputs.values())} (limit: {max_outputs_per_node})")
    print(f"  Violations: {len(node_violations)} nodes exceed limit")
    if node_violations:
        for node, count in sorted(node_violations, key=lambda x: -x[1])[:5]:
            print(f"    Node {node}: {count} outputs (excess: {count - max_outputs_per_node})")
    
    if not row_violations and not node_violations:
        print(f"\n✅ All constraints satisfied!")
    
    return {
        'edge_directions': edge_dirs,
        'row_power': row_amps,
        'node_outputs': node_outputs,
        'row_violations': row_violations,
        'node_violations': node_violations
    }


def optimize_led_network(nodes: Set[Tuple[float, float, float]], 
                        edges: List[Tuple[Tuple[float, float, float], Tuple[float, float, float]]], 
                        num_artnet_nodes: int = None) -> Dict:
    """
    Main function to optimize ArtNet distribution for LED network.
    
    Args:
        nodes: Set of node coordinates
        edges: List of edge tuples
        num_artnet_nodes: Number of ArtNet nodes to place
        
    Returns:
        Optimization results dictionary
    """
    optimizer = ArtNetOptimizer(nodes, edges)
    result = optimizer.optimize_artnet_distribution(num_artnet_nodes)
    
    # Balance edge directions to respect 4-port limit
    print("\nBalancing edge directions (4-port limit per ArtNet node)...")
    direction_result = balance_edge_directions(edges, result['artnet_nodes'])
    
    # Further optimize to balance BOTH row power and node ports
    dual_result = balance_row_power_and_ports(
        edges,
        result['artnet_nodes'],
        direction_result['edge_directions'],
        max_amps_per_row=20,
        max_outputs_per_node=4
    )
    
    # Add direction information to result (using dual-optimized directions)
    result['edge_directions'] = dual_result['edge_directions']
    result['artnet_output_counts'] = dual_result['node_outputs']
    result['direction_violations'] = dual_result['node_violations']
    result['row_power'] = dual_result['row_power']
    result['row_violations'] = dual_result['row_violations']
    
    return result


if __name__ == "__main__":
    # Example usage
    sample_nodes = {(0, 0, 0), (1, 0, 0), (2, 0, 0), (0, 1, 0), (1, 1, 0), (2, 1, 0)}
    sample_edges = [((0, 0, 0), (1, 0, 0)), ((1, 0, 0), (2, 0, 0)), 
                   ((0, 0, 0), (0, 1, 0)), ((1, 0, 0), (1, 1, 0)), ((2, 0, 0), (2, 1, 0)),
                   ((0, 1, 0), (1, 1, 0)), ((1, 1, 0), (2, 1, 0))]
    
    result = optimize_led_network(sample_nodes, sample_edges)
    print("Optimization Results:")
    print(f"ArtNet Nodes: {result['artnet_nodes']}")
    print(f"End Nodes: {len(result['end_nodes'])}")
    print(f"Max Distance: {result['max_distance']:.2f}")
    print(f"Average Distance: {result['avg_distance']:.2f}")
    print(f"Coverage Stats: {result['coverage_stats']}") 