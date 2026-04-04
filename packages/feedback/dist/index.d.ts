import * as react_jsx_runtime from 'react/jsx-runtime';

/** Configuration for the FeedbackWidget component */
interface FeedbackWidgetConfig {
    /** Identifier for the host app (e.g., 'evidence-engine', 'opsample') */
    appId: string;
    /** Base URL of the feedback API (API Gateway endpoint) */
    apiUrl: string;
    /** Optional authenticated user info */
    user?: {
        id: string;
        label: string;
    };
    /** Widget position on screen. Default: 'bottom-right' */
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** API key for the feedback service */
    apiKey?: string;
    /** Base URL for the chat Lambda (enables chatbot mode). If omitted, chat is disabled. */
    chatApiUrl?: string;
}
/** A single tracked event during a feedback session */
interface FeedbackEvent {
    /** Milliseconds from recording start */
    offsetMs: number;
    /** Type of event */
    type: 'route' | 'click' | 'scroll' | 'custom' | 'screenshot';
    /** Event-specific data */
    data: Record<string, unknown>;
}
/** Feedback category selected by the user */
type FeedbackCategory = 'bug' | 'suggestion' | 'confusion' | 'praise';
/** A complete feedback session */
interface FeedbackSession {
    id: string;
    appId: string;
    userId?: string;
    userLabel?: string;
    category: FeedbackCategory;
    startedAt: string;
    duration: number;
    userAgent: string;
    screenSize: string;
    audioUrl: string;
    screenshots: string[];
    transcript?: string;
    aiSummary?: string;
    actionItems?: ActionItem[];
    events: FeedbackEvent[];
    status: 'recording' | 'submitted' | 'transcribed' | 'summarized';
    /** Chat messages if the user engaged in chatbot mode */
    chatMessages?: ChatMessage[];
    /** Screenshot annotations captured during chat */
    annotations?: ScreenshotAnnotation[];
    /** AI-generated summary from the chat conversation */
    chatSummary?: ChatSummary;
}
/** An actionable item extracted from feedback by AI */
interface ActionItem {
    id: string;
    type: 'bug' | 'ux-issue' | 'feature-request' | 'content-fix';
    title: string;
    description: string;
    affectedApp: string;
    affectedPages: string[];
    affectedElements?: string[];
    userQuotes: string[];
    severity: 'critical' | 'major' | 'minor' | 'cosmetic';
    status: 'new' | 'approved' | 'rejected' | 'compiled' | 'resolved';
}
/** A compiled brief of approved action items for Claude Code */
interface CompiledBrief {
    id: string;
    createdAt: string;
    targetApp: string;
    actionItems: ActionItem[];
    sessionIds: string[];
    generatedPrompt: string;
    status: 'draft' | 'sent' | 'completed';
    notes?: string;
}
/** A single chat message in the feedback conversation */
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    /** Optional attachments (screenshot annotation keys, voice transcript markers) */
    attachments?: ChatAttachment[];
}
/** Attachment on a chat message */
interface ChatAttachment {
    type: 'annotation' | 'voice-transcript';
    /** S3 key for screenshots, or inline text for voice transcripts */
    key?: string;
    /** Pre-signed URL for display (populated by API on retrieval) */
    url?: string;
    /** Annotation metadata if type is 'annotation' */
    annotation?: ScreenshotAnnotation;
}
/** A screenshot annotation captured during chat */
interface ScreenshotAnnotation {
    /** S3 key for the screenshot image */
    screenshotKey: string;
    /** Pre-signed URL for display */
    screenshotUrl?: string;
    /** Click coordinates relative to the viewport */
    coordinates: {
        x: number;
        y: number;
    };
    /** Info about the DOM element at the click point */
    elementInfo: {
        selector: string;
        tag: string;
        text: string;
        id?: string;
        className?: string;
    };
    /** User's comment about what they're pointing at */
    userComment?: string;
    /** Page URL when annotation was captured */
    pageUrl: string;
    /** Viewport dimensions */
    viewport: {
        width: number;
        height: number;
    };
}
/** AI-generated summary from a chat conversation */
interface ChatSummary {
    category: FeedbackCategory;
    severity: 'critical' | 'major' | 'minor' | 'cosmetic';
    title: string;
    description: string;
    actionItems: string[];
    userSentiment: 'frustrated' | 'neutral' | 'positive';
}
/** Internal state of the widget */
type WidgetState = 'idle' | 'recording' | 'chatting' | 'annotating' | 'submitting' | 'submitted' | 'error';

