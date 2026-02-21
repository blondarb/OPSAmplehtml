#!/bin/bash
# Generate two-voice visit audio by splitting doctor/patient lines
# Doctor = Reed (male), Patient = Samantha (female)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../generated"
TEMP_DIR="$OUTPUT_DIR/temp"

mkdir -p "$TEMP_DIR"

# Define the dialogue as alternating doctor/patient lines
# Odd lines = Doctor (Reed), Even lines = Patient (Samantha)
LINES=(
  "Good morning Sarah, I'm Doctor Wilson. Thank you for coming in today. Tell me what's been going on with your headaches."
  "Thank you doctor. So my headaches have been getting a lot worse over the past six months or so. I used to only get maybe four or five a month, but now it feels like I have a headache almost every other day."
  "That sounds really frustrating. When exactly did you notice this change?"
  "I think it started gradually around August or September of last year. At first I just thought I was stressed at work, but it kept getting worse."
  "Can you describe what the headaches feel like?"
  "They're usually on both sides of my head, like a throbbing pressure. The pain is usually about a 7 or 8 out of 10. They last pretty long too, maybe 8 to 12 hours if I don't take anything."
  "Do you get any other symptoms with the headaches? Like sensitivity to light or sound, nausea, visual changes?"
  "Yes, definitely light and sound sensitivity. I have to go to a dark room when it gets bad. I get nauseous sometimes but I don't usually vomit. No, I don't see any flashing lights or anything like that before the headaches."
  "What about numbness, tingling, or weakness anywhere?"
  "No, nothing like that."
  "How often are you taking the sumatriptan?"
  "Honestly, probably every other day at this point. It helps but the headache often comes back later the same day."
  "That's an important detail. Using triptans that frequently can actually make the headaches worse over time. It's called medication overuse headache."
  "Oh really? I didn't know that. I just thought I needed it because the headaches were so bad."
  "How are the headaches affecting your daily life? Work, social activities?"
  "It's been pretty tough. I missed three days of work last month. And on the weekends I often just want to stay in bed. My husband is getting worried about me."
  "Are you sleeping okay?"
  "Not great. I average about 5 to 6 hours a night. I have trouble falling asleep, especially when I have a headache."
  "Any depression or anxiety?"
  "I wouldn't say I'm depressed, but I'm definitely frustrated and anxious about the headaches getting worse. I worry that something is wrong."
  "That's understandable. The good news is your MRI from August was completely normal, which is very reassuring. Let me do a quick neurological exam."
  "Okay."
  "Your neurological exam looks completely normal. Cranial nerves are intact, strength is full throughout, reflexes are symmetric, coordination and gait are normal. I do notice some tightness in your neck and trapezius muscles, which is common with chronic headaches. So here's what I think is going on. You meet the criteria for chronic migraine, which means you're having headaches on 15 or more days per month. On top of that, because you're using the sumatriptan so frequently, more than 10 days a month, you likely have a medication overuse headache component making things worse."
  "That makes sense. So what do we do?"
  "I'd like to start you on a preventive medication. I'm recommending a CGRP inhibitor called erenumab, or Aimovig. It's a once monthly injection that you give yourself at home. It's specifically designed for migraine prevention and has fewer side effects than the older medications. For the triptan overuse, we need to bring your sumatriptan use down to less than 10 days per month. I'm going to give you naproxen 500 milligrams as a bridge medication. On days when you would normally reach for the sumatriptan, try the naproxen first. I'd also like you to start a headache diary so we can track your progress. Keep track of headache days, severity, what medications you take, and any triggers you notice. And the sleep issue is important too. Let's work on sleep hygiene. Try to keep a consistent bedtime, avoid screens before bed, and aim for 7 to 8 hours. Let's follow up in 6 weeks. By then the erenumab should be starting to work and we can see if we need to adjust anything."
  "That sounds like a good plan. Thank you doctor. I feel much better having a plan."
  "You're welcome Sarah. My medical assistant will go over the injection instructions with you and we'll get the prior authorization started for the medication. Don't hesitate to call if your headaches get significantly worse before our follow up visit."
)

echo "Generating ${#LINES[@]} dialogue segments..."

# Generate each line as a separate audio file
for i in "${!LINES[@]}"; do
  line="${LINES[$i]}"
  padded=$(printf "%03d" $i)

  # Odd index = doctor (Reed), Even index = patient (Samantha)
  if (( i % 2 == 0 )); then
    voice="Reed"
    speaker="doctor"
  else
    voice="Samantha"
    speaker="patient"
  fi

  echo "  [$padded] $speaker ($voice): ${line:0:50}..."
  say -v "$voice" -o "$TEMP_DIR/segment_${padded}.aiff" "$line"
done

echo "Concatenating segments..."

# Build sox/ffmpeg concat list - use afconvert + cat approach
# First convert all to raw PCM, concatenate, then back to AIFF
# Simpler approach: use afconvert to make WAV files, then use sox or just cat

# Check if sox is available
if command -v sox &> /dev/null; then
  echo "Using sox to concatenate..."
  sox "$TEMP_DIR"/segment_*.aiff "$OUTPUT_DIR/visit-migraine.aiff"
elif command -v ffmpeg &> /dev/null; then
  echo "Using ffmpeg to concatenate..."
  # Create ffmpeg concat list
  CONCAT_LIST="$TEMP_DIR/concat.txt"
  > "$CONCAT_LIST"
  for f in "$TEMP_DIR"/segment_*.aiff; do
    echo "file '$f'" >> "$CONCAT_LIST"
  done
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$OUTPUT_DIR/visit-migraine.aiff" 2>&1
else
  echo "Neither sox nor ffmpeg found. Falling back to single-voice generation..."
  say -v Samantha -o "$OUTPUT_DIR/visit-migraine.aiff" -f "$SCRIPT_DIR/visit-migraine.txt"
fi

# Clean up temp files
rm -rf "$TEMP_DIR"

echo ""
echo "Done! Generated files:"
ls -lh "$OUTPUT_DIR"/*.aiff 2>/dev/null
