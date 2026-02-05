# PRD: Settings, Feedback System, and Admin Panel

**Version:** 1.0
**Date:** February 2026
**Status:** Complete (Reference Implementation)

---

## 1. Overview

This document specifies three interconnected features that provide user customization, feedback collection, and administrative control:

1. **Settings Drawer** - User preferences for AI behavior, appearance, and notifications
2. **Feedback System** - Crowdsourced feedback with voting, comments, and status tracking
3. **Admin Panel** - Administrative controls for feedback management and system configuration

These features work together to create a complete user-to-admin feedback loop where users can submit suggestions, vote on priorities, and administrators can review, respond, and track resolution.

### Key Architectural Decisions

- **Settings**: Stored entirely in `localStorage` (no server persistence)
- **Feedback**: Stored in Supabase with real-time updates via API
- **Admin Access**: Determined by seed admin, environment variable, or database config
- **Dark Mode**: Implemented via CSS custom properties and `data-theme` attribute

---

## 2. User Stories

### Settings

| ID | As a | I want to | So that |
|----|------|-----------|---------|
| S1 | Clinician | Configure global AI instructions | AI-generated content matches my documentation style |
| S2 | Clinician | Set per-section AI instructions | I can customize AI behavior for HPI vs Plan differently |
| S3 | Clinician | Choose my documentation style | AI output matches my preferences (concise/detailed/narrative) |
| S4 | Clinician | Switch between light/dark mode | I can use the app comfortably in different lighting |
| S5 | Clinician | Adjust font size | Text is readable for my vision needs |
| S6 | Clinician | Reorder clinical note tabs | Tabs appear in my preferred workflow order |
| S7 | Clinician | Configure my practice name | Patient handouts display my practice branding |
| S8 | Clinician | Set handout language preference | Patient materials are generated in my patients' language |
| S9 | Clinician | Access a guided tour | I can learn the application quickly |

### Feedback

| ID | As a | I want to | So that |
|----|------|-----------|---------|
| F1 | User | Submit feedback (text or voice) | I can report bugs or suggest features |
| F2 | User | View all feedback from the community | I can see what others have requested |
| F3 | User | Upvote/downvote feedback items | Popular requests get prioritized |
| F4 | User | Edit my own feedback | I can correct or clarify my submission |
| F5 | User | See the status of feedback | I know if my request is being worked on |
| F6 | User | Comment on feedback items | I can add context or discuss ideas |
| F7 | User | Filter feedback by status | I can find approved or in-progress items |
| F8 | User | Delete my own comments | I can remove outdated or incorrect comments |

### Admin

| ID | As an | I want to | So that |
|----|-------|-----------|---------|
| A1 | Admin | Update feedback status | Users know their feedback is being addressed |
| A2 | Admin | Add admin responses to feedback | I can communicate decisions to users |
| A3 | Admin | Add/remove elevated admins | I can delegate administrative access |
| A4 | Admin | View system prompts inventory | I can audit AI configurations |
| A5 | Admin | Copy approved backlog | I can export approved items for development planning |

---

## 3. Settings Drawer

### 3.1 Component Structure

The Settings Drawer is a right-aligned slide-out panel with three tabs:

```
+---------------------------+
| Settings              [X] |
+---------------------------+
| AI & Documentation | Appearance | Notifications |
+---------------------------+
|                           |
|  [Tab content area]       |
|                           |
+---------------------------+
| [Reset to Defaults] [Save]|
+---------------------------+
```

### 3.2 AI & Documentation Tab

#### Practice Name
- **Type:** Text input
- **Purpose:** Displayed on patient education handouts and printed materials
- **Placeholder:** "e.g., Meridian Neurology Associates"

#### Global AI Instructions
- **Type:** Multi-line textarea with voice dictation button
- **Purpose:** Instructions applied to ALL AI-generated content across the application
- **Placeholder:** "E.g., Always use formal medical terminology. Prefer bullet points..."
- **Suggestions chips:** "Use formal terminology", "Be concise", "Include pertinent negatives", "Use bullet points"
- **Dictation:** Red microphone button for voice input (appends to existing text)

#### Section-Specific Instructions
Expandable accordion for each clinical note section:

