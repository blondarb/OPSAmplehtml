import { v4 as uuidv4 } from 'uuid'
import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  SAMPLE_SIZE_BITS,
  CHANNELS,
  DEFAULT_VOICE_ID,
} from './audioConstants.js'

// ---------------------------------------------------------------------------
// Lightweight types
// ---------------------------------------------------------------------------

export interface InferenceConfiguration {
  maxTokens: number
  topP: number
  temperature: number
}

export interface Tool {
  toolSpec: { name: string; [key: string]: unknown }
  [key: string]: unknown
}

interface ToolContentStartEvent {
  event: {
    contentStart: {
      promptName: string
      contentName: string
      type: 'TOOL'
      role: 'TOOL'
      interactive: boolean
      toolResultInputConfiguration: {
        toolUseId: string
        type: string
        textInputConfiguration: { mediaType: string }
      }
    }
  }
}

interface ToolResultEvent {
  event: { toolResult: { promptName: string; contentName: string; content: string } }
}

interface ContentEndEvent {
  event: { contentEnd: { promptName: string; contentName: string } }
}

// ---------------------------------------------------------------------------
// 1. sessionStart
// ---------------------------------------------------------------------------

export function sessionStart(cfg?: Partial<InferenceConfiguration>) {
  return {
    event: {
      sessionStart: {
        inferenceConfiguration: {
          maxTokens: cfg?.maxTokens ?? 1024,
          topP: cfg?.topP ?? 0.9,
          temperature: cfg?.temperature ?? 0.7,
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 2. promptStart
// ---------------------------------------------------------------------------

export function promptStart(promptName: string, tools: Tool[], voiceId?: string) {
  return {
    event: {
      promptStart: {
        promptName,
        textOutputConfiguration: {
          mediaType: 'text/plain',
        },
        audioOutputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: OUTPUT_SAMPLE_RATE,
          sampleSizeBits: SAMPLE_SIZE_BITS,
          channelCount: CHANNELS,
          voiceId: voiceId ?? DEFAULT_VOICE_ID,
          encoding: 'base64',
          audioType: 'SPEECH',
        },
        toolUseOutputConfiguration: {
          mediaType: 'application/json',
        },
        toolConfiguration: {
          tools,
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 3. systemContent — returns [contentStart, textInput, contentEnd]
// ---------------------------------------------------------------------------

export function systemContent(
  promptName: string,
  instructions: string,
  contentName?: string,
) {
  const name = contentName ?? uuidv4()
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName: name,
          type: 'TEXT',
          interactive: true,
          role: 'SYSTEM',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    {
      event: {
        textInput: {
          promptName,
          contentName: name,
          content: instructions,
        },
      },
    },
    {
      event: {
        contentEnd: {
          promptName,
          contentName: name,
        },
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// 4. Audio content events
// ---------------------------------------------------------------------------

// contentName is caller-owned (required): the relay generates one name per
// user audio turn and reuses it for audioInput + audioContentEnd, so this
// builder must NOT mint its own. See Task 2 review (Issue 3).
export function audioContentStart(promptName: string, contentName: string) {
  return {
    event: {
      contentStart: {
        promptName,
        contentName,
        type: 'AUDIO',
        interactive: true,
        role: 'USER',
        audioInputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: INPUT_SAMPLE_RATE,
          sampleSizeBits: SAMPLE_SIZE_BITS,
          channelCount: CHANNELS,
          audioType: 'SPEECH',
          encoding: 'base64',
        },
      },
    },
  }
}

export function audioInput(promptName: string, contentName: string, content: string) {
  return {
    event: {
      audioInput: {
        promptName,
        contentName,
        content,
      },
    },
  }
}

export function audioContentEnd(promptName: string, contentName: string) {
  return {
    event: {
      contentEnd: {
        promptName,
        contentName,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 5. toolResultEvents — returns [contentStart, toolResult, contentEnd]
// ---------------------------------------------------------------------------

export function toolResultEvents(
  promptName: string,
  toolUseId: string,
  contentJsonString: string,
  contentName?: string,
): [ToolContentStartEvent, ToolResultEvent, ContentEndEvent] {
  const name = contentName ?? uuidv4()
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName: name,
          type: 'TOOL',
          role: 'TOOL',
          interactive: false,
          toolResultInputConfiguration: {
            toolUseId,
            type: 'TEXT',
            textInputConfiguration: { mediaType: 'text/plain' },
          },
        },
      },
    },
    {
      event: {
        toolResult: {
          promptName,
          contentName: name,
          content: contentJsonString,
        },
      },
    },
    {
      event: {
        contentEnd: {
          promptName,
          contentName: name,
        },
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// 6. promptEnd / sessionEnd
// ---------------------------------------------------------------------------

export function promptEnd(promptName: string) {
  return {
    event: {
      promptEnd: {
        promptName,
      },
    },
  }
}

export function sessionEnd() {
  return {
    event: {
      sessionEnd: {},
    },
  }
}
