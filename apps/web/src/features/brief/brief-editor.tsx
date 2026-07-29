import { PlumeBadge, PlumeText, PlumeTextArea } from "@plume/ui";

export interface BriefCitation { readonly id: string; readonly label: string; readonly sourceName: string }
export interface BriefField { readonly id: string; readonly label: string; readonly aiValue: string; readonly userValue: string; readonly citations: readonly BriefCitation[] }
export interface BriefEditorProps { fields: readonly BriefField[]; onUserValueChange?: (fieldId: string, value: string) => void }

export function BriefEditor({ fields, onUserValueChange }: BriefEditorProps) {
  return (
    <section aria-label="AI brief editor" data-brief-editor>
      {fields.map((field) => (
        <article key={field.id} data-brief-field={field.id}>
          <PlumeText>{field.label}</PlumeText>
          <div data-brief-origin="ai"><PlumeBadge label="AI proposed" variant="info" /><PlumeText type="supporting">{field.aiValue}</PlumeText></div>
          <div data-brief-origin="user"><PlumeBadge label="User edit" variant="neutral" /><PlumeTextArea label={`${field.label} user edit`} value={field.userValue} onChange={(value) => onUserValueChange?.(field.id, value)} /></div>
          <ul aria-label={`${field.label} citations`} data-brief-citations>{field.citations.map((citation) => <li key={citation.id}><PlumeText type="supporting">{citation.label} · {citation.sourceName}</PlumeText></li>)}</ul>
        </article>
      ))}
    </section>
  );
}
