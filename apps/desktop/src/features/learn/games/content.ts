// Content for Learn's quick games, bundled with the app (no network). Each item has a stable id.
// Markup: in hedge sentences and speeches, [square brackets] mark the words a player should tap
// (a hedge or filler, or the signpost word). Brackets are stripped before showing.

// ---------------------------------------------------------------- Claim Duel
export type ClaimFlaw = "noStance" | "announce" | "hedge" | "filler" | "tooLong" | "offPrompt";
export interface ClaimPair { id: string; prompt: string; strong: string; weak: string; flaw: ClaimFlaw; why: string }

export const FLAW_LABEL: Record<ClaimFlaw, string> = {
  noStance: "No clear stance",
  announce: "Announces a topic",
  hedge: "Hedging",
  filler: "Filler words",
  tooLong: "Too long",
  offPrompt: "Off the prompt",
};
/** Obvious flaws first, subtle ones later. */
export const FLAW_DIFFICULTY: Record<ClaimFlaw, number> = { announce: 0, filler: 0, noStance: 1, tooLong: 1, hedge: 2, offPrompt: 2 };

const P = {
  late: "Should schools start later in the morning?",
  phones: "Should students be allowed to use phones in class?",
  homework: "Is homework worth the time it takes?",
  voting: "Should voting be required for all adults?",
  games: "Are video games good for teenagers?",
  cars: "Should cities ban cars from downtown?",
  uniforms: "Should school uniforms be mandatory?",
  books: "Is it better to read books or watch films?",
  yearRound: "Should the school year be year-round?",
  language: "Should every student learn a second language?",
  junk: "Should junk food be sold in school cafeterias?",
  remote: "Is remote learning as good as learning in a classroom?",
};

