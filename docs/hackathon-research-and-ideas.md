# UNSW × Mistral AI × Atlassian Hackathon 2026

## Source materials

- Information session slides: `/Users/edwinj/Downloads/INFORMATION_SESSION.pdf`
- Atlassian presentation: <https://unsw-mistral-atlassian-2026.atlassian-workers-test.workers.dev/#welcome>
- Notes compiled: 31 July 2026

## Challenge statement

> How might AI help multi-disciplinary teams make sense of information, present ideas, align on decisions, and review work more effectively?

The broader context is information overload. The amount of data and generated content is growing, while different teams work with different formats, terminology, priorities, and sources of truth.

## What the challenge includes

### Teams and disciplines

- Design
- Engineering
- Product
- Operations
- Business
- Law
- Science

### Information and content types

- Pull requests
- Whiteboard photos
- Recordings
- Documents
- PDFs
- Spreadsheets
- Raw data
- Quantitative and qualitative information

## Mandatory requirements

- Use Mistral APIs rather than OpenAI or Anthropic APIs.
- Directly address information overload and teamwork.
- Prefer specialised models, APIs, and workflows over one giant prompt.
- The solution may be a no-code prototype or a deeper technical system.
- The core user flow must be demonstrable.

## Judging criteria

### Challenge-specific criteria

- **Relevance:** clearly responds to the problem statement.
- **Usefulness:** delivers value for real teams.
- **Generality:** works across domains and content types.
- **Hidden Signals Award:** uncovers a non-obvious pattern, contradiction, anomaly, or connection in complex information.

### Information-session criteria

1. **Value and human insight**
   - Name a specific target user and pain point.
   - Demonstrate real-world value.
   - Consider responsibility, privacy, ethics, liability, and other guardrails.
2. **Creativity and design**
   - Start from the persona's pain rather than stacking features.
   - Avoid building a generic dashboard unless it adds real value.
   - Keep the interface focused, accessible, and appropriate for the persona.
3. **Feasibility and scalability**
   - Consider user cost and development/maintenance cost.
   - Explain how the solution could work beyond the hackathon.
4. **Technical execution**
   - Build something realistic within the available time.
   - Judges can only score what can be shown working.
5. **Use of AI**
   - AI should support human thinking rather than replace it.
   - Fact-check generated output.
   - Use the right model for size, latency, cost, and modality.

## Recommended pitch narrative

1. **Persona:** introduce one specific user and role.
2. **Problem:** show an urgent, costly, and currently unresolved pain point.
3. **Insight:** explain why existing solutions fail and what the team's breakthrough is.
4. **Solution:** describe the product in one sentence and show one or two core capabilities.
5. **Live demo:** show one complete path from raw input to useful output.
6. **Future:** explain how the solution can expand after the hackathon.

Keep the narrative tight, hook the audience early, show rather than tell, and never skip the live demo. Prepare a prerecorded backup in case the live demo fails.

## Architecture and MVP guidance

- Start with the user, problem, and desired outcome.
- Break the system into frontend, backend, API/AI layer, storage, and external services.
- Map the complete user and data flow from the initial trigger.
- Use multimodal capabilities where they materially help.
- Design for privacy and secure access.
- Choose the smallest version that proves the core idea.
- Move optional features to the stretch-goal list.
- A simple, reliable, working demo is better than a complex unfinished system.

## Event schedule from the information-session slides

### Friday, 31 July

- Opening address and problem-statement reveal
- Settling down and team preparation
- Main hacking period begins

### Saturday, 1 August

- Submission due at 12:00 pm
- Lunch and judging
- Top teams pitch
- Winners announced at 4:00 pm

Times should be checked against the latest official event announcement.

## Idea backlog

### 1. AI Meeting Decision Radar

**One-line pitch:** An AI decision radar that detects contradictions, missing ownership, and unresolved assumptions across meetings and project documents.

**Inputs:** meeting recording, transcript, whiteboard photo, requirement document, and previous decision log.

**Outputs:**

- Decisions and their supporting evidence
- Owners and deadlines
- Unresolved disagreements
- Statements that conflict with written requirements
- Role-specific summaries for product, engineering, design, and operations

**Demo moment:** The meeting says a feature is approved for launch, but the requirement document still marks it as delayed. The system highlights the contradiction and identifies who needs to resolve it.

**MVP:** Upload one recording and one document, then generate a decision log with one detected conflict.

### 2. Spec Drift Radar

**One-line pitch:** Detect when implementation, design, testing, and product requirements have silently drifted apart.

**Inputs:** product specification, pull request, design screenshot, and QA spreadsheet.

