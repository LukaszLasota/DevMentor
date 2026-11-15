import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { SignInContent } from "./SignInContent";

export const metadata: Metadata = {
  title: "Sign in · DevMentor",
};

// The session and the query are request-time data, so they are read inside <Suspense>
// (cacheComponents): the frame is prerendered, the panel streams in.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<LoadingMessage className="mx-auto w-full max-w-dialog" />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}
