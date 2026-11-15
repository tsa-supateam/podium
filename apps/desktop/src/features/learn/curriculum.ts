// The Learn curriculum: modules -> skills -> lesson + practice.
// Every module is one of the things the analysis scores, and every skill's practice is checked by
// the engine (podium_engine/learn.py, by `check` id) from the same summary the results screen uses,
// so a skill practiced here is exactly what a full run rewards.

export interface Lesson {
  intro: string;
  points: { title: string; body: string }[];
  example?: { weak: string; strong: string; why: string };
  remember: string;
}

export interface Practice {
  instruction: string;
  prompt: string;
  seconds: number;
  /** What the check needs, in plain words. */
  target: string;
  /** How to show the check's value ("2.5 per minute"). */
  unit?: (v: number) => string;
}

export interface Skill {
  id: string;
  title: string;
  check: string; // engine check id
  lesson: Lesson;
  practice: Practice;
}

export interface Module {
  id: string;
  title: string;
  glyph: string;
  color: string;
  blurb: string;
  /** Where it shows up in your results. */
  improves: string;
  /** Score keys from a run's summary that this module raises (for "recommended"). */
  scoreKeys: string[];
  skills: Skill[];
}

const yesNo = (v: number) => (v ? "found" : "not found");

export const MODULES: Module[] = [
  {
    id: "structure",
    title: "Structure",
    glyph: "☰",
    color: "#6aa9ff",
    blurb: "Give your talk a shape listeners can follow: a clear claim, separate points, a real ending.",
    improves: "The Structure score and the Overview's Structure rating (#/5)",
    scoreKeys: ["structure"],
    skills: [
      {
        id: "structure.claim",
        title: "State your claim up front",
        check: "claim_up_front",
        lesson: {
          intro: "Your audience decides in the first 15 seconds whether they know where you're going. Say your position before anything else.",
          points: [
            { title: "One sentence, early", body: "Put your whole position into one sentence and say it within the first 15 seconds, or the first fifth of a longer talk." },
            { title: "Take a side", body: "Use words that commit: “should”, “must”, “is better”, “I believe”. A topic (“today I'll talk about phones”) is not a claim." },
            { title: "Hook, then claim", body: "A quick hook (a question, a fact, a short story) is fine, but the claim must follow right after it." },
          ],
          example: {
            weak: "So, um, today I want to talk about phones in school and some stuff about that.",
            strong: "Schools should ban phones during class, because they cost students focus, grades and sleep.",
            why: "The strong version takes a side and previews the reasons in one sentence.",
          },
          remember: "If someone stopped you after 15 seconds, could they repeat your position?",
        },
        practice: {
          instruction: "Open with your claim in one sentence within the first 15 seconds, then give a reason or two.",
          prompt: "Should students get a longer lunch break? Take a side.",
          seconds: 45,
          target: "A clear claim within the first 15 seconds",
          unit: (v) => `claim at ${Math.round(v)} s`,
        },
      },
      {
        id: "structure.signposts",
        title: "Signpost your points",
        check: "signposts",
        lesson: {
          intro: "Listeners can't scroll back. Signposts are the headings of a speech: they tell people a new point is starting.",
          points: [
            { title: "Number your reasons", body: "“My first reason…”, “The second reason…”, “Finally…”. Simple, and it works." },
            { title: "One point, one signpost", body: "Start each main point with its own signpost so the points stay separate instead of running together." },
            { title: "Preview the count", body: "Saying “I have two reasons” up front lets the audience track where you are." },
          ],
          example: {
            weak: "Phones are distracting and also kids sleep less and grades drop too and teachers hate it.",
            strong: "My first reason is focus: … The second reason is sleep: …",
            why: "Each idea gets its own labeled slot, so the listener can hold onto it.",
          },
          remember: "Two or three signposted points beat six blended ones.",
        },
        practice: {
          instruction: "Make at least two separate points, each starting with a signpost (“First…”, “My second reason…”).",
          prompt: "What are two habits that make someone a good teammate?",
          seconds: 60,
          target: "At least 2 signposted points",
          unit: (v) => `${v} signposted point${v === 1 ? "" : "s"}`,
        },
      },
      {
        id: "structure.conclusion",
        title: "Land the conclusion",
        check: "conclusion",
        lesson: {
          intro: "Talks that just stop feel unfinished. A conclusion tells the audience you're done and what to keep.",
          points: [
            { title: "Signal it", body: "“In conclusion”, “To sum up”, “That's why…”. The audience relaxes and listens for the takeaway." },
            { title: "Come back to your claim", body: "Restate your position in fresh words so the ending ties back to the beginning." },
            { title: "Keep it short", body: "One or two sentences. Don't add new points in the conclusion." },
          ],
          example: {
            weak: "…and yeah, that's kind of it I guess.",
            strong: "That's why schools should ban phones in class: better focus, better sleep and better grades.",
            why: "It signals the end and repeats the claim with its reasons.",
          },
          remember: "Plan your last sentence before your first one.",
        },
        practice: {
          instruction: "Give a short argument and finish with a signalled conclusion that restates your claim.",
          prompt: "Should every student learn to cook before graduating?",
          seconds: 45,
          target: "A signalled conclusion at the end",
          unit: yesNo,
        },
      },
    ],
  },
  {
    id: "evidence",
    title: "Evidence",
    glyph: "✔",
    color: "#4fd18b",
    blurb: "Back every point with something the audience can check: examples, stories, numbers, sources.",
    improves: "The Overview's Evidence rating (#/5) and the Content score's evidence part",
    scoreKeys: ["content"],
    skills: [
      {
        id: "evidence.examples",
        title: "Use examples and stories",
        check: "examples",
        lesson: {
          intro: "A claim without support is just an opinion. The quickest support is a concrete example.",
          points: [
            { title: "Make it specific", body: "Names, places, moments: “Last week in chemistry, three people…” beats “sometimes people…”." },
            { title: "Short stories work", body: "A 2–3 sentence personal story is memorable and counts as support." },
            { title: "Signal it", body: "“For example”, “For instance”, “Imagine…” tell listeners support is coming." },
          ],
          example: {
            weak: "Phones are really distracting for students.",
            strong: "Phones are distracting. For example, in my math class last week, four people missed the test instructions because they were on their phones.",
            why: "The example makes the claim believable and concrete.",
          },
          remember: "Every main point gets at least one “for example”.",
        },
        practice: {
          instruction: "Make your case and back it up at least twice with an example or a short story.",
          prompt: "Is it better to work alone or in a team?",
          seconds: 60,
          target: "At least 2 pieces of support",
          unit: (v) => `${v} piece${v === 1 ? "" : "s"} of support`,
        },
      },
      {
        id: "evidence.hard",
        title: "Bring numbers and sources",
        check: "hard_evidence",
        lesson: {
          intro: "An example shows one case. A number or a named source shows the pattern, and that's what the top Evidence ratings need.",
          points: [
            { title: "Use a figure", body: "“About 40 percent of students…”, “twice as likely…”. Round numbers are fine; be honest." },
            { title: "Name where it's from", body: "“According to a Stanford study…”, “The CDC reports…”. A source makes a number trustworthy." },
            { title: "Pair it with an example", body: "The number shows how big; the story shows what it looks like. Use both." },
          ],
          example: {
            weak: "A lot of teens don't get enough sleep.",
            strong: "According to the CDC, about 7 in 10 high schoolers don't get enough sleep on school nights.",
            why: "A number plus a named source turns a claim into evidence.",
          },
          remember: "Prepare one number and one source for your strongest point.",
        },
        practice: {
          instruction: "Support your point with at least one number or named source (it's practice: a realistic figure is fine).",
          prompt: "Explain why sleep matters for students.",
          seconds: 45,
          target: "At least one number or named source",
          unit: yesNo,
        },
      },
      {
        id: "evidence.every_point",
        title: "Support every point",
        check: "support_every_point",
        lesson: {
          intro: "Strong speakers don't leave any point bare. Each signposted point carries its own support.",
          points: [
            { title: "Point, then proof", body: "Say the point, then immediately give its example or number before moving on." },
            { title: "Check your outline", body: "Before speaking, write each point with its support next to it. Missing one? Cut the point or find support." },
            { title: "Balance", body: "Your weakest-supported point is the one a judge will ask about in Q&A." },
          ],
          remember: "No point without proof.",
        },
        practice: {
          instruction: "Make two signposted points and give each one its own example, story, number or source.",
          prompt: "Should schools start later in the morning? Give two reasons.",
          seconds: 75,
          target: "2+ signposted points, every one supported",
          unit: (v) => `${v} supported point${v === 1 ? "" : "s"}`,
        },
      },
    ],
  },
  {
    id: "commentary",
    title: "Commentary",
    glyph: "❝",
    color: "#c792ea",
    blurb: "Explain what your evidence proves, why it matters, and why the other side is wrong.",
    improves: "The Overview's Commentary rating (#/5)",
    scoreKeys: ["content"],
    skills: [
      {
        id: "commentary.explain",
        title: "Explain your evidence",
        check: "explain_evidence",
        lesson: {
          intro: "Evidence doesn't speak for itself. Commentary is the sentence after the evidence that says what it proves.",
          points: [
            { title: "Use a bridge phrase", body: "“This shows…”, “This means…”, “Which proves…”. Then connect it back to your claim." },
            { title: "Explain each point", body: "Every point needs at least one sentence of reasoning, not just facts." },
          ],
          example: {
            weak: "70 percent of teens don't sleep enough. Next, homework…",
            strong: "70 percent of teens don't sleep enough. This shows early start times work against how teenagers' bodies actually run.",
            why: "The second sentence tells the audience why the number matters for the argument.",
          },
          remember: "After every piece of evidence: “This shows…”.",
        },
        practice: {
          instruction: "Give evidence for your point, and after each piece say what it shows (“This shows…”, “This means…”).",
          prompt: "Should homework be optional? Argue your side.",
          seconds: 60,
          target: "Commentary rated 3/5 or higher",
          unit: (v) => `Commentary ${v}/5`,
        },
      },
      {
        id: "commentary.matters",
        title: "Say why it matters",
        check: "why_it_matters",
        lesson: {
          intro: "The best speakers push one step further: what does the audience gain or lose because of this?",
          points: [
            { title: "Impact", body: "“That matters because…”, “For you, that means…”. Make the stakes personal." },
            { title: "Explain, then impact", body: "Evidence → what it shows → why it matters. That chain earns the top commentary ratings." },
          ],
          remember: "Ask yourself “so what?” after each point, and answer it out loud.",
        },
        practice: {
          instruction: "For each point, explain what your evidence shows and why it matters to your audience.",
          prompt: "Make the case for teaching financial literacy in school.",
          seconds: 75,
          target: "Commentary rated 4/5 or higher",
          unit: (v) => `Commentary ${v}/5`,
        },
      },
      {
        id: "commentary.other_side",
        title: "Answer the other side",
        check: "other_side",
        lesson: {
          intro: "Naming the strongest objection and answering it makes you more convincing, not less.",
          points: [
            { title: "Name it fairly", body: "“Some people argue that…”, “Critics say…”, “You might be thinking…”." },
            { title: "Then answer it", body: "“But…”, “However, that misses…”. Explain why your claim still holds." },
            { title: "Place it late", body: "After your own points, before your conclusion." },
          ],
          example: {
            weak: "Phones should be banned. The end.",
            strong: "Some people say phones help in emergencies. But students can still use them between classes, so a class-time ban keeps them safe and focused.",
            why: "It shows you've thought about the other side and still win.",
          },
          remember: "Your argument is only as strong as the best objection you've answered.",
        },
        practice: {
          instruction: "Argue a side, then name the strongest objection (“Some people say…”) and answer it.",
          prompt: "Should video games be considered a sport? Argue your side.",
          seconds: 60,
          target: "Address the other side",
          unit: yesNo,
        },
      },
    ],
  },
  {
    id: "clarity",
    title: "Clarity & word choice",
    glyph: "✎",
    color: "#f5b14c",
    blurb: "Say it directly, one idea at a time, and leave the audience with a takeaway.",
    improves: "The Content score: directness, clear sentences and takeaway",
    scoreKeys: ["content"],
    skills: [
      {
        id: "clarity.direct",
        title: "Speak directly",
        check: "direct",
        lesson: {
          intro: "Hedges like “I think”, “kind of”, “maybe” and “just” make you sound unsure even when you're right.",
          points: [
            { title: "Cut the softeners", body: "“I think schools should…” → “Schools should…”. Your audience already knows it's your opinion." },
            { title: "Swap vague words", body: "“stuff”, “things”, “really” → the actual noun or a precise adjective." },
          ],
          example: { weak: "I think it's kind of really important to maybe sleep more.", strong: "Sleep is essential.", why: "Same idea, no hedges." },
          remember: "Say it like you mean it.",
        },
        practice: {
          instruction: "Argue a position without hedges: no “I think”, “kind of”, “maybe”, “just”.",
          prompt: "What is one rule you would add to the world?",
          seconds: 45,
          target: "2 or fewer hedges per 100 words",
          unit: (v) => `${v} hedges per 100 words`,
        },
      },
      {
        id: "clarity.one_idea",
        title: "One idea per sentence",
        check: "one_idea",
        lesson: {
          intro: "Long, chained sentences lose listeners. Short fragments sound choppy. Aim for 10–20 words.",
          points: [
            { title: "Stop at the idea", body: "When you hear yourself say “and” for the third time, end the sentence." },
            { title: "Connect short ones", body: "If your sentences are tiny, join related ideas with “because” or “so”." },
          ],
          remember: "One breath, one idea.",
        },
        practice: {
          instruction: "Explain the topic in clear sentences of about 10–20 words each.",
          prompt: "Explain how the internet gets a web page to your screen.",
          seconds: 60,
          target: "Sentences averaging 9–20 words",
          unit: (v) => `${v} words per sentence`,
        },
      },
      {
        id: "clarity.takeaway",
        title: "Finish with a takeaway",
        check: "takeaway",
        lesson: {
          intro: "What should the audience think or do after you finish? Say it, explicitly, at the end.",
          points: [
            { title: "Call to action", body: "“So next time you…”, “We should…”, “Start by…”." },
            { title: "Or a memorable line", body: "“Remember: …”, “The key is…”." },
          ],
          remember: "Write your last sentence first.",
        },
        practice: {
          instruction: "Persuade the audience and end with a clear takeaway or call to action.",
          prompt: "Persuade the audience to volunteer once a month.",
          seconds: 45,
          target: "A clear takeaway at the end",
          unit: yesNo,
        },
      },
    ],
  },
  {
    id: "speed",
    title: "Speaking speed",
    glyph: "⏱",
    color: "#6aa9ff",
    blurb: "Find a pace your audience can follow, and stay steady.",
    improves: "The Speaking speed score (part of Engagement)",
    scoreKeys: ["pacing"],
    skills: [
      {
        id: "speed.target",
        title: "Find your target pace",
        check: "target_pace",
        lesson: {
          intro: "Too fast and people miss words; too slow and they drift. The target is 120–160 words per minute prepared, 100–140 on the spot.",
          points: [
            { title: "Feel the number", body: "About 2–2½ words per second. Read a paragraph against a timer to feel it." },
            { title: "Breathe at periods", body: "A breath at each sentence end naturally slows a fast speaker." },
            { title: "Slow speakers", body: "If you're under target, shorten your pauses rather than talking faster mid-sentence." },
          ],
          remember: "Your target speed is shown on the setup screen for each speech type.",
        },
        practice: {
          instruction: "Speak at a steady, comfortable pace inside your target range.",
          prompt: "Explain what causes the seasons on Earth.",
          seconds: 60,
          target: "Average speed inside your target range",
          unit: (v) => `${Math.round(v)} words/min`,
        },
      },
      {
        id: "speed.steady",
        title: "Keep a steady rhythm",
        check: "steady_pace",
        lesson: {
          intro: "Speeding up when nervous and stalling when lost both cost points. Natural variation is fine; big swings aren't.",
          points: [
            { title: "Slow down on purpose", body: "Slow down for your key line, not because you lost your place." },
            { title: "Pause instead of rushing", body: "When you feel the rush coming, stop for a beat." },
          ],
          remember: "Steady most of the time, slower for what matters.",
        },
        practice: {
          instruction: "Keep an even pace the whole way through, slowing only for your most important sentence.",
          prompt: "Describe a place that feels like home and why.",
          seconds: 60,
          target: "Speed score 70 or higher",
          unit: (v) => `Speed score ${Math.round(v)}`,
        },
      },
    ],
  },
  {
    id: "fillers",
    title: "Filler words",
    glyph: "∅",
    color: "#ff6b6b",
    blurb: "Trade “um”, “uh” and “like” for confident silence.",
    improves: "The Filler words score (part of Engagement)",
    scoreKeys: ["fillers"],
    skills: [
      {
        id: "fillers.fewer",
        title: "Notice your fillers",
        check: "fewer_fillers",
        lesson: {
          intro: "Most fillers happen at the start of a sentence, while you decide what to say next. Noticing them is half the fix.",
          points: [
            { title: "Know your top filler", body: "Check your last results: the filler card lists your most common one." },
            { title: "Start sentences cleanly", body: "Close your mouth before a new sentence. It's hard to say “um” with your lips together." },
          ],
          remember: "You can't fix what you don't hear.",
        },
        practice: {
          instruction: "Talk on the topic while keeping fillers (“um”, “uh”, “like”) to a minimum.",
          prompt: "Describe the best advice you have ever received.",
          seconds: 60,
          target: "4 or fewer fillers per minute",
          unit: (v) => `${v} per minute`,
        },
      },
      {
        id: "fillers.pause",
        title: "Pause instead of filling",
        check: "pause_not_fill",
        lesson: {
          intro: "A one-second silence sounds confident to the audience, even though it feels long to you.",
          points: [
            { title: "Silent beat", body: "When you need a moment, stop talking. Count “one” in your head." },
            { title: "Plan transitions", body: "Fillers cluster between points. Knowing your next signpost removes the gap." },
          ],
          remember: "Silence is a tool, not a mistake.",
        },
        practice: {
          instruction: "Answer on the spot, and pause silently whenever you'd normally say “um”.",
          prompt: "What makes a good leader?",
          seconds: 60,
          target: "1.5 or fewer fillers per minute",
          unit: (v) => `${v} per minute`,
        },
      },
    ],
  },
  {
    id: "voice",
    title: "Vocal variety",
    glyph: "♪",
    color: "#c792ea",
    blurb: "Use pitch and volume so your voice carries meaning, not just words.",
    improves: "The Expressive voice score (part of Engagement)",
    scoreKeys: ["vocalVariety"],
    skills: [
      {
        id: "voice.range",
        title: "Vary your pitch",
        check: "pitch_range",
        lesson: {
          intro: "A flat voice makes even exciting content sound boring, and the audience's attention drops.",
          points: [
            { title: "Rise and fall", body: "Let your pitch rise on questions and important words, and fall at the end of statements." },
            { title: "Smile when it fits", body: "It lifts your pitch and energy automatically." },
          ],
          remember: "Talk to the audience like you're telling a friend something exciting.",
        },
        practice: {
          instruction: "Tell the story with lots of expression: rise, fall and change volume.",
          prompt: "Tell the story of your proudest accomplishment.",
          seconds: 60,
          target: "Expressive voice score 65 or higher",
          unit: (v) => `Voice score ${Math.round(v)}`,
        },
      },
      {
        id: "voice.stress",
        title: "Stress key words",
        check: "stress_words",
        lesson: {
          intro: "In each sentence, one or two words carry the meaning. Hit them harder.",
          points: [
            { title: "Pick the word", body: "“We need to act NOW” vs “WE need to act now”. Different meaning, different stress." },
            { title: "Volume and pause", body: "Say the key word a little louder, or pause just before it." },
          ],
          remember: "Underline one word per sentence, then say it like it's underlined.",
        },
        practice: {
          instruction: "Give a short speech and stress the one key word in every sentence.",
          prompt: "Give a pep talk to a nervous robot before its first day of school.",
          seconds: 45,
          target: "Expressive voice score 80 or higher",
          unit: (v) => `Voice score ${Math.round(v)}`,
        },
      },
    ],
  },
  {
    id: "eye",
    title: "Eye contact",
    glyph: "◉",
    color: "#4fd18b",
    blurb: "Look at your audience, and share your attention across the room.",
    improves: "The Eye contact score (part of Engagement)",
    scoreKeys: ["eyeContact"],
    skills: [
      {
        id: "eye.hold",
        title: "Hold eye contact",
        check: "hold_contact",
        lesson: {
          intro: "Eye contact is the strongest signal of confidence, and the virtual audience reacts to it directly.",
          points: [
            { title: "Glance, don't read", body: "If you use notes, look down for a phrase, then up to say it." },
            { title: "Finish sentences looking up", body: "The end of a sentence is the moment to be looking at someone." },
          ],
          remember: "Look up for every last word.",
        },
        practice: {
          instruction: "Speak while keeping your eyes on the audience (or the camera) almost the whole time.",
          prompt: "Tell me about yourself.",
          seconds: 45,
          target: "Eye contact score 70 or higher",
          unit: (v) => `Eye contact ${Math.round(v)}`,
        },
      },
      {
        id: "eye.sweep",
        title: "Sweep the room",
        check: "sweep_room",
        lesson: {
          intro: "Staring only at the center leaves the sides of the room feeling ignored, and their engagement drops.",
          points: [
            { title: "Thought by thought", body: "Give each sentence to a different part of the room: left, center, right." },
            { title: "Hold for a sentence", body: "Don't dart around; stay with one side for a full thought." },
          ],
          remember: "Each side of the room gets at least a sixth of your attention. (In Direct camera mode this skill passes automatically.)",
        },
        practice: {
          instruction: "Use Simulated audience mode and share your eye contact across left, center and right.",
          prompt: "Give the opening speech at the first school on the Moon.",
          seconds: 60,
          target: "Left and right sides each get 15%+ of your gaze",
          unit: (v) => `smaller side ${Math.round(v)}%`,
        },
      },
    ],
  },
];