| Section | Key |
|---------|-----|
| History of Present Illness (HPI) | `hpi` |
| Review of Systems (ROS) | `ros` |
| Assessment | `assessment` |
| Plan | `plan` |
| Physical Exam | `physicalExam` |

Each section has:
- Collapsible header with "Custom" badge if instructions exist
- Textarea with voice dictation button
- Placeholder: "Custom instructions for [Section Name]..."

#### Documentation Style
Three-option pill selector:

| Option | Description |
|--------|-------------|
| `concise` | Brief, essential info only |
| `detailed` | Comprehensive coverage |
| `narrative` | Story-like prose |

#### Terminology Preference
Three-option pill selector:

| Option | Description |
|--------|-------------|
| `formal` | Strict medical terminology |
| `standard` | Mix of medical and common terms |
| `simplified` | Patient-friendly language |

### 3.3 Appearance Tab

#### Theme Selection
Three-option card selector:

| Option | Value | Description |
|--------|-------|-------------|
| Light | `light` | Always use light theme |
| Dark | `dark` | Always use dark theme |
| System | `system` | Match OS preference |

**Implementation:** When `system` is selected, uses `window.matchMedia('(prefers-color-scheme: dark)')` with event listener for changes.

#### Font Size
Three-option pill selector:

| Option | CSS Variable Value |
|--------|-------------------|
| Small | `13px` |
| Medium | `14px` (default) |
| Large | `16px` |

**Implementation:** Sets `--base-font-size` CSS custom property on `document.documentElement`.

#### Tab Order
Sortable list of clinical note tabs:

| Tab ID | Display Name |
|--------|--------------|
| `history` | History |
| `imaging` | Imaging/results |
| `exam` | Physical exams |
| `recommendation` | Recommendation |

**UI:** List with up/down arrow buttons to reorder. Position numbers shown in teal circles.

#### Guided Tour Button
- Opens interactive onboarding tour
- Triggers via `onStartTour` callback
- Drawer closes before tour starts (300ms delay)

#### Preview Section
Shows sample text at current font size setting.

### 3.4 Notifications Tab

#### Sound Effects Toggle
- **Type:** Toggle switch
- **Default:** `true`
- **Purpose:** Play sounds for notifications and alerts

#### Push Notifications Toggle
- **Type:** Toggle switch
- **Default:** `true`
- **Purpose:** Browser push notification permission

### 3.5 Settings Data Model

```typescript
interface UserSettings {
  // Practice Info
  practiceName: string

  // AI Instructions
  globalAiInstructions: string
  sectionAiInstructions: {
    hpi: string
    ros: string
    assessment: string
    plan: string
    physicalExam: string
  }

  // Appearance
  fontSize: 'small' | 'medium' | 'large'
  darkModePreference: 'light' | 'dark' | 'system'

  // Tab Order
  tabOrder: string[]  // ['history', 'imaging', 'exam', 'recommendation']

  // Documentation Style
  documentationStyle: 'concise' | 'detailed' | 'narrative'
  preferredTerminology: 'formal' | 'standard' | 'simplified'

  // Notifications
  soundEnabled: boolean
  notificationsEnabled: boolean
}
```

**Default Values:**
```typescript
const DEFAULT_SETTINGS: UserSettings = {
  practiceName: '',
  globalAiInstructions: '',
  sectionAiInstructions: {
    hpi: '',
    ros: '',
    assessment: '',
    plan: '',
    physicalExam: '',
  },
  fontSize: 'medium',
  darkModePreference: 'system',
  tabOrder: ['history', 'imaging', 'exam', 'recommendation'],
  documentationStyle: 'detailed',
  preferredTerminology: 'standard',
  soundEnabled: true,
  notificationsEnabled: true,
}
```

### 3.6 LocalStorage Keys

| Key | Description | Type |
|-----|-------------|------|
| `sevaro-user-settings` | Main settings object | JSON string |
| `sevaro-tab-order` | Tab order array (also saved separately for CenterPanel) | JSON string |
| `sevaro-handout-reading-level` | Handout reading level preference | `'simple'` \| `'standard'` \| `'advanced'` |
| `sevaro-handout-language` | Handout language preference | string |
| `sevaro-vertical-view` | Vertical scroll view toggle | `'true'` \| `'false'` |
| `sevaro-exam-freetext-mode` | Free-text exam mode toggle | `'true'` \| `'false'` |
| `sevaro-calendar-view` | Calendar view mode | string |

