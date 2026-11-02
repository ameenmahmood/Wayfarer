import { useState } from "react";
import { setDisplayName, demo, userEmail } from "./store";
import { ownDisplayName, profileIssue } from "./profiles";
import { Button, Field, Notice, useAsyncAction } from "./ui";
export default function DisplayNameForm({
  onDone,
  onboarding = false,
}: {
  onDone?: () => void;
  onboarding?: boolean;
}) {
  const [name, setName] = useState(ownDisplayName),
    [saved, setSaved] = useState(false),
    action = useAsyncAction();
  return (
    <form
      className="display-name-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await setDisplayName(name);
          setSaved(true);
          onDone?.();
        });
      }}
    >
      <p>
        {onboarding
          ? "Choose the name your trip companions will see."
          : "Used for your activities, shared trip members, and expense and packing selections."}
      </p>
      <Field label="Display name">
        <input
          autoComplete="nickname"
          required
          maxLength={120}
          value={name}
          disabled={action.busy}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Ameen"
        />
      </Field>
      {!demo && userEmail && (
        <small className="account-email">
          Linked to {userEmail}. Changing your name does not change your sign-in
          email.
        </small>
      )}
      {demo && (
        <small className="account-email">
          Local demo · this name is saved only in this browser.
        </small>
      )}
      <Button className="primary" type="submit" disabled={action.busy}>
        {action.busy ? "Saving…" : "Save name"}
      </Button>
      {profileIssue && !demo && <Notice tone="error">{profileIssue}</Notice>}
      {saved && <p role="status">Display name saved.</p>}
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  );
}
