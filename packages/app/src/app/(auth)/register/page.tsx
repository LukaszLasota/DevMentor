import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { RegisterContent } from "./RegisterContent";

export const metadata: Metadata = {
  title: "Create an account · DevMentor",
};

// Session and query are request-time data: read inside <Suspense> (cacheComponents), like /sign-in.
export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <Suspense fallback={<LoadingMessage className="mx-auto w-full max-w-dialog" />}>
      <RegisterContent searchParams={searchParams} />
    </Suspense>
  );
}
