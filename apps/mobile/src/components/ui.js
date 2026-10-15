import { useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, space, TAP } from "../theme.js";

export function Button({ title, onPress, variant = "primary", small, disabled, loading, style }) {
  const ghost = variant === "ghost";
  const danger = variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        ghost && s.btnGhost,
        danger && s.btnDanger,
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ghost || danger ? colors.forest : colors.lime} />
      ) : (
        <Text style={[s.btnText, small && { fontSize: 15 }, (ghost || danger) && { color: danger ? colors.danger : colors.forest }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

export const SectionTitle = ({ children, style }) => <Text style={[s.section, style]}>{children}</Text>;

export const Note = ({ children, warn }) => (
  <View style={[s.note, warn && { backgroundColor: colors.warnBg, borderColor: colors.warnLine }]}>
    <Text style={[s.small, warn && { color: colors.warnText }]}>{children}</Text>
  </View>
);

export function Field({ label, children, style }) {
  return (
    <View style={[{ gap: 4, flex: 1, minWidth: 0 }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
    </View>
  );
}

export const Input = (props) => (
  <TextInput placeholderTextColor="#9aa59f" {...props} style={[s.input, props.style]} />
);

/** Numeric input that lets the user clear the field while typing. Emits a Number or "". */
export function NumberField({ label, value, onChange, decimals = true, style }) {
  const [text, setText] = useState(value === "" || value == null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value === "" || value == null ? "" : String(value);
  return (
    <Field label={label} style={style}>
      <Input
        value={shown}
        keyboardType={decimals ? "decimal-pad" : "number-pad"}
        onFocus={() => { setFocused(true); setText(shown); }}
        onBlur={() => setFocused(false)}
        onChangeText={(t) => {
          const clean = t.replace(",", ".").replace(decimals ? /[^0-9.\-]/g : /[^0-9]/g, "");
          setText(clean);
          const n = Number(clean);
          onChange(clean === "" || Number.isNaN(n) ? "" : n);
        }}
      />
    </Field>
  );
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[s.seg, style]} accessibilityRole="tablist">
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k)} style={[s.segBtn, on && s.segOn]}>
            <Text style={[s.segText, on && { color: colors.forest }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} hitSlop={4}>
      <Text style={[s.chipText, on && { color: colors.forest }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Dropdown that opens a bottom sheet — native pickers look and behave very differently on
 * iOS and Android, so one sheet keeps the rule builder consistent.
 *   options: [{ value, label }]
 */
export function Select({ label, value, options, onChange, style, compact, title }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} style={style}>
      <Pressable accessibilityRole="button" accessibilityLabel={label || title} onPress={() => setOpen(true)} style={[s.input, s.select, compact && { minHeight: 40 }]}>
        <Text style={s.selectText} numberOfLines={1}>{current?.label ?? "Choose…"}</Text>
        <Text style={s.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={s.grabber} />
          {(title || label) ? <Text style={s.sheetTitle}>{title || label}</Text> : null}
          <FlatList
            data={options}
            keyExtractor={(o) => String(o.value)}
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable onPress={() => { onChange(item.value); setOpen(false); }} style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.cream }]}>
                  <Text style={[s.optionText, on && { color: colors.forest, fontWeight: "700" }]}>{item.label}</Text>
                  {on ? <Text style={{ color: colors.forest, fontSize: 16 }}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </Field>
  );
}

export const Muted = ({ children, style, small }) => <Text style={[small ? s.small : s.body, { color: colors.muted }, style]}>{children}</Text>;

export const s = StyleSheet.create({
  body: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "500", color: colors.muted },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.muted, marginTop: space.lg, marginBottom: space.sm },
  btn: { minHeight: TAP + 4, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.forest },
  btnSmall: { minHeight: 40, paddingHorizontal: 16 },
  btnGhost: { backgroundColor: "transparent" },
  btnDanger: { backgroundColor: "transparent", borderColor: colors.danger },
  btnText: { color: colors.lime, fontWeight: "700", fontSize: 16 },
  card: { backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, marginBottom: space.md },
  note: { backgroundColor: "#f3f8f2", borderWidth: 1, borderColor: "#d5e8d8", borderRadius: radius.sm, padding: space.md, marginVertical: space.sm },
  input: { minHeight: TAP, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper, paddingHorizontal: 12, fontSize: 16, color: colors.ink },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  selectText: { fontSize: 15, color: colors.ink, flexShrink: 1 },
  caret: { color: colors.muted, fontSize: 14 },
  seg: { flexDirection: "row", backgroundColor: colors.cream, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 3 },
  segBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 8 },
  segOn: { backgroundColor: colors.paper, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  chip: { height: 36, alignSelf: "center", paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, justifyContent: "center" },
  chipOn: { borderColor: colors.forest, backgroundColor: colors.tint },
  chipText: { fontSize: 14, fontWeight: "500", color: colors.muted },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "70%", paddingTop: space.sm },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: space.sm },
  sheetTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: space.xl, paddingBottom: space.sm },
  option: { minHeight: 52, paddingHorizontal: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  optionText: { fontSize: 17, color: colors.ink },
  mono: { fontFamily: fonts.mono },
});
