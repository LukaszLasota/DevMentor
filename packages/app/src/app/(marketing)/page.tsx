import Image from "next/image";
import { buttonVariants } from "@devmentor/ui/mentors";

// Starter page on design tokens (lesson 06 homework: values outside tokens replaced). The content is
// still the Next starter until spec #27 adds "Find a mentor" here.
export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted font-sans">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-section px-section bg-background sm:items-start">
        <Image className="h-5 w-auto" src="/next.svg" alt="Next.js logo" width={100} height={20} priority />
        <div className="flex flex-col items-center gap-panel text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-heading-2 font-semibold text-foreground">
            To get started, edit the{" "}
            <code className="rounded-control bg-muted px-related py-badge-y font-mono text-body">page.tsx</code> file.
          </h1>
          <p className="max-w-md text-body-large text-muted-foreground">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-paragraph sm:flex-row">
          <a
            className={buttonVariants({ intent: "neutral", appearance: "filled", size: "lg" })}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image className="h-auto w-4" src="/vercel.svg" alt="Vercel logomark" width={16} height={14} />
            Deploy Now
          </a>
          <a
            className={buttonVariants({ size: "lg" })}
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
