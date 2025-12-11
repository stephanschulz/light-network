"""
Power Cable Optimization for LED Network

Solves a multi-depot vehicle routing problem (mVRP) where:
- 4 power hubs (one at center of each window edge)
- Each ArtNet node requires power based on number of outgoing edges × 120W
- Each circuit limited to 1800W (15A × 120V)
- Goal: Minimize total cable length while respecting power constraints
"""

import math
import random
from typing import List, Tuple, Dict, Set

try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False


def calculate_node_power_requirements(nodes: List[Tuple], edges: List[Tuple], artnet_nodes: List[Tuple],
                                     edge_directions: Dict = None) -> Dict[Tuple, int]:
    """
    Calculate power requirements for each ArtNet node.
    
    Args:
        nodes: List of all node coordinates
        edges: List of edge tuples (start_node, end_node)
        artnet_nodes: List of ArtNet node coordinates
        edge_directions: Optional dict mapping edge tuple to (data_start, data_end) for balanced directions
    
    Returns:
        Dictionary mapping ArtNet node coordinates to power requirement in watts
    """
    power_requirements = {}
    
    # If balanced edge directions provided, use those
    if edge_directions:
        for artnet_node in artnet_nodes:
            powered_edges = 0
            for edge in edges:
                data_start, data_end = edge_directions.get(edge, (None, None))
                # Count edges where this ArtNet node is the data source
                if data_start == artnet_node:
                    powered_edges += 1
            power_requirements[artnet_node] = powered_edges * 120
    else:
        # Fallback to old logic
        for artnet_node in artnet_nodes:
            powered_edges = 0
            for start_node, end_node in edges:
                # Case 1: Edge starts at this ArtNet node - this node powers it
                if start_node == artnet_node:
                    powered_edges += 1
                # Case 2: Edge ends at this ArtNet node AND doesn't start at any ArtNet node
                # (this handles edges where only the end is an ArtNet node)
                elif end_node == artnet_node and start_node not in artnet_nodes:
                    powered_edges += 1
            power_requirements[artnet_node] = powered_edges * 120
    
    return power_requirements


def euclidean_distance(p1: Tuple, p2: Tuple) -> float:
    """Calculate 3D Euclidean distance between two points."""
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2 + (p1[2] - p2[2])**2)


def get_window_edge_centers(nodes: List[Tuple], hub_offset: float = 2.0) -> List[Tuple[float, float, float]]:
    """
    Get the 4 power hub locations OUTSIDE the window frame.
    
    Args:
        nodes: List of all nodes
        hub_offset: Distance outside the frame to place hubs (meters)
    
    Returns:
        List of 4 hub positions outside the rectangle
    """
    x_coords = [node[0] for node in nodes]
    y_coords = [node[1] for node in nodes]
    
    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)
    
    # 4 power hubs OUTSIDE the window edges (offset outward)
    left_hub = (min_x - hub_offset, (min_y + max_y) / 2, 0)      # Left of left edge
    right_hub = (max_x + hub_offset, (min_y + max_y) / 2, 0)    # Right of right edge
    bottom_hub = ((min_x + max_x) / 2, min_y - hub_offset, 0)   # Below bottom edge
    top_hub = ((min_x + max_x) / 2, max_y + hub_offset, 0)      # Above top edge
    
    return [left_hub, right_hub, bottom_hub, top_hub]


def optimize_hub_positions(nodes: List[Tuple], artnet_nodes: List[Tuple], 
                           power_requirements: Dict[Tuple, int],
                           positions_per_edge: int = 10,
                           hub_offset: float = 2.0) -> List[Tuple]:
    """
    Optimize hub positions OUTSIDE window frame to minimize total cable length.
    Tests all combinations exhaustively - can test 1, 2, 3, or 4 hubs.
    
    Strategy:
    1. Place candidate positions OUTSIDE the frame (offset from edges)
    2. Try different positions along each side (outside the frame)
    3. Exhaustively test all combinations of hub counts and positions
    4. Return configuration with minimum total cable length
    
    Args:
        nodes: All network nodes
        artnet_nodes: Nodes requiring power
        power_requirements: Power per node
        positions_per_edge: Number of positions to test per edge (default 10)
        hub_offset: Distance outside frame to place hubs in meters (default 2.0m)
    """
    x_coords = [node[0] for node in nodes]
    y_coords = [node[1] for node in nodes]
    
    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)
    
    # Use the provided number of positions per edge
    num_positions_per_edge = positions_per_edge
    
    # Left edge candidates (OUTSIDE frame, left of min_x, varying Y)
    left_candidates = [(min_x - hub_offset, 
                       min_y + i * (max_y - min_y) / (num_positions_per_edge - 1), 
                       0) 
                       for i in range(num_positions_per_edge)]
    
    # Right edge candidates (OUTSIDE frame, right of max_x, varying Y)
    right_candidates = [(max_x + hub_offset, 
                        min_y + i * (max_y - min_y) / (num_positions_per_edge - 1), 
                        0) 
                        for i in range(num_positions_per_edge)]
    
    # Bottom edge candidates (OUTSIDE frame, below min_y, varying X)
    bottom_candidates = [(min_x + i * (max_x - min_x) / (num_positions_per_edge - 1), 
                         min_y - hub_offset, 
                         0) 
                         for i in range(num_positions_per_edge)]
    
    # Top edge candidates (OUTSIDE frame, above max_y, varying X)
    top_candidates = [(min_x + i * (max_x - min_x) / (num_positions_per_edge - 1), 
                      max_y + hub_offset, 
                      0) 
                      for i in range(num_positions_per_edge)]
    
    all_edge_candidates = [left_candidates, right_candidates, bottom_candidates, top_candidates]
    edge_names = ['Left', 'Right', 'Bottom', 'Top']
    
    best_config = None
    best_total_length = float('inf')
    
    # Try configurations with different numbers of hubs
    # Start with 4 hubs, then try 3, 2, 1
    from itertools import combinations, product
    
    total_configs = 0
    configs_tested = 0
    
    # Count total configurations
    for num_hubs in [4, 3, 2, 1]:
        for edge_combo in combinations(range(4), num_hubs):
            total_configs += num_positions_per_edge ** num_hubs
    
    print(f"\n{'='*70}")
    print(f"EXHAUSTIVE HUB POSITION SEARCH")
    print(f"{'='*70}")
    print(f"Testing {total_configs:,} hub configurations...")
    print(f"  - {num_positions_per_edge} positions per edge")
    print(f"  - Hubs placed {hub_offset}m OUTSIDE the frame")
    print(f"  - Testing 1, 2, 3, and 4 hub configurations")
    print(f"{'='*70}\n")
    
    import time
    start_time = time.time()
    
    for num_hubs in [4, 3, 2, 1]:
        for edge_combo in combinations(range(4), num_hubs):
            # For each edge in this combination, try each position
            edge_positions = [all_edge_candidates[e] for e in edge_combo]
            
            # Try all combinations of positions across selected edges
            for position_combo in product(*edge_positions):
                configs_tested += 1
                
                if configs_tested % 100 == 0:
                    elapsed = time.time() - start_time
                    rate = configs_tested / elapsed if elapsed > 0 else 0
                    remaining = (total_configs - configs_tested) / rate if rate > 0 else 0
                    print(f"  Progress: {configs_tested}/{total_configs} ({100*configs_tested/total_configs:.1f}%) | "
                          f"Elapsed: {elapsed:.1f}s | ETA: {remaining:.1f}s")
                
                hubs = list(position_combo)
                
                # Calculate total cable length for this configuration
                total_length = calculate_total_cable_length_for_hubs(
                    hubs, artnet_nodes, power_requirements
                )
                
                if total_length < best_total_length:
                    best_total_length = total_length
                    best_config = {
                        'hubs': hubs,
                        'edges': [edge_names[e] for e in edge_combo],
                        'total_length': total_length,
                        'num_hubs': num_hubs
                    }
                    print(f"  ★ New best: {num_hubs} hubs on {', '.join([edge_names[e] for e in edge_combo])}, {total_length:.2f}m")
    
    total_time = time.time() - start_time
    
    print(f"\n{'='*70}")
    print(f"EXHAUSTIVE SEARCH COMPLETE")
    print(f"{'='*70}")
    print(f"Tested: {total_configs:,} configurations in {total_time:.1f} seconds")
    print(f"Rate: {total_configs/total_time:.0f} configs/second")
    print(f"\nOptimal configuration:")
    print(f"  - {len(best_config['hubs'])} hubs on {', '.join(best_config['edges'])} edges")
    print(f"  - Estimated total cable length: {best_config['total_length']:.2f}m")
    print(f"  - Hub positions (outside frame by {hub_offset}m):")
    for i, hub in enumerate(best_config['hubs']):
        print(f"      {best_config['edges'][i]}: ({hub[0]:.2f}, {hub[1]:.2f}, {hub[2]:.2f})")
    print(f"{'='*70}\n")
    
    return best_config['hubs']


