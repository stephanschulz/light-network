# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Start a Web Server

Since the application loads CSV files, you need to run it through a web server:

**Option A: Python (easiest)**
```bash
cd network-visualizer-web
python3 -m http.server 8000
```

**Option B: Node.js**
```bash
cd network-visualizer-web
npx http-server -p 8000
```

**Option C: PHP**
```bash
cd network-visualizer-web
php -S localhost:8000
```

### Step 2: Open in Browser

Navigate to:
```
http://localhost:8000
```

### Step 3: Load Your Data

The app will automatically try to load `../Oct10_003_stephan.csv`

Or click **"Load CSV Data"** to upload your own CSV file.

## 📋 What You'll See

1. **Canvas** (left): Interactive network visualization
2. **Control Panel** (right): All settings and controls

## 🎯 Try These First

1. **Auto-Optimization**: The app runs ArtNet optimization automatically after loading data

2. **View Smart Nodes**:
   - Check ✅ "Show Smart Nodes (□ + #)"
   - See green circles with blue rectangles
   - Numbers show connection counts

3. **Hover Over Nodes**:
   - Move mouse over any node
   - See tooltip with detailed information

4. **Adjust Visuals**:
   - Move sliders to adjust sizes
   - See changes in real-time

5. **Toggle Features**:
   - ✅ Show Grid - see the grid overlay
   - ✅ Show Data Cables - see orange cables to window edges

## 🎨 Visual Guide

### Node Colors
- 🔴 **Red Circle** = Regular node
- 🟢 **Green Circle** = ArtNet node (smart node)
- 🟠 **Orange Ring** = Intercom node

### Line Colors
- **Gray** = Regular edge
- **Red (thick)** = Filtered edge (selected length)
- **Magenta** = Data flow arrow
- **Orange** = Data cable to power hub
- **Dashed Gray** = Window frame

### Connection Count
Blue number inside ArtNet nodes = Number of outgoing data connections

### Row Power
Numbers on right side:
- 🟢 **Green** = OK (< 18A)
- 🟠 **Orange** = Warning (18-20A)
- 🔴 **Red** = Over limit (> 20A)

## 🔧 Common Tasks

### Export Edge Data
1. Run optimization first (automatic)
2. Click **"Export Edge Data"**
3. Download `edge_data_export.csv`

### Print Node Information
1. Run optimization first (automatic)
2. Click **"Print Node Results"**
3. Check browser console (F12) for detailed table

### Filter by Edge Length
1. Move **"Edge Length Filter"** slider
2. See only edges of selected length in bright red
3. Slider value shows: `{length}m ({count} edges)`

### Zoom & Pan
- Click **+** to zoom in
- Click **-** to zoom out
- Click **Reset** to reset view
- (Pan not yet implemented - coming soon!)

## ⚙️ Optimization Details

The app automatically runs:
1. **Minimal Coverage** - finds smallest ArtNet node set
2. **Port Balancing** - ensures ≤4 outputs per node
3. **Power Balancing** - ensures ≤20A per row

Progress shown in **ArtNet Info** box.

## 📊 Understanding the Display

### Smart Nodes (ArtNet)
- Shown with green circles
- Blue square outline
- Blue number = outgoing connections
- Must power all connected edges

### Data Flow
- Magenta arrows show direction
- FROM ArtNet nodes
- TO regular nodes
- TO intercom nodes (special case)

### Data Cables
- Orange lines from ArtNet → window edges
- Blue dots = power hub locations
- Length labels on each cable
- Total length shown in control panel

## 🐛 Troubleshooting

**Nothing shows up?**
- Check browser console (F12) for errors
- Make sure CSV is in correct format
- Try uploading CSV manually

**Optimization not working?**
- Refresh page
- Check that CSV loaded successfully
- Look for error messages in console

**Can't see nodes?**
- Try **Reset** zoom button
- Adjust **Node Diameter** slider
- Check if nodes are actually in CSV

**Performance slow?**
- Disable **Show Grid** for large networks
- Close other browser tabs
- Use Chrome for best performance

## 🎓 Advanced Tips

1. **Hover while zoomed** - Tooltips work at any zoom level

2. **Edge filtering** - Use to find specific cable lengths you need to order

3. **Console logging** - Check browser console for detailed optimization progress

4. **Export regularly** - Export edge data after optimization for offline analysis

5. **Compare settings** - Export with different visual settings to see what works best

## 📱 Mobile Support

Currently optimized for desktop. Mobile support coming soon!

For now, use landscape mode on tablets for best experience.

## 🆘 Need Help?

Check the full README.md for detailed documentation.

Look at browser console (F12 → Console tab) for error messages.
