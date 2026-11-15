import type { LayoutMode, MapStyle } from "@shared/model";

export type TemplateCategory = "Structures" | "Notes" | "Exam" | "Planning" | "Analysis";

export interface Template {
  id: string;
  category?: TemplateCategory;
  name: string;
  description: string;
  icon: string;
  layout: LayoutMode;
  theme: string;
  style?: MapStyle;
  /** Markdown content (the first "# " line is the central topic). */
  markdown: string;
}

const topics = (main: string, n = 3) => `# ${main}\n${Array.from({ length: n }, () => "- Topic").join("\n")}\n`;

/** "Create from type": every structure with starter content. */
export const STRUCTURES: Template[] = [
  { id: "s-mindmap", name: "Two-way mind map", description: "Ideas on both sides", icon: "🧠", layout: "mindmap", theme: "lavender", markdown: topics("Main Idea", 4) },
  { id: "s-right", name: "One-way mind map", description: "Logic chart to the right", icon: "➡️", layout: "right", theme: "lavender", markdown: topics("Main Idea") },
  { id: "s-left", name: "Left map", description: "Branches to the left", icon: "⬅️", layout: "left", theme: "lavender", markdown: topics("Main Idea") },
  { id: "s-org", name: "Organization chart", description: "Top-down hierarchy", icon: "🏢", layout: "down", theme: "lavender", markdown: "# Main Idea\n- Topic\n  - Subtopic\n  - Subtopic\n- Topic\n  - Subtopic\n" },
  { id: "s-tree", name: "Tree chart", description: "Indented list, great for notes", icon: "🌲", layout: "tree", theme: "lavender", markdown: "# Main Idea\n- Topic\n  - Subtopic\n  - Subtopic\n- Topic\n" },
  { id: "s-timeline", name: "Timeline", description: "Events in order", icon: "⏳", layout: "timeline", theme: "lavender", markdown: "# History\n- Event 1\n  - Detail\n- Event 2\n  - Detail\n- Event 3\n  - Detail\n" },
  { id: "s-fishbone", name: "Fishbone", description: "Causes of a problem", icon: "🐟", layout: "fishbone", theme: "lavender", style: { line: "straight" }, markdown: "# Problem\n- Cause\n  - Reason\n- Cause\n  - Reason\n- Cause\n  - Reason\n- Cause\n  - Reason\n" },
  { id: "s-brace", name: "Brace map", description: "Whole and its parts", icon: "🦾", layout: "brace", theme: "lavender", markdown: "# Main\n- Topic\n  - Topic\n  - Topic\n- Topic\n  - Topic\n  - Topic\n" },
  { id: "s-radial", name: "Center divergence", description: "Radial burst of ideas", icon: "🌟", layout: "radial", theme: "lavender", markdown: topics("Main", 6) },
];