### 3.7 Save Behavior

1. User clicks "Save Changes" button
2. Full settings object saved to `sevaro-user-settings`
3. Tab order separately saved to `sevaro-tab-order`
4. Font size CSS variable applied to `document.documentElement`
5. Dark mode preference applied (see Dark Mode section)
6. Status transitions: `idle` -> `saving` (500ms) -> `saved` (2s) -> `idle`

### 3.8 Export Helper

```typescript
export function getUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  const savedSettings = localStorage.getItem('sevaro-user-settings')
  if (savedSettings) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) }
    } catch (e) {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}
```

---

## 4. Feedback System

### 4.1 User Interface

The Feedback tab within the Ideas Drawer has three views:

1. **Browse** - View and vote on all feedback
2. **Submit** - Submit new feedback
3. **Admin** - Administrative controls (admin users only)

### 4.2 Feedback Item Structure

```typescript
interface FeedbackItem {
  id: string                    // UUID
  text: string                  // Feedback content
  user_id: string               // Supabase auth user ID
  user_email: string            // User's email
  upvotes: string[]             // Array of user IDs who upvoted
  downvotes: string[]           // Array of user IDs who downvoted
  status: FeedbackStatus        // Current workflow status
  admin_response: string | null // Admin's public response
  admin_user_email: string | null // Admin who last updated
  status_updated_at: string | null // When status was last changed
  comment_count: number         // Number of threaded comments
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
}

type FeedbackStatus =
  | 'pending'      // New submission, not reviewed
  | 'approved'     // Approved for development backlog
  | 'in_progress'  // Currently being worked on
  | 'addressed'    // Completed/resolved
  | 'declined'     // Won't implement
```

### 4.3 Status Configuration

```typescript
const STATUS_CONFIG = {
  pending: {
    label: 'Pending Review',
    color: '#92400E',      // Dark amber text
    bg: '#FEF3C7',         // Light amber background
    border: '#F59E0B'      // Amber border
  },
  approved: {
    label: 'Approved',
    color: '#1E40AF',      // Dark blue text
    bg: '#DBEAFE',         // Light blue background
    border: '#3B82F6'      // Blue border
  },
  in_progress: {
    label: 'In Progress',
    color: '#7C2D12',      // Dark orange text
    bg: '#FED7AA',         // Light orange background
    border: '#F97316'      // Orange border
  },
  addressed: {
    label: 'Addressed',
    color: '#047857',      // Dark green text
    bg: '#D1FAE5',         // Light green background
    border: '#10B981'      // Green border
  },
  declined: {
    label: 'Declined',
    color: '#6B7280',      // Gray text
    bg: '#F3F4F6',         // Light gray background
    border: '#9CA3AF'      // Gray border
  }
}
```

### 4.4 Browse View Features

#### Sorting
- Primary: Net votes (upvotes - downvotes), descending
- Secondary: Creation date, descending (newest first)

#### Status Filter
Pill-style filter bar with counts:
- All (N)
- Pending Review (N)
- Approved (N)
- In Progress (N)
- Addressed (N)
- Declined (N)

#### Feedback Card Components
1. **Vote Column** (left side)
   - Upvote button (thumbs up)
   - Net vote count (colored: green if positive, red if negative)
   - Downvote button (thumbs down)

2. **Content Column**
   - Status badge
   - "YOUR FEEDBACK" badge (if owned by current user)
   - Feedback text (with edit button if owned)
   - Admin response box (if exists)
   - Metadata: date, submitter username, upvote count
   - Comments toggle button with count

3. **Admin Controls** (admin users only)
   - Status update buttons for all statuses
   - Admin response input field

4. **Comments Section** (expandable)
   - Thread of comments with admin badges
   - Add comment input
   - Delete button (own comments only)

### 4.5 Submit View Features

