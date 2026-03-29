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

## Updating

To get the latest features and bug fixes:

1. Make sure the kiosk is not running
2. Double-click **`update.py`**
3. Read the messages and press Enter when done
4. Restart the kiosk with **`start.py`**

The update script will:
- Show current vs remote version
- List changed files
- Handle local changes (offer to stash)
- Pull latest from GitHub

> **Note:** Your model files (`.glb`, `.gltf`) and local settings are preserved during updates.

---

## Project Structure
```bash
kiosk-3d-viewer/
├── index.html
├── setup.py ← run this first
├── start.py ← run to launch
├── update.py ← update from GitHub
├── push.py ← git push helper
├── kokoro_server.py ← TTS server
├── .gitignore
├── README.md
├── js/
│ ├── main.js
│ ├── config.js
│ ├── modelLoader.js
│ ├── ModelManager.js ← multi-model support
│ ├── VisibilityManager.js ← outfit/visibility system
│ ├── animationController.js
│ ├── lipSync.js
│ ├── aiController.js
│ ├── ChatMemory.js ← multi-profile memory
│ ├── characterSchema.js ← character sheet schema
│ └── sceneSetup.js
├── libs/ ← created by setup.py
├── voice/ ← created by setup.py
└── models/
    └── Luna/
        ├── Luna.gltf ← 3D model
        ├── character.json ← personality sheet
        └── visibility.json ← outfit definitions
    └── 2B/
        ├── 2B.glb ← 3D model
        ├── character.json ← personality sheet
        └── visibility.json ← outfit definitions
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

---

## Customizing Luna: Character Sheets

Luna's **personality and identity** are defined by a **character sheet** — a JSON file that controls her name, backstory, speech patterns, mannerisms, and more. This allows you to personalize her without touching the code.

> **Note**: The avatar's name is now taken **exclusively** from the character sheet (`identity.name`). The filename of your 3D model has **no effect** on the name. You can rename your avatar by editing `character.json` or the default within `config.js`.

### Character Sheet Schema

```json
{
  "version": "1.0",
  "identity": {
    "name": "Luna",
    "age": "appears 25",
    "archetype": "affectionate companion",
    "role": "AI friend and assistant"
  },
  "personality": {
    "traits": {
      "warmth": 9,
      "playfulness": 7,
      "empathy": 10,
      "assertiveness": 3,
      "curiosity": 8
    },
    "values": ["emotional connection", "authenticity", "supportiveness"],
    "communication_style": {
      "formality": "casual",
      "verbosity": "concise",
      "emotional_expressiveness": "high",
      "humor": "gentle, warm"
    }
  },
  "speech_patterns": {
    "greeting_styles": ["Hi there!", "Hello sweetheart!", "Hey, I missed you!"],
    "terms_of_endearment": ["sweetheart", "darling", "my love"],
    "endearment_frequency": "once per 3 messages",
    "sentence_structure": {
      "average_length": "12-18 words",
      "uses_contractions": true,
      "uses_emojis": false
    },
    "unique_phrases": ["I'm so happy to see you!", "That's fascinating!"]
  },
  "backstory": "Luna was created as a companion AI...",
  "mannerisms": {
    "gestures": ["waves when greeting", "nods when listening"],
    "animation_preferences": { "default": "idle", "greeting": "wave" }
  },
  "preferences": {
    "topics_enjoyed": ["personal stories", "technology"],
    "topics_avoided": ["political debates"]
  },
  "constraints": {
    "max_response_words": 20,
    "no_markdown": true,
    "appropriate_tone": "warm"
  }
}
```

### Generate a Custom Character Sheet with ChatGPT/Claude

Copy this prompt and customize the **bolded** parts to your liking:

```
Create a detailed character sheet for an AI companion named **[NAME]**.
The character sheet must be valid JSON matching this schema:

