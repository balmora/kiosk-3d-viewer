# Kiosk 3D Viewer

A talking 3D model kiosk built with Three.js

## Setup

### Requirements
- Python (for local server)
- Git

### Run locally
1. Clone the repository
   git clone https://github.com/balmora/kiosk-3d-viewer.git
   
2. download Node.js Windows installer (.msi) with python
   https://nodejs.org/en/download

3. Download Three.js libraries + ollama
   Double-click download_libs.bat

4. download a model into /model

5. Start the server
   Double-click start.bat

6. Open browser
   http://localhost:8080

## Project Structure
project/
├── index.html
├── start.bat
├── download_libs.bat
├── .gitignore
├── README.md
├── js/
│ ├── main.js
│ ├── modelLoader.js
│ ├── animationController.js
│ ├── lipSync.js
│ ├── aiController.js
│ └── sceneSetup.js
├── libs/ ← downloaded by download_libs.bat
└── models/ ← add your own gltf model

## Usage
Type commands in the text box:
- `hello` — wave
- `nod` — agree
- `dance` — dance
- `think` — thinking pose