declare function FeedbackWidget({ appId, apiUrl, user, position, apiKey, chatApiUrl }: FeedbackWidgetConfig): react_jsx_runtime.JSX.Element;

interface UseEventTrackerReturn {
    startTracking: () => void;
    stopTracking: () => void;
    getEvents: () => FeedbackEvent[];
    getCurrentContext: () => EventContext;
    logCustomEvent: (name: string, detail: Record<string, unknown>) => void;
}
/** Current location context — attached to transcript segments for correlation */
interface EventContext {
    route: string;
    scrollPercent: number;
    lastClickedElement: string | null;
    /** Whether the last clicked element had text content (boolean only — actual text is never captured for HIPAA/PHI safety) */
    lastClickedHasText: boolean;
    viewportSection: string | null;
}
/**
 * Tracks user navigation, clicks, and scroll position during a feedback session.
 * Every event is timestamped relative to recording start so it can be correlated
 * with voice audio timestamps.
 */
declare function useEventTracker(): UseEventTrackerReturn;

interface UseChatApiReturn {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    sendMessage: (content: string, attachments?: ChatMessage['attachments']) => Promise<void>;
    summarize: () => Promise<ChatSummary | null>;
    reset: () => void;
}
/**
 * Hook for communicating with the sevaro-feedback-chat Lambda.
 * Manages the conversation state and sends messages to the AI chatbot.
 */
declare function useChatApi(chatApiUrl: string, sessionId: string | null, appId: string, apiKey?: string): UseChatApiReturn;

interface UseScreenshotAnnotationReturn {
    isAnnotating: boolean;
    startAnnotation: () => void;
    cancelAnnotation: () => void;
    /** The most recently captured annotation (reset on next startAnnotation) */
    lastAnnotation: ScreenshotAnnotation | null;
    /** All annotations captured during this session */
    annotations: ScreenshotAnnotation[];
}
/**
 * Hook for screenshot annotation mode. When activated, overlays a semi-transparent
 * layer on the page. User clicks to select a point, and we capture:
 * - Click coordinates
 * - DOM element info at the click point
 * - A screenshot of the viewport (as a data URL blob)
 */
declare function useScreenshotAnnotation(uploadScreenshot: (blob: Blob, index: number) => Promise<string>): UseScreenshotAnnotationReturn;

interface VoiceRecorderState {
    isRecording: boolean;
    elapsedMs: number;
    error: string | null;
}
interface UseVoiceRecorderReturn extends VoiceRecorderState {
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<Blob | null>;
    getChunks: () => Blob[];
}
/**
 * Hook that wraps the browser MediaRecorder API for voice capture.
 * Records audio as WebM/Opus chunks for periodic upload.
 */
declare function useVoiceRecorder(): UseVoiceRecorderReturn;

interface UseFeedbackApiReturn {
    createSession: (appId: string, user?: {
        id: string;
        label: string;
    }) => Promise<string>;
    uploadAudio: (blob: Blob) => Promise<void>;
    submitSession: (data: {
        category: FeedbackCategory;
        events: FeedbackEvent[];
        duration: number;
        chatMessages?: ChatMessage[];
        annotations?: ScreenshotAnnotation[];
        chatSummary?: ChatSummary;
    }) => Promise<void>;
    getUploadUrl: (type: 'audio-chunk' | 'screenshot', index: number) => Promise<{
        uploadUrl: string;
        key: string;
    }>;
}
/**
 * API client hook for the feedback backend.
 * Handles session creation, audio upload via pre-signed S3 URLs, and session finalization.
 */
declare function useFeedbackApi(apiUrl: string, apiKey?: string): UseFeedbackApiReturn;

export { type ActionItem, type ChatAttachment, type ChatMessage, type ChatSummary, type CompiledBrief, type FeedbackCategory, type FeedbackEvent, type FeedbackSession, FeedbackWidget, type FeedbackWidgetConfig, type ScreenshotAnnotation, type WidgetState, useChatApi, useEventTracker, useFeedbackApi, useScreenshotAnnotation, useVoiceRecorder };