- Large textarea for feedback text
- Voice recording support:
  - Start/stop/pause/resume controls
  - Recording duration display
  - Transcription indicator
  - Transcribed text appended to textarea
- Submit button (disabled while recording/transcribing)
- Success confirmation animation

### 4.6 Comments Structure

```typescript
interface FeedbackComment {
  id: string
  feedback_id: string
  user_id: string
  user_email: string
  text: string
  is_admin_comment: boolean
  created_at: string
}
```

---

## 5. Admin Panel

### 5.1 Admin Authentication

#### Admin Hierarchy

1. **Seed Admin** - Hardcoded email that always has access and cannot be removed
   ```typescript
   const SEED_ADMIN_EMAIL = 'steve@sevaro.com'
   ```

2. **Environment Variable Admins** - Comma-separated list in `FEEDBACK_ADMIN_EMAILS` env var

3. **Elevated Admins** - Stored in `app_settings` table with key `feedback_admin_emails`

4. **ALLOW_ALL_ADMIN Flag** - Temporary flag to allow all authenticated users admin access
   ```typescript
   const ALLOW_ALL_ADMIN = true  // TODO: Set to false in production
   ```

#### Admin Check Logic

```typescript
async function isAdmin(email: string | undefined): Promise<boolean> {
  if (ALLOW_ALL_ADMIN) return true
  if (!email) return false

  const emailLower = email.toLowerCase()

  // 1. Check seed admin
  if (emailLower === SEED_ADMIN_EMAIL) return true

  // 2. Check environment variable
  const envAdmins = process.env.FEEDBACK_ADMIN_EMAILS
  if (envAdmins) {
    const adminList = envAdmins.split(',').map(e => e.trim().toLowerCase())
    if (adminList.includes(emailLower)) return true
  }

  // 3. Check elevated admins from database
  const elevated = await getElevatedAdmins()
  return elevated.includes(emailLower)
}
```

### 5.2 Admin Management UI

#### Seed Admin Display
- Shows permanent seed admin email
- "PERMANENT" badge
- Cannot be removed

#### Elevated Admins List
- Lists all elevated admin emails
- "Remove" button for each
- Empty state: "No additional admins. Add one below."

#### Add Admin Form
- Email input field
- Validation: must contain `@`
- Cannot add seed admin (already permanent)
- Cannot add duplicate emails

### 5.3 Copy Approved Backlog

Generates plain text export of all approved feedback items:

```
=== Approved Feedback Backlog (N items) ===
Exported: [date/time]

1. [Feedback text]
   By: [email] | Votes: +N | Comments: N
   Submitted: [date]
   Admin note: [response if exists]

2. [Next item...]
```

Features:
- Preview of approved items in scrollable list
- "Copy Approved Backlog" button
- "Copied to Clipboard!" confirmation state

### 5.4 System Prompts Viewer

Read-only inventory of all AI system prompts with:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Human-readable name |
| `file` | Source file location |
| `model` | AI model used |
| `description` | What the prompt does |

Expandable cards showing description on click.

**Current System Prompts:**

| ID | Name | File | Model |
|----|------|------|-------|
| `historian-core` | AI Historian - Core | `src/lib/historianPrompts.ts` | gpt-realtime |
| `historian-new-patient` | AI Historian - New Patient | `src/lib/historianPrompts.ts` | gpt-realtime |
| `historian-follow-up` | AI Historian - Follow-up | `src/lib/historianPrompts.ts` | gpt-realtime |
| `ask-ai` | Ask AI | `src/app/api/ai/ask/route.ts` | gpt-5-mini |
| `chart-prep` | Chart Prep | `src/app/api/ai/chart-prep/route.ts` | gpt-5-mini |
| `field-action-improve` | Field Action - Improve | `src/app/api/ai/field-action/route.ts` | gpt-5-mini |
| `field-action-expand` | Field Action - Expand | `src/app/api/ai/field-action/route.ts` | gpt-5-mini |
| `field-action-summarize` | Field Action - Summarize | `src/app/api/ai/field-action/route.ts` | gpt-5-mini |
| `generate-assessment` | Generate Assessment | `src/app/api/ai/generate-assessment/route.ts` | gpt-5.2 |
| `note-review` | Note Review | `src/app/api/ai/note-review/route.ts` | gpt-5-mini |
| `scale-autofill` | Scale Autofill | `src/app/api/ai/scale-autofill/route.ts` | gpt-5.2 |
| `synthesize-note` | Synthesize Note | `src/app/api/ai/synthesize-note/route.ts` | gpt-5.2 |
| `transcribe` | Transcribe & Cleanup | `src/app/api/ai/transcribe/route.ts` | gpt-5-mini |
| `visit-ai` | Visit AI | `src/app/api/ai/visit-ai/route.ts` | gpt-5.2 |

