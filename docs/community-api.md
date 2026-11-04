# Public communities and organization reviews

All endpoints require the shared authenticated session. Mutations also require the shared Origin and CSRF checks. Content is public to signed-in members; these endpoints provide no private consumer–organization messaging.

| Method | Path under `/api/community` | Body or result |
|---|---|---|
| GET | `/communities` | `{communities}` with `joined` and `member_count` |
| POST | `/communities` | `{name,country}` creates a community and joins its creator |
| POST | `/communities/:id/join` | `{}`; repeated existing membership succeeds |
| POST | `/communities/:id/leave` | `{}` |
| GET | `/communities/:id/posts` | `{posts}` |
| POST | `/communities/:id/posts` | `{body}`; membership required |
| GET | `/posts/:id/comments` | `{comments}` |
| POST | `/posts/:id/comments` | `{body}`; membership required |
| GET | `/organizations/:id/reviews` | `{reviews,summary:{count,average}}` |
| POST | `/organizations/:id/reviews` | `{orderId,rating,body}`; rating 1–5 and own delivered order required |
| POST | `/posts/:id/remove`, `/comments/:id/remove`, `/reviews/:id/remove` | `{reason}`; author or fresh MFA-authorized moderation admin |

Public text is returned as text; clients must render escaped content, never inject it as HTML. Names are display names and carry no verification claim. Reads return at most 100 entries; cursor pagination and reporting/appeals are future work. Deletion is a retained soft removal with an audit event.

A purchase permits exactly one review even after removal. Purchase identifiers and credentials are not included in public review responses. Merchant accounts cannot submit a review on behalf of another customer.

Rider accounts may belong to at most five communities. Membership checks, writes and audit events share one transaction, and database triggers enforce the cap against concurrent joins and community creation. An existing consumer with more than five memberships must leave excess communities before applying as a rider. Merchant-linked riders are separate from community membership; this module does not create merchant links or dispatch priority.

No public website access, media attachments, moderation automation, email delivery or identity verification is implied by this module.