def calculate_total_cable_length_for_hubs(hubs: List[Tuple], artnet_nodes: List[Tuple],
                                          power_requirements: Dict[Tuple, int]) -> float:
    """
    Calculate actual total cable length for a given hub configuration.
    Performs full hub assignment and circuit routing.
    """
    # Assign each ArtNet node to its closest hub
    hub_assignments = {i: [] for i in range(len(hubs))}
    
    for node in artnet_nodes:
        # Find closest hub
        min_distance = float('inf')
        closest_hub_idx = 0
        
        for hub_idx, hub in enumerate(hubs):
            distance = euclidean_distance(node, hub)
            if distance < min_distance:
                min_distance = distance
                closest_hub_idx = hub_idx
        
        hub_assignments[closest_hub_idx].append(node)
    
    # Create circuits for each hub and sum total cable length
    total_cable_length = 0.0
    
    for hub_idx, hub in enumerate(hubs):
        unassigned_for_hub = list(hub_assignments[hub_idx])
        
        while unassigned_for_hub:
            route, power, length = nearest_neighbor_route(hub, unassigned_for_hub, power_requirements)
            
            if not route:
                break
            
            total_cable_length += length
            
            for node in route:
                unassigned_for_hub.remove(node)
    
    return total_cable_length


def nearest_neighbor_route(hub: Tuple, available_nodes: List[Tuple], 
                           power_requirements: Dict[Tuple, int],
                           max_power: int = 1800) -> Tuple[List[Tuple], int, float]:
    """
    Create a power circuit using improved nearest neighbor heuristic with power constraint.
    Routes always start from hub and chain through nodes.
    Uses spatial clustering to group nearby nodes, preventing long cable runs.
    
    Args:
        hub: Starting power hub location
        available_nodes: List of ArtNet nodes not yet assigned to a circuit
        power_requirements: Power requirements for each node
        max_power: Maximum power per circuit (default 1800W)
    
    Returns:
        Tuple of (route, total_power, total_length)
        Length includes hub-to-first-node and all subsequent segments
    """
    if not available_nodes:
        return [], 0, 0.0
    
    route = []
    total_power = 0
    total_length = 0.0
    current_position = hub  # Always start from the hub
    remaining = set(available_nodes)
    
    while remaining:
        # Find best node that fits in power budget
        best_node = None
        best_score = float('inf')
        
        for node in remaining:
            node_power = power_requirements[node]
            
            # Check if adding this node would exceed power limit
            if total_power + node_power <= max_power:
                distance = euclidean_distance(current_position, node)
                
                # Improved scoring: heavily penalize nodes that would create long jumps
                # when there are still many nodes left in the circuit
                if len(remaining) > 1:
                    other_nodes = remaining - {node}
                    # Find closest other node to this candidate
                    min_dist_to_others = min(euclidean_distance(node, other) 
                                            for other in other_nodes)
                    # Penalize nodes that are isolated from the remaining group
                    # This prevents picking nodes that create long cable runs
                    isolation_penalty = min_dist_to_others * 0.5
                    score = distance + isolation_penalty
                else:
                    score = distance
                
                if score < best_score:
                    best_score = score
                    best_node = node
                    best_distance = distance
        
        # If no node fits, stop this circuit
        if best_node is None:
            break
        
        # Add node to route
        route.append(best_node)
        total_power += power_requirements[best_node]
        total_length += best_distance  # This includes hub->first_node on first iteration
        current_position = best_node
        remaining.remove(best_node)
    
    return route, total_power, total_length


def cluster_nodes_by_proximity(hub: Tuple, nodes: List[Tuple], 
                               power_requirements: Dict[Tuple, int],
                               max_power: int = 1800) -> List[List[Tuple]]:
    """
    Cluster nodes into spatial groups using angular sectors from the hub.
    This creates "wedge-shaped" clusters that minimize cable crossing.
    
    Args:
        hub: The power hub location
        nodes: List of nodes to cluster
        power_requirements: Power requirements for each node
        max_power: Maximum power per circuit
    
    Returns:
        List of clusters, where each cluster is a list of nodes
    """
    if not nodes:
        return []
    
    import math
    
    # Sort nodes by angle from hub, then by distance
    # This creates wedge-shaped clusters radiating from the hub
    def node_sort_key(node):
        dx = node[0] - hub[0]
        dy = node[1] - hub[1]
        angle = math.atan2(dy, dx)
        distance = euclidean_distance(hub, node)
        return (angle, distance)
    
    sorted_nodes = sorted(nodes, key=node_sort_key)
    
    # Group consecutive nodes in sorted order into power-limited clusters
    clusters = []
    current_cluster = []
    current_power = 0
    
    for node in sorted_nodes:
        node_power = power_requirements[node]
        
        # Check if adding this node would exceed power limit
        if current_power + node_power <= max_power:
            # Add to current cluster
            current_cluster.append(node)
            current_power += node_power
        else:
            # Start a new cluster
            if current_cluster:
                clusters.append(current_cluster)
            current_cluster = [node]
            current_power = node_power
    
    # Don't forget the last cluster
    if current_cluster:
        clusters.append(current_cluster)
    
    return clusters


