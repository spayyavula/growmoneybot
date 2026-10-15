import { Pressable, StyleSheet, Text, View } from "react-native";
import { OPERANDS, OPERATORS, SOURCES, makeOperand } from "@gmb/core";
import { Button, Muted, NumberField, Select } from "./ui.js";
import { colors, radius, space } from "../theme.js";

const TYPE_OPTIONS = Object.entries(OPERANDS).map(([value, d]) => ({ value, label: d.label }));
const OP_OPTIONS = OPERATORS.map((o) => ({ value: o.key, label: o.label }));
const SOURCE_OPTIONS = SOURCES.map((x) => ({ value: x, label: x }));

function OperandEditor({ value, onChange, allowNumber = true, side }) {
  const def = OPERANDS[value.type];
  const setParam = (k, v) => onChange({ ...value, params: { ...value.params, [k]: v } });
  return (
    <View style={{ gap: space.sm }}>
      <View style={st.row}>
        <Select
          title={side === "left" ? "Indicator" : "Compare with"}
          value={value.type}
          options={allowNumber ? TYPE_OPTIONS : TYPE_OPTIONS.filter((o) => o.value !== "value")}
          onChange={(t) => onChange(makeOperand(t))}
          compact
        />
        {def.fields ? (
          <Select title="Output" value={value.field} options={def.fields.map((f) => ({ value: f.key, label: f.label }))} onChange={(field) => onChange({ ...value, field })} compact />
        ) : null}
      </View>
      {def.params.length > 0 && (
        <View style={st.params}>
          {def.params.map((p) =>
            p.type === "source" ? (
              <Select key={p.key} label={p.label} title="Price source" value={value.params[p.key]} options={SOURCE_OPTIONS} onChange={(v) => setParam(p.key, v)} compact style={[st.param, { flexBasis: "40%" }]} />
            ) : (
              <NumberField key={p.key} label={p.label} value={value.params[p.key]} decimals={p.type !== "int"} onChange={(v) => setParam(p.key, v)} style={st.param} />
            )
          )}
        </View>
      )}
    </View>
  );
}

/** Edits one rule group: { logic: "all" | "any", conditions: [...] } */
export default function RuleEditor({ title, hint, group, onChange }) {
  const setCond = (i, c) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  const remove = (i) => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });
  const add = () =>
    onChange({ ...group, conditions: [...group.conditions, { left: makeOperand("rsi"), op: "<", right: { type: "value", params: { value: 30 } } }] });

  return (
    <View style={st.group}>
      <Text style={st.title}>{title}</Text>
      {hint ? <Muted small style={{ marginBottom: space.sm }}>{hint}</Muted> : null}
      {group.conditions.length > 1 && (
        <Select
          label="Trigger when"
          value={group.logic}
          options={[{ value: "all", label: "ALL conditions are true" }, { value: "any", label: "ANY condition is true" }]}
          onChange={(logic) => onChange({ ...group, logic })}
          style={{ marginBottom: space.sm }}
        />
      )}
      {group.conditions.map((c, i) => (
        <View key={i} style={st.cond}>
          <View style={st.condHead}>
            <Text style={st.condNum}>Condition {i + 1}</Text>
            <Pressable onPress={() => remove(i)} accessibilityLabel={`Remove condition ${i + 1}`} hitSlop={10} style={st.remove}>
              <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "600" }}>Remove</Text>
            </Pressable>
          </View>
          <OperandEditor side="left" value={c.left} allowNumber={false} onChange={(left) => setCond(i, { ...c, left })} />
          <Select title="Comparison" value={c.op} options={OP_OPTIONS} onChange={(op) => setCond(i, { ...c, op })} compact style={{ marginVertical: space.sm }} />
          <OperandEditor side="right" value={c.right} onChange={(right) => setCond(i, { ...c, right })} />
        </View>
      ))}
      {group.conditions.length < 10 && <Button title="+ Add condition" variant="ghost" small onPress={add} style={{ alignSelf: "flex-start" }} />}
    </View>
  );
}

const st = StyleSheet.create({
  group: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, marginVertical: space.sm, backgroundColor: colors.paper },
  title: { fontSize: 17, fontWeight: "700", color: colors.forest, marginBottom: 2 },
  cond: { backgroundColor: colors.cream, borderRadius: 12, padding: space.md, marginBottom: space.sm },
  condHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm },
  condNum: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  remove: { minHeight: 32, justifyContent: "center" },
  row: { flexDirection: "row", gap: space.sm },
  params: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  param: { flexBasis: "30%", flexGrow: 1 },
});
