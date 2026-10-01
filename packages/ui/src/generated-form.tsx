"use client";

import { useState, type ReactNode } from "react";
import { FieldShell, Input, Select, Switch, Textarea } from "./input.js";

/**
 * A form, rendered from an app's own schema.
 *
 * Nothing here knows what any of these fields mean. The app authored them in
 * zod, the SDK converted them to the JSON Schema subset in `settings-schema`,
 * registration refused anything this cannot draw, and this draws whatever
 * arrived. An app adding a setting costs no GControl release, which is the
 * entire point of the manifest being a UI contract rather than an identity
 * handshake.
 *
 * The subset is deliberately small: strings, numbers, booleans, enums, flat
 * arrays of those, and objects nested one level. Everything else was rejected
 * at registration with a pointer to the offending node, on the app developer's
 * desk, at the only moment anybody could fix it.
 *
 * Values are collected as a flat map keyed by dotted path and nested again on
 * submit, because an HTML form has no other shape to send. What comes back is
 * checked against the same schema on the broker: this is a renderer, not a
 * validator, and a form that validated its own input would be the only thing
 * standing between an app and whatever an API client posted instead.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The two sentences this form says for itself.
 *
 * `lockNote` takes the reference because the sentence is built around it, and
 * it is named rather than vague on purpose: "Upgrade to continue" tells an
 * operator nothing they can act on, and the module or capability is what they
 * would quote to somebody.
 */
export interface GeneratedFormCopy {
  noSettings: ReactNode;
  lockNote: (requires: string) => ReactNode;
}

export interface GeneratedFormProps {
  schema: unknown;
  /**
   * Props rather than literals: a design-system component has no locale and
   * both consoles that render it do.
   */
  copy: GeneratedFormCopy;
  values: JsonRecord;
  /** Called with the nested object, ready to send. */
  onSubmit: (values: JsonRecord) => void;
  submitLabel: string;
  /**
   * Something is in flight. Distinct from `submitDisabled`, because a button
   * that is off because a required field is empty and one that is off because
   * the request is running are two different states and must not read alike.
   */
  pending?: boolean;
  /** What the button says while pending. "Saving" fits a form; a deploy is not one. */
  busyLabel?: string;
  /** The button is off, the fields are not. For a gate outside the schema. */
  submitDisabled?: boolean;
  /** Field-level messages from the broker, keyed by JSON pointer. */
  issues?: Record<string, string>;
  footer?: ReactNode;
  /** Renders every control read-only, for a viewer without the role. */
  disabled?: boolean;
  /**
   * Fields this licence does not cover, by dotted path, with what unlocks each.
   *
   * The value is a noun phrase and not a sentence, because `LockNote` puts it
   * inside one: "Needs **the Enterprise tier**, which this licence does not
   * currently cover." Passing a finished sentence produces a broken one, and it
   * type-checks perfectly on the way there.
   *
   * Rendered read-only with the stored value still visible, rather than hidden.
   * A customer who is losing a rule should be able to see what stops applying,
   * and the value is kept anyway: a capability that lapses keeps its
   * configuration, waiting for a re-grant that needs nothing retyped.
   *
   * Display only. The broker refuses a change to one of these on save, and the
   * app asks before applying it. This exists so an operator finds out at the
   * moment they look rather than from a rule quietly not happening.
   */
  locked?: Record<string, string>;
}

export function GeneratedForm({
  schema,
  values,
  copy,
  onSubmit,
  submitLabel,
  pending = false,
  busyLabel = "Saving",
  submitDisabled = false,
  issues = {},
  footer,
  disabled = false,
  locked = {},
}: GeneratedFormProps) {
  const properties = isRecord(schema) && isRecord(schema["properties"]) ? schema["properties"] : {};
  const required = new Set(
    isRecord(schema) && Array.isArray(schema["required"])
      ? schema["required"].filter((key): key is string => typeof key === "string")
      : [],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => flatten(properties, values));

  if (Object.keys(properties).length === 0) {
    return <p className="text-xs text-fg-tertiary">{copy.noSettings}</p>;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(nest(draft));
      }}
      className="space-y-4"
    >
      {Object.entries(properties).map(([key, node]) =>
        !isRecord(node) ? null : (
          <Node
            key={key}
            copy={copy}
            path={key}
            name={key}
            node={node}
            required={required.has(key)}
            draft={draft}
            setDraft={setDraft}
            issues={issues}
            disabled={disabled}
            locked={locked}
          />
        ),
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending || disabled || submitDisabled}
          className={
            "inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-accent px-3 text-xs " +
            "font-medium text-accent-fg transition-colors hover:bg-accent-hover " +
            "disabled:cursor-not-allowed disabled:opacity-45"
          }
        >
          {pending ? busyLabel : submitLabel}
        </button>
        {footer}
      </div>
    </form>
  );
}