def solve_single_hub_vrp(hub: Tuple, hub_idx: int, hub_nodes: List[Tuple],
                         power_requirements: Dict[Tuple, int],
                         max_power: int = 1800) -> List[Dict]:
    """
    Solve single-depot VRP for one hub using OR-Tools.
    
    Args:
        hub: Hub location
        hub_idx: Hub index
        hub_nodes: Nodes assigned to this hub
        power_requirements: Power requirements dict
        max_power: Max power per circuit
    
    Returns:
        List of circuits for this hub
    """
    if not hub_nodes:
        return []
    
    # Create distance matrix with hub as depot (index 0)
    all_locations = [hub] + hub_nodes
    num_locations = len(all_locations)
    
    distance_matrix = []
    for loc1 in all_locations:
        row = []
        for loc2 in all_locations:
            dist = int(euclidean_distance(loc1, loc2) * 100)  # cm for precision
            row.append(dist)
        distance_matrix.append(row)
    
    # Demands (depot = 0)
    demands = [0] + [power_requirements[n] for n in hub_nodes]
    
    # Estimate number of vehicles needed
    total_power = sum(power_requirements[n] for n in hub_nodes)
    num_vehicles = max(1, (total_power + max_power - 1) // max_power)
    
    # Create routing
    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)
    
    # Distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]
    
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    # Capacity constraint
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        return demands[from_node]
    
    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null slack
        [max_power] * num_vehicles,
        True,
        'Capacity'
    )
    
    # Search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.AUTOMATIC
    )
    search_parameters.time_limit.seconds = 10
    
    # Solve
    solution = routing.SolveWithParameters(search_parameters)
    
    if not solution:
        return None
    
    # Extract circuits
    circuits = []
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        route = []
        route_distance = 0
        route_power = 0
        
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            if node_index > 0:  # Skip depot
                actual_node = hub_nodes[node_index - 1]
                route.append(actual_node)
                route_power += power_requirements[actual_node]
            
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)
        
        if route:
            circuits.append({
                'hub': hub,
                'hub_index': hub_idx,
                'route': route,
                'power': route_power,
                'length': route_distance / 100.0,
                'nodes_count': len(route)
            })
    
    return circuits


def solve_vrp_with_ortools(power_hubs: List[Tuple], artnet_nodes: List[Tuple],
                           power_requirements: Dict[Tuple, int],
                           max_power: int = 1800) -> List[Dict]:
    """
    Solve the multi-depot capacitated VRP using Google OR-Tools.
    Strategy: Assign nodes to closest hub, then solve single-depot VRP for each hub.
    
    Args:
        power_hubs: List of hub locations
        artnet_nodes: List of ArtNet nodes to visit
        power_requirements: Power requirement for each node
        max_power: Maximum power per circuit
    
    Returns:
        List of circuits with optimized routes
    """
    if not ORTOOLS_AVAILABLE:
        print("OR-Tools not available, falling back to greedy algorithm")
        return None
    
    print(f"Solving VRP with OR-Tools ({len(artnet_nodes)} nodes, {len(power_hubs)} hubs)...")
    
    # Assign each node to its closest hub
    hub_assignments = {i: [] for i in range(len(power_hubs))}
    for node in artnet_nodes:
        closest_hub = min(range(len(power_hubs)), 
                         key=lambda h: euclidean_distance(node, power_hubs[h]))
        hub_assignments[closest_hub].append(node)
    
    # Solve VRP for each hub independently
    all_circuits = []
    total_cable_length = 0.0
    
    for hub_idx, hub in enumerate(power_hubs):
        hub_nodes = hub_assignments[hub_idx]
        if not hub_nodes:
            continue
        
        print(f"  Solving hub {hub_idx+1}/{len(power_hubs)} ({len(hub_nodes)} nodes)...")
        
        hub_circuits = solve_single_hub_vrp(hub, hub_idx, hub_nodes, power_requirements, max_power)
        
        if hub_circuits is None:
            print(f"  Hub {hub_idx+1} failed, falling back to greedy")
            return None
        
        all_circuits.extend(hub_circuits)
        total_cable_length += sum(c['length'] for c in hub_circuits)
    
    print(f"OR-Tools solution: {len(all_circuits)} circuits, {total_cable_length:.2f}m total cable")
    
    return all_circuits