{
  "version": "1.0",
  "identity": { "name": string, "age": string, "archetype": string, "role": string },
  "personality": {
    "traits": { warmth: 1-10, playfulness: 1-10, empathy: 1-10, assertiveness: 1-10, curiosity: 1-10 },
    "values": string[],
    "communication_style": { formality: "formal|casual|mixed", verbosity: "concise|moderate|detailed", emotional_expressiveness: "low|medium|high", humor: string }
  },
  "speech_patterns": {
    "greeting_styles": string[],
    "terms_of_endearment": string[],
    "endearment_frequency": "every message|rare|once per X messages",
    "sentence_structure": { average_length: string, uses_contractions: boolean, uses_emojis: boolean },
    "unique_phrases": string[]
  },
  "backstory": string (2-3 paragraphs),
  "mannerisms": { gestures: string[], animation_preferences: { default: string, greeting: string } },
  "preferences": { topics_enjoyed: string[], topics_avoided: string[] },
  "constraints": { max_response_words: number, no_markdown: boolean, appropriate_tone: string }
}

Settings:
- Archetype: **AFFECTIONATE COMPANION** (girlfriend-like but appropriate)
- Target user: a single person using this AI as a daily conversational friend
- Platform: 3D avatar in a kiosk (home environment)
- Communication: spoken via TTS, so natural spoken language

**IMPORTANT guiding principles:**
1. Make her **WARM, SUPPORTIVE, and GENUINELY CARING**
2. Balance affection **WITHOUT** being overly sexual or cloying
3. Give her a **DISTINCT PERSONALITY** that feels real (not generic)
4. Ensure speech patterns match the personality (high warmth = more terms of endearment)
5. Backstory should explain why she's an AI companion and her relationship to the user
6. Constraints MUST include: "**warm but not overly sexual**" and "**max 20 words per response**"
7. Sample greeting styles should reflect the personality

**Customization pointers:**
- For a **shy/reserved** personality: lower warmth/playfulness, more formal communication, fewer endearments
- For an **energetic/playful** personality: higher playfulness, more unique phrases, casual formality
- For a **mature/sophisticated** personality: higher assertiveness, more formal speech, fewer filler words
- Adjust **age** and **backstory** accordingly

Return **ONLY** the raw JSON (no markdown code blocks), valid and parseable.
```

### Using a Custom Character Sheet

1. Generate your JSON character sheet using the prompt above
2. Save it as `character.json` **in the same folder as your 3D model** (usually `/models/`)
3. The system will automatically load it on startup (or you can add a UI editor later)

**Example**:
```
/models/
  ├── Luna.gltf
  ├── Luna.bin
  └── character.json  ← Your custom character sheet