/** Study templates written for students. */
export const STUDY_TEMPLATES: Template[] = [
  {
    id: "t-chapter",
    category: "Notes",
    name: "Chapter notes",
    description: "Concepts, terms, examples, questions",
    icon: "📘",
    layout: "right",
    theme: "lavender",
    markdown: `# Chapter title
> One-line summary of the chapter
## 💡 Key concepts
- Concept 1
  - Definition
  - Why it matters
- Concept 2
## 📖 Important terms
- Term – meaning
## 🧪 Examples
- Example from class
## ❓ Questions to review
- [ ] Question 1
- [ ] Question 2
## ✅ Summary
- Main takeaway
`,
  },
  {
    id: "t-revision",
    category: "Exam",
    name: "Exam revision plan",
    description: "Track syllabus with checkboxes",
    icon: "🎯",
    layout: "mindmap",
    theme: "lavender",
    markdown: `# Exam: Subject
## 📚 Syllabus
- [ ] Unit 1
- [ ] Unit 2
- [ ] Unit 3
- [ ] Unit 4
## ⚠️ Weak areas
- Topic to revise again
## 📝 Practice
- [ ] Previous year paper 1
- [ ] Previous year paper 2
- [ ] Mock test
## 🔢 Must-remember
- Formulas
- Dates
- Diagrams
## 🎒 Exam day
- [ ] Admit card
- [ ] Pens & calculator
- [ ] Sleep well
`,
  },
  {
    id: "t-answer",
    category: "Exam",
    name: "Answer / essay plan",
    description: "Intro, body dimensions, conclusion",
    icon: "✍️",
    layout: "right",
    theme: "lavender",
    markdown: `# Question
## Introduction
- Define the key term
- Context / data point
## Body
- Political
- Economic
- Social
- Environmental
## Examples & data
- Case study
- Report / survey
## Way forward
- Suggestion 1
- Suggestion 2
## Conclusion
- Balanced, forward-looking line
`,
  },
  {
    id: "t-current",
    category: "Exam",
    name: "Current affairs",
    description: "News issue for competitive exams",
    icon: "📰",
    layout: "mindmap",
    theme: "lavender",
    markdown: `# News issue
## 📍 Why in news
- Recent development
## 🧾 Background
- History of the issue
## 📊 Key facts
- Numbers, places, people
## 🏛️ Govt schemes & laws
- Scheme / Act
## 🎯 Prelims pointers
- Fact likely to be asked
## 🖊️ Mains angle
- GS paper & dimension
## 🚀 Way forward
- Recommendation
`,
  },
  {
    id: "t-cause",
    category: "Analysis",
    name: "Cause & effect",
    description: "Fishbone of causes",
    icon: "🐟",
    layout: "fishbone",
    theme: "lavender",
    style: { line: "straight" },
    markdown: `# Problem / Event
## People
- Cause
## Policies
- Cause
## Economy
- Cause
## Environment
- Cause
## Technology
- Cause
## Society
- Cause
`,
  },
  {
    id: "t-timeline",
    category: "Analysis",
    name: "History timeline",
    description: "Dates and events in order",
    icon: "🏺",
    layout: "timeline",
    theme: "lavender",
    markdown: `# Topic timeline
## Year 1
- What happened
- Who was involved
## Year 2
- What happened
## Year 3
- What happened
## Year 4
- Outcome
`,
  },
  {
    id: "t-compare",
    category: "Exam",
    name: "Compare & contrast",
    description: "Two ideas side by side",
    icon: "⚖️",
    layout: "mindmap",
    theme: "lavender",
    markdown: `# A vs B
## Only A
- Feature
- Feature
## Both
- Similarity
- Similarity
## Only B
- Feature
- Feature
## Verdict
- Which, when and why
`,
  },
  {
    id: "t-summary",
    category: "Notes",
    name: "Book / lecture summary",
    description: "Big idea, points, quotes",
    icon: "🎧",
    layout: "right",
    theme: "lavender",
    markdown: `# Title – Author / Lecturer
## 🌟 Big idea
- One sentence
## 🔑 Key points
- Point 1
- Point 2
- Point 3
## 💬 Quotes
- "Quote"
## 🤔 My thoughts
- What I agree / disagree with
## ✅ Action items
- [ ] Try this
`,
  },
  {
    id: "t-swot",
    category: "Planning",
    name: "SWOT analysis",
    description: "Strengths to threats",
    icon: "🧭",
    layout: "radial",
    theme: "lavender",
    markdown: `# SWOT
## 💪 Strengths
- Strength
## 🩹 Weaknesses
- Weakness
## 🌱 Opportunities
- Opportunity
## ⚡ Threats
- Threat
`,
  },
  {
    id: "t-formulas",
    category: "Notes",
    name: "Formula sheet",
    description: "Formulas grouped by topic",
    icon: "📐",
    layout: "tree",
    theme: "lavender",
    markdown: `# Subject formulas
## Topic 1
- Formula – when to use
- Formula – when to use
## Topic 2
- Formula – when to use
## Units & constants
- Constant = value
`,
  },
  {
    id: "t-week",
    category: "Planning",
    name: "Weekly study plan",
    description: "Day-wise tasks to tick off",
    icon: "🗓️",
    layout: "down",
    theme: "lavender",
    markdown: `# This week
## Mon
- [ ] Task
## Tue
- [ ] Task
## Wed
- [ ] Task
## Thu
- [ ] Task
## Fri
- [ ] Task
## Weekend
- [ ] Revision
`,
  },
  {
    id: "t-research",
    category: "Planning",
    name: "Project / research plan",
    description: "Question, method, sources",
    icon: "🔬",
    layout: "right",
    theme: "lavender",
    markdown: `# Research question
## Background
- What is known
## Hypothesis
- Expected answer
## Method
- Data
- Analysis
## Sources
- Paper / book
## Milestones
- [ ] Outline
- [ ] Draft
- [ ] Final
`,
  },
];

export const ALL_TEMPLATES: Template[] = [...STRUCTURES.map((t) => ({ ...t, category: "Structures" as const })), ...STUDY_TEMPLATES];
export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["Structures", "Notes", "Exam", "Planning", "Analysis"];