export const CLAIM_PAIRS: ClaimPair[] = [
  { id: "late1", prompt: P.late, strong: "Schools should start later because tired students can't learn at eight in the morning.",
    weak: "Today I'm going to talk about school start times.", flaw: "announce", why: "Naming a topic isn't a claim. The strong one says what should happen and why." },
  { id: "late2", prompt: P.late, strong: "High schools must start at nine so students get the sleep their bodies need.",
    weak: "I think schools should maybe start a bit later, probably.", flaw: "hedge", why: "“I think”, “maybe” and “probably” make you sound unsure of your own position." },
  { id: "late3", prompt: P.late, strong: "A later start is better for students because rested minds focus longer in class.",
    weak: "School start times are something lots of families have opinions on.", flaw: "noStance", why: "It describes the debate without taking a side." },
  { id: "phones1", prompt: P.phones, strong: "Phones should stay out of class because every notification pulls students away from learning.",
    weak: "Um, phones in class are, like, a big thing for students.", flaw: "filler", why: "Fillers at the start cost you authority before you've said anything." },
  { id: "phones2", prompt: P.phones, strong: "Students should be allowed phones in class for research, with teachers deciding when.",
    weak: "Phones are something almost every student carries around these days.", flaw: "noStance", why: "A fact isn't a position. Say whether they should be allowed." },
  { id: "phones3", prompt: P.phones, strong: "Schools must ban phones during lessons because focus is the whole point of class time.",
    weak: "I want to talk about phones and whether students, teachers, parents and principals all over the country, in every kind of school, big or small, public or private, should let them be used.",
    flaw: "tooLong", why: "A claim should fit in one breath. This one wanders before it lands anywhere." },
  { id: "hw1", prompt: P.homework, strong: "Homework is worth the time because practice at home makes lessons stick.",
    weak: "I'll talk about homework today.", flaw: "announce", why: "It tells us the topic, not what you believe about it." },
  { id: "hw2", prompt: P.homework, strong: "Homework should be cut to thirty minutes a night so students have time to rest.",
    weak: "Homework is kind of not always worth it, I guess.", flaw: "hedge", why: "“Kind of” and “I guess” water down the point until there isn't one." },
  { id: "hw3", prompt: P.homework, strong: "Daily homework is worth it because it builds the habit of working alone.",
    weak: "Students should get more chances to play sports after class.", flaw: "offPrompt", why: "Sports might be a reason, but the claim never mentions homework." },
  { id: "vote1", prompt: P.voting, strong: "Voting should be required because a democracy works best when everyone takes part.",
    weak: "Voting is when adults choose who runs the country.", flaw: "noStance", why: "That's a definition. It doesn't say whether voting should be required." },
  { id: "vote2", prompt: P.voting, strong: "Required voting is better for democracy because leaders then answer to every adult.",
    weak: "Uh, so, basically voting is, you know, important.", flaw: "filler", why: "“Uh”, “basically” and “you know” bury the one idea in the sentence." },
  { id: "vote3", prompt: P.voting, strong: "Adults must not be forced to vote, because choosing to stay home is also a choice.",
    weak: "Maybe voting should sort of be required, I feel like.", flaw: "hedge", why: "Three hedges in one sentence. Pick a side and say it plainly." },
  { id: "games1", prompt: P.games, strong: "Video games are good for teenagers because they teach problem solving under pressure.",
    weak: "I'm going to speak about video games.", flaw: "announce", why: "Announcing your topic wastes your opening line." },
  { id: "games2", prompt: P.games, strong: "Teenagers deserve video games as a hobby because they build teamwork and quick thinking.",
    weak: "Lots of teenagers play video games on weekends with their friends.", flaw: "noStance", why: "It's true, but it doesn't say whether games are good or bad." },
  { id: "games3", prompt: P.games, strong: "Video games are good for teenagers when they replace scrolling, not sleep.",
    weak: "Schools should have longer lunch breaks so students can relax.", flaw: "offPrompt", why: "A fine idea, but it isn't about video games." },
  { id: "cars1", prompt: P.cars, strong: "Cities should ban cars downtown because streets full of people beat streets full of traffic.",
    weak: "Cars are a big part of life in most cities today.", flaw: "noStance", why: "It describes cities. It never says whether cars should go." },
  { id: "cars2", prompt: P.cars, strong: "Downtown should be car-free because cleaner air will save lives in our cities.",
    weak: "I think cities could perhaps think about maybe banning some cars.", flaw: "hedge", why: "“Perhaps”, “maybe” and “could think about” mean you haven't decided." },
  { id: "cars3", prompt: P.cars, strong: "Cities must keep cars downtown, because shops close when customers can't drive in.",
    weak: "Um, like, cars downtown are, um, kind of a problem.", flaw: "filler", why: "Every “um” and “like” makes the claim harder to take seriously." },
  { id: "uni1", prompt: P.uniforms, strong: "School uniforms should be mandatory because they end the daily pressure of picking outfits.",
    weak: "Today I will discuss school uniforms.", flaw: "announce", why: "It's a table of contents, not a claim." },
  { id: "uni2", prompt: P.uniforms, strong: "Uniforms must not be mandatory, because how students dress is part of who they are.",
    weak: "Some schools have uniforms and some schools don't have them.", flaw: "noStance", why: "Both sides are described. Neither is chosen." },
  { id: "uni3", prompt: P.uniforms, strong: "Mandatory uniforms are better for schools because they make every student look equal.",
    weak: "Uniforms are, um, basically fine I guess.", flaw: "filler", why: "Fillers and a shrug: the listener can't tell what you actually think." },
  { id: "books1", prompt: P.books, strong: "Reading books is better than watching films because your own imagination builds the world.",
    weak: "Books and films are both popular ways people spend their free time.", flaw: "noStance", why: "It compares without choosing. The prompt asks which is better." },
  { id: "books2", prompt: P.books, strong: "Films are better than books for busy students because a story fits into two hours.",
    weak: "I'm going to talk about books, films, television, podcasts, audiobooks, comics, and the many different ways that people of all ages around the world enjoy stories in their free time.",
    flaw: "tooLong", why: "It lists everything and claims nothing. Cut it to one clear side." },
  { id: "books3", prompt: P.books, strong: "Books are better than films because they let you slow down and think.",
    weak: "Students should be given more free time during the school day.", flaw: "offPrompt", why: "Free time is a different topic. The claim should be about books or films." },
  { id: "year1", prompt: P.yearRound, strong: "The school year should be year-round because long summers make students forget what they learned.",
    weak: "This speech is about the school calendar.", flaw: "announce", why: "“This speech is about…” is a topic, not a stance." },
  { id: "year2", prompt: P.yearRound, strong: "Schools must keep summer break because students need a real rest from the school year.",
    weak: "A year-round school year might maybe be kind of good.", flaw: "hedge", why: "Stacked hedges make it sound like you don't believe it." },
  { id: "year3", prompt: P.yearRound, strong: "A year-round calendar is better because shorter breaks keep learning fresh.",
    weak: "Summer is the warmest season of the year in most places.", flaw: "noStance", why: "A weather fact isn't a position on the school calendar." },
  { id: "lang1", prompt: P.language, strong: "Every student should learn a second language because it opens doors to other people.",
    weak: "Languages are spoken by billions of people around the world.", flaw: "noStance", why: "Interesting, but it doesn't say whether students should learn one." },
  { id: "lang2", prompt: P.language, strong: "Schools must teach a second language early, because young brains learn it fastest.",
    weak: "Uh, learning a language is, like, you know, useful.", flaw: "filler", why: "Strip the fillers and there's almost nothing left. Say more, with less noise." },
  { id: "lang3", prompt: P.language, strong: "A second language should be required because students will compete for jobs worldwide.",
    weak: "Schools should buy new computers for all classrooms.", flaw: "offPrompt", why: "Computers aren't languages. Stay on the prompt." },
  { id: "junk1", prompt: P.junk, strong: "Junk food should not be sold in cafeterias because schools should model healthy choices.",
    weak: "I want to talk about cafeteria food.", flaw: "announce", why: "It promises a talk instead of making a point." },
  { id: "junk2", prompt: P.junk, strong: "Cafeterias should sell junk food because students deserve the freedom to choose their lunch.",
    weak: "Junk food is food that has lots of sugar, salt or fat in it.", flaw: "noStance", why: "A definition, with no side taken." },
  { id: "junk3", prompt: P.junk, strong: "Schools must stop selling junk food because sugar crashes ruin afternoon lessons.",
    weak: "I think junk food probably shouldn't sort of be sold, maybe.", flaw: "hedge", why: "The hedges make a firm idea sound like a guess." },
  { id: "remote1", prompt: P.remote, strong: "Remote learning is not as good as a classroom because students learn from each other in person.",
    weak: "Remote learning became very common a few years ago.", flaw: "noStance", why: "History, not a claim. Is it as good or not?" },
  { id: "remote2", prompt: P.remote, strong: "Remote learning is better for students who need to learn at their own pace.",
    weak: "Today I'm going to talk about remote learning.", flaw: "announce", why: "Your first line should be your position, not your topic." },
  { id: "remote3", prompt: P.remote, strong: "Classrooms are better than remote learning because teachers can see who is lost.",
    weak: "Um, remote learning is, basically, kind of okay, I guess.", flaw: "filler", why: "Fillers and hedges turn a claim into a shrug." },
];

