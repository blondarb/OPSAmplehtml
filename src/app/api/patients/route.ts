import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/patients - Create a new patient
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      mrn,
      phone,
      email,
      referringPhysician,
      referralReason,
    } = body

    if (!firstName || !lastName || !dateOfBirth || !gender) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, dateOfBirth, gender' },
        { status: 400 }
      )
    }

    if (!['M', 'F', 'O'].includes(gender)) {
      return NextResponse.json(
        { error: 'Gender must be M, F, or O' },
        { status: 400 }
      )
    }

    // Auto-generate MRN if not provided
    const generatedMrn = mrn || `${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`

    const { data, error } = await supabase
      .from('patients')
      .insert({
        user_id: user.id,
        mrn: generatedMrn,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
        gender,
        phone: phone || null,
        email: email || null,
        referring_physician: referringPhysician || null,
        referral_reason: referralReason || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating patient:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A patient with this MRN already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create patient' }, { status: 500 })
    }

    return NextResponse.json({ patient: data }, { status: 201 })
  } catch (error) {
    console.error('Error in patients API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
