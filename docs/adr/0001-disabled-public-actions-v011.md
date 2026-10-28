# Disabled public actions in v0.1.1

PUBLIC_ACTION_* events and the PUBLIC_ACTION_PENDING/PUBLISHED stages exist in the vocabulary and state machine but always fail closed with PUBLICATION_DISABLED. They are reserved for a future milestone so the vocabulary and state machine need no migration when publication is enabled; omitting them would require a breaking change to the event schema and edge table later. The trade-off is forward-compatibility against the cost of carrying dead code and the risk of accidental enablement.