/** Prompts for the "write your own" finisher round. */
export const FINISHER_PROMPTS = [
  "Should students grade their teachers?",
  "Should school lunches be free for everyone?",
  "Is it better to have one close friend or many friends?",
  "Should students be paid for good grades?",
  "Should every school have a garden?",
  "Should the voting age be lowered to sixteen?",
];

// ---------------------------------------------------------------- Spot the Hedge
export interface HedgeLine { id: string; text: string; clean: string }

export const HEDGE_LINES: HedgeLine[] = [
  { id: "h1", text: "[I think] we should [maybe] start the school day later.", clean: "We should start the school day later." },
  { id: "h2", text: "[Um], the evidence shows that sleep improves grades.", clean: "The evidence shows that sleep improves grades." },
  { id: "h3", text: "This plan is [kind of] the best option we have.", clean: "This plan is the best option we have." },
  { id: "h4", text: "Recycling [basically] saves money for the whole town.", clean: "Recycling saves money for the whole town." },
  { id: "h5", text: "Students [probably] learn more when they teach each other.", clean: "Students learn more when they teach each other." },
  { id: "h6", text: "[You know], longer breaks help everyone focus.", clean: "Longer breaks help everyone focus." },
  { id: "h7", text: "I [just] want to say that this rule is unfair.", clean: "This rule is unfair." },
  { id: "h8", text: "Our team [sort of] proved the theory was wrong.", clean: "Our team proved the theory was wrong." },
  { id: "h9", text: "[Uh], three out of four students agreed with us.", clean: "Three out of four students agreed with us." },
  { id: "h10", text: "It was, [like], the biggest change in ten years.", clean: "It was the biggest change in ten years." },
  { id: "h11", text: "[I guess] the library should stay open later.", clean: "The library should stay open later." },
  { id: "h12", text: "We [might] want to [perhaps] rethink homework.", clean: "We need to rethink homework." },
  { id: "h13", text: "[I feel like] the data speaks for itself.", clean: "The data speaks for itself." },
  { id: "h14", text: "[Um], [basically], the city needs more buses.", clean: "The city needs more buses." },
  { id: "h15", text: "This is [really] [kind of] important for our future.", clean: "This is important for our future." },
  // "like" and "just" used properly: tap nothing there
  { id: "h16", text: "Cities like Paris have banned cars downtown.", clean: "Cities like Paris have banned cars downtown." },
  { id: "h17", text: "That decision was just and fair to every student.", clean: "That decision was just and fair to every student." },
  { id: "h18", text: "[I think] cities like Oslo show it can work.", clean: "Cities like Oslo show it can work." },
  { id: "h19", text: "The class [just] [kind of] ran out of time.", clean: "The class ran out of time." },
  { id: "h20", text: "[Uh], students who sleep more score higher.", clean: "Students who sleep more score higher." },
  { id: "h21", text: "Phones are [probably] the biggest distraction in class.", clean: "Phones are the biggest distraction in class." },
  { id: "h22", text: "[So], [like], we should vote on it.", clean: "We should vote on it." },
  { id: "h23", text: "I would like to show you one more chart.", clean: "I would like to show you one more chart." },
  { id: "h24", text: "[I mean], the results were clear.", clean: "The results were clear." },
  { id: "h25", text: "Our survey [sort of] suggests students want change.", clean: "Our survey suggests students want change." },
  { id: "h26", text: "[Maybe] we can agree that safety comes first.", clean: "We can agree that safety comes first." },
  { id: "h27", text: "Exercise improves memory, [you know], for everyone.", clean: "Exercise improves memory for everyone." },
  { id: "h28", text: "The new park [literally] changed our neighborhood.", clean: "The new park changed our neighborhood." },
  { id: "h29", text: "[Um], I'd [kind of] like to finish with a story.", clean: "I'd like to finish with a story." },
  { id: "h30", text: "Free lunch is [perhaps] the fairest policy.", clean: "Free lunch is the fairest policy." },
];

