---
name: smelp-do
description: Take a feature idea, bug or chore the user names and carry it all the way, filing it as a SMELP work item on the production smelp board and then working that item to an open PR. Use whenever the user wants something both tracked and built in one go ("build X and track it", "file and fix this", "make a ticket for X and do it", "/smelp-do <idea>"). For filing only, use smelp-ticket. For an existing ticket key, use smelp-work.
---

# File a SMELP item and work it

This skill chains two others. Read both in full before you start, and follow them as written except where this file says otherwise:

1. `.claude/skills/smelp-ticket/SKILL.md`
2. `.claude/skills/smelp-work/SKILL.md`

## 1. File the item

Follow smelp-ticket steps 1 to 6, with these changes:

- **Duplicates.** If the search finds an open item that covers the idea, don't create a second one. Tell the user which key you're taking, and continue with that key in step 3 below. smelp-work's step 1 then decides whether it is a fresh start or a pickup.
- **State.** Create the item with `state: "In Progress"`, because work starts now.
- **One item.** If the idea splits into parts that ship on their own, file each part, then work only the first. Name the others in the reply.

## 2. Stop or go

Stop after filing, report the key as smelp-ticket step 7 says, and ask the user, when either is true:

- The item is an `epic`.
- Scoping turned up a product call that only the user can make. Put the question in the item's description too, so the answer has a home.

Otherwise go straight on. Don't ask for confirmation.

## 3. Work the item

Follow smelp-work from step 0 with the new key. Skip the state change in smelp-work step 2, because the item is already `In Progress`. Still add the comment from that step if you decide something the description left open.

## Reply

Use smelp-work's reply. Say that the item was created in this run, or name the existing item you took over.