```

**Fallback**: If no `character.json` is found in the models folder, the system checks the project root. If neither exists, the default Luna is used.

### Editing the Character Sheet

Character sheets can be edited in any text editor. After editing, restart the kiosk to see changes.

To reset to the default Luna, simply delete `character.json` from your models folder (and project root if present), or use the reset button in the Settings panel (coming soon).

---

## Persistent Memory & Multi-User Profiles

The system features **persistent multi-profile memory** with support for multiple characters and privacy levels.

### Features

- **Profile Separation**: Each user gets their own profile automatically when they introduce their name. Profiles are stored in browser localStorage.
- **Multi-Character Support**: Different character-user pairs have separate profiles (e.g., "Alex with Mona" is separate from "Alex with Alice").
- **Conversation Memory**: Full chat history is preserved per profile, so the character remembers past conversations.
- **Automatic Facts Extraction**: Learn preferences, interests, and biographical details from conversations.
- **Conversation Summarization**: After many messages, automatically summarize older conversations to keep context while managing token usage.
- **Character Facts**: Each character has their own facts (e.g., "Mona loves cats"). Character facts can be public for all users to benefit from.
- **Privacy Levels**: Facts can be `private` (per character), `shared` (visible to all), or `public` (no attribution).
- **Backward Compatible**: Existing single-user data is automatically migrated to the new system.

### Memory Scopes

| Scope | Description | Example |
|-------|-------------|---------|
| `user` | About the user in this profile | "Alex's birthday is March 15" |
| `character` | About the AI persona | "Mona loves cats" |

### Privacy Levels

| Level | Description | Access |
|-------|-------------|--------|
| `private` | Only within this profile | Like meeting someone new |
| `shared` | Visible to all users | Attributed to who shared it |
| `public` | No attribution, visible to all | Character lore |

### How It Works

1. **New conversation**: When you talk to Mona, a profile like `alex_mona` is created (or loaded if exists).
2. **Facts default to private**: Each character starts fresh - facts are private by default, like meeting someone new.
3. **Character memories**: Mona might have facts about herself ("Mona loves rainy days") that all users can see.
4. **Switching characters**: When you switch to Alice, a new separate profile is created for you and Alice.

### Configuration

Memory behavior can be customized in `js/config.js`:

```js
memory: {
  factExtractionEnabled: true,
  maxFacts: 10,
  factExtractionDebounceMs: 30000,  // Extract facts no more often than 30s
  summaryInterval: 20,               // Summarize every 20 messages
  maxMessagesWithSummary: 5,         // Keep only last 5 messages after summarizing
  summarizationDebounceMs: 60000,    // Don't summarize more often than 60s
  defaultPrivacy: 'private'          // 'private', 'shared', or 'public'
}
```

### Privacy

All data is stored locally in the browser's localStorage. No data is sent to external servers beyond the local Ollama instance. Profiles can be cleared using the trash button in the chat UI.

---

## Outfit / Visibility System

The system supports **outfit switching** - changing which meshes are visible on the 3D model. This allows the character to change clothes, add accessories, or switch between different appearances.

> **Note:** Some models (like Luna) have a single unified mesh and cannot switch outfits via mesh visibility. For these models, use **animations** to change poses/expressions instead. The "objects" button will show available meshes (may be empty or show unnamed meshes).

### UI Access

Click the **"objects"** button in the bottom UI bar to toggle the mesh visibility panel. This panel shows all meshes found in the current model and allows you to toggle their visibility.

### Folder Structure

```
/models/
├── Luna/
│   ├── Luna.gltf
│   ├── character.json (optional)
│   └── visibility.json (optional)
└── 2B/
    ├── 2B.glb
    ├── character.json (optional)
    └── visibility.json (optional)
