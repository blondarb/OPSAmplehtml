import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { invokeBedrock } from '@/lib/bedrock'

interface UserSettings {
  globalAiInstructions?: string
  documentationStyle?: 'concise' | 'detailed' | 'narrative'
  preferredTerminology?: 'formal' | 'standard' | 'simplified'
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { question, context, userSettings } = await request.json()

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Build user preferences section
    let userPreferences = ''
    if (userSettings) {
      const prefs: string[] = []

      // Global AI instructions
      if (userSettings.globalAiInstructions) {
        prefs.push(`User preferences: ${userSettings.globalAiInstructions}`)
      }

      // Documentation style
      if (userSettings.documentationStyle) {
        const styleGuide: Record<string, string> = {
          concise: 'Keep responses brief and focused on essential information.',
          detailed: 'Provide comprehensive responses with thorough explanations.',
          narrative: 'Write in a flowing, conversational prose style.',
        }
        prefs.push(styleGuide[userSettings.documentationStyle])
      }

      // Terminology preference
      if (userSettings.preferredTerminology) {
        const termGuide: Record<string, string> = {
          formal: 'Use formal, academic medical terminology.',
          standard: 'Use standard clinical terminology.',
          simplified: 'Use simplified, accessible medical language.',
        }
        prefs.push(termGuide[userSettings.preferredTerminology])
      }

      if (prefs.length > 0) {
        userPreferences = `\n\nUser Style Preferences:\n${prefs.join('\n')}`
      }
    }

    const systemPrompt = `You are a clinical AI assistant for a neurology practice. You help providers with clinical questions, treatment guidelines, and documentation.

Current patient context:
- Patient: ${context?.patient || 'Not specified'}
- Chief Complaint: ${context?.chiefComplaint || 'Not specified'}
- HPI Summary: ${context?.hpi || 'Not provided'}
${context?.fullNoteText ? `\nFull Clinical Note:\n${context.fullNoteText}\n` : ''}
Provide concise, evidence-based responses. When discussing medications, include typical dosing. Always recommend consulting current guidelines for complex decisions.${userPreferences}`

    const bedrockResult = await invokeBedrock({
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
      maxTokens: 1000,
      temperature: 1,
    })

    const response = bedrockResult.text || 'No response generated'

    return NextResponse.json({ response })

  } catch (error: any) {
    console.error('AI API Error:', error)

    return NextResponse.json({
      error: error?.message || 'An error occurred while processing your request'
    }, { status: 500 })
  }
}
