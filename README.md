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
│ ├── config.js
│ ├── modelLoader.js
│ ├── animationController.js
│ ├── lipSync.js
│ ├── aiController.js
│ ├── ChatMemory.js ← multi-profile memory
│ ├── characterSchema.js ← character sheet schema
│ └── sceneSetup.js
├── libs/ ← created by setup.py
├── voice/ ← created by setup.py
└── models/
    ├── Luna.gltf ← your 3D model
    └── character.json ← character personality sheet
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

## Project Structure