def solve_vrp_with_genetic_algorithm(power_hubs: List[Tuple], artnet_nodes: List[Tuple],
                                     power_requirements: Dict[Tuple, int],
                                     max_power: int = 1800,
                                     population_size: int = 100,
                                     generations: int = 200,
                                     mutation_rate: float = 0.15) -> List[Dict]:
    """
    Solve multi-depot VRP using Genetic Algorithm.
    
    Chromosome representation: List of (hub_idx, [node_indices_in_route_order])
    
    Args:
        power_hubs: List of hub locations
        artnet_nodes: List of nodes to visit
        power_requirements: Power per node
        max_power: Max power per circuit
        population_size: GA population size
        generations: Number of generations
        mutation_rate: Probability of mutation
    
    Returns:
        List of optimized circuits
    """
    print(f"Solving VRP with Genetic Algorithm ({len(artnet_nodes)} nodes, {len(power_hubs)} hubs)...")
    print(f"  Population: {population_size}, Generations: {generations}, Mutation rate: {mutation_rate}")
    
    # Index nodes for faster processing
    node_list = list(artnet_nodes)
    num_nodes = len(node_list)
    
    # Pre-compute distance matrix
    dist_matrix = {}
    for i, hub in enumerate(power_hubs):
        for j, node in enumerate(node_list):
            dist_matrix[(f"hub_{i}", j)] = euclidean_distance(hub, node)
    for i, n1 in enumerate(node_list):
        for j, n2 in enumerate(node_list):
            if i != j:
                dist_matrix[(i, j)] = euclidean_distance(n1, n2)
    
    def create_individual():
        """Create random valid solution (chromosome)."""
        # Assign each node to a random hub
        nodes_copy = list(range(num_nodes))
        random.shuffle(nodes_copy)
        
        hub_assignments = {i: [] for i in range(len(power_hubs))}
        for node_idx in nodes_copy:
            hub_idx = random.randint(0, len(power_hubs) - 1)
            hub_assignments[hub_idx].append(node_idx)
        
        return hub_assignments
    
    def calculate_route_length(hub_idx: int, route: List[int]) -> float:
        """Calculate total cable length for a route."""
        if not route:
            return 0.0
        
        total_length = dist_matrix[(f"hub_{hub_idx}", route[0])]
        for i in range(len(route) - 1):
            total_length += dist_matrix[(route[i], route[i+1])]
        return total_length
    
    def split_into_circuits(hub_idx: int, node_indices: List[int]) -> List[List[int]]:
        """Split nodes into circuits respecting power constraints."""
        if not node_indices:
            return []
        
        circuits = []
        current_circuit = []
        current_power = 0
        
        for node_idx in node_indices:
            node = node_list[node_idx]
            node_power = power_requirements[node]
            
            if current_power + node_power <= max_power:
                current_circuit.append(node_idx)
                current_power += node_power
            else:
                if current_circuit:
                    circuits.append(current_circuit)
                current_circuit = [node_idx]
                current_power = node_power
        
        if current_circuit:
            circuits.append(current_circuit)
        
        return circuits
    
    def fitness(individual):
        """Calculate fitness (lower total cable length = better)."""
        total_length = 0.0
        
        for hub_idx, node_indices in individual.items():
            if not node_indices:
                continue
            
            # Split into power-constrained circuits
            circuits = split_into_circuits(hub_idx, node_indices)
            
            # Calculate length for each circuit with nearest-neighbor ordering
            for circuit in circuits:
                if not circuit:
                    continue
                
                # Optimize circuit order with nearest neighbor
                ordered_circuit = []
                remaining = set(circuit)
                
                # Start with node closest to hub
                current = min(remaining, key=lambda n: dist_matrix[(f"hub_{hub_idx}", n)])
                ordered_circuit.append(current)
                remaining.remove(current)
                
                # Build route with nearest neighbor
                while remaining:
                    nearest = min(remaining, key=lambda n: dist_matrix[(current, n)])
                    ordered_circuit.append(nearest)
                    remaining.remove(nearest)
                    current = nearest
                
                total_length += calculate_route_length(hub_idx, ordered_circuit)
        
        return -total_length  # Negative because we want to minimize
    
    def crossover(parent1, parent2):
        """Crossover: blend hub assignments from two parents."""
        child = {i: [] for i in range(len(power_hubs))}
        
        for node_idx in range(num_nodes):
            # Find which hub has this node in each parent
            hub1 = next((h for h, nodes in parent1.items() if node_idx in nodes), None)
            hub2 = next((h for h, nodes in parent2.items() if node_idx in nodes), None)
            
            # Randomly choose parent's assignment
            if hub1 is not None and hub2 is not None:
                chosen_hub = hub1 if random.random() < 0.5 else hub2
            elif hub1 is not None:
                chosen_hub = hub1
            else:
                chosen_hub = hub2 if hub2 is not None else random.randint(0, len(power_hubs) - 1)
            
            child[chosen_hub].append(node_idx)
        
        return child
    
    def mutate(individual):
        """Mutation: randomly reassign some nodes to different hubs."""
        mutated = {h: list(nodes) for h, nodes in individual.items()}
        
        for node_idx in range(num_nodes):
            if random.random() < mutation_rate:
                # Find current hub
                current_hub = next((h for h, nodes in mutated.items() if node_idx in nodes), None)
                if current_hub is not None:
                    # Remove from current hub
                    mutated[current_hub].remove(node_idx)
                    # Assign to new random hub (prefer closer hubs)
                    distances = [(h, dist_matrix[(f"hub_{h}", node_idx)]) for h in range(len(power_hubs))]
                    distances.sort(key=lambda x: x[1])
                    # Weighted random selection favoring closer hubs
                    weights = [1.0 / (1.0 + d) for _, d in distances]
                    new_hub = random.choices([h for h, _ in distances], weights=weights)[0]
                    mutated[new_hub].append(node_idx)
        
        return mutated
    
    # Initialize population
    population = [create_individual() for _ in range(population_size)]
    best_solution = None
    best_fitness = float('-inf')
    
    # Evolution
    for gen in range(generations):
        # Calculate fitness for all individuals
        fitnesses = [(ind, fitness(ind)) for ind in population]
        fitnesses.sort(key=lambda x: x[1], reverse=True)
        
        # Track best
        if fitnesses[0][1] > best_fitness:
            best_fitness = fitnesses[0][1]
            best_solution = fitnesses[0][0]
            if (gen + 1) % 20 == 0:
                print(f"  Generation {gen + 1}/{generations}: Best cable length = {-best_fitness:.2f}m")
        
        # Selection: keep top 20%
        elite_size = population_size // 5
        elite = [ind for ind, _ in fitnesses[:elite_size]]
        
        # Create new generation
        new_population = elite.copy()
        
        while len(new_population) < population_size:
            # Tournament selection
            tournament = random.sample(fitnesses, min(5, len(fitnesses)))
            parent1 = max(tournament, key=lambda x: x[1])[0]
            tournament = random.sample(fitnesses, min(5, len(fitnesses)))
            parent2 = max(tournament, key=lambda x: x[1])[0]
            
            # Crossover
            child = crossover(parent1, parent2)
            
            # Mutation
            child = mutate(child)
            
            new_population.append(child)
        
        population = new_population
    
    # Convert best solution to circuit format
    print(f"  Final best: {-best_fitness:.2f}m cable length")
    
    circuits = []
    for hub_idx in range(len(power_hubs)):
        node_indices = best_solution[hub_idx]
        if not node_indices:
            continue
        
        # Split into power-constrained circuits
        circuit_groups = split_into_circuits(hub_idx, node_indices)
        
        for circuit_nodes in circuit_groups:
            # Optimize order with nearest neighbor
            ordered = []
            remaining = set(circuit_nodes)
            
            current = min(remaining, key=lambda n: dist_matrix[(f"hub_{hub_idx}", n)])
            ordered.append(current)
            remaining.remove(current)
            
            while remaining:
                nearest = min(remaining, key=lambda n: dist_matrix[(current, n)])
                ordered.append(nearest)
                remaining.remove(nearest)
                current = nearest
            
            # Convert to actual nodes and calculate metrics
            route = [node_list[idx] for idx in ordered]
            route_power = sum(power_requirements[node_list[idx]] for idx in ordered)
            route_length = calculate_route_length(hub_idx, ordered)
            
            circuits.append({
                'hub': power_hubs[hub_idx],
                'hub_index': hub_idx,
                'route': route,
                'power': route_power,
                'length': route_length,
                'nodes_count': len(route)
            })
    
    total_cable = sum(c['length'] for c in circuits)
    print(f"Genetic Algorithm solution: {len(circuits)} circuits, {total_cable:.2f}m total cable")
    
    return circuits


