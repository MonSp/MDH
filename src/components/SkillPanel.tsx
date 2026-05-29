import React from 'react';
import { formatStepArgs } from '../modules/skillParser';

interface SkillInfo {
  name: string;
  description: string;
  dir: string;
  type?: string;
}

interface EditingSkill {
  name: string;
  description: string;
  params: Array<{ key: string; label: string; defaultValue: string }>;
  steps: Array<{ command: string; payload: Record<string, any> }>;
  skillType: string;
  generating: boolean;
}

interface SkillPanelProps {
  open: boolean;
  skills: SkillInfo[];
  editingSkill: EditingSkill | null;
  onChangeEditingSkill: (skill: EditingSkill | null) => void;
  onSaveSkill: () => void;
  onDeleteSkill: (dir: string) => void;
  onRunSkill: (skill: SkillInfo) => void;
  onClose: () => void;
}

export default function SkillPanel({
  open,
  skills,
  editingSkill,
  onChangeEditingSkill,
  onSaveSkill,
  onDeleteSkill,
  onRunSkill,
  onClose,
}: SkillPanelProps) {
  if (!open) return null;

  return (
    <div className="skill-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="skill-panel">
        <h3>Skill 模板</h3>
        {editingSkill ? (
          <SkillEditor
            skill={editingSkill}
            onChange={onChangeEditingSkill}
            onSave={onSaveSkill}
            onCancel={() => onChangeEditingSkill(null)}
          />
        ) : (
          <SkillList
            skills={skills}
            onRun={onRunSkill}
            onDelete={onDeleteSkill}
          />
        )}
      </div>
    </div>
  );
}

interface SkillEditorProps {
  skill: EditingSkill;
  onChange: (skill: EditingSkill) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SkillEditor({ skill, onChange, onSave, onCancel }: SkillEditorProps) {
  const updateField = (field: keyof EditingSkill, value: any) => {
    onChange({ ...skill, [field]: value });
  };

  return (
    <div className="skill-editor">
      <div className="skill-field">
        <label>名称</label>
        <input
          value={skill.name}
          onChange={e => updateField('name', e.target.value)}
          placeholder="如：GitHub 搜索"
        />
      </div>
      <div className="skill-field">
        <label>描述</label>
        <input
          value={skill.description}
          onChange={e => updateField('description', e.target.value)}
          placeholder="一句话描述这个 Skill 的用途"
        />
      </div>
      <div className="skill-field">
        <label>步骤预览 ({skill.steps.length})</label>
        <div className="skill-steps">
          {skill.steps.map((step, i) => (
            <div key={i} className="skill-step">
              <span className="step-index">{i + 1}</span>
              <span className="step-cmd">{step.command}</span>
              <span className="step-args">{formatStepArgs(step.payload)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="skill-actions">
        <button className="btn-secondary" onClick={onCancel}>取消</button>
        <button className="btn-primary" onClick={onSave}>保存</button>
      </div>
    </div>
  );
}

interface SkillListProps {
  skills: SkillInfo[];
  onRun: (skill: SkillInfo) => void;
  onDelete: (dir: string) => void;
}

function SkillList({ skills, onRun, onDelete }: SkillListProps) {
  if (skills.length === 0) {
    return <p className="skill-empty">暂无 Skill 模板，执行任务后点击"保存为 Skill"即可创建</p>;
  }

  return (
    <div className="skill-list">
      {skills.map(skill => (
        <div key={skill.dir} className="skill-card">
          <div className="skill-card-header">
            <span className="skill-card-name">{skill.name}</span>
            <button className="skill-card-del" onClick={() => onDelete(skill.dir)}>×</button>
          </div>
          <div className="skill-card-desc">{skill.description}</div>
          <button className="skill-card-run" onClick={() => onRun(skill)}>执行</button>
        </div>
      ))}
    </div>
  );
}
