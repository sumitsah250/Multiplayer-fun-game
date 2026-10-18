// The mission library: browse every mission by category, edit or delete any of
// them, add your own, and restore a category's defaults. "My missions" are the
// group's house missions, which are always dealt first.
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  MAX_CUSTOM_MISSIONS,
  PACK_OPTIONS,
  addMission,
  cleanCustomMission,
  editMission,
  missionLibrary,
  removeMission,
  restorePack,
  toEditableText,
} from './gameLogic';
import type { Difficulty, MissionEdits, MissionTemplate, PackId } from './gameLogic';
import { confirmAction } from './dialogs';
import { haptic } from './haptics';
import { ROW_LAYOUT, Toast } from './motion';
import { CLAY, FONTS, RADIUS, THEME, TONE_COLORS, TONE_CYCLE } from './theme';
import { Eyebrow, Icon, PrimaryButton } from './ui';

type Tab = 'mine' | PackId;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
const DIFFICULTY_COLOR: Record<Difficulty, string> = { easy: THEME.lime, medium: THEME.yellow, hard: THEME.pink };
const DIFFICULTY_TEXT_COLOR: Record<Difficulty, string> = { easy: THEME.limeText, medium: THEME.yellowText, hard: THEME.pinkText };

// "Get {t} to dance" shows as "Get [THEM] to dance", with the target as a pill.
function MissionText({ template }: { template: string }) {
  const parts = template.split('{t}');
  return (
    <Text style={styles.missionText}>
      {parts.map((part, index) => (
        <Text key={index}>
          {part}
          {index < parts.length - 1 && <Text style={styles.target}> THEM </Text>}
        </Text>
      ))}
    </Text>
  );
}

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (value: Difficulty) => void }) {
  return (
    <View style={styles.diffRow}>
      {DIFFICULTIES.map((difficulty) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === difficulty }}
          key={difficulty}
          onPress={() => {
            haptic('select');
            onChange(difficulty);
          }}
          style={[styles.diffChip, value === difficulty && { backgroundColor: DIFFICULTY_COLOR[difficulty] }]}
        >
          <Text style={[styles.diffText, value === difficulty && styles.diffTextOn]}>{DIFFICULTY_LABEL[difficulty]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MissionLibrary({
  edits,
  onEditsChange,
  customMissions,
  onCustomMissionsChange,
  onBack,
}: {
  edits: MissionEdits;
  onEditsChange: (edits: MissionEdits) => void;
  customMissions: string[];
  onCustomMissionsChange: (missions: string[]) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('everyday');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty>('medium');
  const [newText, setNewText] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>('medium');
  const [undo, setUndo] = useState<{ edits: MissionEdits; custom: string[]; key: number } | null>(null);
  const undoCount = useRef(0);

  const library = useMemo(() => missionLibrary(edits), [edits]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const template of library) result[template.pack] = (result[template.pack] ?? 0) + 1;
    return result;
  }, [library]);
  const missions = tab === 'mine' ? [] : library.filter((template) => template.pack === tab);
  const packChanged =
    tab !== 'mine' &&
    (edits.added.some((own) => own.pack === tab) ||
      [...edits.removed, ...Object.keys(edits.edited)].some((id) => id.startsWith(`${tab}-`)));

  const rememberForUndo = () => {
    undoCount.current += 1;
    setUndo({ edits, custom: customMissions, key: undoCount.current });
  };

  const startEdit = (id: string, text: string, difficulty: Difficulty) => {
    setEditingId(id);
    setDraft(text);
    setDraftDifficulty(difficulty);
  };

  const saveEdit = (template: MissionTemplate) => {
    onEditsChange(editMission(edits, template, draft, draftDifficulty));
    setEditingId(null);
    haptic('success');
  };

  const deleteMission = (template: MissionTemplate) => {
    rememberForUndo();
    onEditsChange(removeMission(edits, template.id));
    setEditingId(null);
    haptic('warning');
  };

  const add = () => {
    if (tab === 'mine') {
      const mission = cleanCustomMission(newText);
      if (!mission || customMissions.length >= MAX_CUSTOM_MISSIONS) return;
      if (!customMissions.some((existing) => existing.toLocaleLowerCase() === mission.toLocaleLowerCase())) {
        onCustomMissionsChange([...customMissions, mission]);
      }
    } else {
      const next = addMission(edits, tab, newText, newDifficulty, `own-${Date.now().toString(36)}`);
      if (next === edits) return;
      onEditsChange(next);
    }
    setNewText('');
    haptic('success');
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'mine', label: '⭐ MY MISSIONS', count: customMissions.length },
    ...PACK_OPTIONS.map((pack) => ({ id: pack.id as Tab, label: `${pack.emoji} ${pack.title}`, count: counts[pack.id] ?? 0 })),
  ];

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Eyebrow>MISSION LIBRARY · {library.length + customMissions.length} MISSIONS</Eyebrow>
        <Text style={styles.title}>Your missions, your rules.</Text>
        <Text style={styles.copy}>Edit, delete or add missions in any category. Use @ for the person being targeted.</Text>

        <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false}>
          {tabs.map((entry, index) => {
            const selected = tab === entry.id;
            const tone = TONE_COLORS[TONE_CYCLE[index % TONE_CYCLE.length]];
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={entry.id}
                onPress={() => {
                  haptic('select');
                  setTab(entry.id);
                  setEditingId(null);
                }}
                style={[styles.tab, selected && { backgroundColor: tone.face, borderColor: tone.face }]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextOn]}>
                  {entry.label} · {entry.count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.addCard}>
          <Text style={styles.addTitle}>{tab === 'mine' ? '＋ ADD A HOUSE MISSION' : '＋ ADD A MISSION HERE'}</Text>
          {tab === 'mine' && (
            <Text style={styles.addHint}>House missions are dealt first, before any category.</Text>
          )}
          <TextInput
            accessibilityLabel="New mission"
            maxLength={120}
            onChangeText={setNewText}
            onSubmitEditing={add}
            placeholder="Get @ to…"
            placeholderTextColor={THEME.dim}
            returnKeyType="done"
            style={styles.input}
            value={newText}
          />
          {tab !== 'mine' && <DifficultyPicker onChange={setNewDifficulty} value={newDifficulty} />}
          <PrimaryButton
            disabled={!newText.trim() || (tab === 'mine' && customMissions.length >= MAX_CUSTOM_MISSIONS)}
            label="ADD MISSION"
            onPress={add}
            tone="lime"
          />
        </View>

        {tab === 'mine' && customMissions.length === 0 && (
          <Text style={styles.empty}>No house missions yet. Write one above.</Text>
        )}
        {tab === 'mine' &&
          customMissions.map((mission, index) => {
            const id = `mine-${index}`;
            return (
              <Animated.View key={mission} layout={ROW_LAYOUT} style={styles.row}>
                {editingId === id ? (
                  <>
                    <TextInput
                      accessibilityLabel="Edit mission"
                      autoFocus
                      maxLength={120}
                      onChangeText={setDraft}
                      style={styles.input}
                      value={draft}
                    />
                    <View style={styles.rowActions}>
                      <Pressable onPress={() => setEditingId(null)} style={styles.ghost}>
                        <Text style={styles.ghostText}>CANCEL</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const clean = cleanCustomMission(draft);
                          if (clean) onCustomMissionsChange(customMissions.map((entry, i) => (i === index ? clean : entry)));
                          setEditingId(null);
                          haptic('success');
                        }}
                        style={styles.save}
                      >
                        <Text style={styles.saveText}>SAVE</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.rowLine}>
                    <Text style={[styles.missionText, styles.flex]}>{mission}</Text>
                    <Pressable accessibilityLabel="Edit" hitSlop={8} onPress={() => startEdit(id, mission, 'medium')} style={styles.icon}>
                      <Icon color={THEME.text} name="edit-2" size={18} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Delete"
                      hitSlop={8}
                      onPress={() => {
                        rememberForUndo();
                        onCustomMissionsChange(customMissions.filter((_, i) => i !== index));
                        haptic('warning');
                      }}
                      style={styles.icon}
                    >
                      <Icon color={THEME.bad} name="trash-2" size={18} />
                    </Pressable>
                  </View>
                )}
              </Animated.View>
            );
          })}

        {missions.map((template) => (
          <Animated.View key={template.id} layout={ROW_LAYOUT} style={styles.row}>
            {editingId === template.id ? (
              <>
                <TextInput
                  accessibilityLabel="Edit mission"
                  autoFocus
                  maxLength={120}
                  onChangeText={setDraft}
                  style={styles.input}
                  value={draft}
                />
                <DifficultyPicker onChange={setDraftDifficulty} value={draftDifficulty} />
                <View style={styles.rowActions}>
                  <Pressable onPress={() => setEditingId(null)} style={styles.ghost}>
                    <Text style={styles.ghostText}>CANCEL</Text>
                  </Pressable>
                  <Pressable onPress={() => saveEdit(template)} style={styles.save}>
                    <Text style={styles.saveText}>SAVE</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.rowLine}>
                <View style={styles.flex}>
                  <Text style={[styles.diffTag, { color: DIFFICULTY_TEXT_COLOR[template.difficulty] }]}>
                    {DIFFICULTY_LABEL[template.difficulty]}
                  </Text>
                  <MissionText template={template.text} />
                </View>
                <Pressable
                  accessibilityLabel="Edit"
                  hitSlop={8}
                  onPress={() => startEdit(template.id, toEditableText(template.text), template.difficulty)}
                  style={styles.icon}
                >
                  <Icon color={THEME.text} name="edit-2" size={18} />
                </Pressable>
                <Pressable accessibilityLabel="Delete" hitSlop={8} onPress={() => deleteMission(template)} style={styles.icon}>
                  <Icon color={THEME.bad} name="trash-2" size={18} />
                </Pressable>
              </View>
            )}
          </Animated.View>
        ))}

        {tab !== 'mine' && missions.length === 0 && (
          <Text style={styles.empty}>This category is empty. Add a mission above or restore the defaults.</Text>
        )}
        {packChanged && (
          <Pressable
            onPress={() =>
              confirmAction({
                title: 'Restore this category?',
                message: 'Your edits, deletions and added missions in this category will be undone.',
                cancelText: 'Keep my changes',
                confirmText: 'Restore',
                onConfirm: () => onEditsChange(restorePack(edits, tab)),
              })
            }
            style={styles.link}
          >
            <Text style={styles.linkText}>↺  RESTORE DEFAULTS FOR THIS CATEGORY</Text>
          </Pressable>
        )}
        <PrimaryButton label="DONE" onPress={onBack} secondary />
      </ScrollView>
      {undo && (
        <Toast duration={4000} key={undo.key} onDone={() => setUndo(null)} interactive>
          <View style={styles.undoRow}>
            <Text style={styles.undoText}>Mission deleted.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onEditsChange(undo.edits);
                onCustomMissionsChange(undo.custom);
                setUndo(null);
                haptic('success');
              }}
              style={styles.undoButton}
            >
              <Text style={styles.undoButtonText}>UNDO</Text>
            </Pressable>
          </View>
        </Toast>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  page: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  title: { color: THEME.text, fontFamily: FONTS.black, fontSize: 32, lineHeight: 38, marginTop: 6 },
  copy: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 21, marginTop: 4 },
  tabs: { gap: 8, paddingVertical: 16, paddingRight: 20 },
  tab: {
    borderWidth: 2,
    borderColor: THEME.lineStrong,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: THEME.surface,
  },
  tabText: { color: THEME.text, fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.6 },
  tabTextOn: { color: THEME.onAccent },
  addCard: {
    boxShadow: CLAY.card, backgroundColor: THEME.surfaceHi, borderRadius: RADIUS.lg, padding: 16, borderWidth: 2, borderColor: THEME.lime },
  addTitle: { color: THEME.limeText, fontFamily: FONTS.black, fontSize: 13, letterSpacing: 1 },
  addHint: { color: THEME.muted, fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  input: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: RADIUS.sm,
    backgroundColor: THEME.surfaceLo,
    borderWidth: 1,
    borderColor: THEME.line,
    color: THEME.text,
    fontFamily: FONTS.semi,
    fontSize: 15,
    paddingHorizontal: 14,
  },
  diffRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  diffChip: { flex: 1, minHeight: 36, borderRadius: RADIUS.sm, backgroundColor: THEME.surfaceLo, alignItems: 'center', justifyContent: 'center' },
  diffText: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 11, letterSpacing: 0.8 },
  diffTextOn: { color: THEME.onAccent },
  row: {
    boxShadow: CLAY.card, backgroundColor: THEME.surface, borderRadius: RADIUS.md, padding: 14, marginTop: 10, borderWidth: 1, borderColor: THEME.line },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diffTag: { fontFamily: FONTS.black, fontSize: 10, letterSpacing: 1 },
  missionText: { color: THEME.text, fontFamily: FONTS.semi, fontSize: 15, lineHeight: 21 },
  target: { color: THEME.onAccent, backgroundColor: THEME.cyan, fontFamily: FONTS.black, fontSize: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.surfaceLo, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: THEME.text, fontSize: 17 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  ghost: { minHeight: 40, paddingHorizontal: 16, borderRadius: RADIUS.pill, justifyContent: 'center' },
  ghostText: { color: THEME.muted, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1 },
  save: { minHeight: 40, paddingHorizontal: 20, borderRadius: RADIUS.pill, backgroundColor: THEME.yellow, justifyContent: 'center' },
  saveText: { color: THEME.onAccent, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1 },
  empty: { color: THEME.muted, fontFamily: FONTS.semi, fontSize: 14, textAlign: 'center', marginTop: 22 },
  link: { alignItems: 'center', paddingVertical: 18 },
  linkText: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1 },
  undoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  undoText: { color: THEME.onAccent, fontFamily: FONTS.bold, fontSize: 14 },
  undoButton: { paddingHorizontal: 14, minHeight: 36, borderRadius: RADIUS.pill, backgroundColor: THEME.onAccent, justifyContent: 'center' },
  undoButtonText: { color: THEME.primary, fontFamily: FONTS.black, fontSize: 12, letterSpacing: 1 },
});