def solve_with_2opt_improvement(circuits: List[Dict], power_requirements: Dict[Tuple, int],
                                max_power: int = 1800) -> List[Dict]:
    """
    Apply 2-opt local search to improve existing circuit routes.
    This swaps edges in routes to reduce total length while maintaining power constraints.
    """
    improved_circuits = []
    
    for circuit in circuits:
        route = circuit['route']
        hub = circuit['hub']
        
        if len(route) < 4:  # 2-opt needs at least 4 nodes
            improved_circuits.append(circuit)
            continue
        
        best_route = route[:]
        best_length = circuit['length']
        improved = True
        
        # Iterate until no improvement
        max_iterations = 100
        iteration = 0
        while improved and iteration < max_iterations:
            improved = False
            iteration += 1
            
            # Try all 2-opt swaps
            for i in range(len(best_route) - 2):
                for j in range(i + 2, len(best_route)):
                    # Create new route by reversing segment between i and j
                    new_route = best_route[:i+1] + best_route[i+1:j+1][::-1] + best_route[j+1:]
                    
                    # Calculate new length
                    new_length = euclidean_distance(hub, new_route[0])
                    for k in range(len(new_route) - 1):
                        new_length += euclidean_distance(new_route[k], new_route[k+1])
                    
                    # If better, update
                    if new_length < best_length:
                        best_route = new_route
                        best_length = new_length
                        improved = True
        
        # Create improved circuit
        improved_circuits.append({
            'hub': hub,
            'hub_index': circuit['hub_index'],
            'route': best_route,
            'power': circuit['power'],
            'length': best_length,
            'nodes_count': len(best_route)
        })
    
    return improved_circuits


def solve_with_ant_colony(power_hubs: List[Tuple], artnet_nodes: List[Tuple],
                          power_requirements: Dict[Tuple, int],
                          max_power: int = 1800,
                          num_ants: int = 50,
                          iterations: int = 100,
                          alpha: float = 1.0,  # Pheromone importance
                          beta: float = 2.0,   # Distance importance
                          evaporation: float = 0.1,
                          q: float = 100.0) -> List[Dict]:
    """
    Ant Colony Optimization for VRP.
    Ants build solutions probabilistically, leaving pheromone trails on good paths.
    """
    nodes_with_power = [(n, power_requirements[n]) for n in artnet_nodes]
    
    # Initialize pheromone matrix
    all_locations = power_hubs + artnet_nodes
    pheromone = {}
    for i, loc1 in enumerate(all_locations):
        for j, loc2 in enumerate(all_locations):
            if i != j:
                pheromone[(loc1, loc2)] = 1.0
    
    best_circuits = None
    best_total_length = float('inf')
    
    for iteration in range(iterations):
        iteration_circuits = []
        
        # Each ant builds a solution
        for ant in range(num_ants):
            # Assign nodes to nearest hubs first
            hub_assignments = {i: [] for i in range(len(power_hubs))}
            for node, power in nodes_with_power:
                closest_hub_idx = min(range(len(power_hubs)),
                                     key=lambda h: euclidean_distance(node, power_hubs[h]))
                hub_assignments[closest_hub_idx].append(node)
            
            # Build circuits for each hub
            ant_circuits = []
            for hub_idx, hub in enumerate(power_hubs):
                hub_nodes = hub_assignments[hub_idx]
                if not hub_nodes:
                    continue
                
                # Build circuits using pheromone-guided selection
                remaining = set(hub_nodes)
                current_circuit = []
                current_power = 0
                
                while remaining:
                    if not current_circuit:
                        # Start new circuit - choose node probabilistically
                        probs = []
                        nodes_list = list(remaining)
                        for node in nodes_list:
                            dist = euclidean_distance(hub, node)
                            pher = pheromone.get((hub, node), 1.0)
                            # Probability based on pheromone and distance
                            prob = (pher ** alpha) * ((1.0 / (dist + 0.1)) ** beta)
                            probs.append(prob)
                        
                        # Normalize probabilities
                        total_prob = sum(probs)
                        if total_prob > 0:
                            probs = [p / total_prob for p in probs]
                            next_node = random.choices(nodes_list, weights=probs)[0]
                        else:
                            next_node = nodes_list[0]
                        
                        current_circuit = [next_node]
                        current_power = power_requirements[next_node]
                        remaining.remove(next_node)
                    else:
                        # Add to current circuit or start new one
                        current_node = current_circuit[-1]
                        
                        # Find nodes that fit in current circuit
                        feasible = [n for n in remaining 
                                  if current_power + power_requirements[n] <= max_power]
                        
                        if feasible:
                            # Choose next node probabilistically
                            probs = []
                            for node in feasible:
                                dist = euclidean_distance(current_node, node)
                                pher = pheromone.get((current_node, node), 1.0)
                                prob = (pher ** alpha) * ((1.0 / (dist + 0.1)) ** beta)
                                probs.append(prob)
                            
                            total_prob = sum(probs)
                            if total_prob > 0:
                                probs = [p / total_prob for p in probs]
                                next_node = random.choices(feasible, weights=probs)[0]
                            else:
                                next_node = feasible[0]
                            
                            current_circuit.append(next_node)
                            current_power += power_requirements[next_node]
                            remaining.remove(next_node)
                        else:
                            # Current circuit is full, save it and start new one
                            route_length = euclidean_distance(hub, current_circuit[0])
                            for i in range(len(current_circuit) - 1):
                                route_length += euclidean_distance(current_circuit[i], 
                                                                  current_circuit[i+1])
                            
                            ant_circuits.append({
                                'hub': hub,
                                'hub_index': hub_idx,
                                'route': current_circuit,
                                'power': current_power,
                                'length': route_length,
                                'nodes_count': len(current_circuit)
                            })
                            
                            current_circuit = []
                            current_power = 0
                
                # Save last circuit if any
                if current_circuit:
                    route_length = euclidean_distance(hub, current_circuit[0])
                    for i in range(len(current_circuit) - 1):
                        route_length += euclidean_distance(current_circuit[i], current_circuit[i+1])
                    
                    ant_circuits.append({
                        'hub': hub,
                        'hub_index': hub_idx,
                        'route': current_circuit,
                        'power': current_power,
                        'length': route_length,
                        'nodes_count': len(current_circuit)
                    })
            
            # Track best solution
            total_length = sum(c['length'] for c in ant_circuits)
            if total_length < best_total_length:
                best_total_length = total_length
                best_circuits = ant_circuits
                iteration_circuits = ant_circuits
        
        # Update pheromones
        # Evaporation
        for key in pheromone:
            pheromone[key] *= (1.0 - evaporation)
        
        # Deposit pheromone on best solution
        if best_circuits:
            deposit_amount = q / best_total_length
            for circuit in best_circuits:
                route = circuit['route']
                hub = circuit['hub']
                
                # Hub to first node
                pheromone[(hub, route[0])] = pheromone.get((hub, route[0]), 1.0) + deposit_amount
                
                # Between nodes in route
                for i in range(len(route) - 1):
                    edge = (route[i], route[i+1])
                    pheromone[edge] = pheromone.get(edge, 1.0) + deposit_amount
        
        if iteration % 20 == 0:
            print(f"  ACO iteration {iteration}/{iterations}, best length: {best_total_length:.2f}m")
    
    return best_circuits if best_circuits else []


