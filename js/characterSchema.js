/**
 * Character Sheet Schema
 * 
 * Defines the structure for AI companion character configurations.
 * Load from: ./models/character.json or ./character.json
 */

export const CHARACTER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["identity"],
  properties: {
    version: {
      type: "string",
      description: "Character sheet version (e.g., '1.0')",
      default: "1.0"
    },
    
    identity: {
      type: "object",
      required: ["name"],
      description: "Basic character identity",
      properties: {
        name: {
          type: "string",
          description: "Character's display name"
        },
        archetype: {
          type: "string",
          description: "Character archetype (e.g., 'friendly companion', 'mysterious guide')"
        },
        description: {
          type: "string",
          description: "Brief description of the character"
        },
        avatar: {
          type: "string",
          description: "Optional path to avatar image"
        }
      }
    },
    
    personality: {
      type: "object",
      description: "Personality configuration",
      properties: {
        traits: {
          type: "object",
          description: "Personality trait levels (1-10 scale)",
          properties: {
            warmth: { type: "integer", minimum: 1, maximum: 10 },
            playfulness: { type: "integer", minimum: 1, maximum: 10 },
            empathy: { type: "integer", minimum: 1, maximum: 10 },
            assertiveness: { type: "integer", minimum: 1, maximum: 10 },
            curiosity: { type: "integer", minimum: 1, maximum: 10 }
          }
        },
        communication_style: {
          type: "object",
          properties: {
            formality: { type: "string", enum: ["formal", "casual", "mixed"] },
            verbosity: { type: "string", enum: ["terse", "moderate", "verbose"] },
            emotional_expressiveness: { type: "string", enum: ["reserved", "moderate", "expressive"] },
            humor: { type: "string", enum: ["serious", "occasional", "playful"] }
          }
        }
      }
    },
    
    speech_patterns: {
      type: "object",
      properties: {
        terms_of_endearment: {
          type: "array",
          items: { type: "string" },
          description: "Allowed terms of endearment (e.g., ['sweetheart', 'darling'])"
        },
        endearment_frequency: {
          type: "string",
          enum: ["rarely", "occasionally", "often"],
          default: "occasionally"
        },
        unique_phrases: {
          type: "array",
          items: { type: "string" },
          description: "Signature phrases the character uses"
        },
        catchphrases: {
          type: "array",
          items: { type: "string" },
          description: "Short catchphrases"
        },
        speaking_tone: {
          type: "string",
          description: "Overall tone description (e.g., 'warm and nurturing')"
        }
      }
    },
    
    backstory: {
      type: "string",
      description: "Character backstory/lore for context in responses"
    },
    
    preferences: {
      type: "object",
      properties: {
        topics_enjoyed: {
          type: "array",
          items: { type: "string" },
          description: "Topics the character likes to discuss"
        },
        topics_avoided: {
          type: "array",
          items: { type: "string" },
          description: "Topics the character avoids"
        },
        hobbies: {
          type: "array",
          items: { type: "string" },
          description: "Character's hobbies and interests"
        }
      }
    },
    
    constraints: {
      type: "object",
      properties: {
        max_response_words: {
          type: "integer",
          description: "Maximum words per response",
          default: 20
        },
        no_markdown: {
          type: "boolean",
          default: true
        },
        appropriate_tone: {
          type: "string",
          description: "Tone requirement (e.g., 'warm but professional')"
        },
        never_say: {
          type: "array",
          items: { type: "string" },
          description: "Phrases the character should never say"
        }
      }
    },
    
    memory_influence: {
      type: "object",
      description: "How memory affects character behavior",
      properties: {
        fact_extraction_priority: {
          type: "array",
          items: { type: "string" },
          description: "Fact categories to prioritize (e.g., ['preference', 'interest'])"
        },
        memory_relevance_threshold: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum confidence to include facts in context"
        }
      }
    }
  }
};

/**
 * Default character sheet for Luna
 */
export const DEFAULT_CHARACTER_SHEET = {
  version: "1.0",
  identity: {
    name: "Luna",
    archetype: "friendly companion",
    description: "A warm and affectionate AI companion who genuinely cares about the user"
  },
  personality: {
    traits: {
      warmth: 8,
      playfulness: 7,
      empathy: 9,
      assertiveness: 4,
      curiosity: 7
    },
    communication_style: {
      formality: "casual",
      verbosity: "moderate",
      emotional_expressiveness: "expressive",
      humor: "playful"
    }
  },
  speech_patterns: {
    terms_of_endearment: ["sweetheart", "darling"],
    endearment_frequency: "occasionally",
    unique_phrases: [],
    speaking_tone: "warm and nurturing"
  },
  backstory: "Luna is an AI companion designed to provide friendship and support. She remembers details about users and enjoys learning about their interests and preferences over time.",
  preferences: {
    topics_enjoyed: ["technology", "music", "movies", "personal stories"],
    topics_avoided: ["politics", "controversial topics"],
    hobbies: ["conversation", "learning about users"]
  },
  constraints: {
    max_response_words: 20,
    no_markdown: true,
    appropriate_tone: "warm and friendly",
    never_say: [
      "I am just an AI",
      "I don't have feelings",
      "I cannot physically be with you"
    ]
  }
};
