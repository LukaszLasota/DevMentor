import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { z } from "zod";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CopyShareLink,
  CrudForm,
  DataTable,
  EmptyState,
  PayoutStatusPanel,
  ProfileActions,
  ReadinessChecklist,
  SignInPanel,
  SlotsPanel,
  TextLink,
  type ApiResult,
} from "../../src";
import { InvitationPanel, MentorPageView } from "../../src/mentors";
import { ProfileFormPattern } from "../patterns/ProfileFormPattern";
import { marta, prices, slots } from "../product/fixtures";
import { AuthFrame, PanelFrame, PublicFrame } from "./frames";

const ok = async (): Promise<ApiResult<unknown>> => ({ ok: true, data: null });
const noop = () => undefined;

const meta = {
  title: "Screens/E01 Mentor onboarding",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const signInForm = (
  <CrudForm
    schema={z.object({ email: z.string().email("Enter your email address."), password: z.string().min(12).max(128) })}
    fields={[
      { name: "email", label: "Email", type: "email" },
      { name: "password", label: "Password", type: "password", description: "12 to 128 characters" },
    ]}
    onSubmit={ok}
    submitLabel="Sign in"
  />
);

export const SignIn: Story = {
  name: "/sign-in",
  render: () => (
    <AuthFrame>
      <SignInPanel githubHref="#github" emailForm={signInForm} registerLink={<TextLink href="#register">Create an account</TextLink>} />
    </AuthFrame>
  ),
  play: async ({ canvas }) => {
    // GitHub comes before the email form (spec #21).
    const github = canvas.getByRole("link", { name: "Continue with GitHub" });
    const email = canvas.getByLabelText("Email");
    await expect(github.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  },
};
export const SignInWrongCredentials: Story = {
  name: "/sign-in — wrong email or password",
  render: () => (
    <AuthFrame>
      <SignInPanel
        githubHref="#github"
        emailForm={
          <>
            <Alert tone="danger">
              <AlertDescription>Invalid email or password.</AlertDescription>
            </Alert>
            {signInForm}
          </>
        }
        registerLink={<TextLink href="#register">Create an account</TextLink>}
      />
    </AuthFrame>
  ),
};
export const SignInRateLimited: Story = {
  name: "/sign-in — too many attempts",
  render: () => (
    <AuthFrame>
      <SignInPanel githubHref="#github" emailForm={signInForm} registerLink={null} retryAfterSeconds={240} />
    </AuthFrame>
  ),
};
export const Register: Story = {
  name: "/register",
  render: () => (
    <AuthFrame>
      <div className="mx-auto flex max-w-dialog flex-col gap-paragraph rounded-card border border-border p-panel">
        <h1 className="text-heading-3 font-semibold">Create an account</h1>
        <CrudForm
          schema={z.object({ email: z.string().email("Enter your email address.") })}
          fields={[{ name: "email", label: "Email", type: "email", description: "We send a link to set your password." }]}
          onSubmit={ok}
          submitLabel="Send link"
        />
      </div>
    </AuthFrame>
  ),
};
export const RegisterCheckInbox: Story = {
  name: "/register — check your inbox",
  render: () => (
    <AuthFrame>
      <div className="mx-auto flex max-w-dialog flex-col gap-paragraph">
        <Alert tone="success">
          <AlertTitle>Check your inbox to finish registration</AlertTitle>
          <AlertDescription>
            <Button size="sm">Resend the link</Button>
          </AlertDescription>
        </Alert>
      </div>
    </AuthFrame>
  ),
};
export const VerifyEmailInvalid: Story = {
  name: "/verify-email — link not valid",
  render: () => (
    <AuthFrame>
      <div className="mx-auto max-w-dialog">
        <Alert tone="danger">
          <AlertTitle>This link does not work any more</AlertTitle>
          <AlertDescription>
            <p>It may have expired or been used already.</p>
            <Button size="sm">Send a new link</Button>
          </AlertDescription>
        </Alert>
      </div>
    </AuthFrame>
  ),
};
export const Invitation: Story = {
  name: "/invitation/[token] — signed out",
  render: () => (
    <PublicFrame>
      <InvitationPanel
        state={{ kind: "signed-out", email: "marta@example.com", tags: ["typescript", "ai-agents"], githubHref: "#g", emailHref: "#e" }}
      />
    </PublicFrame>
  ),
};
export const InvitationInvalid: Story = {
  name: "/invitation/[token] — not valid",
  render: () => (
    <PublicFrame>
      <InvitationPanel state={{ kind: "invalid" }} />
    </PublicFrame>
  ),
};
export const MentorHome: Story = {
  name: "/mentor — onboarding",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Your mentor page</h1>
      <ReadinessChecklist
        className="max-w-measure"
        title="Publish at least one bookable session by Thu 5 Nov"
        items={[
          { key: "published", label: "Publish your page", met: true },
          { key: "prices", label: "Set your prices", met: false, href: "#prices", actionLabel: "Set prices" },
          { key: "slot", label: "Publish a slot", met: false, href: "#slots", actionLabel: "Add a slot" },
        ]}
      />
      <TextLink href="#payouts">Payouts: not set up</TextLink>
    </PanelFrame>
  ),
};
export const MentorProfileDraft: Story = {
  name: "/mentor/profile — draft",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Profile</h1>
      <div className="grid gap-component lg:grid-cols-2">
        <div className="flex flex-col gap-component">
          <ProfileFormPattern />
          <ReadinessChecklist
            title="Before you can publish"
            items={[
              { key: "displayName", label: "Display name", met: true },
              { key: "publicWorkUrl", label: "Link to your public work", met: true },
              { key: "bio", label: "What you have done", met: true },
              { key: "stackTags", label: "At least one stack tag", met: true },
            ]}
          />
          <ProfileActions published={false} onPublish={noop} onUnpublish={noop} />
        </div>
        <section aria-label="Preview" className="rounded-card border border-dashed border-border p-panel">
          <MentorPageView {...marta} offerReady={false} prices={null} slots={[]} />
        </section>
      </div>
    </PanelFrame>
  ),
};
export const MentorProfilePublished: Story = {
  name: "/mentor/profile — published",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Profile</h1>
      <div className="flex max-w-measure flex-col gap-component">
        <CopyShareLink url="https://devmentor.example/m/marta-kowal" />
        <ProfileActions published onPublish={noop} onUnpublish={noop} />
      </div>
    </PanelFrame>
  ),
};
const priceSchema = z.object({
  price25: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, "Enter an amount like 40 or 40.50."),
  price50: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, "Enter an amount like 75 or 75.50."),
});
export const MentorPrices: Story = {
  name: "/mentor/prices",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Prices</h1>
      <div className="max-w-measure">
        <CrudForm
          schema={priceSchema}
          fields={[
            { name: "price25", label: "25 minutes", inputMode: "decimal", suffix: "USD", description: "Allowed: $20.00–$80.00" },
            { name: "price50", label: "50 minutes", inputMode: "decimal", suffix: "USD", description: "Allowed: $20.00–$150.00" },
          ]}
          defaultValues={{ price25: "40", price50: "200" }}
          onSubmit={async () => ({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "Nothing was saved.", fieldErrors: { price50: ["Allowed: $20.00–$150.00"] } },
          })}
          submitLabel="Save prices"
        />
      </div>
    </PanelFrame>
  ),
};
export const MentorPricesUnavailable: Story = {
  name: "/mentor/prices — cannot be set",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Prices</h1>
      <EmptyState title="Prices cannot be set right now" />
    </PanelFrame>
  ),
};
export const MentorSlots: Story = {
  name: "/mentor/slots",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Open times</h1>
      <div className="max-w-measure">
        <SlotsPanel
          slots={slots.map((s) => ({ ...s }))}
          showPast={false}
          onShowPastChange={noop}
          onRemove={noop}
        />
      </div>
    </PanelFrame>
  ),
};
export const MentorSlotsEmpty: Story = {
  name: "/mentor/slots — none yet",
  render: () => (
    <PanelFrame area="Mentor">
      <h1 className="text-heading-1 font-semibold">Open times</h1>
      <div className="max-w-measure">
        <SlotsPanel slots={[]} showPast={false} onShowPastChange={noop} onRemove={noop} />
      </div>
    </PanelFrame>
  ),
};
export const MentorPayouts: Story = {
  name: "/mentor/payouts (1.1)",
  render: () => (
    <PanelFrame area="Mentor">
      <PayoutStatusPanel state={{ kind: "action_required", guidance: ["Add your date of birth."] }} onStart={noop} onRefresh={noop} />
    </PanelFrame>
  ),
};
export const AdminPayouts: Story = {
  name: "/admin/payouts (1.1)",
  render: () => (
    <PanelFrame area="Operator">
      <h1 className="text-heading-1 font-semibold">Payouts</h1>
      <DataTable
        columns={[
          { id: "name", header: "Mentor", cell: (r: { id: string; name: string; status: string; state: string }) => r.name },
          { id: "status", header: "Onboarding", cell: (r) => r.status },
          { id: "state", header: "Provisioning", cell: (r) => r.state },
        ]}
        rows={[
          { id: "1", name: "Marta Kowal", status: "enabled", state: "provisioned" },
          { id: "2", name: "tomasz@example.com", status: "action_required", state: "reconciliation_required" },
        ]}
        getRowId={(r) => r.id}
      />
    </PanelFrame>
  ),
};
export const MentorPagePreview: Story = {
  name: "/m/[slug] — as the owner sees it",
  render: () => (
    <PublicFrame>
      <MentorPageView {...marta} offerReady prices={prices} slots={slots} />
    </PublicFrame>
  ),
};