/** Splits a marked line into words, with which ones are targets ([bracketed]). Brackets may wrap
 *  several words ("[kind of]"); each word inside counts. Punctuation stays on its word. */
export function hedgeWords(text: string): { word: string; target: boolean }[] {
  const out: { word: string; target: boolean }[] = [];
  const re = /\[([^\]]+)\]([^\s[]*)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] != null) {
      const ws = m[1].split(/\s+/);
      ws.forEach((w, i) => out.push({ word: w + (i === ws.length - 1 ? m![2] : ""), target: true }));
    } else out.push({ word: m[3], target: false });
  }
  return out;
}
export const plain = (text: string) => text.replace(/\[([^\]]+)\]/g, "$1");

// ---------------------------------------------------------------- Signpost Sorter
export type Lane = "claim" | "p1" | "p2" | "end";
export const LANES: { id: Lane; label: string }[] = [
  { id: "claim", label: "Claim" }, { id: "p1", label: "Point 1" }, { id: "p2", label: "Point 2" }, { id: "end", label: "Conclusion" },
];
export interface Speech { id: string; prompt: string; sentences: { text: string; lane: Lane }[] }

/** Each speech has one claim, two points with support, and a conclusion. [Brackets] mark the signpost. */
export const SPEECHES: Speech[] = [
  { id: "s1", prompt: "Should schools start later?", sentences: [
    { lane: "claim", text: "Schools should start at nine, not eight." },
    { lane: "p1", text: "[First], teenagers' body clocks keep them awake late." },
    { lane: "p1", text: "A tired student can't focus in a first-period test." },
    { lane: "p2", text: "[Second], later starts make the roads safer." },
    { lane: "p2", text: "Fewer drowsy teen drivers means fewer morning crashes." },
    { lane: "end", text: "[So] let's give students one more hour of sleep." },
  ] },
  { id: "s2", prompt: "Should phones be banned in class?", sentences: [
    { lane: "claim", text: "Phones should be locked away during lessons." },
    { lane: "p1", text: "[To begin with], notifications break concentration." },
    { lane: "p1", text: "It takes minutes to refocus after every buzz." },
    { lane: "p2", text: "[Another reason] is that phones fuel cheating." },
    { lane: "p2", text: "Answers can be shared across a room in seconds." },
    { lane: "end", text: "[In conclusion], a phone-free class is a focused class." },
  ] },
  { id: "s3", prompt: "Is homework worth it?", sentences: [
    { lane: "claim", text: "Homework is worth the time it takes." },
    { lane: "p1", text: "[First], practice at home makes lessons stick." },
    { lane: "p1", text: "You can't learn math by only watching someone else do it." },
    { lane: "p2", text: "[Second], homework builds independence." },
    { lane: "p2", text: "Working alone teaches you to plan and manage time." },
    { lane: "end", text: "[That's why] a little homework every night pays off." },
  ] },
  { id: "s4", prompt: "Should cities ban cars downtown?", sentences: [
    { lane: "claim", text: "Our city should make downtown car-free." },
    { lane: "p1", text: "[The first reason] is cleaner air." },
    { lane: "p1", text: "Traffic is the biggest source of smog on our main street." },
    { lane: "p2", text: "[The second reason] is that people spend more on foot." },
    { lane: "p2", text: "Walkers stop at shops that drivers speed past." },
    { lane: "end", text: "[To sum up], fewer cars mean a healthier, busier downtown." },
  ] },
  { id: "s5", prompt: "Should uniforms be mandatory?", sentences: [
    { lane: "claim", text: "School uniforms should not be required." },
    { lane: "p1", text: "[For one thing], clothes are how students express themselves." },
    { lane: "p1", text: "A dress code can keep things appropriate without erasing personality." },
    { lane: "p2", text: "[On top of that], uniforms cost families extra money." },
    { lane: "p2", text: "Parents still buy weekend clothes, so uniforms are a second wardrobe." },
    { lane: "end", text: "[Overall], let students choose what they wear." },
  ] },
  { id: "s6", prompt: "Should every student learn a second language?", sentences: [
    { lane: "claim", text: "Every student should learn a second language." },
    { lane: "p1", text: "[First], it opens up friendships and travel." },
    { lane: "p1", text: "You can talk to people you would otherwise never meet." },
    { lane: "p2", text: "[Next], employers value bilingual workers." },
    { lane: "p2", text: "Many jobs pay more if you speak two languages." },
    { lane: "end", text: "[So remember], a second language is a lifelong advantage." },
  ] },
  { id: "s7", prompt: "Are video games good for teenagers?", sentences: [
    { lane: "claim", text: "Video games are good for teenagers in moderation." },
    { lane: "p1", text: "[To start], strategy games train problem solving." },
    { lane: "p1", text: "Players plan ahead, test ideas and learn from failure." },
    { lane: "p2", text: "[Also], online games build teamwork." },
    { lane: "p2", text: "Squads have to communicate clearly to win." },
    { lane: "end", text: "[In short], the right games make sharper, more social teens." },
  ] },
  { id: "s8", prompt: "Should junk food be sold at school?", sentences: [
    { lane: "claim", text: "Schools should stop selling junk food." },
    { lane: "p1", text: "[First of all], sugar crashes ruin afternoon lessons." },
    { lane: "p1", text: "Students who eat candy at lunch struggle to focus by two o'clock." },
    { lane: "p2", text: "[Beyond that], schools should model healthy habits." },
    { lane: "p2", text: "It's confusing to teach nutrition and then sell soda." },
    { lane: "end", text: "[For these reasons], the vending machines should go." },
  ] },
  { id: "s9", prompt: "Should the school year be year-round?", sentences: [
    { lane: "claim", text: "Schools should move to a year-round calendar." },
    { lane: "p1", text: "[The main reason] is the summer slide." },
    { lane: "p1", text: "Over a long summer, students forget weeks of learning." },
    { lane: "p2", text: "[A second benefit] is less burnout." },
    { lane: "p2", text: "Regular short breaks give everyone a chance to recharge." },
    { lane: "end", text: "[In the end], shorter, more frequent breaks help students learn." },
  ] },
  { id: "s10", prompt: "Should voting be required?", sentences: [
    { lane: "claim", text: "Voting should be required for every adult." },
    { lane: "p1", text: "[First], it makes elections truly represent everyone." },
    { lane: "p1", text: "Right now, the loudest groups decide for the rest." },
    { lane: "p2", text: "[Second], it raises interest in politics." },
    { lane: "p2", text: "People who must vote start reading about the choices." },
    { lane: "end", text: "[That is why] every voice should be counted." },
  ] },
  { id: "s11", prompt: "Is it better to read the book or watch the film?", sentences: [
    { lane: "claim", text: "Reading the book is better than watching the film." },
    { lane: "p1", text: "[To begin], books give you the characters' thoughts." },
    { lane: "p1", text: "A film can show a face, but a book shows what's behind it." },
    { lane: "p2", text: "[What's more], your imagination does the directing." },
    { lane: "p2", text: "Every reader builds their own version of the world." },
    { lane: "end", text: "[So next time], read the book before the film." },
  ] },
  { id: "s12", prompt: "Should schools have gardens?", sentences: [
    { lane: "claim", text: "Every school should have a garden." },
    { lane: "p1", text: "[First], gardens turn science into something you can touch." },
    { lane: "p1", text: "Students see how plants grow instead of only reading about it." },
    { lane: "p2", text: "[In addition], gardens improve what students eat." },
    { lane: "p2", text: "Kids are more willing to try vegetables they grew themselves." },
    { lane: "end", text: "[To conclude], a garden is a classroom that feeds you." },
  ] },
];