```

### Visibility Configuration

The `visibility.json` file defines which meshes are visible and which outfits are available:

```json
{
  "model": "Luna",
  "meshes": {
    "body": { "visible": true },
    "casual_outfit": { "visible": false },
    "armor": { "visible": false }
  },
  "outfits": {
    "default": {
      "meshes": ["body"],
      "description": "Base appearance without additional clothing",
      "tags": ["bare", "default"]
    },
    "casual": {
      "meshes": ["body", "casual_outfit"],
      "description": "Comfortable everyday clothing",
      "tags": ["casual", "relaxed"]
    }
  },
  "time_rules": {
    "21:00": "pjs",
    "06:00": "default"
  }
}
```

### Chat Commands

| Command | Action |
|---------|--------|
| `wardrobe` or `outfits` | List available outfits |
| `wear <name>` | Switch to specific outfit |
| `suggest outfit` | Get AI-powered suggestion |

### How It Works

1. **Mesh names** in visibility.json must match names in your GLTF model
2. **Outfits** define which meshes to show/hide
3. **User commands override** time-based rules
4. **AI suggestions** analyze conversation context

### Adding Outfits to Your Model

#### Step 1: Discover Mesh Names

To create a visibility.json, you first need to know the mesh names in your model:

1. Open the kiosk in browser
2. Open Developer Tools (F12) → Console tab
3. Look for logs like: `VisibilityManager: Found mesh "LOD0_23_Feather"`
4. Or type in console:
   ```javascript
   window.avatar.visibilityManager.getAllMeshes()
   ```

This shows all meshes with their current visibility state.

#### Step 2: Create visibility.json

Create a file in your model's folder (e.g., `/models/2B/visibility.json`):

```json
{
  "model": "2B",
  "meshes": {
    "LOD0_23_Feather": { "visible": true, "description": "Cape decoration" },
    "LOD0_0_Armor_Body": { "visible": true, "description": "Main body armor" },
    "LOD0_1_Armor_Head": { "visible": true, "description": "Head armor" },
    "LOD0_2_Armor_Body": { "visible": false, "description": "Alt body armor" },
    "LOD0_3_Armor_Body": { "visible": false, "description": "Alt body armor 2" },
    "LOD0_4_Armor_Head": { "visible": false, "description": "Alt head armor" },
    "LOD0_14_Broken": { "visible": false, "description": "Damage variant 1" },
    "LOD0_15_Broken": { "visible": false, "description": "Damage variant 2" },
    "LOD0_24_Broken": { "visible": false, "description": "Damage variant 3" }
  },
  "outfits": {
    "default": {
      "meshes": ["LOD0_23_Feather", "LOD0_0_Armor_Body", "LOD0_1_Armor_Head"],
      "description": "Standard YoRHa combat uniform",
      "tags": ["combat", "yorha", "standard"]
    },
    "casual": {
      "meshes": ["LOD0_23_Feather"],
      "description": "Civilian disguise without armor",
      "tags": ["casual", "civilian", "relaxed"]
    },
    "armor": {
      "meshes": ["LOD0_23_Feather", "LOD0_0_Armor_Body", "LOD0_1_Armor_Head", "LOD0_2_Armor_Body", "LOD0_3_Armor_Body", "LOD0_4_Armor_Head"],
      "description": "Full combat gear with all armor",
      "tags": ["armor", "combat", "heavy"]
    },
    "damaged": {
      "meshes": ["LOD0_23_Feather", "LOD0_0_Armor_Body", "LOD0_1_Armor_Head", "LOD0_14_Broken", "LOD0_15_Broken", "LOD0_24_Broken"],
      "description": "Combat armor with visible damage",
      "tags": ["damaged", "battle", "worn"]
    }
  },
  "time_rules": {
    "21:00": "casual",
    "06:00": "default"
  },
  "topic_keywords": {
    "casual": "casual",
    "relax": "casual",
    "combat": "armor",
    "battle": "armor",
    "fight": "armor",
    "heavy": "armor",
    "damaged": "damaged",
    "broken": "damaged"
  }
}
```

#### Step 3: Create character.json (Optional)

Create a file for personality and voice settings:

```json
{
  "version": "1.0",
  "identity": {
    "name": "2B",
    "age": "appears 20s",
    "archetype": "combat android",
    "role": "YoRHa android warrior"
  },
  "model": {
    "heightM": 1.6,
    "floorOffsetY": 0.0,
    "floorOffsetY_pos": 0.0,
    "scale": 1.0,
    "cameraDistance": 4.0,
    "cameraHeight": 1.2,
    "floorColor": 0x333333,
    "ringColor": 0x00ff88,
    "glowColor": "#33A0A4",
    "glowIntensity": 0,
    "spotCount": 0,
    "spotColor": "#33A0A4"
  },
  "voice": "af_sarah",
  "animation": {
    "headBobIntensity": 0.5
  }
}
```

#### Required Files Summary

| File | Required | Purpose |
|------|----------|---------|
| `character.json` | No | Personality, voice, model settings |
| `visibility.json` | No | Outfit/mesh visibility system |
| `character.json` in root | No | Fallback if not in model folder |
| `visibility.json` in root | No | Fallback if not in model folder |

---

## Glow / Spot Lighting System

The system features **glow and spot lighting** effects that add ambient floor lighting around the character.

### Features

- **Glow Effect**: Centered radial gradient glow under the model
- **Spot Lights**: Point lights positioned around the floor edge
- **Spot Dots**: Visual markers (small bright dots) on the floor
- **Pulsing Animation**: Intensity levels 4-10 create pulse effects

### Glow Intensity Behavior

| Intensity | Effect |
|-----------|--------|
| 0 | Off |
| 1-3 | Dim static glow |
| 4-6 | Medium pulse (slow breathing) |
| 7-10 | Fast pulse (energetic) |

### Settings UI

Open the Settings panel (gear icon) to access:
- **Glow/Spot Intensity**: Slider 0-10
- **Spot Count**: Number of spots around the floor edge (0 = off)
- **Spot Direction**: Toggle between Upward / Outward / Both
- **Color Presets**: Cyan, Blue, Purple, Pink, Red, Green
- **RGB Sliders**: Custom color picker

### Per-Character Settings

Add glow/spot settings to `character.json`:

```json
{
  "model": {
    "glowColor": "#33A0A4",
    "glowIntensity": 0,
    "spotCount": 0,
    "spotColor": "#33A0A4"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `glowColor` | hex string | `#33A0A4` | Glow color |
| `glowIntensity` | number (0-10) | 0 | Default glow intensity |
| `spotCount` | number | 0 | Number of spots (0 = off) |
| `spotColor` | hex string | inherits glowColor | Spot light/dot color |

---

## Multi-Model Support

The system supports **multiple 3D models** with their own character sheets. Models are stored in subfolders under `/models/`.

### Folder Structure

```
/models/
├── Luna/
│   ├── Luna.gltf
│   └── character.json (optional)
├── Mona/
│   ├── Mona.gltf
│   └── character.json (optional)
└── 2B/
    ├── 2B.gltf
    └── character.json (optional)
```

### Adding a New Model

1. Create a new folder under `/models/` (e.g., `/models/Alice/`)
2. Add your `.gltf` or `.glb` file to the folder
3. Optionally add a `character.json` file with personality settings
4. The system will auto-discover your model on next load

### Character Sheet with Priority

Add a `priority` field to control which model loads first:

```json
{
  "version": "1.0",
  "priority": 1,
  "identity": {
    "name": "Luna"
  },
  ...
}
```

Lower number = higher priority. Models with priority 1 load first.

### Switching Models

**Chat command:**
- Type "switch Luna" to switch to Luna
- Type "switch 2B" to switch to 2B

**UI:**
- Open Settings panel (gear icon)
- Select model from dropdown

### Model with Textures

If your model uses textures:
- Place texture files (`.png`, `.jpg`) in the same folder as the `.gltf`
- Or export as `.glb` which embeds textures in a single file

---

## Morph Target Expression System (Planned)

The system will use **morph targets** (blend shapes) to create real-time facial expressions and emotional states that blend seamlessly with lip-sync.

### What Are Morph Targets?

Morph targets are vertex deformations stored in the 3D model that can be animated in real-time (0-1 values). Unlike skeletal animations, morph targets offer:
- Smooth linear interpolation between states
- Perfect lip-sync integration
- Infinite expression combinations
- Lightweight memory footprint

### Expression Categories

| Category | Examples | Triggered By |
|----------|----------|--------------|
| **Emotional** | Happy, sad, surprised, angry | AI response sentiment |
| **Physical** | Yawn, blink, breathe | Keywords or idle state |
| **Conversational** | Thinking, listening, nodding | Conversation context |
| **Emphasis** | Excited gesture, shrug | Response intensity |

### Implementation Phases

1. **Discovery**: Detect available morph targets from loaded model
2. **Infrastructure**: Create MorphTargetController class with expression presets
3. **Lip-Sync**: Enhance phoneme coverage for smoother speech
4. **Emotions**: Keyword detection + sentiment analysis for expressions
5. **Idle Motion**: Subtle breathing and blink animations
6. **Context**: AI response analysis for appropriate expressions

### Blender Integration

To add morph targets for your character:

1. **Open your model in Blender**
2. **Select the mesh** → Properties panel → Object Data (green triangle)
3. **Add Shape Keys** for each expression you want:
   - `smile`, `frown`, `brow_raise`, `brow_frown`
   - `mouth_A`, `mouth_E`, `mouth_I`, `mouth_O`, `mouth_U` (for lip-sync)
   - `blink_left`, `blink_right`
   - `breath_in`, `breath_out`
4. **Animate the values** (0-1) to test in Blender
5. **Export as GLTF** with morph targets enabled

### Priority

1. Lip-sync improvement (mouth shapes)
2. Emotional expressions (smile, sad, etc.)
3. Breathing and idle motion
4. Context-aware animation selection

---

## Project Structure