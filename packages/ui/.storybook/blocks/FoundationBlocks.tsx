import { useEffect, useRef, useState, type ReactNode } from "react";
import { contrastRatio, resolveColor } from "./contrast";
import {
  colorRoles,
  contrastPairs,
  durationSteps,
  radiusSteps,
  spacingSteps,
  textStyles,
  type Step,
} from "./foundations-data";

// Documentation-only blocks (prompt rule 5): they render the real CSS variables from src/tokens.css.

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="dm-doc-scroll">
      <table className="dm-doc-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ColorRoles() {
  return (
    <Table
      head={["Swatch", "Token", "Role", "Use for", "Do not use for", "Source"]}
    >
      {colorRoles.map((r) => (
        <tr key={r.token}>
          <td>
            <span
              className="dm-doc-swatch"
              style={{ background: `var(${r.token})` }}
              aria-hidden="true"
            />
          </td>
          <td>
            <code>{r.token}</code>
          </td>
          <td>{r.role}</td>
          <td>{r.use}</td>
          <td>{r.avoid}</td>
          <td>{r.source}</td>
        </tr>
      ))}
    </Table>
  );
}

type Measured = { light: number | null; dark: number | null };

function verdict(
  ratio: number | null,
  kind: "text" | "ui",
  exempt: boolean,
): string {
  if (ratio === null) return "not measured";
  if (exempt) return "exempt (decorative)";
  const min = kind === "text" ? 4.5 : 3;
  return ratio >= min ? `pass (≥ ${min})` : `FAIL (< ${min}), fix the token`;
}

/** Measures every text/background pair in both themes from the computed CSS variables. */
export function ContrastTable() {
  const lightRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<Measured[]>([]);

  useEffect(() => {
    const measure = (scope: HTMLElement | null, fg: string, bg: string) => {
      if (!scope) return null;
      const a = resolveColor(scope, fg);
      const b = resolveColor(scope, bg);
      return a && b ? Math.round(contrastRatio(a, b) * 100) / 100 : null;
    };
    setResults(
      contrastPairs.map((p) => ({
        light: measure(lightRef.current, p.fg, p.bg),
        dark: measure(darkRef.current, p.fg, p.bg),
      })),
    );
  }, []);

  return (
    <>
      <div ref={lightRef} className="dm-doc-probe light" aria-hidden="true" />
      <div ref={darkRef} className="dm-doc-probe dark" aria-hidden="true" />
      <Table
        head={[
          "Text / element",
          "Background",
          "Used for",
          "Light",
          "Dark",
          "Result",
        ]}
      >
        {contrastPairs.map((p, i) => {
          const m = results[i];
          const exempt = p.fg === "--border";
          return (
            <tr key={`${p.fg}-${p.bg}`}>
              <td>
                <code>{p.fg}</code>
              </td>
              <td>
                <code>{p.bg}</code>
              </td>
              <td>{p.note}</td>
              <td className="tabular-nums">{m?.light ?? "…"}</td>
              <td className="tabular-nums">{m?.dark ?? "…"}</td>
              <td>
                {verdict(m?.light ?? null, p.kind, exempt)} /{" "}
                {verdict(m?.dark ?? null, p.kind, exempt)}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}

export function TypeScale() {
  return (
    <Table head={["Style", "Role", "Token / class", "Sample"]}>
      {textStyles.map((s) => (
        <tr key={s.name}>
          <td>{s.name}</td>
          <td>{s.role}</td>
          <td>
            <code>{s.token}</code>
            <br />
            <code>{s.className}</code>
          </td>
          <td>
            <span className={s.className}>{s.sample}</span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function StepTable({
  steps,
  render,
}: {
  steps: Step[];
  render: (s: Step) => ReactNode;
}) {
  return (
    <Table head={["Token", "Tailwind", "Relation", "Example", "Preview"]}>
      {steps.map((s) => (
        <tr key={s.token}>
          <td>
            <code>{s.token}</code>
          </td>
          <td>
            <code>{s.tailwind}</code>
          </td>
          <td>{s.relation}</td>
          <td>{s.example}</td>
          <td>{render(s)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function SpacingScale() {
  return (
    <StepTable
      steps={spacingSteps}
      render={(s) => (
        <span
          className="dm-doc-bar"
          style={{ width: `var(${s.token})` }}
          aria-hidden="true"
        />
      )}
    />
  );
}

export function RadiusScale() {
  return (
    <StepTable
      steps={radiusSteps}
      render={(s) => (
        <span
          className="dm-doc-shape"
          style={{ borderRadius: `var(${s.token})` }}
          aria-hidden="true"
        />
      )}
    />
  );
}

export function MotionScale() {
  return (
    <StepTable
      steps={durationSteps}
      render={(s) => (
        <span
          className="dm-doc-motion"
          style={{ transitionDuration: `var(${s.token})` }}
        >
          hover me
        </span>
      )}
    />
  );
}

export function OverlayShadow() {
  return (
    <div className="dm-doc-overlay">
      <p className="text-body-small">
        Overlay surface: <code>--dm-shadow-overlay</code> (class{" "}
        <code>shadow-overlay</code>). Only popovers, menus and dialogs. Rows,
        cards and buttons are separated by <code>--border</code> lines (R01.1,
        R03.2).
      </p>
    </div>
  );
}

export function ThemePair({ children }: { children: ReactNode }) {
  return (
    <div className="dm-doc-theme-pair">
      <div className="light dm-doc-theme">{children}</div>
      <div className="dark dm-doc-theme">{children}</div>
    </div>
  );
}
