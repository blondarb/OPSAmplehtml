import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { patient, noteData } = await request.json()

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Fetch patient's visit history for context
    const { data: visits } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes(hpi, assessment, plan, ai_summary),
        clinical_scales(scale_type, score, interpretation),
        diagnoses(icd10_code, description)
      `)
      .eq('patient_id', patient?.id)
      .eq('status', 'completed')
      .order('visit_date', { ascending: false })
      .limit(3)

    // Fetch imaging studies
    const { data: imaging } = await supabase
      .from('imaging_studies')
      .select('*')
      .eq('patient_id', patient?.id)
      .order('study_date', { ascending: false })
      .limit(5)

    const visitHistory = visits?.map(v => ({
      date: new Date(v.visit_date).toLocaleDateString(),
      type: v.visit_type,
      chiefComplaint: v.chief_complaint?.join(', '),
      hpi: v.clinical_notes?.hpi,
      assessment: v.clinical_notes?.assessment,
      scales: v.clinical_scales?.map((s: any) => `${s.scale_type}: ${s.score} (${s.interpretation})`).join(', '),
      diagnoses: v.diagnoses?.map((d: any) => `${d.icd10_code} - ${d.description}`).join(', '),
    })) || []

    const imagingSummary = imaging?.map(i => ({
      date: new Date(i.study_date).toLocaleDateString(),
      type: i.study_type,
      description: i.description,
      impression: i.impression,
    })) || []

    const systemPrompt = `You are a clinical AI assistant preparing a chart summary for a neurology visit. Generate a concise, well-organized pre-visit summary.

Patient Information:
- Name: ${patient?.first_name} ${patient?.last_name}
- Age: ${patient?.date_of_birth ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() : 'Unknown'}
- Gender: ${patient?.gender || 'Unknown'}
- MRN: ${patient?.mrn || 'Unknown'}

Current Visit:
- Chief Complaint: ${noteData?.chiefComplaint?.join(', ') || 'Not specified'}

Visit History:
${visitHistory.length > 0 ? visitHistory.map(v => `
- ${v.date} (${v.type}): ${v.chiefComplaint}
  HPI: ${v.hpi?.substring(0, 200) || 'N/A'}...
  Assessment: ${v.assessment || 'N/A'}
  Scales: ${v.scales || 'None recorded'}
  Diagnoses: ${v.diagnoses || 'None recorded'}
`).join('\n') : 'No prior visits'}

Imaging:
${imagingSummary.length > 0 ? imagingSummary.map(i => `
- ${i.date}: ${i.type} - ${i.description}
  Impression: ${i.impression || 'N/A'}
`).join('\n') : 'No imaging studies'}

Generate a structured chart prep summary including:
1. Brief patient overview
2. Relevant history summary
3. Current medications/treatments
4. Key findings from imaging
5. Clinical scale trends
6. Points to address this visit`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the chart prep summary for this patient visit.' }
      ],
      max_tokens: 1500,
      temperature: 0.5,
    })

    const response = completion.choices[0]?.message?.content || 'Unable to generate summary'

    return NextResponse.json({ response })

  } catch (error: any) {
    console.error('Chart Prep Error:', error)
    return NextResponse.json({
      error: error?.message || 'An error occurred'
    }, { status: 500 })
  }
}