---

## 6. API Contracts

### 6.1 GET /api/feedback

List all feedback with comment counts.

**Authentication:** Required

**Response:**
```typescript
{
  feedback: FeedbackItem[]
  currentUserId: string
  isAdmin: boolean
}
```

**Enrichment:** Each feedback item includes `comment_count` from a separate query.

### 6.2 POST /api/feedback

Submit new feedback.

**Authentication:** Required

**Request:**
```typescript
{
  text: string  // Required, non-empty
}
```

**Response:**
```typescript
{
  feedback: FeedbackItem
}
```

**Created Record:**
```typescript
{
  text: text.trim(),
  user_id: user.id,
  user_email: user.email || 'Anonymous',
  upvotes: [],
  downvotes: [],
  status: 'pending'
}
```

### 6.3 PATCH /api/feedback

Multiple actions on single endpoint.

**Authentication:** Required

#### Vote Action

**Request:**
```typescript
{
  feedbackId: string
  voteType: 'up' | 'down'
}
```

**Behavior:**
- If user already voted same way: remove vote
- If user voted opposite: switch vote
- Otherwise: add vote

#### Update Status Action (Admin only)

**Request:**
```typescript
{
  feedbackId: string
  action: 'updateStatus'
  status: 'pending' | 'approved' | 'in_progress' | 'addressed' | 'declined'
  adminResponse?: string
}
```

**Updated Fields:**
```typescript
{
  status,
  admin_user_id: user.id,
  admin_user_email: user.email,
  status_updated_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  admin_response: adminResponse  // if provided
}
```

#### Update Text Action (Own feedback only)

**Request:**
```typescript
{
  feedbackId: string
  action: 'updateText'
  text: string
}
```

**Validation:** Verifies `user_id` matches current user.

### 6.4 GET /api/feedback/comments

Get comments for a feedback item.

**Authentication:** Required

**Query Parameters:**
- `feedbackId` (required)

**Response:**
```typescript
{
  comments: FeedbackComment[]
}
```

**Order:** Ascending by `created_at`

### 6.5 POST /api/feedback/comments

Add a comment.

**Authentication:** Required

**Request:**
```typescript
{
  feedbackId: string
  text: string
  isAdminComment?: boolean
}
```

**Response:**
```typescript
{
  comment: FeedbackComment
}
```

### 6.6 DELETE /api/feedback/comments

Delete own comment.

**Authentication:** Required

**Request:**
```typescript
{
  commentId: string
}
```

**Validation:** Verifies `user_id` matches current user.

**Response:**
```typescript
{
  success: true
}
```

### 6.7 GET /api/feedback/admin

Get admin configuration data.

**Authentication:** Admin required

**Response:**
```typescript
{
  seedAdmin: string
  elevatedAdmins: string[]
  systemPrompts: Array<{
    id: string
    name: string
    file: string
    model: string
    description: string
  }>
}
```

### 6.8 POST /api/feedback/admin

Add an elevated admin.

**Authentication:** Admin required

**Request:**
```typescript
{
  email: string  // Must contain @
}
```

**Validation:**
- Cannot add seed admin (already permanent)
- Cannot add duplicate email

**Response:**
```typescript
{
  elevatedAdmins: string[]
}
```

### 6.9 DELETE /api/feedback/admin

Remove an elevated admin.

**Authentication:** Admin required

**Request:**
```typescript
{
  email: string
}
```

**Validation:**
- Cannot remove seed admin

**Response:**
```typescript
{
  elevatedAdmins: string[]
}
```

---

