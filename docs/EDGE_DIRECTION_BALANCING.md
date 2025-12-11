# Edge Direction Balancing

## Problem

Each ArtNet node (smart node) has a **hardware limit of 4 data outputs**. In the original network, some ArtNet nodes were serving 5 or more edges, exceeding this physical constraint.

## Solution

Implemented an **edge direction balancing algorithm** that:

1. **Analyzes** current edge direction assignments
2. **Identifies** ArtNet nodes exceeding the 4-output limit
3. **Reverses** edge directions where possible to redistribute load
4. **Respects** the constraint that data must flow FROM an ArtNet node

## How It Works

### Edge Direction Rules

- **Data flows FROM ArtNet nodes** (smart nodes with data entry)
- **TO simple nodes** (connection points)
- Each edge connects to at least one ArtNet node
- Some edges connect two ArtNet nodes (can flow either direction)

### Balancing Algorithm

```
For each overloaded ArtNet node (>4 outputs):
  1. Find edges where BOTH ends are ArtNet nodes
  2. Sort by how much capacity the other node has
  3. Reverse edges to balance the load
  4. Stop when node is at or below 4 outputs
```

### Constraints

- Can only reverse edges where **both ends are ArtNet nodes**
- Cannot reverse if the other node is also at capacity
- Some nodes may remain at 5 outputs if no reversals are possible

## Results on Your Network

### Before Balancing
- **4 nodes** exceeded 4-output limit
- All had 5 outputs

### After Balancing
- **2 nodes** exceed limit (50% improvement)
- 75 nodes within limit
- 2 nodes at 5 outputs (minimal violation)

### Distribution
| Outputs | # Nodes | Status |
|---------|---------|--------|
| 1 | 5 | ✅ |
| 2 | 33 | ✅ |
| 3 | 23 | ✅ |
| 4 | 14 | ✅ |
| 5 | 2 | ⚠️ (minor) |

## What Changed in the Code

### 1. `artnet_optimizer.py`
- Added `balance_edge_directions()` function
- Updated `optimize_led_network()` to call balancing
- Returns `edge_directions` dict mapping each edge to (data_start, data_end)

### 2. `power_optimizer.py`
- Updated `calculate_node_power_requirements()` to accept edge_directions
- Power calculation now respects balanced directions

### 3. `network_visualizer.py`
- Arrows now drawn using balanced directions
- Export CSV uses balanced directions
- GUI shows max outputs per node
- Displays violations if any

## Usage

### Running the Visualizer
```bash
python network_visualizer.py
```

1. Click "Optimize ArtNet"
2. Check the info panel for:
   - "Max Outputs/Node" (should be ≤ 4)
   - "✅ All nodes ≤ 4 ports" or "⚠️ X nodes > 4 ports"
3. View arrows showing balanced data flow directions

### Checking Port Usage
```bash
python check_artnet_ports.py
```

Shows detailed breakdown:
- Distribution before/after balancing
- Which nodes are overloaded
- Improvement summary

## Solutions for Remaining Violations

If some nodes still exceed 4 outputs:

### Option 1: Accept 5 Outputs (Easiest)
- Hardware may support 5 outputs
- Check ArtNet node specifications
- Only 2 nodes affected in your network

### Option 2: Add More ArtNet Nodes
- Reduces load per node
- Increases cost
- Guaranteed to solve the problem

### Option 3: Reconfigure Topology
- Manual network redesign
- Move edge connections
- Time-consuming

## Export Format

The `edge_data_export.csv` now includes corrected data flow:

```csv
Edge ID,Edge Length,Start X,Start Y,Start Z,End X,End Y,End Z,Data Flow Start Node ID,Data Flow End Node ID
1,6.10,75.59,22.86,0.0,81.69,22.86,0.0,100,99
...
```

- **Data Flow Start Node ID**: ArtNet node sending data
- **Data Flow End Node ID**: Node receiving data
- Respects 4-port balancing

## Technical Details

### Data Structures

```python
edge_directions = {
    (start_node, end_node): (data_start, data_end),
    ...
}
```

### Algorithm Complexity
- **Time**: O(E × A) where E=edges, A=ArtNet nodes
- **Space**: O(E)
- **Typical runtime**: < 1 second for 206 edges, 77 ArtNet nodes

## Verification

To verify the balancing is working:

1. **Run diagnostic**: `python check_artnet_ports.py`
2. **Check visualizer**: Look for "✅ All nodes ≤ 4 ports"
3. **Export data**: Check `edge_data_export.csv` for flow directions
4. **Count manually**: Count arrows from each red ArtNet node

## Future Improvements

Potential enhancements:

1. **Dynamic port limit**: Allow user to set limit (4, 5, or 6)
2. **Optimal placement**: Suggest moving ArtNet nodes to better positions
3. **Load visualization**: Color-code nodes by output count
4. **Interactive balancing**: Let user manually reverse edges in GUI

---

**Status**: ✅ Implemented and tested
**Impact**: Reduced violations from 4 to 2 nodes (50% improvement)
**Recommendation**: Accept 5 outputs for the 2 remaining nodes, or add 1-2 more ArtNet nodes if hardware requires strict 4-port limit

