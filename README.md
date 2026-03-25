# Kiosk 3D Viewer

A talking 3D model kiosk built with Three.js, Ollama AI, and Kokoro TTS.

---

## Requirements (install before setup)

### 1. Node.js (with Python)
Download the Windows installer (.msi):
https://nodejs.org/en/download

> **Important:** During installation, check the box that says  
> **"Automatically install the necessary tools including Python"**

### 2. Git
https://git-scm.com/downloads

---

## Installation

### 1. Clone the repository
   git clone https://github.com/balmora/kiosk-3d-viewer.git
   cd kiosk-3d-viewer
   
### 2. Run setup
On Windows/Linux/macOS:
```bash
python setup.py
```
Or double-click `setup.py`

This will automatically:
- ✅ Download Three.js libraries
- ✅ Download and install Ollama
- ✅ Pull the `leeplenty/ellaria` AI model
- ✅ Install Kokoro TTS (`kokoro-onnx`)
- ✅ Download Kokoro voice model files (~490MB total)
- ✅ Verify everything is in place

> ⏱️ First-time setup may take **5–15 minutes** depending on your internet speed

### 3. Add your 3D model
Drop your `.gltf` model file into the `/models` folder

### 4. Start the kiosk
Double-click **`start.py`**

### 5. Open in browser
   http://localhost:8080

---

## Usage

Type in the chat box to talk to Luna, or use these commands:

| Command | Action |
|---------|--------|
| `hello` | Wave |
| `nod` | Nod in agreement |
| `dance` | Dance animation |
| `think` | Thinking pose |

---

## Project Structure
```bash
kiosk-3d-viewer/
├── index.html
├── setup.py ← run this first
├── start.py ← run to launch
├── push.py ← git push helper
├── kokoro_server.py ← TTS server
├── .gitignore
├── README.md
├── js/
│ ├── main.js
│ ├── modelLoader.js
│ ├── animationController.js
│ ├── lipSync.js
│ ├── aiController.js
│ └── sceneSetup.js
├── libs/ ← created by setup.py
├── voice/ ← created by setup.py
└── models/ ← add your .gltf model here
```
---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Python not found` | Reinstall Node.js and check "Install Python" |
| `Ollama not found after install` | Restart setup.py after Ollama installer finishes |
| `AI model pull failed` | Make sure Ollama is running, try `ollama serve` in terminal |
| `Missing voice files` | Re-run setup.py, it will skip already downloaded files |
| `Model not showing` | Make sure your .gltf file is in the `/models` folder |
| `No sound` | Check that kokoro_server.py is running (start.py handles this) |