def solve_with_simulated_annealing(nodes: List[Tuple], artnet_nodes: List[Tuple],
                                   power_requirements: Dict[Tuple, int],
                                   initial_hubs: List[Tuple],
                                   max_power: int = 1800,
                                   initial_temp: float = 1000.0,
                                   cooling_rate: float = 0.995,
                                   iterations: int = 5000) -> Tuple[List[Tuple], List[Dict]]:
    """
    Solve multi-depot VRP using Simulated Annealing.
    Optimizes BOTH hub positions AND routing simultaneously.
    
    Args:
        nodes: All network nodes (for hub position bounds)
        artnet_nodes: Nodes to visit
        power_requirements: Power per node
        initial_hubs: Starting hub positions
        max_power: Max power per circuit
        initial_temp: Starting temperature
        cooling_rate: Temperature decay factor
        iterations: Number of iterations
    
    Returns:
        Tuple of (optimized_hubs, circuits)
    """
    print(f"Solving with Simulated Annealing ({len(artnet_nodes)} nodes, {len(initial_hubs)} hubs)...")
    print(f"  Temperature: {initial_temp}, Cooling: {cooling_rate}, Iterations: {iterations}")
    
    # Get bounds for hub movement
    all_x = [n[0] for n in nodes]
    all_y = [n[1] for n in nodes]
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    
    node_list = list(artnet_nodes)
    num_nodes = len(node_list)
    
    def evaluate_solution(hubs: List[Tuple], hub_assignments: Dict[int, List[int]]) -> Tuple[float, List[Dict]]:
        """Evaluate a solution and return (total_cable_length, circuits)."""
        # Pre-compute distances for this hub configuration
        dist_cache = {}
        for h_idx, hub in enumerate(hubs):
            for n_idx, node in enumerate(node_list):
                dist_cache[(f"hub_{h_idx}", n_idx)] = euclidean_distance(hub, node)
        
        for i in range(num_nodes):
            for j in range(i + 1, num_nodes):
                d = euclidean_distance(node_list[i], node_list[j])
                dist_cache[(i, j)] = d
                dist_cache[(j, i)] = d
        
        circuits = []
        total_cable = 0.0
        
        for hub_idx in range(len(hubs)):
            node_indices = hub_assignments.get(hub_idx, [])
            if not node_indices:
                continue
            
            # Split into power-constrained circuits
            circuit_groups = []
            current_circuit = []
            current_power = 0
            
            for n_idx in node_indices:
                node = node_list[n_idx]
                node_power = power_requirements[node]
                
                if current_power + node_power <= max_power:
                    current_circuit.append(n_idx)
                    current_power += node_power
                else:
                    if current_circuit:
                        circuit_groups.append(current_circuit)
                    current_circuit = [n_idx]
                    current_power = node_power
            
            if current_circuit:
                circuit_groups.append(current_circuit)
            
            # Optimize each circuit with nearest neighbor
            for circuit_nodes in circuit_groups:
                if not circuit_nodes:
                    continue
                
                # Nearest neighbor ordering
                ordered = []
                remaining = set(circuit_nodes)
                
                current = min(remaining, key=lambda n: dist_cache.get((f"hub_{hub_idx}", n), float('inf')))
                ordered.append(current)
                remaining.remove(current)
                
                while remaining:
                    nearest = min(remaining, key=lambda n: dist_cache.get((current, n), float('inf')))
                    ordered.append(nearest)
                    remaining.remove(nearest)
                    current = nearest
                
                # Calculate route length
                route_length = dist_cache.get((f"hub_{hub_idx}", ordered[0]), 0)
                for i in range(len(ordered) - 1):
                    route_length += dist_cache.get((ordered[i], ordered[i+1]), 0)
                
                # Build circuit
                route = [node_list[idx] for idx in ordered]
                route_power = sum(power_requirements[node_list[idx]] for idx in ordered)
                
                circuits.append({
                    'hub': hubs[hub_idx],
                    'hub_index': hub_idx,
                    'route': route,
                    'power': route_power,
                    'length': route_length,
                    'nodes_count': len(route)
                })
                
                total_cable += route_length
        
        return total_cable, circuits
    
    def create_initial_assignment(hubs: List[Tuple]) -> Dict[int, List[int]]:
        """Assign each node to nearest hub."""
        assignments = {i: [] for i in range(len(hubs))}
        for n_idx, node in enumerate(node_list):
            closest_hub = min(range(len(hubs)), 
                            key=lambda h: euclidean_distance(node, hubs[h]))
            assignments[closest_hub].append(n_idx)
        return assignments
    
    def perturb_solution(hubs: List[Tuple], assignments: Dict[int, List[int]], 
                        temp: float) -> Tuple[List[Tuple], Dict[int, List[int]]]:
        """Generate neighbor solution by perturbing hubs and/or assignments."""
        new_hubs = [h for h in hubs]
        new_assignments = {h: list(nodes) for h, nodes in assignments.items()}
        
        # Choose perturbation type
        choice = random.random()
        
        if choice < 0.4:  # Move a hub (40% chance)
            hub_idx = random.randint(0, len(hubs) - 1)
            # Move proportional to temperature (larger moves when hot)
            move_range = (temp / initial_temp) * 10.0  # Max 10m movement
            dx = random.uniform(-move_range, move_range)
            dy = random.uniform(-move_range, move_range)
            
            # Keep hubs OUTSIDE the grid perimeter (2m minimum offset)
            hub_offset = 2.0
            new_x = hubs[hub_idx][0] + dx
            new_y = hubs[hub_idx][1] + dy
            
            # Constrain to reasonable bounds OUTSIDE the grid
            new_x = max(min_x - 10, min(max_x + 10, new_x))  # Allow 10m outside grid
            new_y = max(min_y - 10, min(max_y + 10, new_y))  # Allow 10m outside grid
            
            # Ensure hub stays outside the grid perimeter
            if min_x <= new_x <= max_x:
                # Hub would be inside horizontally, push it outside
                if abs(new_x - min_x) < abs(new_x - max_x):
                    new_x = min_x - hub_offset
                else:
                    new_x = max_x + hub_offset
            
            if min_y <= new_y <= max_y:
                # Hub would be inside vertically, push it outside
                if abs(new_y - min_y) < abs(new_y - max_y):
                    new_y = min_y - hub_offset
                else:
                    new_y = max_y + hub_offset
            
            new_hubs[hub_idx] = (new_x, new_y, 0.0)
            
            # Reassign nodes affected by hub movement
            new_assignments = create_initial_assignment(new_hubs)
        
        elif choice < 0.7:  # Reassign a node to different hub (30% chance)
            # Pick a random node and reassign it
            if num_nodes > 0:
                node_idx = random.randint(0, num_nodes - 1)
                current_hub = next((h for h, ns in new_assignments.items() if node_idx in ns), None)
                if current_hub is not None:
                    new_assignments[current_hub].remove(node_idx)
                    new_hub = random.randint(0, len(hubs) - 1)
                    new_assignments[new_hub].append(node_idx)
        
        else:  # Swap nodes between hubs (30% chance)
            hubs_with_nodes = [h for h in range(len(hubs)) if len(new_assignments[h]) > 0]
            if len(hubs_with_nodes) >= 2:
                h1, h2 = random.sample(hubs_with_nodes, 2)
                if new_assignments[h1] and new_assignments[h2]:
                    idx1 = random.choice(new_assignments[h1])
                    idx2 = random.choice(new_assignments[h2])
                    new_assignments[h1].remove(idx1)
                    new_assignments[h2].remove(idx2)
                    new_assignments[h1].append(idx2)
                    new_assignments[h2].append(idx1)
        
        return new_hubs, new_assignments
    
    # Initialize
    current_hubs = [h for h in initial_hubs]
    current_assignments = create_initial_assignment(current_hubs)
    current_cost, current_circuits = evaluate_solution(current_hubs, current_assignments)
    
    best_hubs = [h for h in current_hubs]
    best_assignments = {h: list(nodes) for h, nodes in current_assignments.items()}
    best_cost = current_cost
    best_circuits = current_circuits
    
    temperature = initial_temp
    
    # Annealing loop
    accepted_moves = 0
    for iteration in range(iterations):
        # Generate neighbor
        new_hubs, new_assignments = perturb_solution(current_hubs, current_assignments, temperature)
        new_cost, new_circuits = evaluate_solution(new_hubs, new_assignments)
        
        # Accept or reject
        delta = new_cost - current_cost
        
        if delta < 0 or random.random() < math.exp(-delta / temperature):
            current_hubs = new_hubs
            current_assignments = new_assignments
            current_cost = new_cost
            current_circuits = new_circuits
            accepted_moves += 1
            
            # Track best
            if current_cost < best_cost:
                best_hubs = [h for h in current_hubs]
                best_assignments = {h: list(nodes) for h, nodes in current_assignments.items()}
                best_cost = current_cost
                best_circuits = current_circuits
        
        # Cool down
        temperature *= cooling_rate
        
        # Progress reporting
        if (iteration + 1) % 500 == 0:
            accept_rate = accepted_moves / 500
            print(f"  Iteration {iteration+1}/{iterations}: Best={best_cost:.2f}m, "
                  f"Current={current_cost:.2f}m, Temp={temperature:.2f}, Accept={accept_rate:.1%}")
            accepted_moves = 0
    
    print(f"  Final best: {best_cost:.2f}m cable length")
    print(f"Simulated Annealing solution: {len(best_circuits)} circuits, {best_cost:.2f}m total cable")
    
    return best_hubs, best_circuits