// ---------------------------------------------------------------- Evidence or Anecdote
export type Bucket = "hard" | "anecdote" | "none";
export const BUCKET_LABEL: Record<Bucket, string> = { hard: "Hard evidence", anecdote: "Anecdote", none: "Not support" };
export interface EvidenceCard { id: string; claim: string; text: string; bucket: Bucket; why: string }
export interface UpgradeSet { id: string; claim: string; anecdote: string; options: [string, string, string]; answer: number; why: string }

const C = {
  sleep: "Schools should start later.",
  phones: "Phones hurt learning in class.",
  exercise: "Exercise makes students focus better.",
  reading: "Reading every day improves vocabulary.",
  bikes: "Our city needs more bike lanes.",
  lunch: "School lunches should be healthier.",
};

export const EVIDENCE_CARDS: EvidenceCard[] = [
  { id: "e1", claim: C.sleep, bucket: "hard", text: "The American Academy of Pediatrics recommends that middle and high schools start at 8:30 or later.",
    why: "A named expert body and a specific recommendation." },
  { id: "e2", claim: C.sleep, bucket: "anecdote", text: "My cousin always falls asleep in first period.", why: "One person's experience. Vivid, but it can't prove a trend." },
  { id: "e3", claim: C.sleep, bucket: "none", text: "Starting later is simply the right thing to do.", why: "This repeats the claim in other words. It doesn't support it." },
  { id: "e4", claim: C.sleep, bucket: "hard", text: "After one district moved its start to 8:30, attendance rose by 4 percent according to its own report.",
    why: "A measured result with a number and a source." },
  { id: "e5", claim: C.sleep, bucket: "anecdote", text: "When I slept in last Saturday, I felt great all day.", why: "A single personal story, not a measurement." },
  { id: "e6", claim: C.sleep, bucket: "none", text: "Everyone knows teenagers love sleeping in.", why: "“Everyone knows” is an assumption, not evidence." },
  { id: "e7", claim: C.phones, bucket: "hard", text: "A study of 90 schools found test scores rose after phones were banned.", why: "A study with a sample size and a measured outcome." },
  { id: "e8", claim: C.phones, bucket: "anecdote", text: "My friend checks Instagram during every math lesson.", why: "One friend's habit. Relatable, but it's a single case." },
  { id: "e9", claim: C.phones, bucket: "none", text: "Phones are bad, and that's why they are harmful in class.", why: "Circular: it uses the claim to prove the claim." },
  { id: "e10", claim: C.phones, bucket: "hard", text: "In a classroom survey, 7 out of 10 students said notifications distracted them weekly.",
    why: "A survey with a clear count of responses." },
  { id: "e11", claim: C.phones, bucket: "anecdote", text: "Yesterday my phone buzzed during a quiz and I lost my place.", why: "A single moment from your own day." },
  { id: "e12", claim: C.phones, bucket: "none", text: "Teachers have always disliked new technology.", why: "Off the point: it's about teachers, not whether learning suffers." },
  { id: "e13", claim: C.exercise, bucket: "hard", text: "Researchers found students did better on attention tests after 20 minutes of walking.",
    why: "A research finding with a specific condition and measure." },
  { id: "e14", claim: C.exercise, bucket: "anecdote", text: "After soccer practice, I always finish my homework faster.", why: "Your own routine: one person, no measurement." },
  { id: "e15", claim: C.exercise, bucket: "none", text: "Exercise is great and everybody should do it.", why: "Opinion and enthusiasm, but no support." },
  { id: "e16", claim: C.exercise, bucket: "hard", text: "The CDC reports that active students tend to have better grades and attendance.",
    why: "A named public health source reporting a pattern." },
  { id: "e17", claim: C.exercise, bucket: "anecdote", text: "My coach says I'm sharper in class on game days.", why: "One coach's impression of one player." },
  { id: "e18", claim: C.exercise, bucket: "none", text: "Gym class was my favorite subject in middle school.", why: "A preference, not a reason anything is true." },
  { id: "e19", claim: C.reading, bucket: "hard", text: "Children who read 20 minutes a day see about 1.8 million words a year, one estimate shows.",
    why: "A specific number from a calculation you can check." },
  { id: "e20", claim: C.reading, bucket: "anecdote", text: "I learned the word “ephemeral” from a fantasy novel.", why: "One word, one reader. A good example, not proof." },
  { id: "e21", claim: C.reading, bucket: "none", text: "Reading is important because it matters a lot.", why: "Circular again: “important because it matters”." },
  { id: "e22", claim: C.reading, bucket: "hard", text: "A national reading report found daily readers scored higher on vocabulary tests.",
    why: "A report comparing groups on a measured outcome." },
  { id: "e23", claim: C.reading, bucket: "anecdote", text: "My grandmother reads every morning and knows every crossword answer.", why: "One person's habit and result." },
  { id: "e24", claim: C.reading, bucket: "none", text: "Libraries are quiet, comfortable places to spend an afternoon.", why: "True, but it's about libraries, not vocabulary." },
  { id: "e25", claim: C.bikes, bucket: "hard", text: "After adding protected lanes, one city counted 40 percent more cyclists within two years.",
    why: "A counted change over a clear period." },
  { id: "e26", claim: C.bikes, bucket: "anecdote", text: "I almost got hit by a car while biking to school last week.", why: "A single scary moment. It grabs attention but proves little alone." },
  { id: "e27", claim: C.bikes, bucket: "none", text: "Bikes are cool and more people should ride them.", why: "An opinion with nothing behind it." },
  { id: "e28", claim: C.bikes, bucket: "hard", text: "The city's own traffic data shows most bike crashes happen on roads without lanes.",
    why: "Official data pointing to a pattern." },
  { id: "e29", claim: C.bikes, bucket: "anecdote", text: "My neighbor started biking to work and loves it.", why: "One neighbor's experience." },
  { id: "e30", claim: C.bikes, bucket: "none", text: "Cars were invented over a hundred years ago.", why: "A fact, but it doesn't support bike lanes." },
  { id: "e31", claim: C.lunch, bucket: "hard", text: "A school nutrition study found students ate 16 percent more vegetables after menus changed.",
    why: "A study with a measured, specific result." },
  { id: "e32", claim: C.lunch, bucket: "anecdote", text: "Last Friday the pizza at lunch was cold and greasy.", why: "One meal, one day." },
  { id: "e33", claim: C.lunch, bucket: "none", text: "Healthy food is better because it is healthier.", why: "Circular: it restates itself." },
  { id: "e34", claim: C.lunch, bucket: "hard", text: "Government guidelines say most teenagers eat less than half the fruit they need.",
    why: "Official guidelines with a measurable gap." },
  { id: "e35", claim: C.lunch, bucket: "anecdote", text: "My little brother refuses to eat anything green.", why: "One picky eater can't tell us about all students." },
  { id: "e36", claim: C.lunch, bucket: "none", text: "Our cafeteria was painted blue last summer.", why: "Unrelated to what's on the menu." },
];