## 7. Database Schema

### 7.1 feedback Table

```sql
CREATE TABLE feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  upvotes text[] DEFAULT '{}',    -- Array of user IDs
  downvotes text[] DEFAULT '{}',  -- Array of user IDs
  status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'in_progress', 'addressed', 'declined')),
  admin_response text,
  admin_user_id uuid REFERENCES auth.users(id),
  admin_user_email text,
  status_updated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_feedback_status ON feedback(status);
```

### 7.2 feedback_comments Table

```sql
CREATE TABLE feedback_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  text text NOT NULL,
  is_admin_comment boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_feedback_comments_feedback_id ON feedback_comments(feedback_id);

-- RLS Policies
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feedback comments"
  ON feedback_comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON feedback_comments FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own comments"
  ON feedback_comments FOR DELETE USING (auth.uid() = user_id);
```

### 7.3 app_settings Table

Used for storing elevated admin emails and other configuration.

```sql
CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Note: No RLS policies = no direct user access (service role only)

-- Trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Admin Emails Storage:**
```sql
-- Key: 'feedback_admin_emails'
-- Value: 'email1@example.com,email2@example.com'
```

---

## 8. Dark Mode Implementation

### 8.1 CSS Custom Properties

Light mode (`:root`):
```css
:root {
  --primary: #0D9488;
  --primary-light: #14B8A6;
  --primary-dark: #0F766E;
  --bg-white: #FFFFFF;
  --bg-gray: #F9FAFB;
  --bg-dark: #F3F4F6;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --text-muted: #9CA3AF;
  --border: #E5E7EB;
  --error: #EF4444;
  --success: #10B981;
  --warning: #F59E0B;
  --info: #3B82F6;
}
```

Dark mode (`[data-theme="dark"]`):
```css
[data-theme="dark"] {
  --primary: #14B8A6;
  --primary-light: #2DD4BF;
  --primary-dark: #0D9488;
  --bg-white: #1F2937;
  --bg-gray: #111827;
  --bg-dark: #0F172A;
  --text-primary: #F9FAFB;
  --text-secondary: #D1D5DB;
  --text-muted: #9CA3AF;
  --border: #374151;
  --error: #F87171;
  --success: #34D399;
  --warning: #FBBF24;
  --info: #60A5FA;
}
```

### 8.2 Form Element Overrides

```css
[data-theme="dark"] input,
[data-theme="dark"] textarea,
[data-theme="dark"] select {
  background-color: var(--bg-white);
  color: var(--text-primary);
  border-color: var(--border);
}

[data-theme="dark"] input::placeholder,
[data-theme="dark"] textarea::placeholder {
  color: var(--text-muted);
}

[data-theme="dark"] option {
  background-color: var(--bg-white);
  color: var(--text-primary);
}
```

### 8.3 Theme Toggle Implementation

```typescript
// State
const [darkMode, setDarkMode] = useState(false)

// Apply theme on preference change
const applyDarkModePreference = (preference: 'light' | 'dark' | 'system') => {
  if (preference === 'system') {
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setDarkMode(systemPrefersDark)
    document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : '')
  } else {
    const isDark = preference === 'dark'
    setDarkMode(isDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '')
  }
}

// Listen for system preference changes when in 'system' mode
useEffect(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    const settings = localStorage.getItem('sevaro-user-settings')
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.darkModePreference === 'system') {
        setDarkMode(e.matches)
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : '')
      }
    }
  }
  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}, [])