def optimize_power_distribution(nodes: List[Tuple], edges: List[Tuple], 
                                artnet_nodes: List[Tuple],
                                optimize_hubs: bool = True,
                                positions_per_edge: int = 10,
                                use_ortools: bool = False,
                                use_genetic: bool = False,
                                use_simulated_annealing: bool = False,
                                use_ant_colony: bool = False,
                                use_2opt_improvement: bool = True,
                                edge_directions: Dict = None) -> Dict:
    """
    Optimize power cable distribution with optimized hub positions.
    Can use 1-4 hubs depending on what minimizes total cable length.
    
    Args:
        nodes: All network nodes
        edges: All network edges
        artnet_nodes: Nodes that need power
        optimize_hubs: If True, optimize hub positions and count; if False, use default 4 centers
        use_ortools: If True, use Google OR-Tools VRP solver
        use_genetic: If True, use Genetic Algorithm
        use_simulated_annealing: If True, use Simulated Annealing (optimizes hub positions + routing)
    
    Returns:
        Dictionary containing:
        - power_requirements: Dict mapping nodes to power needs
        - power_hubs: List of hub locations (1-4 hubs)
        - circuits: List of circuits, each with hub, route, power, length
        - total_circuits: Total number of circuits needed
        - total_cable_length: Total power cable length
        - max_power_per_circuit: Maximum power constraint
    """
    # Calculate power requirements using balanced edge directions if available
    power_requirements = calculate_node_power_requirements(nodes, edges, artnet_nodes, edge_directions)
    
    # Print which optimizer is being used
    print("\n" + "="*70)
    if use_simulated_annealing:
        print("OPTIMIZER: SIMULATED ANNEALING (optimizes hub positions + routing)")
    elif use_ant_colony:
        print("OPTIMIZER: ANT COLONY OPTIMIZATION")
    elif use_genetic:
        print("OPTIMIZER: GENETIC ALGORITHM")
    elif use_ortools:
        print("OPTIMIZER: GOOGLE OR-TOOLS VRP SOLVER")
    else:
        print("OPTIMIZER: GREEDY ANGULAR CLUSTERING")
    
    if use_2opt_improvement:
        print("POST-PROCESSING: 2-Opt Local Search Improvement")
    print("="*70 + "\n")
    
    # Get initial power hub locations (ALWAYS outside the grid)
    hub_offset = 2.0  # Hubs must be 2m outside grid perimeter
    if optimize_hubs and not use_simulated_annealing:
        print("Optimizing hub positions...")
        power_hubs = optimize_hub_positions(nodes, artnet_nodes, power_requirements, 
                                           positions_per_edge, hub_offset=hub_offset)
    else:
        power_hubs = get_window_edge_centers(nodes, hub_offset=hub_offset)
    
    # Priority: Simulated Annealing > Ant Colony > Genetic > OR-Tools > Greedy
    
    # Try Simulated Annealing if enabled (it handles hub optimization internally)
    if use_simulated_annealing:
        # Use positions_per_edge to control iterations (scaled up)
        # positions_per_edge range: 3-20 → iterations: 3000-20000
        sa_iterations = positions_per_edge * 1000
        optimized_hubs, all_circuits = solve_with_simulated_annealing(
            nodes, artnet_nodes, power_requirements, power_hubs,
            iterations=sa_iterations
        )
        if all_circuits:
            power_hubs = optimized_hubs  # Use the optimized hub positions
            total_cable_length = sum(c['length'] for c in all_circuits)
        else:
            print("Simulated annealing failed, falling back to greedy...")
            use_simulated_annealing = False
    
    # Try Ant Colony Optimization if enabled (and SA not used)
    if not use_simulated_annealing and use_ant_colony:
        aco_iterations = positions_per_edge * 10  # Scale iterations by slider
        all_circuits = solve_with_ant_colony(power_hubs, artnet_nodes, power_requirements,
                                             iterations=aco_iterations)
        if all_circuits:
            total_cable_length = sum(c['length'] for c in all_circuits)
        else:
            print("Ant Colony Optimization failed, falling back to greedy...")
            use_ant_colony = False
    
    # Try Genetic Algorithm if enabled (and neither SA nor ACO used)
    if not use_simulated_annealing and not use_ant_colony and use_genetic:
        all_circuits = solve_vrp_with_genetic_algorithm(power_hubs, artnet_nodes, power_requirements)
        if all_circuits:
            total_cable_length = sum(c['length'] for c in all_circuits)
        else:
            print("Genetic algorithm failed, falling back to greedy...")
            use_genetic = False
    
    # Try OR-Tools VRP solver if enabled and available (and no other advanced algo used)
    if not use_simulated_annealing and not use_ant_colony and not use_genetic and use_ortools and ORTOOLS_AVAILABLE:
        all_circuits = solve_vrp_with_ortools(power_hubs, artnet_nodes, power_requirements)
        
        if all_circuits:
            # OR-Tools succeeded
            total_cable_length = sum(c['length'] for c in all_circuits)
        else:
            # OR-Tools failed, fall back to greedy
            print("Falling back to greedy angular clustering algorithm...")
            use_ortools = False
    
    # Use greedy algorithm if nothing else worked
    if not use_simulated_annealing and not use_ant_colony and not use_genetic and (not use_ortools or not ORTOOLS_AVAILABLE):
        # Step 1: Assign each ArtNet node to its closest hub
        hub_assignments = {i: [] for i in range(len(power_hubs))}
        
        for node in artnet_nodes:
            # Find closest hub
            min_distance = float('inf')
            closest_hub_idx = 0
            
            for hub_idx, hub in enumerate(power_hubs):
                distance = euclidean_distance(node, hub)
                if distance < min_distance:
                    min_distance = distance
                    closest_hub_idx = hub_idx
            
            # Assign node to closest hub
            hub_assignments[closest_hub_idx].append(node)
        
        # Step 2: Create circuits for each hub from its assigned nodes
        # Use spatial clustering to group nearby nodes together
        all_circuits = []
        total_cable_length = 0.0
        
        for hub_idx, hub in enumerate(power_hubs):
            # Get nodes assigned to this hub
            hub_nodes = hub_assignments[hub_idx]
            
            if not hub_nodes:
                continue
            
            # Pre-cluster nodes into groups that should be on the same circuit
            # This prevents long cable runs across the space
            clusters = cluster_nodes_by_proximity(hub, hub_nodes, power_requirements)
            
            # Create circuits from each cluster
            for cluster in clusters:
                route, power, length = nearest_neighbor_route(hub, cluster, power_requirements)
                
                if not route:
                    # No valid circuit found - shouldn't happen
                    print(f"Warning: Could not create circuit from hub {hub_idx}")
                    continue
                
                circuit = {
                    'hub': hub,
                    'hub_index': hub_idx,
                    'route': route,
                    'power': power,
                    'length': length,
                    'nodes_count': len(route)
                }
                
                all_circuits.append(circuit)
                total_cable_length += length
    
    # Determine which optimizer was actually used
    # Apply 2-opt local search improvement if enabled
    if use_2opt_improvement and all_circuits:
        print("\nApplying 2-Opt local search improvement...")
        improved_circuits = solve_with_2opt_improvement(all_circuits, power_requirements)
        improvement = sum(c['length'] for c in all_circuits) - sum(c['length'] for c in improved_circuits)
        if improvement > 0:
            print(f"  2-Opt improved solution by {improvement:.2f}m ({improvement/sum(c['length'] for c in all_circuits)*100:.1f}%)")
            all_circuits = improved_circuits
            total_cable_length = sum(c['length'] for c in all_circuits)
        else:
            print("  No improvement found with 2-Opt")
    
    # Track optimizer name
    if use_simulated_annealing:
        optimizer_name = "SIMULATED ANNEALING (with hub optimization)"
    elif use_ant_colony:
        optimizer_name = "ANT COLONY OPTIMIZATION"
    elif use_genetic:
        optimizer_name = "GENETIC ALGORITHM"
    elif use_ortools:
        optimizer_name = "GOOGLE OR-TOOLS VRP SOLVER"
    else:
        optimizer_name = "GREEDY ANGULAR CLUSTERING"
    
    if use_2opt_improvement:
        optimizer_name += " + 2-Opt"
    
    return {
        'power_requirements': power_requirements,
        'power_hubs': power_hubs,
        'circuits': all_circuits,
        'total_circuits': len(all_circuits),
        'total_cable_length': total_cable_length,
        'max_power_per_circuit': 1800,
        'total_power': sum(power_requirements.values()),
        'optimizer_type': optimizer_name
    }