export const SKILLS = MODULES.flatMap((m) => m.skills.map((s) => ({ ...s, module: m })));
export const skillById = (id: string) => SKILLS.find((s) => s.id === id) ?? null;
export const skillByCheck = (check: string) => SKILLS.find((s) => s.check === check) ?? null;

/** Results-screen tip metrics -> the skill that teaches it. */
export const SKILL_FOR_METRIC: Record<string, string> = {
  pacing: "speed.target",
  fillers: "fillers.fewer",
  vocalVariety: "voice.range",
  eyeContact: "eye.hold",
  structure: "structure.conclusion",
  content_evidence: "evidence.examples",
  content_directness: "clarity.direct",
  content_clarity: "clarity.one_idea",
  content_takeaway: "clarity.takeaway",
  content_relevance: "structure.claim",
};

// ------------------------------------------------------------- mastery
export interface CheckStatus {
  attempts: { id: string; value: number | null; passed: boolean; sessionId: string; at: string | null }[];
  recent: { id: string; value: number | null; passed: boolean }[];
}
export interface LearnStatus {
  lessons: string[];
  checks: Record<string, CheckStatus>;
}

export type Mastery = 0 | 1 | 2 | 3; // not started, familiar, proficient, mastered
export const MASTERY = [
  { name: "Not started", color: "var(--line)" },
  { name: "Familiar", color: "#e0a03d" },
  { name: "Proficient", color: "#6aa9ff" },
  { name: "Mastered", color: "#4fd18b" },
] as const;
export const MASTERY_POINTS = [0, 50, 80, 100];

/** Familiar: lesson read or a practice tried. Proficient: a practice passed.
 *  Mastered: practice passed and the skill shows up in 2 of your last 3 full runs. */
export function mastery(skill: Skill, st: LearnStatus | null): Mastery {
  if (!st) return 0;
  const c = st.checks[skill.check];
  const passed = !!c?.attempts.some((a) => a.passed);
  const inRuns = (c?.recent ?? []).filter((r) => r.passed).length >= 2;
  if (passed && inRuns) return 3;
  if (passed) return 2;
  if (st.lessons.includes(skill.id) || (c?.attempts.length ?? 0) > 0) return 1;
  return 0;
}

export function moduleProgress(m: Module, st: LearnStatus | null): number {
  const pts = m.skills.reduce((a, s) => a + MASTERY_POINTS[mastery(s, st)], 0);
  return Math.round(pts / m.skills.length);
}
