/** Configuration for the FeedbackWidget component */
export interface FeedbackWidgetConfig {
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
}

/** A single tracked event during a feedback session */
export interface FeedbackEvent {
  /** Milliseconds from recording start */
  offsetMs: number;
  /** Type of event */
  type: 'route' | 'click' | 'scroll' | 'custom' | 'screenshot';
  /** Event-specific data */
  data: Record<string, unknown>;
}

/** Feedback category selected by the user */
export type FeedbackCategory = 'bug' | 'suggestion' | 'confusion' | 'praise';

/** A complete feedback session */
export interface FeedbackSession {
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
}

/** An actionable item extracted from feedback by AI */
export interface ActionItem {
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
export interface CompiledBrief {
  id: string;
  createdAt: string;
  targetApp: string;
  actionItems: ActionItem[];
  sessionIds: string[];
  generatedPrompt: string;
  status: 'draft' | 'sent' | 'completed';
  notes?: string;
}

/** Internal state of the widget */
export type WidgetState = 'idle' | 'recording' | 'submitting' | 'submitted' | 'error';