def print_power_optimization_results(optimization: Dict):
    """Print detailed power optimization results."""
    print("\n" + "="*60)
    print("POWER CABLE OPTIMIZATION RESULTS")
    print("="*60)
    
    # Show which optimizer was used
    if 'optimizer_type' in optimization:
        print(f"\nOptimizer used: {optimization['optimizer_type']}")
    
    print(f"\nTotal ArtNet nodes: {len(optimization['power_requirements'])}")
    print(f"Total power required: {optimization['total_power']}W")
    print(f"Max power per circuit: {optimization['max_power_per_circuit']}W")
    print(f"Number of circuits needed: {optimization['total_circuits']}")
    print(f"Total power cable length: {optimization['total_cable_length']:.2f}m")
    
    # Show node assignments per hub
    if 'hub_assignments' in optimization:
        hub_names = ['Left', 'Right', 'Bottom', 'Top']
        print(f"\nNodes assigned per hub:")
        for hub_idx, nodes in optimization['hub_assignments'].items():
            print(f"  {hub_names[hub_idx]}: {len(nodes)} nodes")
    
    print(f"\n{'Circuit':<10} {'Hub':<8} {'Nodes':<8} {'Power':<12} {'Length':<12}")
    print("-" * 60)
    
    hub_names = ['Left', 'Right', 'Bottom', 'Top']
    
    for i, circuit in enumerate(optimization['circuits'], 1):
        hub_name = hub_names[circuit['hub_index']]
        print(f"{i:<10} {hub_name:<8} {circuit['nodes_count']:<8} "
              f"{circuit['power']:>6}W ({circuit['power']/18:.0f}%) "
              f"{circuit['length']:>9.2f}m")
    
    print("\n" + "="*60)