interface NodeProps {
  path: string;
  name: string;
  node: JsonRecord;
  required: boolean;
  draft: Record<string, unknown>;
  setDraft: (update: (previous: Record<string, unknown>) => Record<string, unknown>) => void;
  issues: Record<string, string>;
  disabled: boolean;
  locked: Record<string, string>;
  /** Threaded rather than read: this file has no locale of its own. */
  copy: GeneratedFormCopy;
}

function Node(props: NodeProps): ReactNode {
  const rendered = renderNode(props);
  const requires = props.locked[props.path];
  // Wrapped rather than threaded through six controls. Every leaf renders its
  // own shell and none of them should have to learn what a licence is.
  if (requires === undefined || typeOf(props.node) === "object") return rendered;
  return (
    <div>
      {rendered}
      <LockNote requires={requires} copy={props.copy} />
    </div>
  );
}

function renderNode(props: NodeProps): ReactNode {
  const { path, name, node, required, draft, setDraft, issues, disabled } = props;
  const type = typeOf(node);
  const label = titleOf(node, name);
  const requires = props.locked[path];
  // A locked group locks everything inside it, which is what makes one keyword
  // on the object enough and a separate group concept unnecessary.
  const lockedHere = requires !== undefined;
  const readOnly = disabled || lockedHere;
  const hint = typeof node["description"] === "string" ? node["description"] : undefined;
  const error = issues[`/${path.split(".").join("/")}`];
  const set = (value: unknown): void => setDraft((previous) => ({ ...previous, [path]: value }));

  if (type === "object") {
    const properties = isRecord(node["properties"]) ? node["properties"] : {};
    const nested = new Set(
      Array.isArray(node["required"])
        ? node["required"].filter((key): key is string => typeof key === "string")
        : [],
    );
    return (
      <fieldset className="rounded-(--radius-md) border border-(--gc-border-subtle) p-3">
        <legend className="px-1 text-2xs uppercase tracking-[0.08em] text-fg-tertiary">
          {label}
        </legend>
        {hint === undefined ? null : <p className="mb-3 text-2xs text-fg-tertiary">{hint}</p>}
        {requires === undefined ? null : <LockNote requires={requires} copy={props.copy} />}
        <div className="space-y-3">
          {Object.entries(properties).map(([key, child]) =>
            !isRecord(child) ? null : (
              <Node
                key={key}
                copy={props.copy}
                path={`${path}.${key}`}
                name={key}
                node={child}
                required={nested.has(key)}
                draft={draft}
                setDraft={setDraft}
                issues={issues}
                disabled={readOnly}
                locked={props.locked}
              />
            ),
          )}
        </div>
      </fieldset>
    );
  }

  if (type === "boolean") {
    return (
      <Switch
        name={path}
        checked={draft[path] === true}
        disabled={readOnly}
        onCheckedChange={set}
        label={label}
        {...(hint === undefined ? {} : { description: hint })}
      />
    );
  }

  if (type === "array") {
    // One per line. A repeater with add and remove buttons is the obvious
    // alternative and it is worse for the thing these actually hold: a list of
    // hostnames or email addresses somebody wants to paste in.
    return (
      <Textarea
        name={path}
        label={label}
        hint={hint ?? "One per line."}
        {...(error === undefined ? {} : { error })}
        value={String(draft[path] ?? "")}
        onChange={(event) => set(event.target.value)}
        disabled={readOnly}
        required={required}
        rows={3}
        mono
      />
    );
  }

  const options = enumOf(node);
  if (options !== undefined) {
    return (
      <Select
        name={path}
        label={label}
        {...(hint === undefined ? {} : { hint })}
        {...(error === undefined ? {} : { error })}
        value={String(draft[path] ?? "")}
        onChange={(event) => set(event.target.value)}
        disabled={readOnly}
        required={required}
        options={[
          // An optional enum needs a way back to unset, and a select with no
          // empty option makes the first value look chosen when nobody chose it.
          ...(required ? [] : [{ value: "", label: "Not set" }]),
          ...options.map((option) => ({ value: String(option), label: String(option) })),
        ]}
      />
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <Input
        name={path}
        type="number"
        label={label}
        {...(hint === undefined ? {} : { hint: hint + rangeHint(node) })}
        {...(error === undefined ? {} : { error })}
        value={String(draft[path] ?? "")}
        onChange={(event) => set(event.target.value)}
        disabled={readOnly}
        required={required}
        {...(typeof node["minimum"] === "number" ? { min: node["minimum"] } : {})}
        {...(typeof node["maximum"] === "number" ? { max: node["maximum"] } : {})}
        {...(type === "integer" ? { step: 1 } : {})}
        mono
      />
    );
  }

  const format = typeof node["format"] === "string" ? node["format"] : undefined;
  const long = typeof node["maxLength"] === "number" && node["maxLength"] > 200;

  if (long) {
    return (
      <Textarea
        name={path}
        label={label}
        {...(hint === undefined ? {} : { hint })}
        {...(error === undefined ? {} : { error })}
        value={String(draft[path] ?? "")}
        onChange={(event) => set(event.target.value)}
        disabled={readOnly}
        required={required}
        rows={3}
      />
    );
  }

  return (
    <Input
      name={path}
      type={
        format === "password"
          ? "password"
          : format === "email"
            ? "email"
            : format === "uri"
              ? "url"
              : format === "date-time"
                ? "datetime-local"
                : "text"
      }
      label={label}
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { error })}
      value={String(draft[path] ?? "")}
      onChange={(event) => set(event.target.value)}
      disabled={readOnly}
      required={required}
      {...(typeof node["maxLength"] === "number" ? { maxLength: node["maxLength"] } : {})}
      mono={format === "uri" || format === "hostname"}
    />
  );
}