**Outputs:**

- Requirement-to-implementation comparison
- Missing acceptance criteria
- Conflicting values, states, or terminology
- A short resolution checklist assigned by role

**Demo moment:** The design says users can undo an action for 30 days, the specification says 14 days, and the code implements 7 days.

**MVP:** Compare three small artefacts and surface one clear inconsistency.

### 3. Evidence Graph

**One-line pitch:** Turn scattered claims and evidence into a traceable decision graph.

**Inputs:** PDFs, spreadsheets, research notes, and recordings.

**Outputs:**

- Claims linked to their supporting sources
- Unsupported assumptions
- Conflicting evidence
- Confidence and freshness indicators

**Demo moment:** A proposal claims that customers prefer feature A, but the system shows that the claim is based on one old interview while current usage data points to feature B.

**MVP:** Build a graph for five claims across one PDF and one spreadsheet.

### 4. Smart Handoff Compiler

**One-line pitch:** Convert a mixed project folder into a role-specific handoff package with missing information clearly identified.

**Inputs:** project documents, tickets, meeting notes, designs, and launch checklist.

**Outputs:**

- Engineering, design, operations, and legal handoff views
- Missing owners, approvals, deadlines, and dependencies
- Questions that must be resolved before the next phase

**Demo moment:** The launch appears ready, but the system finds that no one owns rollback communication and legal approval is absent.

**MVP:** Generate two role-specific handoffs and identify one missing dependency.

### 5. Qual × Quant Insight Finder

**One-line pitch:** Connect qualitative feedback with quantitative data to reveal where the two tell different stories.

**Inputs:** interview transcripts, survey responses, product analytics, and spreadsheets.

**Outputs:**

- Themes from user feedback
- Supporting or contradicting metrics
- Minority views that may be hidden by averages
- Suggested investigation questions

**Demo moment:** Users say the product feels slow, while analytics reveal that most abandonment happens at the permissions step rather than during loading.

**MVP:** Compare a small set of interview comments with a simple funnel spreadsheet.

### 6. Constraint Translator

**One-line pitch:** Translate policy, legal, scientific, and business constraints into testable product requirements.

**Inputs:** policies, regulations, technical documents, product specifications, and pull requests.

**Outputs:**

- Plain-language constraints
- Engineering acceptance tests
- Design and accessibility checks
- Missing or violated constraints

**Demo moment:** A privacy document prohibits retaining raw audio, but the implementation plan stores recordings indefinitely.

**MVP:** Convert one policy document into five acceptance checks and test them against one specification.

### 7. Incident Story Builder

**One-line pitch:** Reconstruct a shared incident timeline from fragmented technical and business information.

**Inputs:** logs, tickets, alerts, meeting notes, customer reports, and runbooks.

**Outputs:**

- Unified incident timeline
- Decisions and their context
- Early warning signals
- Conflicting assumptions between teams
- Follow-up actions

**Demo moment:** Operations noticed repeated warnings, support saw similar complaints, and engineering changed a dependency, but no team saw the combined pattern before the incident.

**MVP:** Reconstruct one incident from three small data sources.

### 8. Semantic Misalignment Detector

**One-line pitch:** Detect when different teams use the same words but mean different things.

**Target users:** product managers and project leads coordinating engineering, design, operations, legal, or business teams.

**Problem:** Teams often appear aligned because they repeat the same term—such as “launch-ready,” “approved,” “customer,” or “real-time”—while each discipline is using a different definition.

**Inputs:** meeting transcripts, specifications, checklists, policies, and team documents.

**Outputs:**

- Important terms with inconsistent definitions
- The definition implied by each team or source
- Decisions affected by the ambiguity
- A proposed shared definition and clarification questions

**Demo moment:** Product uses “launch-ready” to mean the feature is complete, engineering means it has passed automated tests, operations means monitoring and rollback are ready, and legal means final approval has been issued. The tool exposes the mismatch before launch.

**Why it fits the challenge:**

- Directly addresses multidisciplinary alignment.
- Works across industries and content types.
- Produces an unusual and easily understood hidden signal.
- Can be demonstrated with a small, reliable MVP.

**MVP:** Upload three short team documents, detect one ambiguous shared term, show the competing definitions, and generate one clarification card.

## Current shortlist

1. **Spec Drift Radar** — strongest overall fit and clear Hidden Signals demo.
2. **AI Meeting Decision Radar** — simplest complete MVP and easiest story to communicate.
3. **Semantic Misalignment Detector** — most distinctive new direction.
4. **Qual × Quant Insight Finder** — strong creativity if good sample data is available.

