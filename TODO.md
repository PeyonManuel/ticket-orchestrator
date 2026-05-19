We need to ensure programatically that the AI is responding with gerkhin, it is not doing it most of the time. Maybe spike on this to see solutions, maybe use a tool for it, or some programatic way to make this deterministic, maybe what we are sending it from the previous phase isnt good enough? maybe it should ask the PO questions so that it has more info to create gherkin? It seems to try to ask these as i try to make it write AC's on tickets where it hadnt. Before when we had the separate AC array, we didnt have this issue, so i wonder if thats an interesting insight.

If the AI already generated ticket 5, then i leave and come back, it generates ticket 5 again. It needs to remember it already generated it.

Now the Architect/blueprint is creating tickets that are duplicated, or at least its setting two tickets as duplications of each other, what is this?

If i open a new epic, dont write anything and leave, that epic didnt start so it shouldnt be saved as anything.

If i send a message to a chat, immediatly leave, then next time i get into the chat i should see that the AI is still thinking or the answer it already had, right now it drops the thinking and no output is sent and nothing is saved.

When the AI updates a ticket, the reverse button of the description isnt allowing to revert its changes, see to fix this.

So we have to first, need a button to retry the planning phase.

On phase 5 the AI should know about the tickets that where removed, all the information of them and know when they where removed.

When creating an epic from the orchestrator, it is setting already tickets as deleted when no tickets where deleted, investigate on this.

When the orchestrator creates the sprints, its showing like a full date 2026-06-03T00:00:00.000Z instead of just 2026-06-03.

No way to edit the sprint names that the AI proposes, its also not proposing them starting from the logical next sprint name, since all the sprints should be labeled as "Board name - {incremental number}".

Make orchestrator UI timeline be clickable, to be able to move between phases much quicker.
Show Ticket type label in the deep dive phase as well. As well as if its a story or not.
