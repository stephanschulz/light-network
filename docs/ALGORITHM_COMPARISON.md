# Power Cable Routing Algorithm Comparison

## Test Results (77 ArtNet nodes, 4 power hubs, 206 edges)

| Algorithm | Cable Length | Circuits | Time | Hub Optimization | Status |
|-----------|--------------|----------|------|------------------|--------|
| **Greedy Angular Clustering** | **838.93m** ✓ | 16 | 0.00s | No | **WINNER** |
| Simulated Annealing | 1086.67m | 16 | 8.69s | **Yes** | 30% worse |
| OR-Tools VRP | 1167.32m | 15 | 0.04s | No | 39% worse |
| Genetic Algorithm | 1268.15m | 16 | 4.08s | No | 51% worse |

## Algorithm Details

### 1. Greedy Angular Clustering (RECOMMENDED ★)

**How it works:**
- Groups nodes by their angular direction from each hub
- Creates "wedge-shaped" circuits radiating outward
- Minimizes cable crossing and backtracking

**Pros:**
- ✓ Best cable optimization (838m)
- ✓ Instant results (<0.01s)
- ✓ Specifically designed for radial hub-and-spoke patterns
- ✓ Simple and predictable

**Cons:**
- Not guaranteed globally optimal (but best in practice)

**Use when:** You want the best results for hub-based power distribution (ALWAYS for this project)

---

### 2. OR-Tools VRP Solver

**How it works:**
- Industry-standard solver for Vehicle Routing Problems
- Uses constraint programming and local search
- Treats each hub independently as single-depot VRP

**Pros:**
- ✓ Very fast (0.04s)
- ✓ Professional-grade solver
- ✓ Good for general VRP problems

**Cons:**
- ✗ 39% worse than greedy (1167m vs 839m)
- Designed for general routing, not radial patterns
- Requires OR-Tools library installation

**Use when:** Testing alternative approaches or general VRP problems (not recommended for this project)

---

### 3. Simulated Annealing

**How it works:**
- Probabilistically accepts worse solutions to escape local minima
- Temperature-controlled exploration (hot → cold)
- **Optimizes both hub positions AND routing simultaneously**
- Gradually "freezes" into best solution found

**Pros:**
- ✓ Best of the general-purpose algorithms (1087m)
- ✓ Optimizes hub positions during search
- ✓ Can escape local minima
- ✓ Theoretically guaranteed to find global optimum given infinite time

**Cons:**
- ✗ Still 30% worse than greedy (1087m vs 839m)
- Slow (8.7 seconds)
- Needs parameter tuning (temperature, cooling rate)
- Even with hub optimization, can't match greedy

**Use when:** You want to experiment with hub position optimization (not recommended for this project)

---

### 4. Genetic Algorithm

**How it works:**
- Evolves population of solutions over 200 generations
- Uses crossover and mutation to explore solution space
- Tournament selection for parent choices

**Pros:**
- ✓ Flexible approach
- ✓ Can escape local minima
- ✓ Learns from multiple solutions

**Cons:**
- ✗ 51% worse than greedy (1268m vs 839m)
- Slow (4.1 seconds)
- Non-deterministic results
- Needs more generations/better operators for this problem

**Use when:** Experimenting with evolutionary approaches (not recommended for this project)

---

## How to Switch Algorithms

In `network_visualizer.py`, line 522-531:

```python
self.power_optimization = optimize_power_distribution(
    list(self.nodes),
    self.edges,
    self.artnet_optimization['artnet_nodes'],
    optimize_hubs=self.optimize_hub_positions,
    positions_per_edge=self.hub_positions_per_edge,
    use_ortools=False,              # Set to True for OR-Tools
    use_genetic=False,              # Set to True for Genetic Algorithm
    use_simulated_annealing=False   # Set to True for Simulated Annealing
)
```

**Priority:** If multiple are True, it uses: **Simulated Annealing > Genetic > OR-Tools > Greedy**

---

## Why Greedy Wins

The **angular clustering** approach is perfect for this specific problem because:

1. **Radial Pattern**: Power hubs naturally create spoke-like circuits
2. **Spatial Grouping**: Nodes in same direction cluster together
3. **No Backtracking**: Circuits extend outward, minimizing cable crossing
4. **Domain-Specific**: Designed for this exact use case

General-purpose solvers (OR-Tools, GA) try to optimize generic routing, missing the radial structure that makes greedy so effective.

---

## Recommendation

**Use Greedy Angular Clustering** (default setting)

It's faster, simpler, and 30-51% better than all alternatives. Even **Simulated Annealing with hub position optimization** can't beat the greedy approach because:

1. **Domain-specific design beats general algorithms** - Angular clustering is tailored for radial hub-spoke patterns
2. **Fixed hubs are already optimal** - Window edge centers are geometrically ideal
3. **Spatial structure matters** - Grouping nodes by direction eliminates cable crossing

The other algorithms (SA, GA, OR-Tools) are available for experimentation, but offer no practical advantage for this hub-based power distribution problem.

### Key Insight

Sometimes a well-designed greedy heuristic outperforms sophisticated optimization algorithms. The angular clustering approach exploits the geometric structure of the problem in a way that general-purpose solvers cannot match.

