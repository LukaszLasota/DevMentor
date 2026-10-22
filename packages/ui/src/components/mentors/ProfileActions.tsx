"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";

export interface ProfileActionsProps {
  published: boolean;
  /** True while the request runs. */
  busy?: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

/**
 * Publish / Unpublish on /mentor/profile (spec #23) with the consequence written next to the action.
 * Unpublish asks first (destructive confirm, focus on Cancel).
 */
export function ProfileActions({ published, busy = false, onPublish, onUnpublish }: ProfileActionsProps) {
  if (!published) {
    return (
      <div className="flex flex-col items-start gap-related">
        <p className="max-w-measure text-caption text-muted-foreground">
          Publishing shows your name, GitHub avatar (if any), link, description and tags to anyone with the link,
          and lists you on /mentors while you have open times.
        </p>
        <Button intent="primary" appearance="filled" loading={busy} loadingLabel="Publishing…" onClick={onPublish}>
          Publish
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-related">
      <p className="max-w-measure text-caption text-muted-foreground">
        Hides your page; the link works again when you republish.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button intent="destructive" loading={busy} loadingLabel="Unpublishing…">
            Unpublish
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish your page?</AlertDialogTitle>
            <AlertDialogDescription>
              Mentees with the link will see “not found” and you leave /mentors until you publish again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it published</AlertDialogCancel>
            <AlertDialogAction onClick={onUnpublish}>Unpublish page</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
