# Power Distribution Optimization Guide

## Fixed Issues

### ✓ Hub Placement Outside Grid
**Problem:** Power hubs were being placed inside the grid perimeter.
**Solution:** 
- All hubs now placed **2m outside** grid boundaries
- Simulated Annealing constrained to keep hubs outside during optimization
- `optimize_hub_positions()` generates candidates only outside the frame

## Available Optimization Algorithms

### 1. **Ant Colony Optimization (ACO)** ⭐ RECOMMENDED
**Current Default** - Best for routing problems like VRP

**How it works:**
- Virtual "ants" explore different routes
- Leave "pheromone trails" on good paths
- Future ants follow stronger trails
- Excellent for TSP/VRP-type problems

**Strengths:**
- Proven track record for routing optimization
- Good balance of exploration vs exploitation
- Parallelizable (multiple ants work simultaneously)

**Tuning:**
- **Iterations slider**: Controls ACO iterations (value × 10)
- Example: Slider = 10 → 100 ACO iterations
- More iterations = better solution, slower runtime

**To use:** In `network_visualizer.py` line 544, set:
```python
use_ant_colony=True
```

---

### 2. **Greedy Angular Clustering** 
**Fast baseline** - Custom algorithm for this geometry

**How it works:**
- Groups nodes by angle from each hub (creates "wedges")
- Routes within each wedge using nearest-neighbor
- Very fast, respects power constraints

**Strengths:**
- Extremely fast
- Works well for grid-like layouts
- Predictable behavior

**To use:** In `network_visualizer.py` line 541-544, set all to `False`

---

### 3. **Simulated Annealing (SA)**
**Hub position optimizer** - Moves hubs AND optimizes routes

**How it works:**
- Starts "hot" - accepts worse solutions
- Gradually "cools" - becomes more selective
- Can escape local minima
- **Only algorithm that also optimizes hub positions**

**Strengths:**
- Optimizes BOTH hub placement AND routing
- Can escape local minima
- Good for complex optimization landscapes

**Tuning:**
- **Iterations slider**: Controls SA iterations (value × 1000)
- Example: Slider = 10 → 10,000 iterations
- More iterations = more hub exploration

**To use:** In `network_visualizer.py` line 543, set:
```python
use_simulated_annealing=True
```

---

### 4. **Genetic Algorithm (GA)**
**Population-based** - Evolves solutions over generations

**How it works:**
- Population of candidate solutions
- Fitness = total cable length
- Crossover + mutation create new generations
- Best solutions survive

**Strengths:**
- Diverse solution exploration
- Good for complex search spaces

**To use:** In `network_visualizer.py` line 542, set:
```python
use_genetic=True
```

---

### 5. **Google OR-Tools VRP Solver**
**Professional solver** - Industrial-grade optimization

**How it works:**
- Uses constraint programming + metaheuristics
- Industry-standard VRP solver
- Multiple built-in strategies

**Note:** May timeout on large problems

**To use:** In `network_visualizer.py` line 541, set:
```python
use_ortools=True
```

---

## Post-Processing: 2-Opt Improvement

**Always enabled by default** - Improves any solution

**How it works:**
- Takes existing routes
- Tries swapping edge pairs
- Keeps improvements that reduce length
- Classic local search for TSP

**Strengths:**
- Fast improvement step
- Works with ANY base algorithm
- Often finds 5-15% improvement

**To disable:** In `network_visualizer.py` line 545, set:
```python
use_2opt_improvement=False
```

---

## Switching Algorithms

Edit `network_visualizer.py`, find the `optimize_power()` method (around line 535):

```python
self.power_optimization = optimize_power_distribution(
    list(self.nodes),
    self.edges,
    self.artnet_optimization['artnet_nodes'],
    optimize_hubs=self.optimize_hub_positions,
    positions_per_edge=self.hub_positions_per_edge,
    use_ortools=False,              # ← Google OR-Tools
    use_genetic=False,              # ← Genetic Algorithm
    use_simulated_annealing=False,  # ← Simulated Annealing (optimizes hubs)
    use_ant_colony=True,            # ← Ant Colony Optimization ⭐
    use_2opt_improvement=True       # ← Post-process with 2-Opt
)
```

**Set ONE to `True`, rest to `False`** (except `use_2opt_improvement` which can stay `True`)

**Priority order:** SA > ACO > Genetic > OR-Tools > Greedy

---

## Performance Comparison Recommendations

To find the best algorithm for YOUR data:

1. **Start with Ant Colony (ACO)**
   - Set slider to 10-15
   - Run optimization
   - Note cable length

2. **Try Simulated Annealing (SA)**
   - Uncheck "Optimize Hub Positions" 
   - Set slider to 10
   - Run optimization
   - Compare cable length

3. **Try with Hub Optimization**
   - Check "Optimize Hub Positions"
   - Set slider to 5 (slower)
   - Run SA or Greedy
   - See if moving hubs helps

4. **Try 2-Opt alone**
   - Use Greedy (all False)
   - Keep `use_2opt_improvement=True`
   - See improvement percentage

---

## Troubleshooting

### Hubs still inside grid?
1. Clear cache: `find . -name "*.pyc" -delete`
2. Restart visualizer
3. Check terminal output for hub coordinates
4. Hubs should be 2m outside grid bounds

### Algorithm too slow?
- Reduce iterations slider (3-5)
- Try Greedy algorithm
- Disable "Optimize Hub Positions"

### Solution not good?
- Increase iterations slider
- Try different algorithms
- Enable hub position optimization
- Check if 2-Opt is enabled

---

## Current Configuration

**Active Algorithm:** Ant Colony Optimization + 2-Opt
**Hub Placement:** Always 2m outside grid perimeter
**Hub Optimization:** Optional (checkbox in UI)

The **Iterations slider** now shows both:
- ACO iterations (value × 10)
- SA iterations (value × 1000)

Example: Slider = 10
- ACO: 100 iterations
- SA: 10,000 iterations

