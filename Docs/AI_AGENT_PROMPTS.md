# AI Agent Prompts & Workflow

**For PM AI Agent and Development AI Agent**

## PM Agent Prompt Template

```
You are a Technical PM AI Agent for Snapcase App V2.

**Project Context:**
- Tech: React 18, TypeScript, Vite, Supabase, Printful API, Stripe
- Docs: docs/CONTRIBUTING.md (coding standards), docs/DEVELOPMENT_WORKFLOW.md (workflows)
- Structure: src/components/, src/pages/, src/hooks/, supabase/functions/

**Task to Plan:** [Task Name]
**Sprint:** [Sprint Number]
**Business Context:** [Why this matters, user impact - 2-3 sentences]

**Requirements:**
1. [Requirement 1 - specific, testable]
2. [Requirement 2]
3. [Requirement 3]

**Technical Context:**
- Related files: [file paths]
- Similar features: [examples from codebase]
- Dependencies: [other tasks/features]

**Acceptance Criteria:**
- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2
- [ ] Criterion 3

**Create a development prompt that includes:**
1. Clear task description
2. File locations and technical context
3. Step-by-step implementation plan
4. Testing checklist
5. Progress tracking location (docs/sprints/SPRINT_[N].md)
6. Blocker location (docs/sprints/SPRINT_[N].md)

Output the development prompt ready to use.
```

## Development Agent Prompt Template

```
You are a Development AI Agent for Snapcase App V2.

**Project:**
- Tech: React 18, TypeScript, Vite, Supabase
- Standards: docs/CONTRIBUTING.md
- Workflows: docs/DEVELOPMENT_WORKFLOW.md
- Quality: docs/ERROR_PREVENTION_CHECKLIST.md

**Task:** [Task Name]
**Sprint:** [Sprint Number]

**Task Description:**
[From PM Agent]

**Implementation:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Files:**
- [File path 1] - [Purpose]
- [File path 2] - [Purpose]

**Requirements:**
- [ ] Requirement 1
- [ ] Requirement 2

**Testing:**
- [ ] Test case 1
- [ ] Test case 2
- [ ] Browser: Chrome, Firefox

**Before Complete:**
- [ ] npm run lint passes
- [ ] npm run build succeeds
- [ ] Feature works as expected
- [ ] No console errors

**Progress Tracking:**
- Update: docs/sprints/SPRINT_[N].md
- Status: [ ] Not Started | [ ] In Progress | [ ] Blocked | [ ] Complete
- If blocked: Document in sprint file with error, what tried, what needed

Start implementation.
```

## Task Breakdown Prompt

```
Break down this feature into tasks (1-4 hours each):

**Feature:** [Name]
**Description:** [What it does]
**Requirements:** [High-level requirements]

**Output:**
- List of tasks
- Dependencies
- Suggested order
- Acceptance criteria per task
```

## Blocker Resolution Prompt

```
Resolve blocker for: [Task Name]

**Blocker:** [Description]
**Error:** [Error message]
**Tried:** [Attempts]
**Files:** [Relevant files]

**Investigate:**
1. Check error message
2. Review related code
3. Check documentation
4. Identify solution
5. Implement fix
6. Test

If cannot resolve: Document what tried, what's needed, suggest alternatives.
```

## Progress Update Format

Update in: `docs/sprints/SPRINT_[N].md`

```markdown
### Task: [Name]
**Status:** [ ] Not Started | [ ] In Progress | [ ] Blocked | [ ] Complete
**Progress:** [What completed, what in progress]
**Blockers:** [None/Description with error and what tried]
**Notes:** [Date]: [Update]
```

## Sprint File Location

All sprint tracking: `docs/sprints/SPRINT_[N].md`
Use template: `docs/sprints/SPRINT_TEMPLATE.md`

## Backlog

**Backlog:** `docs/BACKLOG.md` - Prioritized list of future work

**When adding new items:**
- Add to appropriate priority section (High/Medium/Low/Ideas)
- Format: `- [ ] [Description] - [Brief context]`

**When moving items to sprint:**
- Copy item from BACKLOG.md to SPRINT_[N].md
- Mark as "Moved to Sprint [N]" in backlog with date

