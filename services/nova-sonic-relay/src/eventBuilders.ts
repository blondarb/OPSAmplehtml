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

interface TextContentStartEvent {
  event: {
    contentStart: {
      promptName: string
      contentName: string
      type: 'TEXT'
      interactive: boolean
      role: 'SYSTEM' | 'USER'
      textInputConfiguration: { mediaType: string }
    }
  }
}

interface TextInputEvent {
  event: { textInput: { promptName: string; contentName: string; content: string } }
}

type TextContentEvents = [TextContentStartEvent, TextInputEvent, ContentEndEvent]

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
): TextContentEvents {
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
// 3b. userText — returns [contentStart, textInput, contentEnd] with role USER
// ---------------------------------------------------------------------------
//
// Nova Sonic allows the SYSTEM role content ONCE per prompt (the init system
// prompt). Any second SYSTEM content block fails the whole stream with
// "Duplicate SYSTEM content. SYSTEM content can only be provided once per
// prompt." Mid-conversation context injections (localizer pushes, scale
// instructions, early-end save nudges) must therefore be delivered as USER
// text turns, which Nova accepts repeatedly. Structurally identical to
// systemContent(); only the role differs.
export function userText(
  promptName: string,
  text: string,
  contentName?: string,
): TextContentEvents {
  const name = contentName ?? uuidv4()
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName: name,
          type: 'TEXT',
          interactive: true,
          role: 'USER',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    {
      event: {
        textInput: {
          promptName,
          contentName: name,
          content: text,
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
// 3c. historyContent — non-interactive USER/ASSISTANT turn used to seed a
// freshly opened connection with prior conversation (Nova Sonic connection
// renewal — see novaConnectionManager.ts. Nova enforces an ~8-minute cap per
// bidirectional stream; renewal opens a new stream and replays history here
// so the model continues without the browser noticing).
//
// Shape verified 2026-09-08 against aws-samples/sample-serverless-nova-sonic-chat
// (linked from the official aws-samples/amazon-nova-samples README as the
// reference "Serverless Nova Sonic Chat" solution for the 8-minute limit),
// specifically its `enqueueChatHistory` method in app/src/agent/nova-stream.ts
// (fetched via WebFetch on the raw GitHub URL, not cloned/run). That method's
// three events, reproduced there near-verbatim:
//   contentStart: { promptName, contentName, type: 'TEXT', interactive: false,
//                    textInputConfiguration: { mediaType: 'text/plain' } }
//   textInput:    { promptName, contentName, content, role: role.toUpperCase() }
//   contentEnd:   { promptName, contentName }
// Two differences from systemContent()/userText() above are load-bearing and
// intentional, not oversights:
//   - `role` lives on `textInput`, not `contentStart` (systemContent/userText
//     put it on contentStart).
//   - `interactive` is `false` — this is historical context for the model to
//     read, not a live turn it should treat as needing an immediate response.
// The amazon-nova-samples "speech-to-speech" sample itself was not reachable
// with a working conversation-history code sample during this task; this
// builder follows the linked serverless-chat reference sample instead. See
// the PR description for the exact fetch trail.
// ---------------------------------------------------------------------------

export type HistoryRole = 'USER' | 'ASSISTANT'

interface HistoryContentStartEvent {
  event: {
    contentStart: {
      promptName: string
      contentName: string
      type: 'TEXT'
      interactive: false
      textInputConfiguration: { mediaType: string }
    }
  }
}

interface HistoryTextInputEvent {
  event: {
    textInput: {
      promptName: string
      contentName: string
      content: string
      role: HistoryRole
    }
  }
}

type HistoryContentEvents = [HistoryContentStartEvent, HistoryTextInputEvent, ContentEndEvent]

export function historyContent(
  promptName: string,
  role: HistoryRole,
  text: string,
  contentName?: string,
): HistoryContentEvents {
  const name = contentName ?? uuidv4()
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName: name,
          type: 'TEXT',
          interactive: false,
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    {
      event: {
        textInput: {
          promptName,
          contentName: name,
          content: text,
          role,
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
