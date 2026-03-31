# Edge Data Export — Column Reference

The file `edge_data_export.csv` contains one row per edge (LED strip segment) in the network.

## Columns

| # | Column | Description |
|---|--------|-------------|
| 0 | `ID` | Unique edge identifier (integer). |
| 1 | `start_X` | X coordinate of the first geometric endpoint (meters). |
| 2 | `start_Y` | Y coordinate of the first geometric endpoint. Respects the Flip Y toggle at export time. |
| 3 | `start_Z` | Z coordinate of the first geometric endpoint. |
| 4 | `start_node_type` | Type of the node at the start endpoint: **ArtNet**, **Intercom**, or **Regular**. |
| 5 | `start_node_id` | Numeric node ID of the start endpoint. |
| 6 | `start_label` | Grid label of the start node (e.g. `M17`). Falls back to `#<id>` for off-grid nodes. |
| 7 | `end_X` | X coordinate of the second geometric endpoint (meters). |
| 8 | `end_Y` | Y coordinate of the second geometric endpoint. Respects the Flip Y toggle. |
| 9 | `end_Z` | Z coordinate of the second geometric endpoint. |
| 10 | `end_node_type` | Type of the node at the end endpoint: **ArtNet**, **Intercom**, or **Regular**. |
| 11 | `end_node_id` | Numeric node ID of the end endpoint. |
| 12 | `end_label` | Grid label of the end node (e.g. `A3`). Falls back to `#<id>` for off-grid nodes. |
| 13 | `Edge_Length` | Full distance between the two geometric endpoints (meters). |
| 14 | `Length_Adjusted_m` | LED strip length between the two LED rings: `max(0, Edge_Length − LED_Ring_Diameter_m)`. This is the actual lit strip length. |
| 15 | `LED_Ring_Diameter_m` | Diameter of the LED ring trim applied at each node (meters). Half this value is trimmed from each end of the edge to produce the strip segment. |
| 16 | `strip_start_x` | X coordinate where the LED strip begins (after trimming half the ring diameter inward from the start endpoint). |
| 17 | `strip_start_y` | Y coordinate of strip start. |
| 18 | `strip_start_z` | Z coordinate of strip start. |
| 19 | `strip_end_x` | X coordinate where the LED strip ends (trimmed inward from the end endpoint). |
| 20 | `strip_end_y` | Y coordinate of strip end. |
| 21 | `strip_end_z` | Z coordinate of strip end. |
| 22 | `Data_Flow_Start_Node_ID` | Node ID where data **originates** for this edge. This is the data source (the ArtNet controller side). May differ from `start_node_id`. Value is `No Flow` if no direction was assigned. |
| 23 | `Data_Flow_End_Node_ID` | Node ID where data **arrives** for this edge. This is the data sink. For intercom edges, this is the intercom node. Value is `No Flow` if no direction was assigned. |

## Node types

| Type | Meaning |
|------|---------|
| **ArtNet** | Smart node with an ArtNet controller. Outputs data to connected edges. |
| **Intercom** | Receive-only node (speaker/mic). Data always flows toward it. Drawn with a blue dot in the 2D view. |
| **Regular** | Standard junction node with no controller. |

## Geometric vs. data flow direction

The geometric endpoints (`start_X/Y/Z`, `end_X/Y/Z`) define the physical position of each edge. The data flow columns (`Data_Flow_Start_Node_ID`, `Data_Flow_End_Node_ID`) define the signal path, which may run in either direction along the edge.

To determine arrow direction: compare `Data_Flow_Start_Node_ID` with `start_node_id`. If they match, data flows start → end. If `Data_Flow_Start_Node_ID` matches `end_node_id`, data flows end → start.

## 3D Viewer

Open `edge_viewer.html` in a browser with `edge_data_export.csv` in the same folder. The viewer reads the CSV and renders edges, LED tubes, LED rings, data flow arrows, node dots, and grid labels. Arrow direction is derived from the flow columns as described above.

### GUI controls

| Control | Description |
|---------|-------------|
| Edges | Toggle thin edge lines |
| LED Tubes | Toggle fat LED strip tubes |
| LED Tube diameter | Adjust tube render width |
| Data Flow Arrows | Toggle direction arrows |
| ArtNet/Regular Rings | Toggle LED rings on non-intercom nodes |
| Intercom Rings | Toggle LED rings on intercom nodes |
| Node Dots | Toggle small white node spheres |
| Label Size | Scale grid labels (e.g. M17) above each node. At 0 labels are hidden. |
| Intercom diameter | Adjust intercom ring size |
| Open README | Open this file in a new tab |
