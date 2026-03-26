# Blender Guide: Adding Blink Morph Targets

This guide will walk you through adding `blink_left` and `blink_right` shape keys to your character model in Blender.

## What You'll Learn
- How to add shape keys (morph targets) to a mesh
- How to create a basic blink expression
- How to test and export

## Prerequisites
- Blender installed (download from https://blender.org)
- Your character model loaded as GLTF

---

## Step 1: Open Blender and Import Your Model

1. Open **Blender** (fresh start)
2. Delete the default cube: Select it (left-click), press `X`, then `Enter`
3. Import your model:
   - Menu: `File` → `Import` → `glTF 2.0 (.gltf/.glb)`
   - Navigate to your model file
   - Click `Import glTF`

---

## Step 2: Select the Face Mesh

Your model has multiple parts. You need to select just the **head/face mesh**.

1. In the **Outliner** (top-right panel), find your model
2. Expand it by clicking the arrow `▶`
3. Look for meshes - likely named something like `head`, `face`, `Body`, or `Head`
4. **Left-click** to select the face/head mesh
5. The mesh should be highlighted orange in the 3D view

> **Tip**: If you're not sure which is the face mesh, look for the smallest/largest mesh, or the one with eyes/mouth visible.

---

## Step 3: Open the Shape Keys Panel

With the face mesh selected:

1. Look at the **Properties** panel (right side of Blender)
2. Find the **green triangle icon** (Object Data)
3. Click on it to open
4. You should see "Shape Keys" with a list showing "Basis" (and maybe more)

---

## Step 4: Add the Basis Shape Key

The "Basis" shape key should already exist (it's the rest/neutral position).

If you don't see it:
1. Click the **`+`** button next to "Shape Keys"
2. It will create a "Basis" key (this is your starting position)

---

## Step 5: Add Blink Left Shape Key

1. With the face mesh still selected
2. In the Shape Keys panel, click **`+`** to add a new shape key
3. Rename it: Double-click "Key 1" and type `blink_left`
4. Click on "blink_left" to select it (highlight it)

---

## Step 6: Create the Blink (Edit Mode)

Now we'll modify the vertices to create the blink.

1. With `blink_left` selected in Shape Keys, click the **shield icon** (edit mode toggle)
   - This shows only the vertices affected by this shape key
   - All other geometry becomes gray

2. **Zoom in on the left eye area**:
   - Scroll wheel to zoom
   - Middle-mouse drag to orbit
   - Focus on the eye with the eyelid

3. **Select the eyelid vertices**:
   - Press `C` to activate **Circle Select**
   - Left-click and drag to paint-select the upper eyelid vertices
   - Cover the area that closes when blinking
   - Press `Esc` to exit Circle Select

4. **Scale the eyelid down**:
   - Press `S` to scale
   - Type `0` (zero) and press `Enter`
   - This flattens the eyelid vertices

5. **Move slightly**:
   - Press `G`, then `Z`, then type `-0.001` and `Enter`
   - This moves the eyelid slightly down/back

6. **Check your work**:
   - Click the **shield icon** again to see both shapes
   - Slide the "blink_left" slider to see the blink
   - If it looks wrong, click "blink_left" again and fix

7. Press `Tab` to exit Edit Mode when done

---

## Step 7: Add Blink Right Shape Key

1. Click **`+`** to add another shape key
2. Rename it to `blink_right`
3. Select it and click the **shield icon** to edit
4. **Zoom to the RIGHT eye** (opposite side)
5. Repeat the same process:
   - Circle select (`C`) the right upper eyelid
   - Scale (`S`) to `0`
   - Move (`G`, `Z`, `-0.001`)
6. Exit Edit Mode (`Tab`)

---

## Step 8: Test Your Blinks

1. Make sure you're in **Object Mode** (`Tab` if needed)
2. Find the **Shape Keys** panel on the right
3. You should see:
   ```
   Shape Keys
   ├─ Basis (value: 1.00)
   ├─ blink_left (value: 0.00)
   └─ blink_right (value: 0.00)
   ```
4. **Drag the sliders** to test:
   - Move `blink_left` slider to 1.0 → Left eye should close
   - Move `blink_right` slider to 1.0 → Right eye should close
   - Both at 1.0 → Both eyes closed (like sleeping)

---

## Step 9: Export as GLTF

**Important**: We need to export so the shape keys are included.

1. Menu: `File` → `Export` → `glTF 2.0 (.gltf/.glb)`

2. **Export Settings** (right panel):
   - ✅ Include:
     - ✅ `Selected Objects` (only export selected mesh)
     - ✅ `Mesh` 
     - ✅ `Armature` (if you have bones - your model does!)
   - ⚠️ Geometry:
     - ✅ `Apply Modifiers`
     - ✅ `UVs`
     - ⬜ `Apply Scalings` → set to **"FBX All"** (NOT "Default"!)
     - ⬜ `Max Cache Size` → leave default
   - ⚠️ **CRITICAL**: 
     - ✅ `Use Mesh Vertices as Blend Shape Targets` ← **MUST CHECK THIS!**
   - ⚠️ Animation (if exporting animations):
     - Configure as needed

3. **Filename**: Choose a new filename like `YourModel_withBlinks.gltf`

4. Click **Export glTF**

---

## Step 10: Test in the Kiosk

1. Replace your model file (or update `config.js` to point to the new file)
2. Restart the kiosk
3. Check the console for:
   ```
   === MORPH TARGET ANALYSIS ===
   Found 2 morph target(s): blink_left, blink_right
   eye: blink_left, blink_right
   Blink shapes: ✓ Found
   ```

---

## Troubleshooting

### "Selected Objects" is grayed out
- You must have the face mesh selected before exporting

### Shape keys don't appear in the export
- Make sure **"Use Mesh Vertices as Blend Shape Targets"** is checked

### Model looks wrong after export
- Try different settings in the Geometry section
- Some models need "Apply Scalings" set to "All Local"

### Eyes blink in wrong direction
- Go back to Edit Mode for that shape key
- Try scaling in different axis (try `S`, `Y`, `0` instead of `S`, `0`)

---

## Next Steps: Adding More Shape Keys

Once you have blinking working, you can add:

| Name | Purpose |
|------|---------|
| `smile` | Happy expression - curve mouth corners up |
| `mouth_A` | Lip-sync - slight mouth open |
| `mouth_O` | Lip-sync - round open mouth |
| `brow_raise` | Surprise - raise eyebrows |

**Same process**: Select face mesh → Add Shape Key → Edit vertices → Export

---

## Quick Reference

| Action | Shortcut |
|--------|----------|
| Select all | `A` |
| Circle select | `C` |
| Scale | `S` then axis then value |
| Move | `G` then axis then value |
| Zoom | Scroll wheel |
| Orbit | Middle-mouse drag |
| Exit Edit Mode | `Tab` |
| Delete | `X` |
| Confirm | `Enter` |
