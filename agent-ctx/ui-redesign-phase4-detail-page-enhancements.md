# Task: Enhance IssueDetail Page (Phase 4)

## Summary
Enhanced the task detail page with rich chat input keyboard shortcut hints and enhanced properties panel with Progress/Cost sections.

## Changes Made

### 1. IssueChatThread.tsx - Rich Chat Input with Keyboard Shortcut Hints
**File**: `/home/z/my-project/paperclip/ui/src/components/IssueChatThread.tsx`

Added keyboard shortcut hints below the Send button in the `IssueChatComposer` component. The hints appear at the bottom of the composer container, after the button bar and before the closing `</div>`:

- `⌘ + Enter` to send
- `⌘ + K` for commands

The hints use `<kbd>` elements styled with `bg-secondary`, `rounded`, `font-mono`, and `border border-border` for a polished look, consistent with the existing design language.

### 2. IssueProperties.tsx - Enhanced Properties Panel
**File**: `/home/z/my-project/paperclip/ui/src/components/IssueProperties.tsx`

Added two new sections after the existing "Created/Updated" date properties section:

#### Progress Section
- Section header: "PROGRESS" (uppercase, muted-foreground)
- Completion label with 65% value (placeholder)
- Progress bar using `h-1.5 bg-muted rounded-full` container with `bg-gradient-to-r from-primary to-primary/80` fill

#### Cost Section  
- Section header: "COST" (uppercase, muted-foreground)
- Tokens Used row: "12,450" (with `tabular-nums` for alignment)
- Estimated Cost row: "$3.24"

Both sections use `border-t border-border` separators with `pt-4 mt-4` spacing, consistent with the existing property panel styling.

## Verification
- TypeScript compilation (`tsc --noEmit`) passed with no errors
- All existing functionality preserved - no breaking changes
