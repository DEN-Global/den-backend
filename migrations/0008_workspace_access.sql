CREATE TABLE den_workspace_choices (
 user_id TEXT PRIMARY KEY REFERENCES den_users(id),
 role TEXT NOT NULL CHECK(role IN ('manager','rider','dispatch','transport','shipment','warehouse')),
 selected_at INTEGER NOT NULL
);
CREATE TRIGGER den_workspace_choice_immutable BEFORE UPDATE ON den_workspace_choices
BEGIN SELECT RAISE(ABORT,'WORKSPACE_CHOICE_PERMANENT'); END;
CREATE TRIGGER den_workspace_choice_retained BEFORE DELETE ON den_workspace_choices
BEGIN SELECT RAISE(ABORT,'WORKSPACE_CHOICE_PERMANENT'); END;