/**
 * Why a field will not take a change.
 *
 * Named rather than vague. "Upgrade to continue" tells an operator nothing they
 * can act on; the module or capability that unlocks it is the thing they would
 * quote to somebody, and it is also what the broker's refusal will say if they
 * go around the form.
 */
function LockNote({ requires, copy }: { requires: string; copy: GeneratedFormCopy }) {
  return <p className="mt-1 text-2xs text-locked-ink">{copy.lockNote(requires)}</p>;
}

/** A field with no control of its own, used for the empty case. */
export function EmptyField({ label, children }: { label: string; children: ReactNode }) {
  return <FieldShell label={label}>{children}</FieldShell>;
}

function typeOf(node: JsonRecord): string {
  const declared = node["type"];
  if (Array.isArray(declared)) {
    return declared.find((entry) => entry !== "null") ?? "string";
  }
  if (typeof declared === "string") return declared;
  return Array.isArray(node["enum"]) ? "string" : "string";
}

function enumOf(node: JsonRecord): unknown[] | undefined {
  const values = node["enum"];
  return Array.isArray(values) && values.length > 0 ? values : undefined;
}

function titleOf(node: JsonRecord, name: string): string {
  if (typeof node["title"] === "string" && node["title"].length > 0) return node["title"];
  // `retentionDays` reads as "Retention days". Better than the raw key, and it
  // costs nothing when the app did not bother with a title.
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function rangeHint(node: JsonRecord): string {
  const min = node["minimum"];
  const max = node["maximum"];
  if (typeof min === "number" && typeof max === "number") return ` Between ${min} and ${max}.`;
  if (typeof min === "number") return ` At least ${min}.`;
  if (typeof max === "number") return ` At most ${max}.`;
  return "";
}

/** Nested values to dotted paths, with arrays as one-per-line text. */
function flatten(properties: JsonRecord, values: JsonRecord, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, node] of Object.entries(properties)) {
    if (!isRecord(node)) continue;
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    const value = values[key];

    if (typeOf(node) === "object" && isRecord(node["properties"])) {
      Object.assign(out, flatten(node["properties"], isRecord(value) ? value : {}, path));
      continue;
    }
    if (typeOf(node) === "array") {
      out[path] = Array.isArray(value) ? value.join("\n") : "";
      continue;
    }
    out[path] = value ?? (typeOf(node) === "boolean" ? false : (node["default"] ?? ""));
  }
  return out;
}

/** Dotted paths back to a nested object. The broker checks what comes out. */
function nest(draft: Record<string, unknown>): JsonRecord {
  const out: JsonRecord = {};
  for (const [path, value] of Object.entries(draft)) {
    const parts = path.split(".");
    let target = out;
    for (const part of parts.slice(0, -1)) {
      const next = target[part];
      if (!isRecord(next)) target[part] = {};
      target = target[part] as JsonRecord;
    }
    const leaf = parts[parts.length - 1];
    if (leaf !== undefined) target[leaf] = value;
  }
  return out;
}
