import { OPERANDS, OPERATORS, SOURCES, makeOperand } from "@gmb/core";

function OperandEditor({ value, onChange, allowNumber = true }) {
  const def = OPERANDS[value.type];
  const setParam = (k, v) => onChange({ ...value, params: { ...value.params, [k]: v } });

  return (
    <div className="operand">
      <select
        value={value.type}
        onChange={(e) => onChange(makeOperand(e.target.value))}
        aria-label="Indicator"
      >
        {Object.entries(OPERANDS)
          .filter(([k]) => allowNumber || k !== "value")
          .map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
      </select>
      {def.fields && (
        <select value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })} aria-label="Output">
          {def.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
      {def.params.map((p) =>
        p.type === "source" ? (
          <select key={p.key} value={value.params[p.key]} onChange={(e) => setParam(p.key, e.target.value)} title={p.label} aria-label={p.label}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <label key={p.key} className="param" title={p.label}>
            <span>{p.label}</span>
            <input
              type="number"
              inputMode="decimal"
              value={value.params[p.key]}
              step={p.type === "int" ? 1 : "any"}
              min={p.min}
              max={p.max}
              onChange={(e) => setParam(p.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
        )
      )}
    </div>
  );
}

/** Edits one rule group: { logic: "all" | "any", conditions: [...] } */
export default function RuleEditor({ title, hint, group, onChange }) {
  const setCond = (i, c) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  const remove = (i) => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });
  const add = () =>
    onChange({
      ...group,
      conditions: [...group.conditions, { left: makeOperand("rsi"), op: "<", right: { type: "value", params: { value: 30 } } }],
    });

  return (
    <fieldset className="rules">
      <legend>{title}</legend>
      {hint && <p className="muted tiny">{hint}</p>}
      {group.conditions.length > 1 && (
        <div className="logic">
          Trigger when
          <select value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value })}>
            <option value="all">ALL conditions are true</option>
            <option value="any">ANY condition is true</option>
          </select>
        </div>
      )}
      {group.conditions.map((c, i) => (
        <div key={i} className="condition">
          <OperandEditor value={c.left} allowNumber={false} onChange={(left) => setCond(i, { ...c, left })} />
          <select className="op" value={c.op} onChange={(e) => setCond(i, { ...c, op: e.target.value })} aria-label="Comparison">
            {OPERATORS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <OperandEditor value={c.right} onChange={(right) => setCond(i, { ...c, right })} />
          <button type="button" className="icon-btn" onClick={() => remove(i)} aria-label="Remove condition" title="Remove">×</button>
        </div>
      ))}
      {group.conditions.length < 10 && (
        <button type="button" className="btn btn-ghost btn-small" onClick={add}>+ Add condition</button>
      )}
    </fieldset>
  );
}
