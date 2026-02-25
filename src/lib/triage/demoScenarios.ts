import { DemoScenario } from './types'

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'outpatient-01-jennings',
    patientName: 'Jennings, Harold',
    age: 74,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Family NP',
    briefDescription: 'Routine chronic disease follow-up with incidental resting tremor and bradykinesia.',
    clinicalHighlight: 'Early Parkinsonism',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '01_Jennings_Harold.pdf',
        path: '/samples/triage/outpatient/01_Jennings_Harold.pdf',
        docType: 'PCP Referral',
        previewText: `Prairie View Family Health Center
102 Main Street, Eldon, MO 65026
Phone: (573) 555-0142 | Fax: (573) 555-0143

Patient: Harold W. Jennings

Date of Service: 01/14/2026

DOB: 04/12/1951

Provider: Tammy R. Clifton, APRN, FNP-BC

MRN: PV-20248831

Credentials: Family Nurse Practitioner

CHIEF COMPLAINT
Follow-up for diabetes, hypertension, and knee pain.

HISTORY OF PRESENT ILLNESS
Mr. Jennings is a 74-year-old male who presents today for routine follow-up of his chronic conditions. He reports his blood
sugars have been running in the 150s to 180s fasting. He admits to not following his diet well over the holidays. He had
some dizziness a few weeks ago but it went away. He is still having bilateral knee pain that is worse with walking and going
up stairs. He ran out of his metformin about a week ago and has not been taking it. He denies chest pain, shortness of
breath, or swelling in his legs. He does mention that his wife has noticed his left hand shaking sometimes when he is sitting
in his recliner watching TV. He says it does not bother him much. He also reports some constipation and says he feels like
he is moving slower than he used to but attributes this to getting older.

REVIEW OF SYSTEMS
Constitutional: Denies fever, chills, or weight loss. Reports mild fatigue. HEENT: Denies vision changes, hearing loss.
Cardiovascular: Denies chest pain, palpitations. Reports occasional dizziness, resolved. Respiratory: Denies cough,
shortness of breath. GI: Reports constipation x 2 months. Denies nausea, vomiting, diarrhea. Musculoskeletal: Bilateral
knee pain, chronic. Neurologic: Wife notes left hand tremor at rest. Patient reports slowed movement. Psych: Denies
depression, anxiety.

CURRENT MEDICATIONS
1. Metformin 1000 mg BID (not taking - ran out)
2. Lisinopril 20 mg daily
3. Amlodipine 5 mg daily
4. Atorvastatin 40 mg daily
5. Acetaminophen 500 mg PRN knee pain
6. Omeprazole 20 mg daily

PHYSICAL EXAM
Vitals: BP 148/88, HR 76, Temp 98.2, Wt 218 lbs, BMI 31.2
General: Alert, cooperative, appears stated age. Slow to get up from chair.
HEENT: PERRL, TMs clear bilaterally, oropharynx normal.
Cardiovascular: RRR, no murmurs. Pedal pulses 2+ bilaterally.
Lungs: CTA bilaterally.
Abdomen: Soft, non-tender, non-distended. BS normal.
Extremities: No edema. Bilateral knee crepitus. ROM limited by pain.
Neuro: Intermittent left hand resting tremor noted. Gait slow, mildly stooped.

ASSESSMENT AND PLAN
1. Type 2 Diabetes Mellitus, uncontrolled (E11.65)
A1c drawn today. Refill metformin. Counseled on diet and medication adherence. If A1c >9, will consider adding a
sulfonylurea or GLP-1.
2. Essential Hypertension (I10)
BP elevated today. Increase lisinopril to 40 mg daily. Recheck in 4 weeks. Reviewed low-sodium diet.
3. Bilateral Knee Osteoarthritis (M17.0)
Discussed weight loss. Continue acetaminophen. May consider knee x-rays at next visit if not improving. Referred to PT but

patient declined due to distance.
4. Left hand tremor (R25.1)
New finding. Resting tremor noted in left hand, wife reports progressive over past few months. Patient also with
bradykinesia and constipation. Referring to Neurology for further evaluation. Closest neurologist is in Columbia. Placed
referral.
5. Constipation (K59.00)
Started MiraLAX daily. Increase fluids and fiber.
Follow-up in 4 weeks for BP recheck and A1c results.

Electronically signed by Tammy R. Clifton, APRN, FNP-BC
Document generated in PrairieEHR v3.1 | Encounter finalized 01/14/2026 17:42 CST`,
      },
    ],
    demoPoints: ['Neuro finding buried in routine visit', 'Movement disorders referral'],
  },
  {
    id: 'outpatient-02-gutierrez',
    patientName: 'Gutierrez, Maria',
    age: 29,
    sex: 'F',
    category: 'outpatient',
    referringSpecialty: 'OB/GYN',
    briefDescription: 'Postpartum visit with bilateral hand numbness and new headaches.',
    clinicalHighlight: 'Postpartum carpal tunnel + headaches',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '02_Gutierrez_Maria.pdf',
        path: '/samples/triage/outpatient/02_Gutierrez_Maria.pdf',
        docType: 'OB/GYN Referral',
        previewText: `Lakeshore Internal Medicine Associates
4500 N. Michigan Ave, Suite 310, Chicago, IL 60611
Phone: (312) 555-0276 | Fax: (312) 555-0277

Patient: Maria Elena Gutierrez

Date of Service: 01/22/2026

DOB: 09/23/1988

Provider: Robert A. Tanaka, MD, FACP

MRN: LIM-00553921

Specialty: Internal Medicine (Board Certified, 22 yrs practice)

CHIEF COMPLAINT
Worsening headaches over the past 3 months.

HISTORY OF PRESENT ILLNESS
Ms. Gutierrez is a 37-year-old female with a history of episodic migraine without aura since her early 20s who presents with
a change in her headache pattern over the past 3 months. Previously, she experienced migraines approximately 2-3 times
per month, typically perimenstrual, responding well to sumatriptan 100 mg PO. Over the past 12 weeks, she reports
headaches occurring 4-5 days per week. The headaches are now bifrontal and occipital, described as a pressure/tightness
with superimposed throbbing, rated 6-8/10 in intensity. Associated symptoms include photophobia, mild nausea (no
vomiting), and difficulty concentrating at work. She denies visual aura, weakness, numbness, speech difficulty, or fever. No
history of head trauma.
She reports increased sumatriptan use to 10-12 doses per month. She was started on topiramate 25 mg BID by her prior
PCP 6 weeks ago with titration to 50 mg BID, but she has seen no meaningful improvement and reports word-finding
difficulty and paresthesias in her hands as side effects. She is a graphic designer and the cognitive side effects are
significantly impacting her work.
She works long hours at a computer, sleeps approximately 5-6 hours per night, drinks 3-4 cups of coffee daily, and reports
moderate work-related stress. She exercises 2-3x/week. No recent vision changes aside from photophobia with headache.
Last eye exam 8 months ago was normal.
Of note, her mother has a history of migraine and her maternal aunt was diagnosed with idiopathic intracranial hypertension
at age 35.

REVIEW OF SYSTEMS
Constitutional: Reports fatigue. No weight changes, fevers, or night sweats. HEENT: Photophobia with headaches. No
vision loss, diplopia, tinnitus, hearing changes. Cardiovascular: No chest pain, palpitations. Respiratory: No cough or
dyspnea. GI: Mild nausea with headaches. No vomiting, abdominal pain, or changes in bowel habits. Neurologic: No focal
weakness, numbness (other than topiramate-related), gait difficulty, or seizures. Reports difficulty concentrating and
word-finding trouble (on topiramate). Psych: Mild anxiety related to headaches affecting work. No depression, SI/HI.

CURRENT MEDICATIONS
1. Sumatriptan 100 mg PO PRN (using 10-12x/month)
2. Topiramate 50 mg BID (started 6 weeks ago, poor response)
3. Ibuprofen 400 mg PRN (using 2-3x/week)
4. Combined oral contraceptive (ethinyl estradiol/norgestimate)

ALLERGIES
Amoxicillin (rash)

PHYSICAL EXAM
Vitals: BP 122/78, HR 72, Temp 98.4, Wt 156 lbs, Ht 5'5", BMI 26.0
General: Well-appearing female, no acute distress.
HEENT: Normocephalic, atraumatic. No tenderness over sinuses or temporal arteries. PERRL, EOMI, no papilledema on
fundoscopic exam (limited view, non-dilated). TMs normal. Oropharynx clear.
Neck: Supple, no meningismus, no lymphadenopathy. Mild trapezius tenderness bilaterally.
Cardiovascular: RRR, no murmurs.

Lungs: Clear bilaterally.
Neurologic: Alert and oriented x3. Cranial nerves II-XII intact. Motor strength 5/5 in all extremities. Sensation intact to light
touch. DTRs 2+ and symmetric. Finger-to-nose and heel-to-shin normal. Romberg negative. Gait normal including tandem.

ASSESSMENT AND PLAN
1. Chronic migraine with medication overuse headache (G43.709, G44.41)
Patient has transitioned from episodic migraine to chronic migraine (>15 headache days/month x >3 months) with
concurrent medication overuse (sumatriptan >10 days/month). Topiramate trial has been inadequate due to intolerable
cognitive side effects. Family history notable for maternal aunt with IIH, though patient's exam does not suggest this at
present.
Plan:
- Taper and discontinue topiramate over 2 weeks (50 mg daily x 1 week, then 25 mg daily x 1 week, then stop)
- Limit sumatriptan to no more than 2 days/week; counseled on medication overuse headache
- Start headache diary to track frequency, triggers, and acute medication use
- Referring to Neurology/Headache specialist for further management including consideration of CGRP monoclonal antibody
therapy (e.g., erenumab, fremanezumab) or alternative prophylaxis, and evaluation for medication overuse headache
detoxification strategy
- MRI brain without contrast ordered to evaluate given change in headache pattern and family history
- Discussed sleep hygiene, caffeine reduction, and stress management
2. Anxiety, mild, situational
Related to headache impact on work function. Will defer to neurology for comprehensive management. If persistent, may
consider SSRI which could serve dual purpose.
Follow-up in 6 weeks or sooner after neurology evaluation.

Electronically signed by Robert A. Tanaka, MD, FACP
Signed electronically 01/22/2026 15:18 CST | Lakeshore IM EHR`,
      },
    ],
    demoPoints: ['Postpartum neurologic symptoms', 'Multi-symptom referral'],
  },
  {
    id: 'outpatient-03-patterson',
    patientName: 'Patterson, Thomas',
    age: 62,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Internal Medicine',
    briefDescription: 'HTN follow-up with two transient episodes of right arm weakness and speech difficulty.',
    clinicalHighlight: 'TIA presentation',
    expectedTier: 'urgent',
    files: [
      {
        filename: '03_Patterson_Thomas.pdf',
        path: '/samples/triage/outpatient/03_Patterson_Thomas.pdf',
        docType: 'PCP Referral',
        previewText: `Riverbend Family Medicine
780 Commerce Dr, Suite A, Dayton, OH 45402
Phone: (937) 555-0388 | Fax: (937) 555-0389

Patient: Thomas J. Patterson

Date of Service: 01/08/2026

DOB: 11/05/1962

Provider: Andrea L. Mitchell, MD

MRN: RFM-0041177

Specialty: Family Medicine

CHIEF COMPLAINT
Diabetes follow-up, medication refills.

HISTORY OF PRESENT ILLNESS
Mr. Patterson is a 63-year-old male here for quarterly diabetes follow-up. His A1c from last month was 8.2%, improved from
8.9% in July. He reports better adherence to metformin since we switched to extended release. He has been walking 20
minutes most days. His home blood glucose readings are mostly in the 130-170 range fasting.
He continues to smoke half a pack per day, down from one pack. We discussed cessation again today and he is considering
varenicline. He reports his mood has been okay, though he is stressed about finances. He denies suicidal ideation.
He also mentions ongoing numbness and tingling in both feet that has been gradually worsening over the past year. He
says it is now up to his ankles. He dropped a cup last week because his right hand felt numb. He reports some burning pain
at night in his feet that wakes him up. He has not tried anything for it. He has not had a fall but does feel unsteady
sometimes.

PAST MEDICAL HISTORY
Type 2 DM x 12 years, Hypertension, Hyperlipidemia, GERD, Obesity, Depression (stable on sertraline), Former alcohol
use disorder (sober 8 years)

CURRENT MEDICATIONS
1. Metformin ER 1000 mg BID
2. Glipizide 10 mg BID
3. Empagliflozin 10 mg daily
4. Lisinopril 40 mg daily
5. Atorvastatin 80 mg daily
6. Sertraline 100 mg daily
7. Omeprazole 20 mg daily
8. Aspirin 81 mg daily

PHYSICAL EXAM
Vitals: BP 138/82, HR 80, Temp 98.0, Wt 247 lbs, BMI 34.5
General: Obese male, pleasant, no acute distress.
HEENT: PERRL, no retinopathy on undilated exam (due for ophthalmology).
Cardiovascular: RRR, no murmurs, no edema.
Lungs: Clear.
Feet: Skin intact, no ulcers, no calluses. Monofilament testing: absent at multiple sites bilaterally in forefoot. Vibration sense
decreased at bilateral great toes. Ankle reflexes absent bilaterally. Pedal pulses palpable. Mild stocking-distribution sensory
loss to pinprick to mid-calf bilaterally. Right hand grip slightly reduced.
Psych: Euthymic, appropriate affect.

LABS (12/18/2025)
A1c: 8.2% | Fasting glucose: 162 | BMP: Na 140, K 4.3, Cr 1.1, eGFR 72 | Lipids: TC 188, LDL 98, HDL 38, TG 210 | TSH:
2.1 | B12: 285 (low-normal)

ASSESSMENT AND PLAN

1. Type 2 DM, improving but not at goal (E11.65)
A1c improved to 8.2%. Continue current regimen. Goal A1c <7.5%. Counseled on continued lifestyle modification. Recheck
A1c in 3 months.
2. Peripheral Neuropathy (G63, E11.42)
Progressive symmetric polyneuropathy affecting feet and now hands, in the setting of longstanding diabetes with suboptimal
control. B12 is low-normal at 285 — will supplement with cyanocobalamin 1000 mcg daily and recheck methylmalonic acid
level. However, hand involvement and the relatively rapid progression concern me. Referring to Neurology for EMG/NCS
and further evaluation to confirm diagnosis and rule out other contributing etiologies (e.g., CIDP, other). Starting gabapentin
100 mg TID for neuropathic pain, may titrate.
3. Hypertension (I10)
Borderline today. Continue current regimen. Home BP log reviewed, most readings 130s/80s.
4. Tobacco use disorder (F17.210)
Reduced to half PPD. Will prescribe varenicline if he decides to proceed. Counseled again today.
5. Hypertriglyceridemia (E78.1)
TG still elevated at 210. Likely related to diabetes control. Will reassess after A1c improves.
RTC 3 months. Ophthalmology referral for diabetic eye exam placed. Podiatry referral placed.

Electronically signed by Andrea L. Mitchell, MD
Encounter signed 01/08/2026 16:55 EST | Riverbend EHR v4.2`,
      },
    ],
    demoPoints: ['Urgent vascular neurology', 'TIA recognition'],
  },
  {
    id: 'outpatient-04-williams',
    patientName: 'Williams, Deshawn',
    age: 8,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Pediatrics',
    briefDescription: 'Staring spells at school with lip smacking, unresponsive for 10-15 seconds.',
    clinicalHighlight: 'Absence seizures in child',
    expectedTier: 'urgent',
    files: [
      {
        filename: '04_Williams_Deshawn.pdf',
        path: '/samples/triage/outpatient/04_Williams_Deshawn.pdf',
        docType: 'Pediatric Referral',
        previewText: `QuickCare Urgent Care
1220 Veterans Blvd, Kenner, LA 70062
Phone: (504) 555-0199 | Fax: (504) 555-0200

Patient: Deshawn A. Williams

Date of Service: 01/19/2026

DOB: 03/17/1995

Provider: Kyle M. Boudreaux, PA-C

MRN: QC-90082714

Credentials: Physician Assistant

CHIEF COMPLAINT
Episode of passing out and shaking, per girlfriend.

HISTORY OF PRESENT ILLNESS
30-year-old male presents accompanied by his girlfriend. She reports that last night while they were watching a movie, the
patient suddenly became stiff and then started shaking all over for about 1-2 minutes. She states he was unresponsive
during the episode and bit his tongue. Afterward he was confused for about 10 minutes and then very tired. He slept the rest
of the night. He does not remember the episode. He says he felt fine otherwise yesterday. He had a few beers earlier in the
evening (3-4). He denies any prior seizures, head injury, or drug use. He smokes marijuana occasionally. He has been
sleeping poorly due to work stress. No family history of seizures that he knows of. No medications. He presents today
because his girlfriend insisted.

PHYSICAL EXAM
Vitals: BP 128/76, HR 82, Temp 98.6, O2 sat 99% RA
General: Alert, oriented, no distress. Appears tired.
HEENT: Small healing bite mark on left lateral tongue. No head trauma signs.
Neuro: A&Ox4.; Cranial nerves grossly intact. Strength and sensation intact. Gait normal. No focal deficits.
Otherwise: Heart, lungs, abdomen unremarkable.

ASSESSMENT AND PLAN
1. First-time seizure (R56.9)
Presentation consistent with witnessed generalized tonic-clonic seizure — tongue bite, postictal confusion, and amnesia for
event. No clear provoking factor identified other than possible sleep deprivation and alcohol. Neuro exam normal today.
- BMP, CBC, glucose, and UDS sent. Results pending at time of discharge.
- Counseled patient not to drive until evaluated by Neurology
- Advised against alcohol and to maintain regular sleep
- Referral to Neurology for further workup including EEG and MRI
- If another event occurs, go to ER
- Prescription: none at this time, deferring to neurology for decision on antiepileptic medication

Electronically signed by Kyle M. Boudreaux, PA-C
Supervising Physician: James T. Fontenot, MD | Signed 01/19/2026 14:22 CST`,
      },
    ],
    demoPoints: ['Pediatric epilepsy referral', 'Seizure recognition'],
  },
  {
    id: 'outpatient-05-hargrove',
    patientName: 'Hargrove, Linda',
    age: 56,
    sex: 'F',
    category: 'outpatient',
    referringSpecialty: 'Family Medicine',
    briefDescription: 'Fibromyalgia follow-up with progressive bilateral foot numbness ascending to calves.',
    clinicalHighlight: 'Peripheral neuropathy',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '05_Hargrove_Linda.pdf',
        path: '/samples/triage/outpatient/05_Hargrove_Linda.pdf',
        docType: 'PCP Referral',
        previewText: `Broken Bow Community Health Clinic
P.O. Box 340, 14 Elm Street, Broken Bow, OK 74728
Phone: (580) 555-0087 | Fax: (580) 555-0088

Patient: Linda S. Hargrove

Date of Service: 01/06/2026

DOB: 06/29/1958

Provider: Jessica Dye, APRN, FNP-C

MRN: BB-0003291

Credentials: Family Nurse Practitioner

CHIEF COMPLAINT
Back pain and medication refills.

HISTORY OF PRESENT ILLNESS
Mrs. Hargrove is a 67-year-old female here for ongoing low back pain and medication refills. She has had back pain for
years, worse over the last 6 months. She had an MRI at the hospital in McAlester about 4 months ago that showed
multilevel degenerative disc disease and a disc bulge at L4-L5. She got a steroid injection from pain management in
September which helped for about a month. She is currently taking hydrocodone 5/325 two to three times a day for pain.
She says the pain goes down the back of both legs to her calves. She rates it 7/10 today.
She is also here for refills on her blood pressure and thyroid meds. She says her blood pressure has been running fine at
home. She checks it at the pharmacy.
She also mentions that her left foot has been dragging some when she walks and her left leg feels weak. She says it started
maybe 2 months ago and is getting worse. She tripped on a rug last week because of it. She has not told anyone about it
until today.

CURRENT MEDICATIONS
1. Hydrocodone/APAP 5/325 mg q8h PRN
2. Levothyroxine 75 mcg daily
3. Amlodipine 10 mg daily
4. Ibuprofen 800 mg TID with food

PHYSICAL EXAM
Vitals: BP 134/78, HR 74, Wt 182 lbs
General: Pleasant female, ambulates slowly, slightly antalgic gait favoring left.
Back: Tender to palpation over lumbar paraspinals. Limited flexion and extension. Positive straight leg raise on left at 40
degrees.
Lower Extremities: Left dorsiflexion 3/5, right dorsiflexion 5/5. Left EHL weak. Sensation decreased lateral left leg and
dorsum of left foot. Left patellar reflex 2+, left ankle reflex 1+. Right side normal.
Remainder: Not formally examined today, focused visit.

ASSESSMENT AND PLAN
1. Chronic low back pain with left-sided radiculopathy (M54.5, M54.17)
Known multilevel DDD with L4-5 disc bulge. Current presentation is consistent with left L5 radiculopathy. Continue
hydrocodone for now. Refill ibuprofen. Medrol dosepak prescribed.
2. Left foot drop / progressive left leg weakness
This is new and concerning. Progressive left foot drop with fall risk. This needs neurology evaluation. Referred to neuro.
Told patient this is important and not to wait on appointment. If worsens or develops bowel/bladder problems, go to ER.
3. Hypothyroidism (E03.9)
Stable. Refill levothyroxine. TSH due, ordered today.
4. Hypertension (I10)
Controlled. Refill amlodipine.

Follow-up in 4-6 weeks, sooner if weakness worsens.

Electronically signed by Jessica Dye, APRN, FNP-C
Collaborating Physician: not available on-site | Signed 01/06/2026 11:30 CST`,
      },
    ],
    demoPoints: ['Neuropathy workup', 'Symptom overlap with fibromyalgia'],
  },
  {
    id: 'outpatient-06-caldwell',
    patientName: 'Caldwell, Dorothy',
    age: 78,
    sex: 'F',
    category: 'outpatient',
    referringSpecialty: 'Geriatrics',
    briefDescription: 'Family concerned about progressive memory decline, getting lost, leaving stove on.',
    clinicalHighlight: 'Early dementia (MoCA 18/30)',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '06_Caldwell_Dorothy.pdf',
        path: '/samples/triage/outpatient/06_Caldwell_Dorothy.pdf',
        docType: 'Geriatric Referral',
        previewText: `Commonwealth Geriatric & Internal Medicine
2100 Brownsboro Road, Suite 200, Louisville, KY 40206
Phone: (502) 555-0312 | Fax: (502) 555-0313

Patient: Dorothy Mae Caldwell

Date of Service: 01/16/2026

DOB: 02/14/1940

Provider: Priya Narayan, MD

MRN: CGI-0071882

Specialty: Internal Medicine / Geriatrics

CHIEF COMPLAINT
Annual wellness visit. Daughter present, concerned about memory.

HISTORY OF PRESENT ILLNESS
Mrs. Caldwell is an 85-year-old female presenting for her annual wellness visit. She is accompanied by her daughter, Karen,
who has power of attorney for healthcare. Mrs. Caldwell reports she feels "fine" and does not have specific complaints.
Karen reports increasing concern about her mother's memory over the past 12-18 months. She describes repetitive
questioning, forgetting recent conversations, and difficulty managing her medications (she found pills in the wrong
compartments of her pill organizer several times). Mrs. Caldwell got lost driving to church 2 months ago — a route she has
driven for decades — and a neighbor had to help her home. Her daughter has since been driving her. She also left the stove
on twice in December. Karen states her mother's personality has not changed and she is not agitated or having
hallucinations, but she does seem more withdrawn and less interested in her garden, which she previously loved.
Mrs. Caldwell has been independent in ADLs (bathing, dressing, toileting) but is now needing reminders. IADLs are
declining — Karen has taken over finances, medication management, and cooking. Mrs. Caldwell acknowledges "I forget
things sometimes" but does not seem concerned.
No recent falls, urinary incontinence, gait changes, or new headaches. No depression screening done recently.

PAST MEDICAL HISTORY
Hypertension, Hyperlipidemia, Osteoarthritis (knees, hands), Osteoporosis (on alendronate), GERD, Chronic kidney
disease stage 3a (eGFR 52), Remote history of breast cancer (2005, lumpectomy + radiation, in remission), Hearing loss
(bilateral hearing aids)

CURRENT MEDICATIONS
1. Amlodipine 5 mg daily
2. Losartan 50 mg daily
3. Atorvastatin 20 mg daily
4. Alendronate 70 mg weekly
5. Calcium/Vitamin D 600/400 BID
6. Omeprazole 20 mg daily
7. Acetaminophen 500 mg TID PRN
8. Diphenhydramine 25 mg QHS PRN sleep (per daughter, taking nightly)
9. Lorazepam 0.5 mg PRN anxiety (per daughter, taking 2-3x/week)

COGNITIVE SCREENING
MoCA (administered today): 18/30
Deficits in: delayed recall (0/5), visuospatial/executive (2/5), orientation (4/6). Attention and language relatively preserved.
+1 point for education (high school graduate).
PHQ-2: 1 (daughter answered; patient scored 0, daughter felt score of 1 more accurate). Does not meet threshold for major
depression.
GDS-4: 1/4. Not suggestive of significant depression.

PHYSICAL EXAM
Vitals: BP 128/68 (seated), 118/62 (standing, no symptoms), HR 68, Wt 138 lbs, Ht 5'2"
General: Thin elderly female, well-groomed, pleasant. Hearing aids in place.

Cardiovascular: RRR, grade 2/6 systolic murmur at aortic area (known, stable).
Neuro: Alert, oriented to person and city but not date (said "January something... 2024?"). No focal motor or sensory
deficits. Gait steady with narrow base, no assistive device. No tremor, rigidity, or bradykinesia. Cranial nerves grossly intact.

LABS (01/09/2026)
CBC: normal | BMP: Cr 1.2, eGFR 52, otherwise normal | TSH: 3.1 | B12: 410 | Folate: 14.2 | RPR: nonreactive | Vitamin D:
28 (low-normal) | UA: normal

ASSESSMENT AND PLAN
1. Cognitive decline / suspected early-to-moderate dementia (R41.81)
MoCA 18/30 with deficits in memory, executive function, and orientation, in the context of progressive functional decline
over 12-18 months. Reversible causes screened: TSH, B12, folate, RPR all within normal limits. No depression on
screening. CT head ordered to rule out structural pathology (NPH, SDH, mass).
Referring to Neurology for formal evaluation and consideration of further cognitive testing, possible MRI with volumetrics,
and discussion of cholinesterase inhibitor therapy. Would also appreciate their input on whether amyloid biomarker testing
would be appropriate.
IMPORTANT — Medication changes related to cognition:
- Discontinuing diphenhydramine (high anticholinergic burden, Beers list) — will substitute melatonin 3 mg QHS for sleep
- Tapering lorazepam: 0.25 mg x 2 weeks then discontinue — benzodiazepine use associated with worsened cognition in
elderly; discussed with daughter who is on board
- Counseled family on driving cessation (already implemented)
- Discussed home safety: remove throw rugs, stove knob covers
2. CKD stage 3a (N18.31) — Stable. Continue losartan. Recheck BMP in 6 months.
3. Hypertension — Controlled. Orthostatics negative. Continue current regimen.
4. Osteoporosis — Continue alendronate. DEXA due this year.
5. Polypharmacy — Reviewed medications with daughter. Eliminating Beers list medications as above. Will reassess
omeprazole at next visit (long-term PPI use).
Follow-up in 8 weeks. Sooner if behavioral changes or rapid decline. Provided Alzheimer's Association caregiver resources
to daughter.

Electronically signed by Priya Narayan, MD
Signed 01/16/2026 18:05 EST | CGIM EHR System`,
      },
    ],
    demoPoints: ['Cognitive decline workup', 'Dementia evaluation'],
  },
  {
    id: 'outpatient-07-kowalski',
    patientName: 'Kowalski, Brittany',
    age: 14,
    sex: 'F',
    category: 'outpatient',
    referringSpecialty: 'Pediatrics',
    briefDescription: 'Recurrent headaches with nausea and photophobia in obese teen.',
    clinicalHighlight: 'Migraine +/- IIH concern',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '07_Kowalski_Brittany.pdf',
        path: '/samples/triage/outpatient/07_Kowalski_Brittany.pdf',
        docType: 'Pediatric Referral',
        previewText: `Sycamore Street Family Practice
305 Sycamore St, Terre Haute, IN 47807
Phone: (812) 555-0234 | Fax: (812) 555-0235

Patient: Brittany N. Kowalski

Date of Service: 01/21/2026

DOB: 08/11/1993

Provider: Michael Chen, MD

MRN: SSFP-0028441

Specialty: Family Medicine (2 yrs post-residency)

CHIEF COMPLAINT
Numbness in legs, fatigue, vision was blurry last month.

HPI
32 y/o F, no significant PMH, presents with several weeks of numbness/tingling in both legs below the knees. She also had
an episode of blurry vision in her right eye about 5 weeks ago that lasted ~10 days then mostly resolved — she did not seek
care at that time. Currently reports profound fatigue, worse than her baseline. She is having difficulty at work (she is a
teacher) because her legs feel "heavy." Denies bowel or bladder issues. No back pain. No rash. No recent illness or travel.
She did have a UTI treated with Macrobid about 2 months ago.

EXAM
Vitals: WNL
General: Well-appearing, appears fatigued.
Neuro: Strength 4+/5 bilateral LE, 5/5 UE. Hyperreflexia bilateral LE (3+). Positive Babinski on right. Decreased vibration
sense bilateral feet. Visual acuity 20/25 OD, 20/20 OS. Mild RAPD on right.
Other: Unremarkable.

ASSESSMENT/PLAN
Concerning for demyelinating disease given combination of optic neuritis history, upper motor neuron signs in LE, and
sensory changes. Dissemination in space and time is suggested clinically.
- MRI brain and C/T spine with and without contrast ordered (STAT)
- CBC, CMP, ESR, CRP, ANA, B12, TSH ordered
- Urgent neurology referral placed — requesting expedited appointment
- Told patient to go to ER if she develops worsening weakness, difficulty walking, or bladder retention
- Will call patient when MRI results are available

Electronically signed by Michael Chen, MD
Signed 01/21/2026 12:40 EST`,
      },
    ],
    demoPoints: ['Pediatric headache', 'IIH screening needed'],
  },
  {
    id: 'outpatient-08-sandoval',
    patientName: 'Sandoval, Richard',
    age: 52,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Pulmonology/Sleep',
    briefDescription: 'OSA patient with persistent daytime sleepiness and bilateral leg restlessness at night.',
    clinicalHighlight: 'Restless legs syndrome (low ferritin)',
    expectedTier: 'routine',
    files: [
      {
        filename: '08_Sandoval_Richard.pdf',
        path: '/samples/triage/outpatient/08_Sandoval_Richard.pdf',
        docType: 'Sleep Medicine Referral',
        previewText: `Harmony Integrative Family Medicine
9020 W. Thunderbird Rd, Suite 4, Peoria, AZ 85381
Phone: (623) 555-0471 | Fax: (623) 555-0472

Patient: Richard P. Sandoval

Date of Service: 01/12/2026

DOB: 12/01/1955

Provider: Catherine O'Brien, DO

MRN: HIFM-008293

Specialty: Family Medicine / OMM

CHIEF COMPLAINT
Annual physical exam.

HISTORY OF PRESENT ILLNESS
Mr. Sandoval is a 70-year-old male presenting for his annual physical. Overall he reports feeling well. He has been
maintaining an active lifestyle, playing golf twice a week and walking daily. His wife accompanies him today.
He reports his blood pressure has been well controlled at home, typically running 120s/70s. His blood sugars are in the
prediabetes range — he has been trying to cut carbs. He had a colonoscopy last year that was normal. He is up to date on
his PSA (0.8 last year).
He reports good sleep, good appetite, no depression. He exercises regularly and his weight has been stable. He does report
some bilateral hand tremor that he has noticed over the past 2-3 years. It is worse when he is trying to eat soup or pour
coffee. His golf game has not been affected. His father had a similar tremor. It is getting more noticeable and he is a little
embarrassed by it at restaurants. He has tried reducing caffeine, which helped a little. His wife says she has noticed his
head seems to shake sometimes too.
Otherwise, he reports some mild bilateral knee stiffness in the mornings that resolves with activity. He takes glucosamine
and feels it helps. He denies chest pain, shortness of breath, urinary problems, or bowel changes.

PREVENTIVE CARE
Colonoscopy: 2025, normal. PSA: 0.8 (2025). LDCT lung: not indicated (never smoker). Tdap: 2022. Flu: 10/2025. COVID
booster: 09/2025. Shingrix: completed series 2024. Pneumovax: 2023. Hearing: subjectively normal. Vision: wears readers,
last eye exam 2024.

CURRENT MEDICATIONS
1. Lisinopril 10 mg daily
2. Fish oil 1000 mg daily
3. Vitamin D3 2000 IU daily
4. Glucosamine/chondroitin daily
5. Baby aspirin 81 mg daily (will discuss deprescribing per USPSTF)

PHYSICAL EXAM
Vitals: BP 124/72, HR 66, Temp 98.4, Wt 189 lbs, Ht 5'10", BMI 27.1
General: Well-developed, well-nourished male. Appears younger than stated age.
HEENT: PERRL, EOMI, TMs clear. Mild head titubation noted.
Neck: No thyromegaly, no LAD.
Cardiovascular: RRR, no murmurs. No carotid bruits.
Lungs: CTA bilaterally.
Abdomen: Soft, NT, ND. No masses.
MSK: Bilateral knee crepitus, full ROM. OMM: somatic dysfunction T4-T8, treated with muscle energy. Mild sacral torsion
corrected.
Neuro: Action tremor bilateral hands, right greater than left, 4-6 Hz. Tremor increases with intention (finger-to-nose). Mild
head tremor (yes-yes pattern). No resting tremor. No rigidity, no bradykinesia. Gait normal. Tandem gait normal. Writing
sample obtained — shows moderate tremor affecting legibility.
DRE: Prostate smooth, no nodules, normal size. Guaiac negative.

LABS ORDERED TODAY
CBC, CMP, Lipid panel, TSH, Free T4, Fasting glucose, A1c, Vitamin D, PSA

ASSESSMENT AND PLAN
1. Essential tremor, progressive (G25.0)
Bilateral action tremor with family history, no features of parkinsonism. Getting worse over 2-3 years, now affecting eating
and writing. Head tremor also present. Reduced caffeine with minimal benefit. Could consider propranolol trial, but given
progression and impact on function, referring to Neurology for confirmation and treatment optimization. Patient interested in
learning about all options.
2. Prediabetes (R73.03)
Continue dietary modifications. A1c today. If >6.0, will start metformin discussion.
3. Hypertension, controlled (I10)
Continue lisinopril. Excellent home readings.
4. Osteoarthritis, bilateral knees (M17.0)
Mild, activity responsive. Continue glucosamine. Consider OMM for hip/knee biomechanics.
5. Aspirin deprescribing
Per updated USPSTF, primary prevention aspirin no longer recommended for his age group. Discussed discontinuation.
Patient agreeable. Will stop aspirin.
6. Somatic dysfunction, thoracic (M99.02)
Treated today with muscle energy technique. Improved post-treatment.
Follow-up in 6 months or after neurology evaluation.

Electronically signed by Catherine O'Brien, DO
Signed 01/12/2026 17:20 MST | Harmony EHR`,
      },
    ],
    demoPoints: ['Sleep disorder referral', 'RLS recognition'],
  },
  {
    id: 'outpatient-09-washington',
    patientName: 'Washington, Eugene',
    age: 71,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Family Medicine',
    briefDescription: 'Wife reports dream-enacting behavior with punching/kicking during sleep, anosmia.',
    clinicalHighlight: 'REM sleep behavior disorder (prodromal neurodegeneration)',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '09_Washington_Eugene.pdf',
        path: '/samples/triage/outpatient/09_Washington_Eugene.pdf',
        docType: 'PCP Referral',
        previewText: `Midtown Medical Associates
1400 Peachtree St NE, Suite 500, Atlanta, GA 30309
Phone: (404) 555-0588 | Fax: (404) 555-0589

Patient: Eugene L. Washington

Date of Service: 01/15/2026

DOB: 07/22/1953

Provider: Samuel K. Abernathy, MD, FACP

MRN: MMA-0055120

Specialty: Internal Medicine

CHIEF COMPLAINT
Follow-up CHF, diabetes, blood pressure. Also had a funny spell.

HISTORY OF PRESENT ILLNESS
Mr. Washington is a 72-year-old African American male with extensive medical history including HFrEF (EF 35%), type 2
diabetes on insulin, hypertension, atrial fibrillation on Eliquis, CKD stage 3b, and COPD. He presents for scheduled
follow-up.
He reports his breathing has been stable. He can walk about one block before getting short of breath, which is his baseline.
He weighs himself daily and his weight has been stable around 220 lbs. He is checking his blood sugars — morning
readings are 140-190. He reports compliance with his medications. He uses his inhalers as prescribed. He is sleeping on
two pillows, no change.
He ran out of Eliquis for about 5 days earlier this month because of a prior authorization issue. He restarted it 4 days ago.
When specifically asked about any new concerns, he mentions a 'funny spell' about 10 days ago (during the time he was off
Eliquis). He was eating breakfast and suddenly his right hand went numb and he could not hold his fork. His wife said his
face looked droopy on the right side. He also had trouble getting words out. The episode lasted approximately 15-20
minutes and then completely resolved. He did not seek medical attention because 'it went away.' He has not had
recurrence. He denies headache, vision changes, or weakness since then.

CURRENT MEDICATIONS
1. Carvedilol 25 mg BID
2. Sacubitril/valsartan 49/51 mg BID
3. Spironolactone 25 mg daily
4. Furosemide 40 mg daily
5. Apixaban 5 mg BID (restarted 4 days ago)
6. Insulin glargine 28 units QHS
7. Insulin lispro sliding scale with meals
8. Metformin 500 mg BID
9. Empagliflozin 10 mg daily
10. Atorvastatin 80 mg daily
11. Tiotropium 18 mcg inhaled daily
12. Albuterol MDI PRN
13. Potassium chloride 20 mEq daily

PHYSICAL EXAM
Vitals: BP 142/88, HR 78 (irregular), Temp 98.2, Wt 221 lbs, O2 sat 94% RA
General: Chronically ill-appearing male, no acute distress.
Cardiovascular: Irregularly irregular rhythm. Grade 2/6 systolic murmur at apex. JVP 8 cm. Trace bilateral pedal edema,
improved from prior.
Lungs: Bibasilar crackles, mild. No wheezes today.
Neuro: Alert, oriented x3. Face symmetric today. Speech fluent, no dysarthria. Motor 5/5 all extremities. No drift. Sensation
intact.

ASSESSMENT AND PLAN

1. HFrEF, NYHA Class II-III, stable (I50.22)
Weight stable, trace edema improved. Continue sacubitril/valsartan, carvedilol, spironolactone, furosemide, empagliflozin.
BMP today — monitor K and Cr.
2. Atrial fibrillation (I48.91)
Rate controlled today. Eliquis gap is very concerning in the context below.
3. Probable TIA (G45.9)
Episode of acute-onset right facial droop, right hand numbness, and expressive language difficulty lasting 15-20 minutes
with complete resolution — classic TIA presentation. This occurred while off anticoagulation for 5 days in the setting of atrial
fibrillation (CHA2DS2-VASc score = 5). Normal neuro exam today. HOWEVER, this requires urgent workup.
- Stat CT head ordered today (done in office — no acute hemorrhage or large territory infarct)
- Urgent Neurology referral placed — requesting appointment within 1 week
- MRI brain with DWI, MRA head and neck ordered
- Carotid duplex ultrasound ordered
- Emphasized to patient and wife the critical importance of not missing ANY doses of Eliquis. Provided 2-week bridge supply
from office samples
- If any recurrent symptoms, call 911 immediately
4. Type 2 DM on insulin (E11.65)
A1c pending. Fasting sugars elevated. May need glargine uptitration. Await A1c.
5. CKD 3b (N18.32)
Cr 1.8, eGFR 38 last check. Recheck today. Monitor with diuretic and SGLT2i.
6. Hypertension, suboptimal (I10)
BP 142/88 today. At goal <130/80 given comorbidities, we are above target. However, not adjusting today given fluid status.
Will reassess.
Follow-up in 2 weeks. Urgent neurology within 1 week.

Electronically signed by Samuel K. Abernathy, MD, FACP
Signed 01/15/2026 16:30 EST | Midtown Medical EHR`,
      },
    ],
    demoPoints: ['Prodromal neurodegenerative disease', 'RBD recognition'],
  },
  {
    id: 'outpatient-10-delgado',
    patientName: 'Delgado, Rosa',
    age: 45,
    sex: 'F',
    category: 'outpatient',
    referringSpecialty: 'Endocrinology',
    briefDescription: 'Graves disease follow-up with persistent tremor, diplopia, and balance issues despite normal thyroid.',
    clinicalHighlight: 'Neurologic symptoms beyond thyroid disease',
    expectedTier: 'semi_urgent',
    files: [
      {
        filename: '10_Delgado_Rosa.pdf',
        path: '/samples/triage/outpatient/10_Delgado_Rosa.pdf',
        docType: 'Endocrinology Referral',
        previewText: `Esperanza Community Health Center
2850 W. Cermak Rd, Chicago, IL 60623
Phone: (773) 555-0661 | Fax: (773) 555-0662

Patient: Rosa M. Delgado

Date of Service: 01/20/2026

DOB: 03/08/1970

Provider: Maria Santos, APRN, ANP-BC

MRN: ECH-0099203

Credentials: Adult Nurse Practitioner

CHIEF COMPLAINT
Hand numbness, dropping things. (Visit conducted with Spanish medical interpreter, ID #4417.)

HISTORY OF PRESENT ILLNESS
Ms. Delgado is a 55-year-old Spanish-speaking female who works as a housekeeper at a hotel. She presents with
numbness and tingling in both hands for the past 6 months, gradually worsening. She says she wakes up at night with numb
hands and has to shake them out. She has been dropping things — dishes at work, her phone. She reports the numbness is
mostly in the thumb, index, and middle fingers of both hands. She also notes some neck pain radiating to her shoulders that
has been present for about a year. She has been taking ibuprofen for this.
On further questioning, she also reports that her legs have been feeling stiff and she has trouble walking fast. She says her
balance is not as good as it used to be. She tripped going up stairs last week. She also notes an electric shock sensation
that goes down her back and into her legs when she bends her neck forward. She has not mentioned this to anyone before
because she thought it was normal aging.
She reports no bowel or bladder problems. No history of trauma. No fevers or weight loss. She has diabetes and
hypertension. She does not have a regular doctor and comes to this clinic as needed. She has not seen a doctor in about a
year.

PAST MEDICAL HISTORY
Type 2 Diabetes (last A1c unknown, not monitored regularly), Hypertension, Obesity

CURRENT MEDICATIONS
1. Metformin 500 mg BID (reports taking inconsistently)
2. Lisinopril 20 mg daily
3. Ibuprofen 600 mg TID PRN

SOCIAL HISTORY
Born in Mexico, in US for 20 years. Works full time as hotel housekeeper — repetitive hand motions, lifting. Lives with
husband and two adult children. No tobacco, rare alcohol. No insurance (sliding-scale patient). Primary language: Spanish.

PHYSICAL EXAM
Vitals: BP 152/94, HR 80, Wt 198 lbs, Ht 5'3", BMI 35.1
General: Obese female, cooperative, communicating through interpreter.
Neck: Limited ROM in extension and lateral flexion. Tenderness over posterior cervical paraspinals. Positive Spurling's on
right.
Upper extremities: Positive Tinel's bilateral wrists. Positive Phalen's bilateral. Thenar atrophy bilateral, right worse than
left. Grip strength reduced bilaterally. Sensation decreased in median nerve distribution bilateral hands.
Lower extremities: Spastic catch in bilateral hamstrings. Hyperreflexia bilateral LE (3+). Positive Babinski bilateral. Positive
Hoffman's sign bilateral. Gait wide-based and mildly spastic. Heel-to-toe walking impaired.
Special: Positive Lhermitte's sign (electric sensation down spine with neck flexion).

ASSESSMENT AND PLAN
1. Bilateral carpal tunnel syndrome (G56.03)
Classic symptoms with positive provocative testing and thenar atrophy. Likely related to occupational repetitive use. Will
provide bilateral wrist splints for nighttime use.

2. Cervical myelopathy (M47.12)
This is the more concerning finding. Patient has upper motor neuron signs in bilateral lower extremities (hyperreflexia,
Babinski, Hoffman's, spastic gait) with positive Lhermitte's sign, in the setting of neck pain and limited cervical ROM. This
suggests cervical spinal cord compression and is potentially a surgical issue.
- URGENT MRI cervical spine ordered (coordinating with radiology for charity care pricing)
- URGENT Neurology referral — requesting expedited evaluation
- Counseled patient (via interpreter) that this is a serious condition that needs prompt evaluation, and that she should go to
the ER if she develops weakness in legs, difficulty walking, or loss of bowel/bladder control
- Provided work restrictions letter: no heavy lifting, no repetitive overhead work until further evaluation
- Social work consulted for financial assistance with MRI and specialist visit
3. Type 2 DM, unmonitored (E11.65)
A1c, BMP, lipid panel, urine microalbumin ordered. Increase metformin to 1000 mg BID if renal function allows. Diabetic
education referral (Spanish-speaking educator).
4. Hypertension, uncontrolled (I10)
BP 152/94. Increase lisinopril to 40 mg. Add HCTZ 12.5 mg if still elevated at follow-up.
5. NSAID overuse
Taking ibuprofen TID chronically — risk of GI bleed, renal injury especially with DM and HTN. Counseled to stop ibuprofen.
Provided acetaminophen as alternative.
Follow-up in 2 weeks for lab results and to check on MRI/neuro scheduling. Interpreter services arranged for all future visits.

Electronically signed by Maria Santos, APRN, ANP-BC
Collaborating Physician: James Liu, MD | Signed 01/20/2026 15:45 CST | Esperanza EHR`,
      },
    ],
    demoPoints: ['Cross-specialty diagnostic puzzle', 'Thyroid-neuro overlap'],
  },
  {
    id: 'cross-01-thornton',
    patientName: 'Thornton, James',
    age: 68,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Orthopedics',
    briefDescription: 'Shoulder MRI incidentally revealed cervical cord signal abnormality with bilateral hand clumsiness.',
    clinicalHighlight: 'Cervical myelopathy (incidental finding)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '01_Thornton_James.pdf',
        path: '/samples/triage/cross-specialty/01_Thornton_James.pdf',
        docType: 'Orthopedic Referral',
        previewText: `Southwest Orthopedic & Spine Associates
7200 E. Camelback Rd, Suite 104, Scottsdale, AZ 85251
Phone: (480) 555-0310 | Fax: (480) 555-0311

Patient: James R. Thornton

Date: 01/23/2026

DOB: 03/14/1957

Provider: David Park, MD

MRN: SOSA-0038821

Specialty: Orthopedic Surgery

CHIEF COMPLAINT
Right shoulder pain and weakness — follow-up after MRI shoulder.

HISTORY OF PRESENT ILLNESS
Mr. Thornton is a 68-year-old male who presents for review of right shoulder MRI obtained after 4 months of right shoulder
pain with overhead weakness. He is an avid golfer and reports difficulty with his backswing. Pain is 5/10, worse with
abduction. He has tried physical therapy with partial improvement. He denies any neck pain.
MRI right shoulder (01/10/2026) shows a full-thickness supraspinatus tear, moderate acromioclavicular joint arthropathy,
and mild long head biceps tendinopathy — findings discussed with patient and consistent with his symptoms.
However, I note that the MRI report addendum also flags incidental findings on the scout sequences: 'Signal abnormality
within the cervical cord at C4-C5 level is partially visualized on localizer sequences and warrants dedicated cervical spine
MRI.' I reviewed the images myself and agree — there appears to be T2 signal change within the cord. On further
questioning, Mr. Thornton does admit to some bilateral hand clumsiness over the past 8-10 months (difficulty with buttons,
dropping things). He attributed this to arthritis. He also endorses occasional bilateral leg stiffness when walking longer
distances. He has not had a fall but reports 'my legs feel heavier than they used to.'

PHYSICAL EXAM
Shoulder: Right shoulder — limited active abduction to 90 degrees, painful arc. Positive Neer and Hawkins. Supraspinatus
weakness 3+/5 on right. AC joint tender.
Cervical Spine: Limited extension. Mild bilateral upper extremity hyperreflexia (3+). Positive Hoffmann's sign bilateral. Grip
strength mildly reduced bilaterally. Intrinsic hand muscle bulk appears slightly diminished right hand.
Lower Extremities: Bilateral patellar reflexes 3+, ankle reflexes 2+. Mild spasticity in bilateral hamstrings. Gait slightly
broad-based.

ASSESSMENT AND PLAN
1. Full-thickness right supraspinatus tear (M75.121)
Surgical candidate — will schedule right shoulder arthroscopy and rotator cuff repair. Pre-op workup ordered. However, I
am deferring shoulder surgery until cervical spine pathology is evaluated, as myelopathy must be assessed and may affect
anesthesia positioning and surgical urgency.
2. Suspected cervical myelopathy — INCIDENTAL FINDING (M47.12)
This was not the reason for today's visit but cannot be ignored. Cord signal change on localizer sequences, bilateral upper
motor neuron signs, progressive hand clumsiness, and lower extremity spasticity are all consistent with cervical cord
compression. Ordering dedicated MRI cervical spine with and without contrast as urgent study. Referring to Neurology for
evaluation prior to any surgical planning. Also notifying spine surgery colleague Dr. Reyes for potential co-management.
Patient counseled on the importance of this finding. Told to avoid contact sports, heavy lifting, and any activity with risk of
cervical hyperextension until evaluated. Warned that a fall or trauma could be catastrophic. Patient expressed surprise —
he was not expecting this today.

Electronically signed by: David Park, MD
Signed 01/23/2026 15:44 MST | Southwest Ortho EHR`,
      },
    ],
    demoPoints: ['Incidental finding on unrelated imaging', 'Myelopathy recognition'],
  },
  {
    id: 'cross-02-vasquez',
    patientName: 'Vasquez, Isabel',
    age: 34,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'Rheumatology',
    briefDescription: 'SLE patient with new-onset seizure, headaches, word-finding difficulty, and visual phenomena.',
    clinicalHighlight: 'CNS lupus (cerebral vasculitis)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '02_Vasquez_Isabel.pdf',
        path: '/samples/triage/cross-specialty/02_Vasquez_Isabel.pdf',
        docType: 'Rheumatology Referral',
        previewText: `Pinebrook Behavioral Health & Psychiatry
1402 Oak Park Ave, Suite 3B, Oak Park, IL 60302
Phone: (708) 555-0182 | Fax: (708) 555-0183

Patient: Isabel M. Vasquez

Date: 01/26/2026

DOB: 07/29/1991

Provider: Carolyn Freed, MD

MRN: PBH-0017743

Specialty: Psychiatry

CHIEF COMPLAINT
Established patient follow-up. Ongoing 'spells.'

HISTORY OF PRESENT ILLNESS
Ms. Vasquez is a 34-year-old female with a psychiatric history significant for major depressive disorder (in partial remission
on sertraline), childhood trauma, and a history of somatization. She has been my patient for 3 years. She returns today
continuing to report episodic spells that began approximately 7 months ago.
The spells involve sudden onset of bilateral leg weakness — she describes her legs 'just giving out' — associated with
unresponsiveness lasting 2-8 minutes, followed by prolonged fatigue. During spells, her eyes are sometimes closed,
sometimes open and deviated. Her boyfriend reports the episodes look 'like a seizure' but she has no tongue biting, no
incontinence, and recovers talking immediately after. She has had approximately 14 such events since June.
She was seen in the ED twice. Both times CT head was normal, basic labs normal. She was told 'it might be seizures' and
referred to neurology, but she cancelled that appointment because she 'didn't think it was her brain.' She is convinced she
has a 'heart problem' or 'blood sugar issue.' Glucometer readings during two spells documented by boyfriend were 94 and
107.
She has had increased stressors: relationship conflict, financial strain, and the anniversary of a significant trauma occurring
in July. PHQ-9 today: 14 (moderate depression). GAD-7: 11. She endorses dissociative symptoms — 'checking out' and
feeling 'not in her body' at times of high stress.
From a clinical standpoint, the semiology — prolonged course, eyes closed during events, immediate full recall afterward,
ictal crying noted once, waxing/waning course correlating with stressors — is most consistent with functional neurological
symptom disorder / psychogenic non-epileptic spells (PNES). I have discussed this framework with her before with limited
acceptance.

MENTAL STATUS EXAM
Alert, cooperative. Appears mildly distressed. Mood 'stressed.' Affect constricted. Speech normal rate/rhythm. Thought
process linear. No psychosis. No SI/HI. Insight limited — does not connect spells to psychological stressors. Judgment fair.

ASSESSMENT AND PLAN
1. Major depressive disorder, moderate recurrence (F32.1)
Increase sertraline from 100 mg to 150 mg daily. Schedule therapy — patient agreeable to return to CBT. Discussed
trauma-focused therapy as longer-term goal.
2. Functional neurological symptom disorder / suspected PNES (F44.5)
Clinical presentation strongly suggests PNES in the context of MDD, trauma history, and dissociative symptoms. However, I
am re-referring to Neurology to complete workup including video EEG monitoring during a typical event, which I have
explained to her as 'making sure we have the full picture' rather than leading with the psychiatric framing, which she has
previously rejected. The goal is to obtain EEG documentation of a spell and formally exclude epilepsy — both to complete
the diagnostic workup and to allow us to engage her more meaningfully in treatment. Referral placed with note to Neurology
explaining the clinical context and requesting outpatient video-EEG rather than empiric antiepileptic therapy.
I will continue to manage the psychiatric component regardless of neurology's findings. Discussed with patient that the
spells and her mental health are both real and both worth treating — she was somewhat receptive today.

3. Generalized anxiety disorder (F41.1)
Sertraline increase may help. Continue current PRN approach; no benzodiazepines given risk in this patient. Discussed
diaphragmatic breathing exercises.

Electronically signed by: Carolyn Freed, MD
Signed 01/26/2026 17:30 CST | Pinebrook BH EHR | cc: patient PCP Dr. Amos Singh`,
      },
    ],
    demoPoints: ['Neuroimmunology referral', 'CNS lupus presentation'],
  },
  {
    id: 'cross-03-mcallister',
    patientName: 'McAllister, Robert',
    age: 72,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Cardiology',
    briefDescription: 'AFib patient with recurrent transient confusion/word-finding difficulty despite anticoagulation.',
    clinicalHighlight: 'TIAs despite anticoagulation',
    expectedTier: 'urgent',
    files: [
      {
        filename: '03_McAllister_Robert.pdf',
        path: '/samples/triage/cross-specialty/03_McAllister_Robert.pdf',
        docType: 'Cardiology Referral',
        previewText: `Heartland Cardiovascular Consultants
3300 N. Knoxville Ave, Suite 200, Peoria, IL 61604
Phone: (309) 555-0441 | Fax: (309) 555-0442

Patient: Robert G. McAllister

Date: 01/20/2026

DOB: 11/08/1958

Provider: Nadia Okonkwo, MD, FACC

MRN: HCC-0029301

Specialty: Cardiovascular Disease

CHIEF COMPLAINT
Three syncopal episodes over the past 5 months.

HISTORY OF PRESENT ILLNESS
Mr. McAllister is a 67-year-old male with known coronary artery disease (2-vessel CABG 2018), hypertension, and type 2
diabetes referred by his PCP for evaluation of recurrent syncope. He has had three witnessed loss-of-consciousness
episodes:
Episode 1 (August 2025): Occurred after prolonged standing at a family cookout on a hot day. He felt lightheaded and
nauseated, then lost consciousness for approximately 30 seconds. Wife noted he was pale and limp. No shaking.
Recovered quickly, felt tired. Did not seek care.
Episode 2 (October 2025): Occurred while urinating in the middle of the night. He felt dizzy, sat down on the toilet, then
'blacked out.' No witnesses. Was found on the bathroom floor by wife; unclear duration, was confused briefly afterward.
Episode 3 (January 2026): Occurred during church — had been standing for about 20 minutes. He went pale, collapsed,
and his wife states he had 'a few jerks of his arms' for about 10-15 seconds before going limp. He had no tongue bite, no
incontinence. He was fully oriented within 2 minutes. EMS was called; blood glucose 118, BP 90/60 on scene, ECG showed
sinus bradycardia at 46 bpm. He was not transported.
He denies chest pain or palpitations prior to any of the episodes. He does note a prodrome of warmth, nausea, and tunnel
vision in episodes 1 and 3. He takes metoprolol succinate 100 mg daily, lisinopril 20 mg, atorvastatin 80 mg, aspirin 81 mg,
metformin 1000 mg BID, and amlodipine 5 mg.

PHYSICAL EXAM
Vitals: BP 134/80 seated, 118/74 standing (no symptoms), HR 58, RR 14
General: Well-appearing male, no acute distress.
Cardiovascular: Bradycardic, regular rhythm. No murmurs, rubs, or gallops. No carotid bruits. No JVD. No peripheral
edema.
Neuro: Alert, oriented x4. No focal deficits.

RESULTS
ECG today: Sinus bradycardia, HR 54. First-degree AV block (PR 218 ms). No acute ischemic changes. No QTc
prolongation (QTc 412 ms).
Echo (01/15/2026): EF 50-55%, mildly impaired relaxation, no wall motion abnormalities, no significant valvular disease.
Holter monitor (worn 72 hrs, 12/2025): Sinus bradycardia with HR nadir 38 bpm at night. Two pauses of 2.1 and 2.4
seconds. No high-degree block captured.

ASSESSMENT AND PLAN
1. Recurrent syncope — vasovagal vs. cardiogenic (R55)
The first two episodes have classic vasovagal features: triggers (prolonged standing, heat, micturition), prodrome, and quick
recovery. The third episode with brief myoclonic jerks and on-scene bradycardia of 46 is more ambiguous — brief
convulsive activity can occur with any syncope due to cerebral hypoperfusion and does not indicate epilepsy. However, I
cannot exclude a primary cardiac arrhythmia, particularly given his CAD history, baseline bradycardia, and 2.4-second
pauses on Holter.
Plan: Implantable loop recorder (ILR) discussed and patient consents — scheduling implantation within 2 weeks for

long-term cardiac rhythm monitoring. Reduce metoprolol to 50 mg daily given significant bradycardia. Orthostatic
precautions and hydration counseling provided. No driving until further evaluation completed.
2. Neurology referral
I am also placing a neurology referral regarding episode 3. Although I believe the convulsive movements most likely
represent anoxic myoclonus from syncope, the brief postictal confusion and the atypical features warrant formal
neurological evaluation to rule out a seizure disorder, particularly given his post-CABG status and history of possible
cerebral emboli. I am asking Neurology to evaluate and would request an outpatient EEG if they feel it is warranted.
3. Coronary artery disease, stable (I25.10)
Continue aspirin and statin. Annual nuclear stress test due — will order.

Electronically signed by: Nadia Okonkwo, MD, FACC
Signed 01/20/2026 14:55 CST | Heartland CV EHR`,
      },
    ],
    demoPoints: ['Cardiology-to-neurology referral', 'Breakthrough events on anticoagulation'],
  },
  {
    id: 'cross-04-patel',
    patientName: 'Patel, Anita',
    age: 58,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'Oncology',
    briefDescription: 'Breast cancer patient on chemo with neuropathy plus new facial droop and arm weakness.',
    clinicalHighlight: 'Possible brain metastases vs leptomeningeal disease',
    expectedTier: 'urgent',
    files: [
      {
        filename: '04_Patel_Anita.pdf',
        path: '/samples/triage/cross-specialty/04_Patel_Anita.pdf',
        docType: 'Oncology Referral',
        previewText: `Great Lakes ENT & Audiology
900 Medical Campus Dr, Suite 12, Ann Arbor, MI 48109
Phone: (734) 555-0267 | Fax: (734) 555-0268

Patient: Anita J. Patel

Date: 01/22/2026

DOB: 08/04/1965

Provider: Harrison Wolfe, MD

MRN: GLEN-0053019

Specialty: Otolaryngology – Head & Neck Surgery

CHIEF COMPLAINT
Episodic dizziness and spinning, worse with position changes. x 3 weeks.

HISTORY OF PRESENT ILLNESS
Ms. Patel is a 60-year-old female with no significant neurological history who presents with episodic vertigo for the past 3
weeks. She describes sudden onset of a spinning sensation when she rolls over in bed, especially turning to the right, or
when she tips her head back to look up (e.g., reaching into an overhead cabinet). Episodes last approximately 20-40
seconds and then fully resolve. She has had no continuous dizziness between episodes. No hearing loss, no tinnitus, no ear
fullness. No nausea severe enough to vomit. No headache. No diplopia, dysarthria, dysphagia, or focal weakness. No prior
episodes. She did have a minor cold about 4 weeks ago that has fully resolved.
She has extensively Googled her symptoms and is convinced she has had 'mini-strokes.' Her sister had a stroke 2 years
ago, which has heightened her anxiety. She has been avoiding all movement out of fear and has not driven in 2 weeks.

PHYSICAL EXAM
Vitals: BP 126/80, HR 74, normal
Otoscopy: Bilateral TMs intact, no effusion, no perforation. EACs clear.
HEENT: No nystagmus in primary gaze. EOMI without corrective saccades or limitation. Hearing grossly intact bilateral (512
Hz fork). No facial asymmetry.
Dix-Hallpike Test:
- Right Dix-Hallpike: POSITIVE. Upbeat-torsional nystagmus with 4-second latency, lasting approximately 18 seconds,
fatigable on repeat. Patient reported intense vertigo.
- Left Dix-Hallpike: Negative.
Head Impulse Test: Normal (no corrective saccade — negative, as expected in BPPV).
Romberg: Negative. Gait normal.

TREATMENT
Epley canalith repositioning maneuver performed for right posterior canal BPPV. Patient experienced vertigo and
nystagmus during maneuver, confirming diagnosis. Post-maneuver: Dix-Hallpike right — NEGATIVE. Patient reports
significant improvement in dizziness. Instructed to sleep semi-recumbent for 48 hours, avoid lying on right side for 1 week.
Home Brandt-Daroff exercises demonstrated and handout provided.

ASSESSMENT AND PLAN
1. Benign paroxysmal positional vertigo, right posterior semicircular canal (H81.11)
Classic history, positive Dix-Hallpike with characteristic upbeat-torsional fatigable nystagmus, normal head impulse test, and
immediate response to Epley maneuver. This is entirely consistent with peripheral vestibular pathology — specifically
canalith displacement in the right posterior semicircular canal. There are no features of central vertigo: no
direction-changing nystagmus, no neurological symptoms or signs, normal head impulse test, and fatigable nystagmus.
Reassured patient that this is not a stroke.
Return to clinic in 2 weeks to confirm resolution. If symptoms recur, repeat Epley can be performed at home or in office.
Approximately 50% of BPPV resolves within 4 weeks; recurrence rate approximately 15% per year.
2. Neurology referral — patient request
Despite thorough explanation of the diagnosis and reassurance, Ms. Patel remains anxious about the possibility of a stroke
and is requesting a neurology opinion and brain MRI. I have explained that based on the clinical presentation, central
pathology is extremely unlikely and imaging is not indicated by current guidelines (AAN/AAO). However, given her

significant anxiety, family history of stroke, and the impact on her daily function, I am placing a neurology referral at her
request. I have communicated to the referring neurologist that my clinical assessment is BPPV, treated successfully today,
and that imaging is being requested for reassurance rather than clinical suspicion.
Meclizine 12.5 mg PRN prescribed for symptomatic relief during any recurrent episodes (advised to use sparingly as it may
impair vestibular compensation).

Electronically signed by: Harrison Wolfe, MD
Signed 01/22/2026 12:15 EST | Great Lakes ENT EHR`,
      },
    ],
    demoPoints: ['Neuro-oncology urgency', 'Symptoms beyond CIPN'],
  },
  {
    id: 'cross-05-kowalczyk',
    patientName: 'Kowalczyk, Stefan',
    age: 67,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Gastroenterology',
    briefDescription: 'Crohn patient on infliximab with progressive bilateral leg weakness and areflexia.',
    clinicalHighlight: 'CIDP vs GBS variant (anti-TNF related)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '05_Kowalczyk_Stefan.pdf',
        path: '/samples/triage/cross-specialty/05_Kowalczyk_Stefan.pdf',
        docType: 'GI Referral',
        previewText: `Tri-State Occupational Medicine
215 Industrial Pkwy, Suite 100, Youngstown, OH 44505
Phone: (330) 555-0378 | Fax: (330) 555-0379

Patient: Stefan R. Kowalczyk

Date: 01/19/2026

DOB: 06/17/1974

Provider: Renee Gallagher, MD, MPH

MRN: TSOM-0061142

Specialty: Occupational & Environmental Medicine

CHIEF COMPLAINT
Worker's compensation IME / evaluation — bilateral upper and lower extremity numbness. Referred by employer's WC
carrier.

HISTORY OF PRESENT ILLNESS
Mr. Kowalczyk is a 51-year-old male who has worked for 18 years as a heavy equipment operator and assembly line
supervisor at a steel fabrication plant. He filed a workers' compensation claim 6 months ago for bilateral hand numbness
and tingling, with a claim that the condition is work-related. He was placed on modified duty 3 months ago and is currently
off work pending this evaluation.
He reports numbness and tingling in both hands — predominantly in the thumb, index, and middle fingers bilaterally.
Symptoms are worse at night and with prolonged gripping of equipment controls. He also reports fatigue and bilateral leg
heaviness that he says began around the same time. His treating physician (his PCP, Dr. Yost) diagnosed bilateral carpal
tunnel syndrome and ordered nerve conduction studies, which Mr. Kowalczyk states showed 'abnormal results' — he does
not have the report with him today.
The WC carrier has specifically requested that this evaluation address 'whether the claimant's symptoms could represent
multiple sclerosis or other neurological disease ' rather than an occupational injury.' This request was made after Mr.
Kowalczyk's attorney mentioned MS as a possible diagnosis. The employer is arguing the condition is pre-existing and not
work-related.
He denies any vision changes, diplopia, bladder dysfunction, gait problems, fatigue beyond the norm, heat sensitivity, or
prior neurological symptoms. He has no family history of neurological disease. He does not smoke and drinks socially. He
has hypertension and takes lisinopril.

PHYSICAL EXAM
Vitals: BP 140/88, HR 76, Wt 224 lbs
General: Well-developed male, cooperative, appeared somewhat guarded.
Upper extremities: Bilateral positive Tinel's at wrists. Positive Phalen's bilaterally. Mild thenar flattening right hand, left
WNL. Grip strength mildly reduced bilaterally by dynamometer (right 38 kg, left 41 kg; normal >45 kg). Sensation reduced in
median nerve distribution bilaterally to monofilament. Sensation normal in ulnar and radial distributions.
Lower extremities: Strength 5/5 bilaterally. Sensation intact. Reflexes 2+ symmetric. No Babinski. Gait normal. No ataxia.
Romberg negative.
Cervical Spine: Full ROM, no radicular symptoms with Spurling's test.
Cranial nerves: II-XII intact. No RAPD. No internuclear ophthalmoplegia.

ASSESSMENT AND PLAN
1. Bilateral carpal tunnel syndrome (G56.03)
Clinical presentation is fully consistent with bilateral CTS: classic median nerve distribution symptoms, positive provocative
testing, thenar atrophy on the right, and occupation involving prolonged vibratory tool use and repetitive grip — all are
well-established risk factors for CTS and support occupational causation. I will obtain the prior NCS report from Dr. Yost's
office to confirm electrodiagnostic findings.
2. Multiple sclerosis — NOT supported (addressed per WC carrier request)
There are no clinical features to suggest MS in this patient. His neurological examination outside of the median nerve
distribution is entirely normal: no upper motor neuron signs, no optic nerve or cerebellar findings, no bowel/bladder
dysfunction, no history consistent with relapsing-remitting neurological events. The focal, bilateral median-nerve-distribution

sensory loss without any CNS findings is not a presentation of MS. The 'leg heaviness' he describes is non-specific and his
lower extremity exam is completely normal.
That said, in the interest of completeness for the WC process, I am placing a neurology referral for formal evaluation and
repeat NCS/EMG by a board-certified neurologist. This will formally document the electrodiagnostic findings and provide an
independent neurological opinion on whether systemic neurological disease is present. I do not expect this evaluation to
reveal MS or any condition other than bilateral CTS.
3. Occupational causation opinion
Based on available information, the bilateral CTS is consistent with workplace exposure to vibratory tools and repetitive
gripping over 18 years. This is my preliminary assessment pending the neurology evaluation and review of prior NCS.

Electronically signed by: Renee Gallagher, MD, MPH
Signed 01/19/2026 16:10 EST | TSOM Case Management System | WC Claim #OH-2025-44871`,
      },
    ],
    demoPoints: ['Drug-induced neuropathy', 'CIDP recognition'],
  },
  {
    id: 'cross-06-barnes',
    patientName: 'Barnes, Christine',
    age: 41,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'Psychiatry',
    briefDescription: 'Treatment-resistant depression with involuntary lip smacking, tongue protrusion, jaw movements.',
    clinicalHighlight: 'Tardive dyskinesia from perphenazine',
    expectedTier: 'semi_urgent',
    files: [
      {
        filename: '06_Barnes_Christine.pdf',
        path: '/samples/triage/cross-specialty/06_Barnes_Christine.pdf',
        docType: 'Psychiatry Referral',
        previewText: `Advanced Pain & Spine Center
8840 Prominence Pkwy, Suite 105, Jacksonville, FL 32256
Phone: (904) 555-0293 | Fax: (904) 555-0294

Patient: Christine A. Barnes

Date: 01/28/2026

DOB: 04/02/1969

Provider: Marcus Yee, MD

MRN: APSC-0033774

Specialty: Interventional Pain Management

CHIEF COMPLAINT
Right upper extremity burning pain, allodynia — follow-up.

HISTORY OF PRESENT ILLNESS
Ms. Barnes is a 56-year-old female who initially presented 14 months ago following a right wrist fracture (distal radius)
sustained in a fall. She underwent ORIF by Dr. Kaminsky in November 2024. Postoperatively she developed
disproportionate, burning pain in the right hand and forearm — far exceeding what would be expected from the surgical
recovery. Over the following months she developed allodynia (light touch intolerable), color changes (right hand appears
mottled, purplish at times, pale at others), temperature asymmetry (right hand cooler by 2-3°C on infrared thermometry),
and edema of the right hand and fingers. She reports hyperhidrosis of the right hand. The pain is constant, 7-8/10, burning
and electric in quality, worse with any movement, weather changes, and stress.
She has been treated with a right stellate ganglion block (partial, temporary relief), two sympathetic nerve blocks (short-lived
benefit), gabapentin 600 mg TID (partial benefit), duloxetine 60 mg daily (some mood benefit), and physical therapy (poorly
tolerated due to pain). She has not tried IV ketamine or spinal cord stimulation.
She is increasingly disabled — she was a dental hygienist and can no longer work. She is applying for disability. She reports
significant depression and anxiety related to her condition. She asks today about 'whether this is all in my head' because her
orthopedic surgeon implied her symptoms were 'out of proportion.'

PHYSICAL EXAM
Vitals: BP 128/78, HR 82
Right upper extremity: Diffuse allodynia to light touch from wrist to mid-forearm. Skin mottled with patchy erythema and
pallor. Mild non-pitting edema of dorsal hand. Right hand temperature 33.1°C vs left 35.8°C by infrared. Hyperhidrosis right
palm. ROM of right wrist and fingers markedly limited by pain. Grip strength right 8 kg, left 42 kg.
Neuro: Sensation difficult to formally assess given allodynia. No upper motor neuron signs. Left side normal. Cranial nerves
intact.

ASSESSMENT AND PLAN
1. Complex Regional Pain Syndrome Type I, right upper extremity (G90.511)
Meets Budapest Criteria: continuous pain disproportionate to inciting event; allodynia, hyperalgesia; color, temperature,
trophic, and sudomotor changes; no other diagnosis explains the findings. This is a well-established CRPS diagnosis, not a
somatoform disorder.
Plan: Discuss spinal cord stimulation trial — she meets criteria. Refer to SCS-certified pain physician. Continue gabapentin
and duloxetine. Revisit IV ketamine infusion series (3-5 infusions) as bridging therapy.
2. Neurology referral
While CRPS is a clinical diagnosis managed within pain medicine, I am referring Ms. Barnes to Neurology for a secondary
opinion and for their assessment of any peripheral nerve contribution (e.g., median or radial nerve injury from ORIF
hardware or surgical retraction). NCS/EMG of the right upper extremity would be valuable to rule out structural nerve injury
that might modify surgical planning for SCS lead placement. Additionally, the patient's question about whether this is
'psychological' deserves a definitive answer from a neurologist in writing, which will support her disability application.
3. Depression/anxiety (F32.1, F41.1)
Duloxetine serving dual purpose. Referred to chronic pain psychology — patient accepted.

Electronically signed by: Marcus Yee, MD
Signed 01/28/2026 16:20 EST | Advanced Pain EHR`,
      },
    ],
    demoPoints: ['Movement disorder from psych meds', 'Tardive dyskinesia recognition'],
  },
  {
    id: 'cross-07-reynolds',
    patientName: 'Reynolds, Danielle',
    age: 28,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'Sports Medicine',
    briefDescription: 'Collegiate soccer player with 5th concussion and persistent post-concussion symptoms x 3 months.',
    clinicalHighlight: 'Prolonged post-concussion syndrome (multiple prior)',
    expectedTier: 'routine_priority',
    files: [
      {
        filename: '07_Reynolds_Danielle.pdf',
        path: '/samples/triage/cross-specialty/07_Reynolds_Danielle.pdf',
        docType: 'Sports Medicine Referral',
        previewText: `Women's Health Partners of Nashville
2021 Richard Jones Rd, Suite 210, Nashville, TN 37215
Phone: (615) 555-0381 | Fax: (615) 555-0382

Patient: Danielle M. Reynolds

Date: 01/24/2026

DOB: 09/18/1993

Provider: Gwendolyn Marsh, MD

MRN: WHPN-0071254

Specialty: Obstetrics & Gynecology

CHIEF COMPLAINT
6-week postpartum visit. Also reports hand numbness and dropped baby.

HISTORY OF PRESENT ILLNESS
Ms. Reynolds is a 32-year-old G2P2 who delivered her second child vaginally 6 weeks ago at 39+2 weeks. Uncomplicated
vaginal delivery, no neuraxial complications, no postpartum hemorrhage. She is exclusively breastfeeding.
Today she reports bilateral hand numbness and tingling that began in the third trimester and has not fully resolved. She
describes the numbness in the thumb, index, and middle fingers of both hands. She wakes at night with numb hands and
has to shake them out. She reports that last Tuesday she was holding her 6-week-old and her right hand 'went completely
numb and I dropped him onto the couch.' The baby was uninjured. She is extremely distressed about this and tearful today.
She researched her symptoms online and found information about MS. She is terrified. She reports that her hands have
also been more clumsy in general — difficulty with buttons and her phone keyboard. She denies any vision changes, facial
numbness, leg weakness, bladder problems, or fatigue beyond normal new-mother exhaustion. No prior neurological
symptoms. No family history of MS or neurological disease. She has not had any fever, rash, or illness.

PHYSICAL EXAM
Vitals: BP 110/68, HR 78, Wt 148 lbs (pre-pregnancy 138 lbs)
General: Well-appearing, tearful, anxious.
Breast/Postpartum: Uterus involuted. Incision sites healing well. Breastfeeding successfully established per her report.
Hands (limited exam): Positive Tinel's sign bilateral wrists. Positive Phalen's bilateral. No thenar atrophy noted. Sensation
appears reduced to light touch in median nerve distribution, though I acknowledge my neurological exam skills are limited. I
did not perform a formal strength or reflex assessment — outside my scope.

ASSESSMENT AND PLAN
1. Bilateral hand numbness and tingling — postpartum (R20.2)
Her symptom pattern — bilateral, median nerve distribution, worsening at night, relieved by shaking, onset in third trimester,
persisting postpartum — is very consistent with bilateral carpal tunnel syndrome. This is extremely common in pregnancy
and postpartum, particularly in breastfeeding women due to fluid retention and positioning during nursing. The 'dropping'
episode was almost certainly a sudden numbness event from CTS, not weakness.
However, given her significant anxiety about MS and the functional impact on infant care, I am referring urgently to
Neurology. I want to be honest: I do not think this is MS. But I am an OB/GYN and I am not the right person to rule that out
definitively or to provide the reassurance she needs. A neurologist can formally evaluate her, likely confirm CTS, and
provide the credible reassurance that will help her anxiety more than I can. Please note the urgency is driven by her
emotional state and childcare safety concern, not by my clinical suspicion for serious neurological disease.
In the meantime: bilateral wrist splints for nighttime use provided. Counseled on supported nursing positions to minimize
wrist flexion. Will consult OT if not improved after neurology evaluation.
2. Postpartum visit — otherwise unremarkable
Contraception: discussed IUD placement, patient deferred. EPDS score: 6 (reassuring, anxiety items elevated —
monitoring). Return to activity counseled. Anemia CBC today.

Electronically signed by: Gwendolyn Marsh, MD

Signed 01/24/2026 11:45 CST | WHPN EHR`,
      },
    ],
    demoPoints: ['Repeat concussion management', 'Return-to-play clearance'],
  },
  {
    id: 'cross-08-fletcher',
    patientName: 'Fletcher, George',
    age: 74,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Nephrology',
    briefDescription: 'CKD patient with burning foot pain, orthostatic hypotension, and autonomic dysfunction.',
    clinicalHighlight: 'Complex neuropathy (diabetic vs uremic)',
    expectedTier: 'semi_urgent',
    files: [
      {
        filename: '08_Fletcher_George.pdf',
        path: '/samples/triage/cross-specialty/08_Fletcher_George.pdf',
        docType: 'Nephrology Referral',
        previewText: `MedFirst Urgent Care – Riverside
4410 Riverside Dr, Macon, GA 31210
Phone: (478) 555-0155 | Fax: (478) 555-0156

Patient: George T. Fletcher

Date: 01/21/2026

DOB: 02/22/1952

Provider: Dylan Brandt, PA-C

MRN: MF-00294551

Credentials: Physician Assistant-Certified

CHIEF COMPLAINT
Weakness, confusion, unsteady walking — daughter brought him in.

HISTORY OF PRESENT ILLNESS
73-year-old male brought in by his daughter who reports he 'hasn't been himself' for the past week. She says he has been
moving slowly, seems confused at times, and nearly fell twice trying to get up from his recliner. He has not been eating well.
She is worried he is having strokes.
Patient himself minimizes symptoms — says he is 'just tired.' He did have a GI illness about 10 days ago with vomiting and
diarrhea that lasted 3 days. He says he has barely eaten since then. He drinks 'a lot of water' because he heard that was
good for you — daughter estimates 12-15 glasses a day since his illness. He takes hydrochlorothiazide 25 mg, lisinopril,
and atorvastatin. He has hypertension, type 2 diabetes (diet-controlled), and 'some memory problems' per daughter, though
she says this is much worse than his baseline.
He denies any sudden onset of focal weakness, speech difficulty, facial droop, or vision changes. No headache. No chest
pain. Daughter is not sure about these.

PHYSICAL EXAM
Vitals: BP 108/62, HR 92, Temp 97.8, O2 sat 97% RA, wt 161 lbs (daughter says he weighed 174 lbs at his doctor's office 2
months ago)
General: Elderly male, thin, appears fatigued and mildly confused. Slow to respond.
HEENT: Dry mucous membranes. Eyes sunken.
Cardiovascular: Tachycardic, regular. No murmurs.
Neuro: Alert but disoriented to date. Follows simple commands. No obvious facial asymmetry. Moves all extremities. Grip
weak bilaterally — hard to say if focal or diffuse. Gait unsteady but I couldn't determine if this was new vs. baseline.

LABS
BMP: Na 121, K 3.2, Cl 88, CO2 22, BUN 28, Cr 1.4 (unknown baseline), glucose 94
CBC: WBC 7.2, Hgb 13.1, Plt 188 — unremarkable
UA: concentrated, specific gravity 1.028, no infection

ASSESSMENT AND PLAN
Assessment: Weakness, confusion, and gait instability in elderly male. Differential includes TIA/stroke vs. metabolic
encephalopathy vs. other. Significant lab findings noted.
1. Sending to ED via EMS for further evaluation. Na of 121 is critically low and may explain presentation but stroke cannot
be ruled out here without imaging. Called Navicent Health ED to give report. Advised slow correction of sodium — do not
over-correct.
2. Neurology referral placed for outpatient follow-up after hospitalization given weakness and confusion. ED and inpatient
team should determine if acute neurology consult needed during admission.
Note: I did not have the capability to obtain CT imaging or IV fluids here. Transfer is the appropriate next step.

Electronically signed by: Dylan Brandt, PA-C
Supervising MD: Priscilla Tran, MD (off-site) | Signed 01/21/2026 14:05 EST`,
      },
    ],
    demoPoints: ['Multi-etiology neuropathy', 'Nephrology-to-neurology referral'],
  },
  {
    id: 'cross-09-kim',
    patientName: 'Kim, Jennifer',
    age: 43,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'ENT',
    briefDescription: 'Acute vertigo, hearing loss, and tinnitus after gentamicin course.',
    clinicalHighlight: 'Aminoglycoside ototoxicity vs vestibular neuritis',
    expectedTier: 'semi_urgent',
    files: [
      {
        filename: '09_Kim_Jennifer.pdf',
        path: '/samples/triage/cross-specialty/09_Kim_Jennifer.pdf',
        docType: 'ENT Referral',
        previewText: `Peak Performance Sports Medicine
630 W. University Ave, Gainesville, FL 32601
Phone: (352) 555-0448 | Fax: (352) 555-0449

Patient: Jennifer L. Kim

Date: 01/27/2026

DOB: 11/30/2001

Provider: Trevor Hollis, DO

MRN: PPSM-0018872

Specialty: Sports Medicine / Primary Care

CHIEF COMPLAINT
Head injury 5 weeks ago — headache, brain fog, not cleared for return to play.

HISTORY OF PRESENT ILLNESS
Ms. Kim is a 24-year-old female Division I soccer goalkeeper who sustained a concussion on December 19, 2025 during a
collision with a field player. She was removed from play per concussion protocol, evaluated on the sideline, and diagnosed
with a concussion (no LOC, brief confusion, no amnesia). Initial symptom burden was significant: headache 8/10, dizziness,
nausea, photophobia, phonophobia, and difficulty concentrating.
She is now 5 weeks post-injury and has not been cleared. Symptom progress has been slow. Current symptoms: persistent
headache (bifrontal, pressure-type, 4/10 at baseline, spikes to 7/10 with exertion or screen time), cognitive fog ('I feel like I'm
thinking through mud'), sleep disruption (difficulty initiating sleep, vivid dreams), increased irritability, and emotional lability
— she cried three times this week without clear trigger. She is a pre-med student and her academic performance has
suffered significantly. She is anxious about her athletic career and her upcoming spring season.
She attempted Stage 2 of the Graduated Return to Play protocol (light aerobic exercise) twice and both times had symptom
exacerbation requiring 24-hour rest. She has not progressed further. She is currently using ibuprofen 400 mg 3-4x per day
for headaches.
She has a prior concussion in 2022 (recovered fully in 3 weeks). No other neurological history. No prior psychiatric history.
Not currently taking any other medications.

NEUROLOGICAL EXAM / CONCUSSION TESTING
Vitals: BP 112/70, HR 68
VOMS (Vestibular/Ocular Motor Screening):
- Smooth pursuit: normal
- Saccades (horizontal/vertical): normal latency, some symptom provocation with rapid vertical
- Near point of convergence: 8 cm (mildly increased; normal <5 cm), provoked headache
- Vestibulo-ocular reflex (VOR): mildly impaired, symptom provocation
- Visual motion sensitivity: significant dizziness with optokinetic stimulus
Balance (mBESS): 6 errors (normal <4 for this age group)
King-Devick: 52 seconds (baseline unknown, but above expected norms)
ImPACT: Verbal memory 78, Visual memory 70, Processing speed 32.4, Reaction time 0.68 (all below her baseline scores
from pre-season testing)
Cervical spine: Restricted rotation bilateral, tenderness over right upper trapezius and suboccipital muscles. Cervicogenic
headache component likely.

ASSESSMENT AND PLAN
1. Post-concussion syndrome (F07.81)
Persistent symptoms at 5 weeks following a second concussion in 3 years, with objective deficits on vestibulo-ocular and
neurocognitive testing. Not yet cleared for GRTP. Ibuprofen overuse likely contributing to headache chronification —
counseled to limit to 2 days/week maximum.
Neurology referral placed — requesting evaluation by concussion specialist/sports neurologist. Specific concerns: (1) rate of
recovery slower than expected, (2) prior concussion history, (3) vestibular dysfunction pattern, (4) academic and
occupational impact. Would appreciate evaluation for possible pharmacologic support (e.g., amitriptyline for
sleep/headache), formal vestibular rehabilitation referral, and guidance on return-to-sport timeline.

2. Cervicogenic headache component
Refer to PT specializing in concussion/cervical rehabilitation. Manual therapy and vestibular rehab to be coordinated with
neurology plan.
3. Academic accommodations
Provided documentation for extended test time, reduced course load, screen time limits. Coordinated with athletic academic
advisor.
4. Return to play
NOT CLEARED. Will not progress GRTP until symptom-free at rest AND formal neurology clearance.

Electronically signed by: Trevor Hollis, DO
Signed 01/27/2026 13:50 EST | Peak Performance EHR | cc: Athletic Training Staff`,
      },
    ],
    demoPoints: ['ENT-to-neuro referral', 'Drug-induced vestibular toxicity'],
  },
  {
    id: 'cross-10-okafor',
    patientName: 'Okafor, Emmanuel',
    age: 55,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Endocrinology',
    briefDescription: 'Poorly controlled DM2 with both distal neuropathy and proximal motor weakness.',
    clinicalHighlight: 'Diabetic amyotrophy + polyneuropathy',
    expectedTier: 'semi_urgent',
    files: [
      {
        filename: '10_Okafor_Emmanuel.pdf',
        path: '/samples/triage/cross-specialty/10_Okafor_Emmanuel.pdf',
        docType: 'Endocrinology Referral',
        previewText: `University Rheumatology Associates
1500 E. Medical Center Dr, Ann Arbor, MI 48109
Phone: (734) 555-0502 | Fax: (734) 555-0503

Patient: Emmanuel C. Okafor

Date: 01/29/2026

DOB: 05/07/1976

Provider: Helen Strauss, MD, PhD

MRN: URA-0084410

Specialty: Rheumatology & Clinical Immunology

CHIEF COMPLAINT
New patient — headache, confusion, and abnormal MRI. Referred by PCP.

HISTORY OF PRESENT ILLNESS
Mr. Okafor is a 49-year-old male of Nigerian descent with a past medical history of hypertension and prior diagnosis of
'possible sarcoidosis' (hilar lymphadenopathy noted on chest CT in 2021, never biopsied, resolved spontaneously). He was
referred urgently following an MRI brain obtained by his PCP for 6 weeks of progressive headache, intermittent confusion,
and one witnessed episode of expressive aphasia lasting 4 hours that fully resolved.
MRI brain with and without contrast (01/15/2026, outside hospital): Multiple bilateral cortical and subcortical enhancing
lesions in a non-watershed distribution, involving the frontal and parietal lobes with adjacent leptomeningeal enhancement.
Pattern described by radiologist as 'atypical for demyelination; vasculitis or CNS lymphoma cannot be excluded.'
He reports the headache began 6 weeks ago — bitemporal, pressure-like, progressive, not relieved by acetaminophen or
ibuprofen. He has had 3-4 episodes of 'blanking out' during conversations, not remembering what was said. His wife notes
personality change — he is normally gregarious and is now withdrawn and irritable. He had one episode of seeing flickering
lights in the right visual field lasting 15 minutes. He denies fever, rash, joint pain, dry eyes/mouth, or cough. He has lost 8 lbs
over 6 weeks unintentionally. No recent travel. No known TB exposure. Not immunocompromised.

REVIEW OF SYSTEMS
Positive: Progressive headache, episodic confusion, transient aphasia, visual phenomena, weight loss, personality change.
Negative: Fever, night sweats, rash, photosensitivity, oral ulcers, serositis, Raynaud's, sicca symptoms, arthritis, cough,
hemoptysis.

PHYSICAL EXAM
Vitals: BP 146/92, HR 78, Temp 98.6, Wt 174 lbs (down from 182 lbs in Oct 2025)
General: Alert, well-groomed male. Mildly slow in responses.
HEENT: No oral ulcers, no lymphadenopathy. Fundoscopy: no papilledema.
Skin: No rash, no purpura, no livedo reticularis.
MSK: No synovitis, full ROM all joints.
Neuro: Alert, oriented x3. Mild word-finding difficulty. Cranial nerves intact. Motor 5/5 all extremities. Sensation intact.
Coordination normal. Gait normal.

LABS / WORKUP ORDERED
Sent today: ESR, CRP, ANA, anti-dsDNA, ANCA (p and c), RF, anti-CCP, complement (C3/C4), antiphospholipid panel
(aCL IgG/IgM, beta-2 glycoprotein, LA), SPEP, LDH, ACE level, CBC with diff, CMP, HIV, RPR, hepatitis B/C serologies,
IGRA (QuantiFERON), serum protein electrophoresis.
Pending outside: CSF analysis (LP scheduled 01/31 by neurology).

ASSESSMENT AND PLAN
1. CNS vasculitis vs. CNS lymphoma vs. neurosarcoidosis — high priority (M31.9 provisional)
This patient has a serious, progressive CNS inflammatory or neoplastic process requiring urgent and coordinated
multidisciplinary evaluation. The MRI pattern with leptomeningeal and parenchymal enhancement in a non-vascular
distribution raises the following differential:
- Primary CNS vasculitis (PACNS) — isolated CNS, no systemic features
- Secondary vasculitis from systemic disease (sarcoidosis, SLE, ANCA-associated) — prior hilar LAD is relevant
- CNS lymphoma — weight loss, enhancing lesions, must exclude

- Infectious (TB, fungal, viral encephalitis) — less likely but must screen
I have contacted Neurology directly (Dr. Chen) and they are seeing him 01/31 for LP. I have also requested Neuroradiology
re-review of the outside MRI with dedicated vasculitis protocol sequences. Brain biopsy may ultimately be required if LP and
serology are non-diagnostic.
Given the rapidity of progression, I am starting a short course of high-dose prednisone 60 mg daily empirically to prevent
further neurological injury while workup proceeds — with full understanding this may partially treat and obscure the
diagnosis. PCP notified. Discussed with patient and wife; they understand and consent.
2. Hypertension — hold HCTZ (may mask inflammatory markers); continue amlodipine.
Will present at multidisciplinary neuro-rheumatology conference Thursday.

Electronically signed by: Helen Strauss, MD, PhD
Signed 01/29/2026 19:15 EST | URA EHR | CC: Neurology (Chen), Neuroradiology, PCP`,
      },
    ],
    demoPoints: ['Complex diabetic neuropathy', 'Dual neuropathy pattern'],
  },
  {
    id: 'cross-11-petrov',
    patientName: 'Petrov, Nina',
    age: 62,
    sex: 'F',
    category: 'cross_specialty',
    referringSpecialty: 'Pulmonology',
    briefDescription: 'Reduced FVC with progressive dysarthria, dysphagia, fasciculations, and UMN+LMN signs.',
    clinicalHighlight: 'Suspected ALS (motor neuron disease)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '11_Petrov_Nina.pdf',
        path: '/samples/triage/cross-specialty/11_Petrov_Nina.pdf',
        docType: 'Pulmonology Referral',
        previewText: `Midwest Eye Associates
2900 N. Sheridan Rd, Suite 401, Chicago, IL 60657
Phone: (773) 555-0614 | Fax: (773) 555-0615

Patient: Nina P. Petrov

Date: 01/30/2026

DOB: 01/03/1985

Provider: Andrew Tsai, MD

MRN: MEA-0029882

Specialty: Ophthalmology

CHIEF COMPLAINT
Annual eye exam, mild blurring for 2 months.

HISTORY OF PRESENT ILLNESS
Ms. Petrov is a 41-year-old female presenting for a routine annual eye exam. She mentions in passing that her vision has
been 'slightly blurry' for about 2 months, which she attributed to needing a new glasses prescription. She also reports
intermittent headaches described as a pressure-like sensation behind her eyes, daily, for the past 6 weeks — she is taking
ibuprofen most days. She also notes transient visual obscurations (brief dimming or blackouts of vision in one or both eyes
for seconds at a time) occurring several times a day, especially with positional changes such as standing up or bending
over. She did not consider these symptoms serious and did not report them to her PCP.
She has no prior history of optic nerve disease, glaucoma, or significant eye pathology. She has a BMI of 38 (obesity). She
takes an oral contraceptive pill and vitamin D. No prior neurological diagnoses. No diplopia, no pulsatile tinnitus noted today
(will ask specifically). She is a 41-year-old female with obesity and headache — this clinical picture is immediately
concerning.

EYE EXAM
Visual acuity (with current correction): OD 20/30, OS 20/25 (previously 20/20 OU)
Pupils: Equal and reactive, no RAPD
IOP: OD 14 mmHg, OS 15 mmHg (normal)
Confrontation visual fields: Enlarged blind spots bilateral on confrontation; formal Humphrey perimetry performed (see
below)
Humphrey 24-2 Visual Fields: Bilateral enlarged blind spots with early arcuate defects superior OD
Fundoscopy (dilated exam):
- OD: Optic disc markedly swollen, elevated, with blurred margins, peripapillary hemorrhages at 7 and 11 o'clock positions.
Spontaneous venous pulsations ABSENT.
- OS: Optic disc swollen with blurred margins, less pronounced than OD but clearly abnormal. Spontaneous venous
pulsations ABSENT.
- Bilateral optic disc photographs obtained and saved in chart.
- Macula: flat and even bilaterally. Vessels normal caliber.

ASSESSMENT AND PLAN
1. Bilateral papilledema — URGENT (H47.10)
This is a serious and urgent finding. Bilateral optic disc edema with absent venous pulsations, peripapillary hemorrhages,
visual field defects, and transient visual obscurations in a young obese woman on oral contraceptives is highly concerning
for elevated intracranial pressure, most likely idiopathic intracranial hypertension (IIH) but must exclude secondary causes
including intracranial mass, venous sinus thrombosis, or other space-occupying lesion.
Actions taken today:
- Patient counseled on the urgency and seriousness of this finding — she was not expecting this
- Called her PCP (Dr. Kim, (773) 555-0820) directly during the appointment
- Neurology referral placed as URGENT — requesting appointment within 48-72 hours
- Instructed patient to go to the Emergency Department now if: sudden severe headache, vision loss, diplopia, weakness, or
any change in mental status
- MRI brain and orbits with and without gadolinium + MRV (to evaluate venous sinuses) ordered
- Oral contraceptive pill — recommend stopping immediately pending neurology evaluation (OCP associated with cerebral
venous thrombosis); discussed with patient and she agrees

- Do NOT give ibuprofen or any NSAIDs — could mask symptoms
I documented the disc photographs, perimetry results, and full exam findings. Patient has my direct line and will call if any
new or worsening symptoms before the neurology appointment. This case requires urgent attention.

Electronically signed by: Andrew Tsai, MD
Signed 01/30/2026 16:55 CST | Midwest Eye EHR | Urgent: neurology and PCP notified by phone`,
      },
    ],
    demoPoints: ['ALS recognition', 'Pulmonology-to-neurology urgency'],
  },
  {
    id: 'cross-12-wei',
    patientName: 'Wei, Liang',
    age: 38,
    sex: 'M',
    category: 'cross_specialty',
    referringSpecialty: 'Infectious Disease',
    briefDescription: 'HIV+ patient with new seizure, right-sided weakness, and ring-enhancing brain lesion.',
    clinicalHighlight: 'Ring-enhancing lesion (toxo vs lymphoma vs PML)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '12_Wei_Liang.pdf',
        path: '/samples/triage/cross-specialty/12_Wei_Liang.pdf',
        docType: 'Infectious Disease Referral',
        previewText: `University Hospital Emergency Department
500 S. State St, Ann Arbor, MI 48109 | Emergency Medicine
Phone: (734) 555-0800 | Fax: (734) 555-0801

Patient: Liang T. Wei

Date: 01/30/2026

DOB: 07/11/1974

Provider: Sandra Kopp, MD

MRN: UH-ED-1047823

Specialty: Emergency Medicine

CHIEF COMPLAINT
Worst headache of my life — sudden onset while exercising.

HISTORY OF PRESENT ILLNESS
Mr. Wei is a 51-year-old male with no significant past medical history who presents via EMS after sudden onset of severe
headache while lifting weights at a gym at approximately 10:45 AM. He reports he was in the middle of a squat when he
developed an instantaneous, explosive headache he describes as 'like a bat hit the back of my head.' He rated the pain
10/10. He did not lose consciousness. He became nauseated and vomited once at the gym. A bystander called 911. He has
never had a headache like this before.
He has had prior occasional tension-type headaches, never requiring medical attention. He denies recent illness, fever,
neck stiffness at onset (though has some neck discomfort now), any medication use, cocaine or stimulant use. He takes no
prescription medications. Family history: mother had a brain aneurysm; he does not know if she had surgery. He smokes
half a pack per day, drinks socially. He is a software engineer.

PHYSICAL EXAM (on arrival)
Vitals: BP 172/98, HR 96, Temp 37.0°C, RR 18, O2 sat 99% RA
General: Alert, distressed, photophobic, holding head.
HEENT: PERRL. No papilledema on fundoscopic exam (limited, non-dilated). Photophobia present. Phonophobia present.
Neck: Meningismus present — resistance to passive neck flexion, positive Kernig's sign. Brudzinski's sign equivocal.
Neuro: Alert and oriented x4. Cranial nerves II-XII intact. Motor 5/5 all extremities. No pronator drift. Sensation intact.
Reflexes 2+ symmetric. No ataxia.

DIAGNOSTIC RESULTS
CT Head without contrast (11:38 AM): Hyperdense material in the basal cisterns and bilateral Sylvian fissures consistent
with subarachnoid hemorrhage. No hydrocephalus. No midline shift. No intraparenchymal hemorrhage identified. CT
Angiography Head/Neck (12:02 PM): 7mm saccular aneurysm at the junction of the left posterior communicating artery and
left internal carotid artery. No other aneurysms identified.
Lumbar Puncture (1:45 PM): Performed given classic presentation even after positive CT. Opening pressure 24 cmH2O.
Tube 1: RBC 185,000/mm3. Tube 4: RBC 182,000/mm3 (not clearing). Xanthochromia: PRESENT (yellow tinge). WBC 12
(likely reactive). Protein 98 mg/dL. Glucose 62.
Labs: CBC: Hgb 14.8, Plt 224,000. PT/INR 1.0. BMP: normal. Type and screen sent.

ASSESSMENT AND PLAN
1. Subarachnoid hemorrhage from ruptured left PComA aneurysm (I60.7, Q28.3)
Hunt-Hess Grade II (severe headache, meningismus, no neurological deficit). Fisher Grade 2 (subarachnoid blood only, no
IVH or thick clot).
Neurosurgery and Neurology both paged and at bedside:
- Neurosurgery (Dr. Abramowitz): Planning endovascular coiling via interventional neuroradiology — likely tonight pending
family consent and prep
- Neurology (Dr. Vasquez): Admitting to Neurocritical Care Unit, initiating nimodipine 60 mg q4h for vasospasm prophylaxis
ED interventions:
- IV access x2 large bore; NS maintenance

- Strict bed rest, HOB 30 degrees
- BP target systolic 100-140 mmHg — labetalol 10 mg IV given x1, BP now 148/88
- NPO for OR
- Morphine 4 mg IV for pain, ondansetron 4 mg IV for nausea
- Repeat neuro checks q1h
- Family called — wife en route
Disposition: Admitted to Neurocritical Care Unit under joint Neurosurgery/Neurology service.

Electronically signed by: Sandra Kopp, MD
Signed 01/30/2026 15:22 EST | UH Emergency EHR | Attending attestation: James Hollis, MD`,
      },
    ],
    demoPoints: ['Neuro-infectious disease', 'HIV-related CNS pathology'],
  },
  {
    id: 'packet-donnelly',
    patientName: 'Donnelly, Frank',
    age: 71,
    sex: 'M',
    category: 'packet',
    referringSpecialty: 'Cardiology',
    briefDescription: 'AFib patient with acute left-sided weakness episode. Full stroke workup packet.',
    clinicalHighlight: 'TIA/embolic stroke with complete workup',
    expectedTier: 'urgent',
    files: [
      {
        filename: '01_Cardiology_Note.pdf',
        path: '/samples/triage/packets/donnelly-frank/01_Cardiology_Note.pdf',
        docType: 'Cardiology Note',
        previewText: `Boston Heart & Vascular Institute
110 Francis St, Suite 4B, Boston, MA 02215
Phone: (617) 555-0330 | Fax: (617) 555-0331

Patient: Frank J. Donnelly

Date: 01/26/2026

DOB: 08/28/1950

Provider: Thomas Greer, MD, FACC

MRN: BHVI-0044028

Specialty: Cardiovascular Disease / Interventional Cardiology

CHIEF COMPLAINT
Referred by PCP after transient episode of right arm weakness and slurred speech.

HISTORY OF PRESENT ILLNESS
Mr. Donnelly is a 75-year-old male with a history of hypertension, hyperlipidemia, type 2 diabetes, and known coronary
artery disease (stent to LAD, 2019) referred for cardiology evaluation following an episode of sudden right arm weakness
and dysarthria that lasted approximately 25 minutes and then fully resolved. Episode occurred on January 18, 2026, while
he was reading the newspaper. His wife noted slurred speech and saw him drop his coffee cup. He had no headache, no
vision changes, and no loss of consciousness. He did not call 911; his PCP saw him the next day.
His PCP obtained an MRI brain (results reviewed below) and referred to both Cardiology and Neurology. He is on aspirin 81
mg, clopidogrel 75 mg (from his coronary stent), atorvastatin 80 mg, lisinopril 20 mg, metoprolol succinate 50 mg, and
metformin 1000 mg BID. He has had no prior TIA or stroke. He was a smoker for 30 years, quit 10 years ago.

PHYSICAL EXAM
Vitals: BP 152/90, HR 68, regular. Wt 198 lbs.
Cardiovascular: RRR, no murmurs or gallops. No JVD. Trace bilateral ankle edema.
Carotids: Right carotid bruit audible.
Neuro (today): No focal deficits. Normal cranial nerves, strength, speech.

RESULTS REVIEWED
MRI brain with DWI (01/20/2026): Small area of restricted diffusion in the left pons — see radiology report. Consistent with
small acute infarction.
ECG today: Normal sinus rhythm, HR 68. No ST changes. No LVH. QTc 418 ms.

ASSESSMENT AND PLAN
1. TIA / minor ischemic stroke, left pontine (G45.9 / I63.9)
Despite symptom resolution, MRI evidence of acute pontine infarct makes this a minor stroke rather than a pure TIA. The
right carotid bruit raises concern for significant ipsilateral (left-sided) stenosis given contralateral symptom pattern — or
alternatively the bruit may represent the right side while pathology is on the left.
Carotid duplex ultrasound ordered (see results). Echocardiogram ordered to evaluate for cardioembolic source (LV
thrombus, structural disease, PFO). Hypercoagulability panel ordered given age and cryptogenic component if stenosis is
insufficient to explain.
Not changing antithrombotic regimen today — he is already on dual antiplatelet therapy for his coronary stent. Coordinate
with Neurology regarding definitive antithrombotic strategy. If PFO found, anticoagulation vs. device closure discussion will
be needed.
2. Hypertension, inadequately controlled (I10)
BP 152/90 — target <130/80 post-stroke per ACC/AHA. Increase lisinopril to 40 mg. Add amlodipine 5 mg. Recheck in 2
weeks.
3. Neurology referral
Urgent neurology referral in place per PCP. I have called Dr. Hasan directly to discuss the case and share imaging results.
Will co-manage.

Electronically signed by: Thomas Greer, MD, FACC
Signed 01/26/2026 14:40 EST | BHVI Cardiology EHR | cc: Neurology — Dr. Hasan`,
      },
      {
        filename: '02_MRI_Brain_DWI_Report.pdf',
        path: '/samples/triage/packets/donnelly-frank/02_MRI_Brain_DWI_Report.pdf',
        docType: 'MRI Brain Report',
        previewText: `Massachusetts General Hospital — Department of Radiology
55 Fruit St, Boston, MA 02114
Phone: (617) 555-0200 | Fax: (617) 555-0201

RADIOLOGY REPORT
Patient: Frank J. Donnelly

DOB: 08/28/1950

MRN: BHVI-0044028

Exam Date: 01/20/2026 14:10

Ordering MD: Robert Klein, MD (PCP)

Accession: MGH-MR-20260120-8812

EXAM
MRI BRAIN WITH DIFFUSION-WEIGHTED IMAGING, WITHOUT AND WITH GADOLINIUM CONTRAST
CLINICAL INDICATION
75-year-old male with acute-onset right arm weakness and dysarthria lasting 25 minutes, now resolved. Rule out acute
infarction.
TECHNIQUE
3T MRI brain: axial DWI/ADC, axial FLAIR, axial T2, axial T2*, axial and sagittal T1, post-contrast axial T1 MPRAGE.
Gadavist 0.1 mmol/kg administered.
COMPARISON
No prior MRI available.
FINDINGS
Diffusion-weighted imaging: A 7 x 5 mm focus of restricted diffusion (bright on DWI, dark on ADC map) is identified in the
left paramedian pons at the level of the mid-pons. This is consistent with acute to early subacute infarction (approximately
2-7 days old).
FLAIR: The pontine lesion demonstrates early T2/FLAIR signal change. No other areas of restricted diffusion. No additional
acute lesions identified.
White matter: Moderate periventricular and subcortical white matter T2/FLAIR hyperintensities in a pattern consistent with
chronic small vessel ischemic disease (Fazekas grade 2). This is an expected finding for age.
Contrast enhancement: No abnormal enhancement identified. The pontine lesion does not enhance (consistent with
acute/early subacute ischemia rather than demyelination or neoplasm).
Major vessels: Flow voids of the basilar artery, bilateral ICAs, and MCAs appear grossly preserved on this non-MRA study.
MRA is recommended for vascular assessment.
Posterior fossa: No cerebellar infarction. Brainstem otherwise unremarkable outside the described lesion. No mass or
herniation.
Ventricles/Calvarium: Mild prominence of cortical sulci consistent with age-related volume loss. No hydrocephalus. No
hemorrhage. No calvarial abnormality.

IMPRESSION
1. 7 x 5 mm acute to early subacute infarction, left paramedian pons. Clinically consistent with the reported episode of right
arm weakness and dysarthria (corticospinal and corticobulbar tract involvement at the mid-pons level).
2. Moderate chronic small vessel ischemic changes (Fazekas grade 2) — background finding consistent with patient's
vascular risk factor history.
3. No intracranial hemorrhage.
4. MRA of the head and neck is recommended to evaluate the posterior circulation vessels (basilar artery, vertebral
arteries) and carotid arteries.

Electronically attested by: Patricia Walsh, MD — Neuroradiology
Attested 01/20/2026 17:50 EST | MGH Radiology PACS`,
      },
      {
        filename: '03_Carotid_Duplex_Report.pdf',
        path: '/samples/triage/packets/donnelly-frank/03_Carotid_Duplex_Report.pdf',
        docType: 'Carotid Duplex',
        previewText: `Boston Heart & Vascular Institute — Vascular Lab
110 Francis St, Suite 2A, Boston, MA 02215
Phone: (617) 555-0340 | Fax: (617) 555-0341

CAROTID DUPLEX ULTRASOUND REPORT
Patient: Frank J. Donnelly

DOB: 08/28/1950

MRN: BHVI-0044028

Exam Date: 01/27/2026 09:30

Ordering MD: Thomas Greer, MD

Accession: BHVI-VL-20260127-0441

CLINICAL INDICATION
75-year-old male with acute left pontine infarct. Right carotid bruit on exam. Evaluate carotid stenosis.
TECHNIQUE
B-mode and color/spectral Doppler ultrasound of bilateral carotid arteries including common carotid, carotid bifurcation,
proximal internal carotid (ICA), and external carotid arteries (ECA). Vertebral artery flow also assessed.
FINDINGS
RIGHT CAROTID SYSTEM:
Common carotid artery (CCA): Patent, normal flow. No plaque.
Carotid bifurcation: Heterogeneous calcified and soft plaque at the right carotid bulb extending into the proximal ICA. Plaque
surface irregular.
Internal carotid artery (ICA):
PSV: 248 cm/s; EDV: 112 cm/s
ICA/CCA ratio: 4.2
Estimated stenosis: 70-79% (moderate-severe by NASCET criteria)
External carotid artery: Patent, no significant stenosis.
LEFT CAROTID SYSTEM:
Common carotid artery: Patent, normal flow.
Carotid bifurcation: Mild intima-media thickening. Small calcified plaque at bifurcation.
Internal carotid artery (ICA):
PSV: 98 cm/s; EDV: 34 cm/s
ICA/CCA ratio: 1.4
Estimated stenosis: <50% (mild)
VERTEBRAL ARTERIES:
Bilateral vertebral artery flow is antegrade and symmetric. No significant stenosis identified.

IMPRESSION
1. Right internal carotid artery stenosis 70-79% (NASCET moderate-severe) with heterogeneous, irregular plaque —
high-risk plaque morphology.
2. Left ICA stenosis less than 50% — mild, not hemodynamically significant.
3. Normal vertebral artery flow bilaterally.
Note: The acute infarction was in the left pons (posterior circulation territory). The right ICA stenosis does not directly
explain a left pontine infarct via the carotid system. CTA or MRA of the posterior circulation (vertebrobasilar system) is
recommended to evaluate for vertebral artery or basilar artery disease as the more likely culprit vessel. Right ICA stenosis
warrants vascular surgery consultation regardless for secondary prevention.

Electronically attested by: Kevin Moore, RVT — Registered Vascular Technologist
Interpreted by: Thomas Greer, MD, FACC | Attested 01/27/2026 12:15 EST`,
      },
      {
        filename: '04_Echocardiogram_Report.pdf',
        path: '/samples/triage/packets/donnelly-frank/04_Echocardiogram_Report.pdf',
        docType: 'Echocardiogram',
        previewText: `Boston Heart & Vascular Institute — Echocardiography Lab
110 Francis St, Suite 2A, Boston, MA 02215
Phone: (617) 555-0340 | Fax: (617) 555-0341

ECHOCARDIOGRAPHY REPORT — TRANSTHORACIC + BUBBLE STUDY
Patient: Frank J. Donnelly

DOB: 08/28/1950

MRN: BHVI-0044028

Exam Date: 01/27/2026 11:00

Ordering MD: Thomas Greer, MD

Accession:
BHVI-ECHO-20260127-0214

CLINICAL INDICATION
Acute left pontine infarct. Evaluate for cardioembolic source. Bubble study for PFO.
TECHNIQUE
Complete 2D transthoracic echocardiogram with Doppler. Agitated saline contrast (bubble study) performed at rest and with
Valsalva maneuver.
FINDINGS
Left ventricle: Normal size. EF estimated 55-60% (normal). No wall motion abnormalities. No LV thrombus. Normal
diastolic function (Grade I impairment).
Right ventricle: Normal size and systolic function.
Atria: Left atrium mildly dilated (LA volume index 32 mL/m2; normal <34). Right atrium normal size. No intracardiac
thrombus identified. No spontaneous echo contrast.
Valves: Mild mitral annular calcification. Mild mitral regurgitation (1+). Aortic valve mildly thickened and calcified; aortic
stenosis mild (peak gradient 18 mmHg, mean 9 mmHg). Tricuspid valve normal. No pulmonic stenosis.
Pericardium: No pericardial effusion.
Aortic root: Mildly dilated at 3.9 cm.
BUBBLE STUDY (Agitated Saline Contrast):
At rest: No right-to-left shunting observed.
With Valsalva: POSITIVE — appearance of >20 microbubbles in the left atrium within 3 cardiac cycles of right atrial
opacification. This is consistent with a patent foramen ovale (PFO) with right-to-left shunting on Valsalva. Bubble passage
quantity suggests a moderate-sized PFO.

IMPRESSION
1. Normal left ventricular size and systolic function (EF 55-60%). No LV thrombus.
2. Mild LA enlargement. No intracardiac mass or thrombus.
3. Mild valvular disease as described (mitral regurgitation, early aortic stenosis) — not considered embolic source.
4. PATENT FORAMEN OVALE (PFO) with moderate right-to-left shunting demonstrated on Valsalva — potentially
relevant embolic source, particularly in context of acute ischemic stroke. Correlation with clinical stroke characteristics and
discussion of closure vs. anticoagulation vs. continued antiplatelet therapy is recommended in a multidisciplinary setting.

Electronically attested by: Thomas Greer, MD, FACC
Attested 01/27/2026 13:45 EST | BHVI Cardiology EHR`,
      },
      {
        filename: '05_Hypercoagulability_Labs.pdf',
        path: '/samples/triage/packets/donnelly-frank/05_Hypercoagulability_Labs.pdf',
        docType: 'Hypercoagulability Labs',
        previewText: `Brigham Specialized Coagulation Laboratory
75 Francis St, Boston, MA 02115 | CLIA #22D0009832
Phone: (617) 555-0950 | Fax: (617) 555-0951

HYPERCOAGULABILITY / THROMBOPHILIA PANEL
Patient: Frank J. Donnelly

DOB: 08/28/1950

MRN: BHVI-0044028

Exam Date: 01/27/2026 08:00

Ordering MD: Thomas Greer, MD

Accession: BCL-20260127-5541

CLINICAL INDICATION: Acute ischemic stroke — evaluate for hereditary or acquired thrombophilia.
NOTE: Patient is on aspirin 81 mg and clopidogrel 75 mg at time of collection. Antiplatelet agents may affect some functional assays; results should
be interpreted in clinical context. Patient is NOT on anticoagulation.

ANTIPHOSPHOLIPID ANTIBODY PANEL
Test

Result

Reference

Flag

Anticardiolipin IgG

8 GPL

<20 GPL (negative)

Anticardiolipin IgM

6 MPL

<20 MPL (negative)

Anti-beta2-glycoprotein I IgG

4 SGU

<20 SGU (negative)

Anti-beta2-glycoprotein I IgM

3 SMU

<20 SMU (negative)

Lupus Anticoagulant (dRVVT screen)

Negative

Negative

Lupus Anticoagulant (Silica clot time)

Negative

Negative

Test

Result

Reference

Flag

Factor V Leiden mutation (PCR)

HETEROZYGOUS
(R506Q)

Negative / Wild-type

H

Prothrombin G20210A mutation (PCR)

Not detected

Negative

MTHFR C677T

Heterozygous

—

MTHFR A1298C

Not detected

—

Protein C activity

88%

70-140%

Protein S (free antigen)

74%

65-140%

Antithrombin III activity

96%

80-120%

Homocysteine (fasting)

18.4 µmol/L

<15 µmol/L

H

Test

Result

Reference

Flag

PT / INR

12.1 sec / 1.0

11-14 sec / 0.8-1.2

aPTT

30 sec

25-38 sec

Fibrinogen

388 mg/dL

200-400 mg/dL

D-dimer

0.62 mg/L FEU

<0.50 mg/L FEU

HEREDITARY THROMBOPHILIA

OTHER COAGULATION

H

INTERPRETATION: Factor V Leiden heterozygous mutation detected. This is the most common inherited thrombophilia
and confers approximately 3-7x increased risk of venous thromboembolism; arterial risk data are less robust but some
studies suggest modest increased stroke risk. Mildly elevated homocysteine (18.4) is a modifiable risk factor —
supplement with folate and B6/B12. MTHFR heterozygosity may contribute to homocysteinemia. No antiphospholipid
antibodies detected. D-dimer mildly elevated — nonspecific in the context of recent ischemic event.

Electronically attested by: Anna Bergstrom, PhD — Hemostasis Laboratory
Director: Robert Flaumenhaft, MD | Reported 01/27/2026 15:30 EST`,
      },
    ],
    demoPoints: ['Multi-document patient packet', 'Stroke workup fusion', 'Imaging + labs + clinical notes'],
  },
  {
    id: 'packet-jimenez',
    patientName: 'Jimenez, Marta',
    age: 72,
    sex: 'F',
    category: 'packet',
    referringSpecialty: 'Emergency Medicine',
    briefDescription: 'First-time seizure with left frontal mass found on CT. Full ED workup.',
    clinicalHighlight: 'New-onset seizure with brain mass',
    expectedTier: 'urgent',
    files: [
      {
        filename: '01_ED_Note.pdf',
        path: '/samples/triage/packets/jimenez-marta/01_ED_Note.pdf',
        docType: 'ED Note',
        previewText: `Memorial Regional Hospital — Emergency Department
3501 Johnson St, Hollywood, FL 33021 | Level I Trauma Center
Phone: (954) 555-0600 | Fax: (954) 555-0601

Patient: Marta L. Jimenez

Date: 01/31/2026

DOB: 04/17/1958

Provider: Kevin Daly, MD

MRN: MRH-0882341

Specialty: Emergency Medicine

CHIEF COMPLAINT
Confusion and slurred speech — brought by daughter. Possible stroke per EMS.

HISTORY OF PRESENT ILLNESS
67-year-old Hispanic female brought by EMS after her daughter found her confused and speaking incoherently at home. Per
daughter (primary historian — patient is minimally verbal and not providing reliable history): Patient was in her usual state of
health yesterday morning. Daughter called her at 6 PM and she 'sounded drunk and confused.' Daughter arrived at the
house at 8 PM and found her mother confused, slurring words, and not recognizing her. She had been incontinent of urine.
No witnessed seizure activity. No facial droop per daughter, though she is not certain. No vomiting.
Patient has a history of cirrhosis (daughter believes from alcohol — patient 'used to drink a lot'), hypertension, and type 2
diabetes. She takes lactulose 'sometimes' per daughter but is not always compliant. She also takes lisinopril and metformin.
Daughter reports patient has been constipated for 4-5 days. She has had two prior hospitalizations for 'liver problems' —
daughter does not know details. She has not seen her doctor in over a year. Daughter is unaware of any recent infections,
falls, or head trauma.
EMS documented: GCS 11 (E3V3M5), BP 162/96, glucose 78, no obvious facial asymmetry on field assessment. EMS
stroke alert activated given altered mental status and slurred speech.

PHYSICAL EXAM
Vitals on arrival: BP 168/98, HR 102, Temp 37.8°C, RR 18, O2 sat 94% RA, Wt ~155 lbs
GCS: 12 (E3V4M5) — improved from field
General: Jaundiced female, mildly unkempt. Mild asterixis noted on outstretched hands. Spider angiomata on anterior
chest. Palmar erythema. Moderate abdominal distension.
HEENT: Scleral icterus. Pupils 3mm, equal and sluggishly reactive. No obvious facial asymmetry at rest.
Cardiovascular: Tachycardic, regular. No murmurs.
Abdomen: Distended, dull to percussion in flanks — possible ascites. Mild diffuse tenderness without guarding.
Extremities: 2+ bilateral pitting edema to the knees. No focal limb weakness apparent.
Neuro: Confused, disoriented. Follows simple commands inconsistently. Speech slurred and slow. Cannot assess focal
deficits reliably given cooperation. No obvious hemiplegia. Asterixis present bilaterally. Reflexes 2+ symmetric. Toes
downgoing bilaterally.

ED COURSE AND WORKUP
Stroke team activated. CT head obtained (see report). IV access x2, O2 2L NC, monitor. Glucose 78 on finger stick — 1
amp D50 given empirically — minimal response. Labs sent (see lab report). Chest X-ray: cardiomegaly, no acute infiltrate.
EKG: sinus tachycardia, no ischemic changes.
CT head returned as no acute hemorrhage but with chronic changes. Stroke team performed NIHSS: score 4 (confusion,
mild dysarthria). tPA window considered — on hold pending labs and further evaluation. Neurology attending called to
bedside.

ASSESSMENT AND PLAN
Assessment: Altered mental status with slurred speech in patient with cirrhosis. Initial concern for acute stroke given EMS
activation, however clinical picture becoming more consistent with hepatic encephalopathy: asterixis, jaundice, stigmata of
chronic liver disease, constipation, known cirrhosis, lactulose non-compliance, and fever. Stroke has NOT been definitively
excluded — MRI with DWI would be needed but patient is confused and may not cooperate. tPA not administered given
significant uncertainty about diagnosis and concern about coagulopathy in a cirrhotic patient.

1. Admit to medicine / hepatology
2. Lactulose 30 mL q2h until 3 soft BMs per day
3. Rifaximin 550 mg BID
4. IV thiamine 100 mg given prior to any dextrose
5. Blood cultures x2 for SBP workup given fever and ascites
6. Neurology consult ordered — please evaluate for stroke vs. metabolic encephalopathy
7. EEG ordered per neurology
8. MRI brain if patient's mental status and cooperation permit

Electronically signed by: Kevin Daly, MD
Signed 01/31/2026 23:58 EST | MRH Emergency EHR | Attending: Gloria Nwachukwu, MD`,
      },
      {
        filename: '02_CT_Head_Report.pdf',
        path: '/samples/triage/packets/jimenez-marta/02_CT_Head_Report.pdf',
        docType: 'CT Head Report',
        previewText: `Memorial Regional Hospital — Department of Radiology
3501 Johnson St, Hollywood, FL 33021
Phone: (954) 555-0610 | Fax: (954) 555-0611

RADIOLOGY REPORT
Patient: Marta L. Jimenez

DOB: 04/17/1958

MRN: MRH-0882341

Exam Date: 01/31/2026 22:10

Ordering MD: Kevin Daly, MD

Accession: MRH-R-20260131-9920

EXAM
CT HEAD WITHOUT CONTRAST — ACUTE STROKE PROTOCOL
CLINICAL INDICATION
67-year-old female with acute onset confusion and slurred speech. Stroke alert. Rule out hemorrhage.
TECHNIQUE
Non-contrast CT head. Standard stroke protocol with 5 mm axial slices and thin coronal/sagittal reformats.
COMPARISON
CT head from 03/2022 (outside study, available for comparison via PACS).
FINDINGS
Acute findings: No intracranial hemorrhage. No hyperdense vessel sign. No sulcal effacement or loss of gray-white
differentiation to suggest early large territory infarction. ASPECTS score: 10/10.
Chronic/background findings:
- Multiple bilateral subcortical and periventricular hypodensities consistent with chronic small vessel ischemic disease
(Fazekas grade 2-3). Findings are more prominent than on 2022 study, suggesting progression.
- A 6 mm hypodensity in the right posterior limb internal capsule and a 4 mm hypodensity in the left putamen are present —
consistent with chronic lacunar infarcts, unchanged from prior study.
- Mild cortical volume loss and sulcal prominence consistent with age and possible alcohol-related atrophy.
Ventricles: Mildly prominent but stable compared to 2022. No hydrocephalus.
Posterior fossa: No acute cerebellar or brainstem lesion.
Calvarium: No fracture. No acute bony pathology.
Soft tissues: No scalp hematoma.

IMPRESSION
1. NO ACUTE INTRACRANIAL HEMORRHAGE.
2. No CT evidence of acute large territory infarction (ASPECTS 10). Acute ischemia cannot be excluded by CT alone —
MRI with diffusion-weighted imaging is significantly more sensitive for acute infarct and is recommended.
3. Chronic small vessel ischemic disease, progressed since 2022.
4. Known chronic bilateral lacunar infarcts — right PLIC and left putamen — unchanged.
5. Mild cortical volume loss.
Clinical correlation required. In the appropriate clinical context, CTA head and neck should be considered for large vessel
occlusion assessment if ischemic stroke remains suspected.

Electronically attested by: Mark Brennan, MD — Neuroradiology (Attending, on call)
Attested 01/31/2026 22:48 EST | MRH Radiology PACS`,
      },
      {
        filename: '03_Comprehensive_Labs.pdf',
        path: '/samples/triage/packets/jimenez-marta/03_Comprehensive_Labs.pdf',
        docType: 'Comprehensive Labs',
        previewText: `Memorial Regional Hospital — Clinical Laboratory
3501 Johnson St, Hollywood, FL 33021 | CLIA #10D0065831
Phone: (954) 555-0620 | Fax: (954) 555-0621

LABORATORY REPORT — COMPREHENSIVE PANEL
Patient: Marta L. Jimenez

DOB: 04/17/1958

MRN: MRH-0882341

Exam Date: 01/31/2026 22:15

Ordering MD: Kevin Daly, MD

Accession: LAB-20260131-6641

COLLECTION: 01/31/2026 22:15 | REPORTED: 02/01/2026 00:45
BASIC METABOLIC PANEL
Test

Result

Reference

Flag

Sodium

128

136-145 mEq/L

H

Potassium

3.2

3.5-5.0 mEq/L

L

Chloride

94

98-107 mEq/L

L

CO2

20

22-29 mEq/L

L

BUN

38

7-20 mg/dL

H

Creatinine

1.4

0.6-1.1 mg/dL

H

eGFR (CKD-EPI)

38

≥60 mL/min/1.73m²

L

Glucose

82

70-99 mg/dL

Test

Result

Reference

Flag

AST (SGOT)

188

10-40 U/L

H

ALT (SGPT)

72

7-56 U/L

H

Total Bilirubin

8.4

0.2-1.2 mg/dL

H

Direct Bilirubin

5.1

0-0.3 mg/dL

H

Alkaline Phosphatase

214

44-147 U/L

H

GGT

310

9-48 U/L

H

Total Protein

5.8

6.3-8.2 g/dL

L

Albumin

2.4

3.5-5.0 g/dL

L

Prothrombin Time (PT)

18.2 sec

11.0-14.0 sec

H

INR

1.62

0.8-1.2

H

Test

Result

Reference

Flag

Ammonia (plasma)

142 µmol/L

11-48 µmol/L

H

Lactate

3.1 mmol/L

0.5-2.2 mmol/L

H

Lipase

48

13-60 U/L

TSH

2.8

0.4-4.0 mIU/L

Vitamin B12

312

200-900 pg/mL

Blood Culture x2

Pending 5 days

Negative

Test

Result

Reference

LIVER FUNCTION TESTS

AMMONIA & SPECIAL

CBC
Flag

WBC

11.4

4.5-11.0 K/µL

H

Hemoglobin

9.8

12.0-16.0 g/dL

L

MCV

102

80-100 fL

H

Platelets

68

150-400 K/µL

L

Neutrophils %

78

40-75%

H

Test

Result

Reference

Flag

Serum Ethanol

<10 mg/dL
(undetectable)

<10 mg/dL

Urine Drug Screen

Negative (all
panels)

Negative

Salicylate level

<1.0 mg/dL

<20 mg/dL

Acetaminophen level

<10 µg/mL

<20 µg/mL

TOXICOLOGY

CRITICAL VALUES CALLED: Sodium 128 mEq/L (critical low) called to RN at 00:52. Ammonia 142 µmol/L (critical high)
called to RN at 00:52. INR 1.62 flagged. Platelets 68K — thrombocytopenia.
SUMMARY NOTE: Findings consistent with decompensated liver cirrhosis: markedly elevated ammonia, conjugated
hyperbilirubinemia, hypoalbuminemia, coagulopathy (elevated PT/INR), thrombocytopenia, and hyponatremia. Elevated
lactate may reflect hepatic dysfunction and/or early sepsis. Macrocytic anemia (MCV 102) consistent with hepatic disease
or prior alcohol use. Ethanol undetectable at time of draw.

Electronically attested by: Memorial Regional Laboratory, CLIA Certified
Laboratory Director: Helena Park, MD | Reported 02/01/2026 00:45 EST`,
      },
      {
        filename: '04_EEG_Report.pdf',
        path: '/samples/triage/packets/jimenez-marta/04_EEG_Report.pdf',
        docType: 'EEG Report',
        previewText: `Memorial Regional Hospital — Neurophysiology Laboratory
3501 Johnson St, Hollywood, FL 33021
Phone: (954) 555-0630 | Fax: (954) 555-0631

ELECTROENCEPHALOGRAPHY (EEG) REPORT — PORTABLE BEDSIDE
Patient: Marta L. Jimenez

DOB: 04/17/1958

MRN: MRH-0882341

Exam Date: 02/01/2026 06:30

Ordering MD: Raymond Osei, MD
(Neurology)

Accession: MRH-EEG-20260201-0114

CLINICAL INDICATION
67-year-old female admitted for altered mental status. Known cirrhosis. Ammonia elevated (142 µmol/L). Evaluate for
nonconvulsive seizures vs. encephalopathy pattern.
RECORDING DETAILS
Portable bedside EEG performed in medical ICU. 21-electrode standard 10-20 placement. Recording duration: 30 minutes.
Patient encephalopathic — drowsy to lethargic throughout. No hyperventilation performed (patient unable to cooperate).
Photic stimulation not performed.
BACKGROUND ACTIVITY
No normal posterior dominant rhythm identified. Background consists predominantly of moderate-amplitude diffuse theta
(4-7 Hz) and delta (0.5-3 Hz) activity. No normal sleep architecture. No normal waking background for age. The background
is diffusely slow and disorganized — no regional predominance.
INTERICTAL / ABNORMAL FINDINGS
Prominent generalized, bilaterally synchronous triphasic waves (TWs) are identified throughout the recording. These are
high-amplitude, frontally predominant, with a characteristic morphology: positive-negative-positive complex with
anterior-to-posterior phase lag. Frequency approximately 1.5-2.5 Hz. They persist throughout all states of arousal captured.
No clear focal onset epileptiform discharges identified. No electrographic seizure activity recorded.
Attempted stimulation of the patient during recording produced brief attenuation of the pattern followed by resumption —
consistent with encephalopathy, not seizure.
REACTIVITY
EEG mildly reactive to stimulation with brief attenuation. No normal reactivity pattern.
NO SEIZURE ACTIVITY
No electrographic or clinical seizures recorded during this 30-minute study. A longer recording or continuous EEG
monitoring may be considered if nonconvulsive status epilepticus (NCSE) remains a clinical concern.

IMPRESSION
1. ABNORMAL EEG — moderately-severely abnormal.
2. Diffuse background slowing with prominent generalized triphasic waves. This pattern is classically associated with
metabolic encephalopathy, most commonly hepatic encephalopathy (in this clinical context), uremic encephalopathy, or
other toxic-metabolic derangements. The pattern is not specific to etiology but is highly consistent with the patient's clinical
profile and markedly elevated ammonia.
3. No epileptiform discharges. No electrographic seizures in this recording.
4. Triphasic waves can occasionally be difficult to distinguish from NCSE; if clinical suspicion for NCSE remains, a
benzodiazepine trial under EEG monitoring or continuous EEG can be considered. However, the pattern here is typical of
metabolic encephalopathy rather than NCSE.
Recommend clinical correlation with ammonia, liver function, and metabolic parameters. EEG findings support a primary
metabolic/toxic etiology over structural or epileptic cause.

Electronically attested by: Raymond Osei, MD — Neurology / Clinical Neurophysiology

Attested 02/01/2026 09:15 EST | MRH Neurophysiology Lab`,
      },
    ],
    demoPoints: ['Multi-document patient packet', 'Seizure workup with structural lesion', 'Urgent neurosurgery consideration'],
  },
  {
    id: 'packet-nakamura',
    patientName: 'Nakamura, Eleanor',
    age: 31,
    sex: 'F',
    category: 'packet',
    referringSpecialty: 'Family Medicine',
    briefDescription: 'Progressive weakness, numbness, vision changes. Full MS diagnostic workup.',
    clinicalHighlight: 'Multiple sclerosis (complete McDonald criteria)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '01_PCP_Referral.pdf',
        path: '/samples/triage/packets/nakamura-eleanor/01_PCP_Referral.pdf',
        docType: 'PCP Referral',
        previewText: `Harbor View Family Medicine
4422 Pacific Coast Hwy, Suite B, Long Beach, CA 90804
Phone: (562) 555-0271 | Fax: (562) 555-0272

Patient: Eleanor K. Nakamura

Date: 01/20/2026

DOB: 06/15/1994

Provider: Carmen Rodriguez, MD

MRN: HVFM-0041903

Specialty: Family Medicine

CHIEF COMPLAINT
Bilateral leg weakness, right eye vision problem last month, extreme fatigue.

HISTORY OF PRESENT ILLNESS
Ms. Nakamura is a 31-year-old Japanese-American female with no significant past medical history who presents with
several weeks of bilateral lower extremity weakness and fatigue. She also reports an episode approximately 6 weeks ago of
blurry vision and pain with eye movement in her right eye that lasted about 10 days and then mostly resolved — she did not
seek care at that time. Current vision is described as 'almost back to normal' but colors seem slightly washed out in the right
eye.
She has had progressive bilateral leg heaviness and weakness over the past 4 weeks, worse in the afternoons and with
heat (she noticed it dramatically worsens after a hot shower). She has difficulty climbing stairs and has tripped twice. She is
a high school teacher and has been calling in sick frequently. She also reports a band-like tightness around her
mid-abdomen that started 3 weeks ago. She has had urinary urgency with two episodes of incontinence, which she finds
very distressing.
She denies back pain, recent illness, rash, joint pain, or family history of neurological disease. She is on no medications.
She is a non-smoker and drinks socially.

PHYSICAL EXAM
Vitals: BP 118/74, HR 76, Temp 98.3, Wt 138 lbs
General: Alert, appears fatigued, mildly anxious.
Eyes: Visual acuity OD 20/40, OS 20/20. Mild RAPD right eye. Color vision (Ishihara): OD 6/12 plates correct, OS 12/12.
Fundoscopy: optic disc OD appears slightly pale — subtle.
Motor: Hip flexors 4/5 bilaterally, knee extensors 4+/5 bilaterally. Ankles 5/5. Upper extremities 5/5.
Reflexes: Bilateral patellar 3+, bilateral ankle 3+. Bilateral Babinski present. Hoffman's bilateral.
Sensation: Vibration mildly reduced bilateral feet. Pinprick intact. Lhermitte's sign: patient reports electric sensation down
spine with neck flexion.
Gait: Mildly spastic, circumduction of right leg.

ASSESSMENT AND PLAN
1. Suspected demyelinating disease — probable multiple sclerosis (G35, provisional)
This presentation is very concerning: young woman with subacute bilateral upper motor neuron signs in the legs, prior
episode clinically consistent with optic neuritis (right eye pain, vision loss over days, partial recovery, now RAPD and
reduced color vision), Lhermitte's sign, Uhthoff's phenomenon (heat sensitivity), urinary symptoms, and sensory level. This
represents clinical dissemination in both time and space.
Urgent neurology referral placed — requesting expedited appointment. Ordered MRI brain and cervical spine with and
without contrast today (ordered as outpatient but marked urgent). Also ordering CBC, CMP, TSH, B12, ANA,
NMO-IgG/MOG antibodies, ESR, CRP, and VEP referral.
Counseled patient that this is serious and requires specialist evaluation. She is understandably frightened. Provided MS
Society patient education materials. Told her not to take hot baths.

Electronically signed by: Carmen Rodriguez, MD
Signed 01/20/2026 17:10 PST | Harbor View FHR EHR`,
      },
      {
        filename: '02_MRI_Brain_Report.pdf',
        path: '/samples/triage/packets/nakamura-eleanor/02_MRI_Brain_Report.pdf',
        docType: 'MRI Brain Report',
        previewText: `Pacific Neuroimaging Center
3100 Wilshire Blvd, Suite 700, Los Angeles, CA 90010
Phone: (213) 555-0440 | Fax: (213) 555-0441

RADIOLOGY REPORT
Patient: Eleanor K. Nakamura

DOB: 06/15/1994

MRN: HVFM-0041903

Exam Date: 01/22/2026 14:30

Ordering MD: Carmen Rodriguez, MD

Accession: PNC-MR-20260122-3301

EXAM
MRI BRAIN WITH AND WITHOUT GADOLINIUM CONTRAST
CLINICAL INDICATION
31-year-old female with right eye vision loss (partial recovery), bilateral leg weakness, upper motor neuron signs,
Lhermitte's sign. Rule out demyelinating disease.
TECHNIQUE
Multiplanar, multisequence MRI brain performed at 3T. Sequences: sagittal T1, axial FLAIR, axial T2, axial DWI/ADC, axial
T2*, sagittal MPRAGE pre- and post-contrast, axial T1 post-contrast. Gadavist 0.1 mmol/kg IV administered.
COMPARISON
No prior MRI available.
FINDINGS
White matter: Multiple T2/FLAIR hyperintense lesions are identified, as follows:
- Periventricular: At least 6 ovoid lesions oriented perpendicular to the lateral ventricles (Dawson's fingers appearance),
largest measuring 12 x 6 mm in the left periventricular region.
- Juxtacortical: 3 lesions at the gray-white junction, right frontal (2) and left parietal (1).
- Infratentorial: One 5 mm lesion in the right middle cerebellar peduncle.
- Deep white matter: 2 additional lesions in the bilateral centrum semiovale.
Total: At least 12 discrete white matter lesions.
Contrast enhancement: Two lesions demonstrate ring enhancement: one periventricular left (12 x 6 mm) and one
juxtacortical right frontal (8 x 4 mm). Enhancement pattern is consistent with active/recent demyelinating plaques (<6
weeks).
Corpus callosum: Multiple T2 lesions along the undersurface of the corpus callosum (callososeptal interface), highly
characteristic of MS.
Optic nerves: Right optic nerve shows subtle T2 signal increase and mild enhancement on fat-saturated coronal
post-contrast sequence — consistent with resolving optic neuritis.
Gray matter, cortex: No cortical lesions identified on DIR sequence. No atrophy.
Posterior fossa, brainstem: Right MCP lesion as above. No other brainstem lesions.
Ventricles/CSF: Normal. No hydrocephalus.
Vascular: No territorial infarction. No mass effect or midline shift.

IMPRESSION
1. Multiple T2/FLAIR white matter lesions in a distribution highly characteristic of multiple sclerosis: periventricular
(Dawson's fingers), juxtacortical, infratentorial, and corpus callosum involvement — satisfying MAGNIMS 2016 criteria for
dissemination in space.
2. Two actively enhancing lesions consistent with acute/subacute demyelinating plaques, indicating recent disease
activity.
3. Right optic nerve T2 signal change and enhancement consistent with right optic neuritis, correlating with clinical history.
4. Findings are consistent with McDonald 2017 criteria for diagnosis of MS when combined with clinical history of prior
optic neuritis and current presentation.

5. CSF analysis (for oligoclonal bands) and spinal cord MRI recommended for complete workup.

Electronically attested by: Rachel Kim, MD — Neuroradiology
Read and attested 01/22/2026 18:45 PST | PNC Radiology System`,
      },
      {
        filename: '03_MRI_Cervical_Thoracic_Spine_Report.pdf',
        path: '/samples/triage/packets/nakamura-eleanor/03_MRI_Cervical_Thoracic_Spine_Report.pdf',
        docType: 'MRI Spine Report',
        previewText: `Pacific Neuroimaging Center
3100 Wilshire Blvd, Suite 700, Los Angeles, CA 90010
Phone: (213) 555-0440 | Fax: (213) 555-0441

RADIOLOGY REPORT
Patient: Eleanor K. Nakamura

DOB: 06/15/1994

MRN: HVFM-0041903

Exam Date: 01/22/2026 15:20

Ordering MD: Carmen Rodriguez, MD

Accession: PNC-MR-20260122-3302

EXAM
MRI CERVICAL AND THORACIC SPINE WITH AND WITHOUT GADOLINIUM CONTRAST
CLINICAL INDICATION
Same as MRI brain above. Evaluate for spinal cord demyelinating lesions.
TECHNIQUE
Sagittal T1, T2, STIR, and axial T2 sequences cervical and thoracic spine at 3T. Post-contrast sagittal and axial T1
sequences obtained.
FINDINGS
Cervical spine alignment: Normal lordotic curvature. No fracture or subluxation.
Cervical cord: A single focal T2 hyperintense lesion measuring 8 x 3 mm is identified within the posterior right hemicord at
the C4 level. The lesion spans less than 2 vertebral segments in length. No cord expansion or swelling. No abnormal
enhancement post-contrast (this lesion is therefore not acutely active). No cord atrophy.
Cervical disc spaces: Mild C5-C6 disc dessication without significant canal or foraminal stenosis. No cord compression.
Thoracic spine: Thoracic cord normal in caliber and signal. One small 4 mm T2 hyperintense lesion in the posterior
thoracic cord at T6 level — morphology similar to cervical lesion. No enhancement. No compression.
Vertebral bodies: Normal marrow signal. No compression fractures.

IMPRESSION
1. Single right posterior cervical cord lesion at C4 (8 x 3 mm), T2 hyperintense, non-enhancing, less than 2 vertebral
segments — morphologically consistent with a non-active demyelinating plaque. Satisfies spinal cord dissemination in
space criteria per MAGNIMS 2016.
2. Probable additional small demyelinating lesion at T6 level.
3. No acute cord compression or myelopathy from structural cause.
4. Combined with brain MRI findings, the overall imaging supports a diagnosis of multiple sclerosis with dissemination in
space (brain, spinal cord, optic nerve) and in time (enhancing and non-enhancing lesions).

Electronically attested by: Rachel Kim, MD — Neuroradiology
Read and attested 01/22/2026 19:10 PST | PNC Radiology System`,
      },
      {
        filename: '04_VEP_Report.pdf',
        path: '/samples/triage/packets/nakamura-eleanor/04_VEP_Report.pdf',
        docType: 'VEP Report',
        previewText: `Pacific Neuroimaging Center — Neurophysiology Division
3100 Wilshire Blvd, Suite 700, Los Angeles, CA 90010
Phone: (213) 555-0440 | Fax: (213) 555-0441

VISUAL EVOKED POTENTIAL (VEP) REPORT
Patient: Eleanor K. Nakamura

DOB: 06/15/1994

MRN: HVFM-0041903

Exam Date: 01/28/2026 10:00

Ordering MD: Sarah Chen, MD (Neurology)

Accession: PNC-VEP-20260128-0214

CLINICAL INDICATION
Suspected right optic neuritis. Prior visual symptoms right eye. Evaluate optic nerve conduction.
TECHNIQUE
Pattern-reversal VEP performed using standard checkerboard stimulus (60' and 15' check sizes) at 2 reversals/second.
Electrode placement: Oz, O1, O2, MO, Cz (referential montage). Each eye tested separately with the other eye patched.
Corrective lenses worn. Room luminance controlled. 200 averages per trial; trials repeated for reproducibility.
RESULTS
Right Eye (OD):
P100 latency: 126 ms (normal ≤115 ms) — PROLONGED
P100 amplitude: 4.2 µV (low-normal; normal ≥4 µV)
Waveform morphology: Present but broadened.
Left Eye (OS):
P100 latency: 104 ms (normal ≤115 ms) — NORMAL
P100 amplitude: 9.8 µV — Normal
Waveform morphology: Normal.
Interocular latency difference: 22 ms (abnormal; normal ≤8 ms)

IMPRESSION
1. ABNORMAL Visual Evoked Potentials.
2. Prolonged P100 latency right eye (126 ms) with significant interocular asymmetry (22 ms difference), consistent with
right optic nerve demyelination.
3. Left eye VEP normal.
4. Findings are consistent with prior right optic neuritis with residual conduction delay, correlating with the clinical history
and MRI optic nerve findings. This constitutes objective paraclinical evidence supporting the diagnosis of multiple
sclerosis.

Electronically attested by: James Park, PhD — Clinical Neurophysiology
Reviewed by: Sarah Chen, MD (Neurology) | Attested 01/28/2026 15:00 PST`,
      },
      {
        filename: '05_CSF_LP_Results.pdf',
        path: '/samples/triage/packets/nakamura-eleanor/05_CSF_LP_Results.pdf',
        docType: 'CSF/LP Results',
        previewText: `UCLA Health Laboratory — Cerebrospinal Fluid Analysis
757 Westwood Plaza, Los Angeles, CA 90095 | CLIA #05D0644312
Phone: (310) 555-0900 | Fax: (310) 555-0901

CEREBROSPINAL FLUID (CSF) ANALYSIS REPORT
Patient: Eleanor K. Nakamura

DOB: 06/15/1994

MRN: HVFM-0041903

Exam Date: 01/29/2026 08:45

Ordering MD: Sarah Chen, MD (Neurology)

Accession: UCLA-CSF-20260129-1109

PROCEDURE NOTE
Lumbar puncture performed at L3-L4 under fluoroscopic guidance by Dr. Chen. Patient in lateral decubitus position.
Opening pressure measured. 15 mL CSF collected in sequential numbered tubes. No complications. Patient tolerated
procedure well.
OPENING PRESSURE & APPEARANCE
Test

Result

Reference

Flag

Opening Pressure

16 cmH2O

≤20 cmH2O

Appearance

Clear, colorless

Clear, colorless

Xanthochromia

Absent

Absent

Test

Result

Reference

WBC

3

0-5 cells/µL

RBC

2

0-5 cells/µL (traumatic tap
excluded)

Differential — Lymphocytes

90%

60-80% of WBC (upper limit)

Differential — Monocytes

10%

15-45%

Differential — Neutrophils

0%

0-6%

Test

Result

Reference

Glucose (CSF)

62 mg/dL

45-80 mg/dL (serum 94 mg/dL)

CSF/Serum Glucose Ratio

0.66

≥0.60

Total Protein

48 mg/dL

15-45 mg/dL

Albumin (CSF)

22 mg/dL

10-30 mg/dL

IgG (CSF)

8.4 mg/dL

0.8-6.0 mg/dL

H

IgG Index

0.82

<0.70 (elevated indicates
intrathecal IgG production)

H

Test

Result

Reference

Flag

Serum OCBs

1 band

—

CSF OCBs

5 bands

—

H

Unique CSF bands (not in serum)

4

0-1 (positive threshold: ≥2 unique
bands)

H

Interpretation

POSITIVE —
intrathecal IgG
synthesis

—

H

CELL COUNTS
Flag

CHEMISTRY
Flag

H

OLIGOCLONAL BANDS (Isoelectric Focusing)

OTHER
Test

Result

Reference

Myelin Basic Protein (MBP)

3.8 ng/mL

<4.0 ng/mL — high-normal

Culture and Gram Stain

No growth / No
organisms

Negative

VDRL (CSF)

Nonreactive

Nonreactive

Cytology

No malignant cells

Negative

Flag

INTERPRETATION: CSF profile consistent with intrathecal IgG synthesis: elevated IgG index (0.82) and 4 unique
oligoclonal bands not present in serum. These findings, in conjunction with clinical presentation and MRI results, support
the diagnosis of multiple sclerosis. Mildly elevated protein and slightly elevated lymphocyte percentage are consistent with
active demyelination. No evidence of infection or malignancy.

Electronically attested by: Lisa Wong, MD, PhD — Neuropathology / CSF Laboratory
Authorized 01/29/2026 16:30 PST | UCLA Health Lab`,
      },
    ],
    demoPoints: ['Multi-document patient packet', 'MS diagnostic workup', 'MRI + VEP + CSF fusion'],
  },
  {
    id: 'packet-reyes',
    patientName: 'Reyes, Carlos',
    age: 19,
    sex: 'M',
    category: 'packet',
    referringSpecialty: 'Emergency Medicine',
    briefDescription: 'College student with first GTC seizure during finals. ED workup with EEG showing generalized epileptiform discharges.',
    clinicalHighlight: 'First seizure — genetic generalized epilepsy (JME pattern)',
    expectedTier: 'urgent',
    files: [
      {
        filename: '01_ED_Note.pdf',
        path: '/samples/triage/packets/reyes-carlos/01_ED_Note.pdf',
        docType: 'ED Note',
        previewText: `St. Catherine Medical Center — Emergency Department
2100 S. Western Ave, Chicago, IL 60608 | Level II Trauma Center
Phone: (312) 555-0700 | Fax: (312) 555-0701

Patient: Carlos E. Reyes

Date: 01/25/2026

DOB: 10/05/1988

Provider: Patricia Eng, MD

MRN: SCM-0339147

Specialty: Emergency Medicine

CHIEF COMPLAINT
Witnessed seizure — brought in by girlfriend.

HISTORY OF PRESENT ILLNESS
Mr. Reyes is a 37-year-old male with no known medical history who presents after a witnessed generalized tonic-clonic
seizure at home. Per girlfriend: He was watching TV when he suddenly let out a cry, went stiff, then started shaking
rhythmically in all four limbs. She estimates the convulsion lasted 2 minutes. He was unresponsive during the event. She
rolled him onto his side. He was incontinent of urine. After the shaking stopped he was confused and combative for
approximately 15 minutes, then became very sleepy. She called 911. He bit the right side of his tongue.
Patient himself has no recall of the event. He says he felt 'fine' before it happened. He denies any prodrome of aura, smell,
or visual changes. He denies prior episodes. He does report poor sleep this past week due to work stress and consumed
4-5 beers the night before. He denies illicit drug use. He smokes half a pack per day. No family history of epilepsy. Takes no
medications. No recent head trauma or illness. No prior CT or MRI of the brain.

PHYSICAL EXAM
Vitals (on arrival): BP 148/92, HR 110, Temp 37.2°C, O2 sat 98% RA, RR 16
General: Drowsy but arousable, oriented to self only initially. Improved to fully oriented x4 over 45 minutes.
HEENT: Healing laceration right lateral tongue. No head trauma signs. PERRL, 3mm and reactive bilaterally.
Cardiovascular: Tachycardic, regular. No murmurs.
Neuro (post-ictal, on arrival): Drowsy, confused. No focal motor deficits. Moving all four extremities symmetrically. No
gaze deviation. No nystagmus.
Neuro (2 hours post-ictally): Alert and oriented x4. Cranial nerves intact. Motor 5/5 all extremities. Sensation intact.
Reflexes 2+ and symmetric. Gait normal.

ASSESSMENT AND PLAN
1. First unprovoked generalized tonic-clonic seizure (R56.9)
Classic witnessed GTC seizure with tongue bite, urinary incontinence, and postictal confusion. No clear provoking cause
identified, though sleep deprivation and alcohol use are potential lowering factors. Neurological exam normal post-ictally.
Workup:
- CT head without contrast: obtained — results documented separately
- BMP, CBC, glucose, LFTs, UDS, EtOH level: obtained — see labs
- EEG: ordered as outpatient — see referral
- MRI brain with/without contrast: ordered as outpatient
- Counseled patient regarding seizure precautions: no driving, no swimming alone, no operating heavy machinery until
cleared by neurology
- Strongly advised alcohol reduction
- No antiepileptic medication initiated — deferring to outpatient Neurology
- Neurology referral placed; requesting appointment within 1-2 weeks
- Return precautions given: return to ED for any recurrent episode
Disposition: Discharged home with girlfriend after 4 hours of observation. Patient fully oriented at discharge, ambulating
independently.

Electronically signed by: Patricia Eng, MD
Signed 01/25/2026 22:40 CST | St. Catherine ED EHR | Attending: Marcus Webb, MD`,
      },
      {
        filename: '02_CT_Head_Report.pdf',
        path: '/samples/triage/packets/reyes-carlos/02_CT_Head_Report.pdf',
        docType: 'CT Head Report',
        previewText: `University Radiology Group — St. Catherine Medical Center
2100 S. Western Ave, Chicago, IL 60608
Phone: (312) 555-0750 | Fax: (312) 555-0751

RADIOLOGY REPORT
Patient: Carlos E. Reyes

DOB: 10/05/1988

MRN: SCM-0339147

Exam Date: 01/25/2026 21:15

Ordering MD: Patricia Eng, MD

Accession: SCM-R-20260125-4471

EXAM
CT HEAD WITHOUT CONTRAST
CLINICAL INDICATION
37-year-old male with first-time generalized seizure. Rule out intracranial pathology.
TECHNIQUE
Axial CT of the head performed without IV contrast using standard head protocol. 5 mm and 1.25 mm reconstructions in
axial, coronal, and sagittal planes reviewed.
COMPARISON
None available.
FINDINGS
Brain parenchyma: No acute intracranial hemorrhage. No area of abnormal density to suggest infarction or contusion.
Gray-white matter differentiation is preserved. No mass effect or midline shift.
Ventricles/Cisterns: Ventricles are normal in size and configuration. Basal cisterns are patent. No hydrocephalus.
Sulci/Cortex: Normal cortical sulcal pattern for age. No gyral swelling.
Posterior fossa: Cerebellum, brainstem, and fourth ventricle appear unremarkable.
Calvarium/Skull base: No fracture. No bony destructive lesion.
Orbits/Paranasal sinuses: Mild mucosal thickening in bilateral maxillary sinuses, likely chronic/incidental. Orbits grossly
unremarkable.

IMPRESSION
1. No acute intracranial hemorrhage, mass, or structural abnormality identified.
2. No imaging evidence of acute infarction on non-contrast CT.
3. Mild bilateral maxillary sinus mucosal thickening — incidental, clinically insignificant.
Note: A normal non-contrast CT does not exclude subtle structural lesions (e.g., cortical dysplasia, low-grade neoplasm).
MRI brain is recommended for comprehensive evaluation of new-onset seizure.

Electronically attested by: Yuki Tanaka, MD, Diagnostic Radiology
Read and attested 01/25/2026 23:05 CST | Accession SCM-R-20260125-4471`,
      },
      {
        filename: '03_Lab_Results.pdf',
        path: '/samples/triage/packets/reyes-carlos/03_Lab_Results.pdf',
        docType: 'Lab Results',
        previewText: `St. Catherine Medical Center — Laboratory Services
2100 S. Western Ave, Chicago, IL 60608 | CLIA #14D0088440
Phone: (312) 555-0760 | Fax: (312) 555-0761

LABORATORY REPORT
Patient: Carlos E. Reyes

DOB: 10/05/1988

MRN: SCM-0339147

Exam Date: 01/25/2026 21:30

Ordering MD: Patricia Eng, MD

Accession: LAB-20260125-7821

COLLECTION TIME: 01/25/2026 21:30 | REPORTED: 01/25/2026 22:55
BASIC METABOLIC PANEL
Test

Result

Reference Range

Sodium

138

136-145 mEq/L

Potassium

3.9

3.5-5.0 mEq/L

Chloride

101

98-107 mEq/L

CO2 (Bicarbonate)

22

22-29 mEq/L

BUN

14

7-20 mg/dL

Creatinine

0.9

0.7-1.3 mg/dL

eGFR (CKD-EPI)

>60

≥60 mL/min/1.73m²

Glucose

94

70-99 mg/dL

Calcium

9.2

8.5-10.2 mg/dL

Test

Result

Reference Range

WBC

8.4

4.5-11.0 K/µL

RBC

5.1

4.5-5.9 M/µL

Hemoglobin

15.2

13.5-17.5 g/dL

Hematocrit

44.8

41-53%

MCV

88

80-100 fL

Platelets

198

150-400 K/µL

Neutrophils %

72

40-75%

Lymphocytes %

22

20-45%

Test

Result

Reference Range

AST

28

10-40 U/L

ALT

32

7-56 U/L

Total Bilirubin

0.8

0.2-1.2 mg/dL

Alkaline Phosphatase

74

44-147 U/L

Total Protein

7.2

6.3-8.2 g/dL

Albumin

4.3

3.5-5.0 g/dL

Magnesium

1.9

1.7-2.2 mg/dL

Phosphorus

3.4

2.5-4.5 mg/dL

Flag

COMPLETE BLOOD COUNT
Flag

LIVER FUNCTION / OTHER

TOXICOLOGY / ALCOHOL

Flag

Test

Result

Reference Range

Flag

Serum Ethanol

62

<10 mg/dL (negative)

H

Urine Drug Screen — Cannabinoids

POSITIVE

Negative

H

Urine Drug Screen — Cocaine

Negative

Negative

Urine Drug Screen — Opiates

Negative

Negative

Urine Drug Screen — Amphetamines

Negative

Negative

Urine Drug Screen — Benzodiazepines

Negative

Negative

Serum ethanol level of 62 mg/dL is above the legal driving limit (80 mg/dL in IL). Clinical correlation advised. Cannabis detected — may lower
seizure threshold during withdrawal in chronic users, though causal role uncertain.
Electronically attested by: St. Catherine Laboratory Services, CLIA Certified
Director: Howard Park, MD, PhD | Reported 01/25/2026 22:55 CST`,
      },
      {
        filename: '04_EEG_Report.pdf',
        path: '/samples/triage/packets/reyes-carlos/04_EEG_Report.pdf',
        docType: 'EEG Report',
        previewText: `Chicago Neurophysiology Associates
875 N. Michigan Ave, Suite 1900, Chicago, IL 60611
Phone: (312) 555-0820 | Fax: (312) 555-0821

ELECTROENCEPHALOGRAPHY (EEG) REPORT
Patient: Carlos E. Reyes

DOB: 10/05/1988

MRN: SCM-0339147

Exam Date: 02/03/2026 09:15

Ordering MD: Marcus Webb, MD (Neurology) Accession: CNA-EEG-20260203-0882

CLINICAL INDICATION
37-year-old male with first unprovoked generalized tonic-clonic seizure on 01/25/2026. Evaluate for epileptiform activity.
Prior CT head normal.
RECORDING DETAILS
Standard 21-electrode placement per modified 10-20 international system. Recording duration: 40 minutes. Includes
wakefulness, drowsiness, and stage N1/N2 sleep. Hyperventilation performed x3 minutes. Photic stimulation at 1-30 Hz
performed. Video co-recording: yes. Patient cooperative.
BACKGROUND ACTIVITY
Waking background: Posterior dominant rhythm (PDR) of 10 Hz, well-formed, symmetric, and reactive to eye opening.
Amplitude 30-50 µV. Appropriate fronto-central beta activity. No focal slowing. No asymmetry.
SLEEP
Patient transitioned to drowsiness and stage N1/N2 sleep. Vertex waves and sleep spindles identified bilaterally and
symmetrically. K-complexes present. No activation of epileptiform discharges during sleep.
INTERICTAL FINDINGS
Intermittent right temporal sharp waves with phase reversal at T4/T6, occurring in brief runs of 2-4 discharges at
approximately 2 Hz. Maximum amplitude 80 µV. These were most prominent during drowsiness and light sleep. Frequency:
6-8 complexes per 10-minute epoch during drowsiness. No generalized spike-wave complexes observed. No continuous
focal slowing.
HYPERVENTILATION
Hyperventilation produced mild diffuse slowing, normal response. No epileptiform activation.
PHOTIC STIMULATION
No photoparoxysmal response at any flash frequency.
NO CLINICAL SEIZURE
No clinical or electrographic seizure was recorded during this study.

IMPRESSION
1. Mildly ABNORMAL EEG.
2. Intermittent right temporal sharp waves during drowsiness and sleep are epileptiform and increase the risk of recurrent
seizure. This finding is consistent with a focal epileptic tendency, though the index event was clinically generalized —
secondary generalization from a right temporal focus is possible.
3. No generalized epileptiform discharges identified.
4. Normal background activity.
Clinical correlation required. MRI brain with epilepsy protocol is recommended to evaluate for structural etiology in the right
temporal region (e.g., mesial temporal sclerosis, cortical dysplasia, neoplasm).

Electronically attested by: David Park, MD, PhD — Clinical Neurophysiology
Read and attested 02/03/2026 14:30 CST | CNA EEG Lab`,
      },
    ],
    demoPoints: ['Multi-document patient packet', 'First seizure workup', 'EEG-guided epilepsy classification'],
  },
]

export const DEMO_CATEGORIES = [
  { key: 'outpatient' as const, label: 'Outpatient Referrals', count: 10 },
  { key: 'cross_specialty' as const, label: 'Cross-Specialty', count: 12 },
  { key: 'packet' as const, label: 'Diagnostic Packets', count: 4 },
]

export function getDemosByCategory(category: DemoScenario['category']): DemoScenario[] {
  return DEMO_SCENARIOS.filter(s => s.category === category)
}
