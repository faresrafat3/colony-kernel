# Rework counters never reset within a mission

Bounded rework counters (revisionCount, planReworkCount, gateReissueCount, etc.) are monotone within a mission and never reset, even on recovery or re-entry. Resetting would allow an agent to loop indefinitely through revision cycles, defeating the bounded-rework safety guarantee that caps total rework at 2 per counter. The trade-off is strict enforcement of the rework budget against the flexibility of allowing fresh attempts after a pause or recovery.