export const UPGRADES: UpgradeSet[] = [
  { id: "u1", claim: C.sleep, anecdote: "My friend is always tired in first period.",
    options: ["My friend and her sister are always tired in first period.", "A survey of 2,000 teens found most get less than 8 hours of sleep on school nights.", "Being tired in first period is the worst feeling ever."],
    answer: 1, why: "A survey with a number turns one tired friend into a pattern." },
  { id: "u2", claim: C.phones, anecdote: "I get distracted by my phone when I study.",
    options: ["A study found students who silenced phones scored higher on recall tests.", "I get really, really distracted by my phone when I study.", "Phones are the most distracting thing ever made."],
    answer: 0, why: "A study with a measured result is hard evidence." },
  { id: "u3", claim: C.exercise, anecdote: "I focus better after a run.",
    options: ["Everyone focuses better after a run.", "I focus much better after a long run.", "Researchers found a short walk before class improved attention scores."],
    answer: 2, why: "“Everyone” is a guess. Research with a measure is evidence." },
  { id: "u4", claim: C.reading, anecdote: "My sister reads a lot and has a huge vocabulary.",
    options: ["My sister reads a lot, so she knows tons of words.", "Students who read daily scored higher on vocabulary tests in a national report.", "Reading is the best hobby in the world."],
    answer: 1, why: "A national report compares many students, not just one." },
  { id: "u5", claim: C.bikes, anecdote: "Biking to school feels dangerous.",
    options: ["Biking to school feels really dangerous to me and my friends.", "Cars go too fast on my street.", "City data shows most bike crashes happen on streets without bike lanes."],
    answer: 2, why: "City data shows where crashes actually happen." },
  { id: "u6", claim: C.lunch, anecdote: "Nobody I know likes the school lunches.",
    options: ["A cafeteria survey found 62 percent of students skip the main dish twice a week.", "Nobody at all likes school lunches.", "School lunches are honestly the worst."],
    answer: 0, why: "A survey with a percentage measures what “nobody I know” only guesses." },
  { id: "u7", claim: "Recycling programs save money.", anecdote: "My town started recycling and it seems to be working.",
    options: ["My town started recycling and it is definitely working well.", "The town's budget report shows waste costs fell 12 percent after recycling began.", "Recycling is good for the planet."],
    answer: 1, why: "A budget report with a number shows the saving." },
  { id: "u8", claim: "Music lessons help with math.", anecdote: "I play piano and I'm good at math.",
    options: ["I play piano and violin and I'm very good at math.", "Music is a universal language.", "A long-term study found students in music programs scored higher in math."],
    answer: 2, why: "A study following many students is stronger than one musician." },
  { id: "u9", claim: "Trees make neighborhoods cooler.", anecdote: "It feels cooler on my tree-lined street.",
    options: ["Temperature readings show tree-lined streets can be several degrees cooler in summer.", "It feels a lot cooler on my street than others.", "Trees are beautiful in every season."],
    answer: 0, why: "Measured temperatures prove what “it feels cooler” suggests." },
  { id: "u10", claim: "Breakfast improves school performance.", anecdote: "I do worse on tests when I skip breakfast.",
    options: ["I always do worse when I skip breakfast, every single time.", "Breakfast is the most important meal of the day.", "A study of school breakfast programs found test scores rose after they started."],
    answer: 2, why: "A study of programs measures the effect across many students." },
  { id: "u11", claim: "Group projects teach teamwork.", anecdote: "My last group project taught me to listen.",
    options: ["A survey of employers ranked teamwork among the top skills they look for, and projects practice it.", "My last two group projects taught me to listen.", "Group projects are fun when your friends are in your group."],
    answer: 0, why: "Employer survey data links the skill to something measurable." },
  { id: "u12", claim: "Longer recess improves behavior.", anecdote: "Our class is calmer after recess.",
    options: ["Our class is way calmer after a long recess.", "Schools that added recess time reported fewer discipline referrals, a district review found.", "Kids need to play outside."],
    answer: 1, why: "A district review counts referrals across schools." },
];