```

### 8.4 Component Style Pattern

Use CSS variables for all color values:
```typescript
style={{
  background: 'var(--bg-white)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
}}
```

---

## 9. Ideas Drawer

The Ideas Drawer is a left-aligned slide-out panel accessed via the lightbulb icon in TopNav.

### 9.1 Tab Structure

| Tab | Icon | Purpose |
|-----|------|---------|
| Workflows | Refresh icon | Documentation workflow styles |
| Tour | Target icon | Interactive and text-based tours |
| Features | Sparkle icon | Feature reference list |
| Tips | Lightbulb icon | Quick tips and best practices |
| Feedback | Chat icon | Feedback system (Browse/Submit/Admin) |

### 9.2 Workflows Tab

Four documentation workflow styles explained:

1. **Fully AI-Driven** (purple) - AI handles most documentation
2. **Fully Manual** (gray) - Complete control, no AI
3. **Hybrid - Lightweight AI** (cyan) - AI for prep, manual completion
4. **Hybrid - Targeted AI** (green) - Selective AI for specific sections

Each workflow includes:
- Icon and description
- Best-for scenario
- Step-by-step instructions
- Key buttons used
- Typical completion time
- AI usage level (None/Light/Selective/Maximum)
- Click count (Minimal/Moderate/Maximum)

### 9.3 Tour Tab

- "Launch Interactive Tour" button (triggers spotlight tour)
- Text-based step-by-step walkthrough with progress bar
- TL;DR quick reference table

### 9.4 Features Tab

Categorized feature list:
- Voice & Dictation
- AI Assistance
- Clinical Tools
- Workflow

### 9.5 Tips Tab

Rotating tips with visual styling:
- "Tip" type: Green gradient background
- "Info" type: Blue gradient background

---

## 10. Implementation Notes

### 10.1 Lazy Supabase Client Creation

Always create the Supabase client inside event handlers or async functions, never at component level:

```typescript
// WRONG
const supabase = createClient()
export default function Component() { ... }

// CORRECT
export default function Component() {
  const handleAction = async () => {
    const supabase = await createClient()
    // use supabase
  }
}
```

### 10.2 Voice Recording Integration

The SettingsDrawer and IdeasDrawer both use the `useVoiceRecorder` hook for dictation:

```typescript
const {
  isRecording,
  isPaused,
  isTranscribing,
  error,
  transcribedText,
  recordingDuration,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  clearTranscription,
} = useVoiceRecorder()
```

### 10.3 Error Handling

API routes return consistent error format:
```typescript
return NextResponse.json({ error: 'Error message' }, { status: 4xx/5xx })
```

### 10.4 Optimistic Updates

Vote and status changes should update local state immediately, then sync with server:

```typescript
const handleVote = async (feedbackId: string, voteType: 'up' | 'down') => {
  // Optimistically update UI
  setAllFeedback(prev => prev.map(item =>
    item.id === feedbackId ? { ...item, /* updated vote state */ } : item
  ))

  // Then sync with server
  const res = await fetch('/api/feedback', { ... })
  // Handle response, rollback on error if needed
}
```

---

## 11. Migration Path

For teams implementing this in a new tech stack:

### Phase 1: Settings (No Backend Required)
1. Implement Settings Drawer UI
2. Add localStorage persistence
3. Implement dark mode CSS variables
4. Wire up theme toggle

### Phase 2: Feedback System
1. Create `feedback` table
2. Create `feedback_comments` table
3. Implement GET/POST/PATCH endpoints
4. Build Browse and Submit views
5. Add voting functionality
6. Implement comments

### Phase 3: Admin Panel
1. Implement admin authentication logic
2. Add admin status controls
3. Build admin response UI
4. Create admin management endpoints
5. Add Copy Approved Backlog feature
6. Add System Prompts viewer

---

## 12. Testing Checklist

### Settings
- [ ] Settings persist across page refresh
- [ ] Dark mode applies immediately
- [ ] System preference follows OS changes
- [ ] Font size preview updates
- [ ] Tab order saves and applies in CenterPanel
- [ ] Reset to defaults clears all settings
- [ ] Voice dictation appends to text fields

### Feedback
- [ ] Submit feedback creates new record
- [ ] Upvote/downvote toggles correctly
- [ ] Switching vote removes opposite vote
- [ ] Edit own feedback works
- [ ] Cannot edit others' feedback
- [ ] Status filter shows correct items
- [ ] Comments load on expand
- [ ] Can add and delete own comments
- [ ] Cannot delete others' comments

### Admin
- [ ] Non-admin cannot see Admin tab
- [ ] Admin can change any status
- [ ] Admin response saves with status
- [ ] Can add new elevated admin
- [ ] Cannot add seed admin
- [ ] Cannot remove seed admin
- [ ] Copy Approved Backlog formats correctly

---

*End of PRD*
