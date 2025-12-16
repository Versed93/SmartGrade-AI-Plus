import React, { useState, useRef } from 'react';
import { Rubric, RubricCriterion, RubricLevel } from '../types';
import { generateRubricWithAI, extractRubricFromMedia } from '../services/geminiService';
import { Icon } from './Icon';

interface RubricEditorProps {
  rubric: Rubric;
  onUpdate: (rubric: Rubric) => void;
  readOnly?: boolean;
}

export const RubricEditor: React.FC<RubricEditorProps> = ({ rubric, onUpdate, readOnly = false }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('Undergraduate');
  const [isDragging, setIsDragging] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draggedCriterionIndex, setDraggedCriterionIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template Management State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateMode, setTemplateMode] = useState<'save' | 'load'>('load');
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<Rubric[]>([]);

  // Calculate course contribution weights
  const assignmentWeight = rubric.assignmentWeight || 0;
  const peerEvalPct = rubric.peerEvalWeight || 0;
  const teacherCourseWeight = (assignmentWeight * (100 - peerEvalPct)) / 100;
  const peerCourseWeight = (assignmentWeight * peerEvalPct) / 100;

  const handleAiGenerate = async () => {
    if (readOnly) return;
    if (!topic) {
        alert("Please enter a topic.");
        return;
    }
    setIsGenerating(true);
    try {
      // Use context stored in the rubric object
      const generated = await generateRubricWithAI(topic, gradeLevel, {
        brief: rubric.assignmentBrief,
        plos: rubric.plos,
        clos: rubric.clos
      });

      if (generated && generated.criteria) {
        onUpdate({
          ...rubric,
          description: generated.description || rubric.description,
          criteria: generated.criteria as RubricCriterion[]
        });
      }
    } catch (e) {
      alert("Failed to generate rubric. Please check API key configuration.");
    } finally {
      setIsGenerating(false);
    }
  };

  const processFile = async (file: File) => {
    if (readOnly) return;
    if (!file) return;
    
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Please upload an image (PNG, JPEG) or PDF file.');
      return;
    }

    setIsGenerating(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const generated = await extractRubricFromMedia(base64Data, file.type);
      if (generated && generated.criteria) {
        onUpdate({
          ...rubric,
          description: generated.description || rubric.description,
          criteria: generated.criteria as RubricCriterion[]
        });
      }
    } catch (e) {
      console.error(e);
      alert("Failed to extract rubric from file.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const addCriterion = () => {
    if (readOnly) return;
    const newCriterion: RubricCriterion = {
      id: crypto.randomUUID(),
      title: 'New Criterion',
      description: 'Description of items to evaluate...',
      weight: 0.5, 
      levels: [
        { label: 'Excellent (10)', score: 10, description: 'Exceptional performance meeting all requirements.' },
        { label: 'Good (8)', score: 8, description: 'Above average performance with minor issues.' },
        { label: 'Average (6)', score: 6, description: 'Acceptable performance meeting basic requirements.' },
        { label: 'Fair (4)', score: 4, description: 'Below average performance with significant issues.' },
        { label: 'Poor (2)', score: 2, description: 'Unacceptable performance or missing components.' }
      ].map(l => ({ ...l, id: crypto.randomUUID() }))
    };
    onUpdate({ ...rubric, criteria: [...rubric.criteria, newCriterion] });
    setEditingIndex(rubric.criteria.length);
  };

  const updateCriterion = (index: number, field: keyof RubricCriterion, value: any) => {
    if (readOnly) return;
    const updated = [...rubric.criteria];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ ...rubric, criteria: updated });
  };

  const removeCriterion = (index: number) => {
    if (readOnly) return;
    const updated = rubric.criteria.filter((_, i) => i !== index);
    onUpdate({ ...rubric, criteria: updated });
    if (editingIndex === index) setEditingIndex(null);
  };

  const addLevel = (criterionIndex: number) => {
    if (readOnly) return;
    const criterion = rubric.criteria[criterionIndex];
    if (criterion.levels.length >= 10) return;
    const newLevel: RubricLevel = {
      id: crypto.randomUUID(),
      label: 'New Level',
      score: 0,
      description: 'Description'
    };
    const newLevels = [...criterion.levels, newLevel];
    updateCriterion(criterionIndex, 'levels', newLevels);
  };

  const removeLevel = (criterionIndex: number, levelIndex: number) => {
    if (readOnly) return;
    const criterion = rubric.criteria[criterionIndex];
    if (criterion.levels.length <= 1) return;
    const newLevels = criterion.levels.filter((_, i) => i !== levelIndex);
    updateCriterion(criterionIndex, 'levels', newLevels);
  };

  const handleDragStartCriterion = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    setDraggedCriterionIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOverCriterion = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropCriterion = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation(); 
    if (draggedCriterionIndex === null) return;
    if (draggedCriterionIndex === index) { setDraggedCriterionIndex(null); return; }
    const newCriteria = [...rubric.criteria];
    const [draggedItem] = newCriteria.splice(draggedCriterionIndex, 1);
    newCriteria.splice(index, 0, draggedItem);
    onUpdate({ ...rubric, criteria: newCriteria });
    setDraggedCriterionIndex(null);
  };

  // Template Handlers
  const openTemplateModal = (mode: 'save' | 'load') => {
    if (readOnly) return;
    setTemplateMode(mode);
    setTemplateName(rubric.title);
    const loaded = localStorage.getItem('smartgrade_rubric_templates');
    if (loaded) setSavedTemplates(JSON.parse(loaded));
    setShowTemplateModal(true);
  };

  const saveTemplate = () => {
    if (!templateName.trim()) return;
    const newTemplate = { ...rubric, title: templateName.trim() };
    const existingIndex = savedTemplates.findIndex(t => t.title === newTemplate.title);
    let newTemplates;
    if (existingIndex >= 0) {
        if (!confirm(`Overwrite existing template "${newTemplate.title}"?`)) return;
        newTemplates = [...savedTemplates];
        newTemplates[existingIndex] = newTemplate;
    } else {
        newTemplates = [...savedTemplates, newTemplate];
    }
    localStorage.setItem('smartgrade_rubric_templates', JSON.stringify(newTemplates));
    setSavedTemplates(newTemplates);
    setShowTemplateModal(false);
  };

  const deleteTemplate = (index: number) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    const newTemplates = savedTemplates.filter((_, i) => i !== index);
    localStorage.setItem('smartgrade_rubric_templates', JSON.stringify(newTemplates));
    setSavedTemplates(newTemplates);
  };

  const loadTemplate = (template: Rubric) => {
     if (!confirm("Loading a template will replace your current rubric criteria. Continue?")) return;
     const freshRubric: Rubric = {
        ...rubric,
        title: template.title, // Keep or overwrite? Usually templates overwrite title
        description: template.description,
        criteria: template.criteria.map(c => ({
            ...c,
            id: crypto.randomUUID(),
            levels: c.levels.map(l => ({...l, id: crypto.randomUUID()}))
        }))
     };
     onUpdate(freshRubric);
     setShowTemplateModal(false);
  };

  const getCriterionMaxScore = (c: RubricCriterion) => Math.max(0, ...(c.levels?.map(l => l.score) || [0]));
  const getCriterionEffectiveScore = (c: RubricCriterion) => getCriterionMaxScore(c) * (c.weight ?? 1);
  const getTotalRubricScore = () => rubric.criteria.reduce((sum, c) => sum + getCriterionEffectiveScore(c), 0);

  const currentCriterion = editingIndex !== null ? rubric.criteria[editingIndex] : null;
  const totalRubricScore = getTotalRubricScore();

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Rubric Info Summary (Read Only) */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{rubric.subject || 'No Subject Code'}</div>
              <h2 className="text-xl font-bold text-slate-800">{rubric.title || 'Untitled Assignment'}</h2>
              <div className="flex gap-2 mt-1">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${rubric.type === 'individual' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {rubric.type || 'Individual'}
                  </span>
                  {readOnly && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700">Read Only</span>}
              </div>
          </div>
          <div className="flex gap-4 text-sm">
             <div className="text-right">
                 <div className="text-slate-500 text-xs">Teacher Rubric</div>
                 <div className="font-bold text-blue-600">{teacherCourseWeight.toFixed(1)}%</div>
                 <div className="text-[10px] text-slate-400">of Course Grade</div>
             </div>
             <div className="text-right border-l border-slate-300 pl-4">
                 <div className="text-slate-500 text-xs">Peer Eval</div>
                 <div className="font-bold text-purple-600">{peerCourseWeight.toFixed(1)}%</div>
                 <div className="text-[10px] text-slate-400">of Course Grade</div>
             </div>
          </div>
      </div>

      {!readOnly && (
        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="font-bold text-slate-700 ml-2">Rubric Actions</h2>
            <div className="flex gap-2">
                <button onClick={() => openTemplateModal('load')} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 text-sm font-medium transition-colors">
                    <Icon.FolderOpen /> Load Template
                </button>
                <button onClick={() => openTemplateModal('save')} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 text-sm font-medium transition-colors">
                    <Icon.Bookmark /> Save as Template
                </button>
            </div>
        </div>
      )}

      {!readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Text Generation */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Icon.Sparkles /> AI Generation
            </h2>
            <p className="text-sm text-slate-500 mb-4">
                Enter a topic to generate criteria. The AI will consider your Assignment Context (Brief, PLOs, CLOs) from the Subject section.
            </p>
            <div className="space-y-4">
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assignment Topic</label>
                <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. Science Fair Project"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                />
                </div>
                <div className="flex gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Grade Level</label>
                    <select 
                    className="w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    >
                    <option>Undergraduate</option>
                    <option>Foundation</option>
                    <option>Postgraduate</option>
                    </select>
                </div>
                <button 
                    onClick={handleAiGenerate}
                    disabled={isGenerating || !topic}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors h-[42px]"
                >
                    {isGenerating ? 'Generating...' : 'Generate Rubric'}
                </button>
                </div>
            </div>
            </div>

            {/* File Upload Extraction */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Icon.CloudArrowUp /> Extract Rubric from File
            </h2>
            <div 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
                }`}
            >
                <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                />
                {isGenerating ? (
                <div className="animate-pulse text-blue-600 font-medium">Analyzing document...</div>
                ) : (
                <>
                    <div className="w-12 h-12 text-slate-400 mb-2">
                    <Icon.CloudArrowUp />
                    </div>
                    <p className="text-slate-600 font-medium text-sm">Drag & drop Rubric PDF/Image</p>
                    <p className="text-slate-400 text-xs mt-1">or click to browse</p>
                </>
                )}
            </div>
            </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-2 px-2">
            <h3 className="font-bold text-slate-700">Criteria</h3>
            <div className="text-sm text-slate-500">
                Total Criteria Marks: <span className="font-bold text-blue-600">{totalRubricScore.toFixed(1)}</span>
            </div>
        </div>

        {/* List of Criteria - Table-like Layout */}
        <div className="space-y-4">
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider rounded-t-lg border-b border-slate-200">
            <div className="col-span-4">Criteria / Items</div>
            <div className="col-span-2 text-center">Full Mark (%)</div>
            <div className="col-span-2 text-center">Weightage</div>
            <div className="col-span-3">Score Levels</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {rubric.criteria.map((criterion, i) => {
             const standardizedFullMark = (criterion.weight ?? 1) * 10;
             return (
             <div 
               key={criterion.id} 
               draggable={!readOnly}
               onDragStart={(e) => handleDragStartCriterion(e, i)}
               onDragOver={(e) => handleDragOverCriterion(e, i)}
               onDrop={(e) => handleDropCriterion(e, i)}
               className={`bg-white p-4 rounded-lg border shadow-sm group transition-all grid grid-cols-1 md:grid-cols-12 gap-4 items-center ${
                 draggedCriterionIndex === i ? 'border-dashed border-blue-400 bg-blue-50 opacity-60' : 'border-slate-200 hover:border-blue-300'
               }`}
             >
                {/* Title & Description */}
                <div className="md:col-span-4 flex items-start gap-2">
                     {!readOnly && (
                        <div 
                            className="text-slate-300 cursor-grab hover:text-slate-500 active:cursor-grabbing p-1 rounded hover:bg-slate-100 mt-0.5"
                            title="Drag to reorder"
                        >
                            <Icon.Bars3 />
                        </div>
                     )}
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm">{criterion.title || 'Untitled Criterion'}</h3>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-1">{criterion.description || 'No description provided.'}</p>
                    </div>
                </div>

                {/* Full Mark (Effective Score) */}
                <div className="md:col-span-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            disabled={readOnly}
                            value={standardizedFullMark}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0) {
                                    updateCriterion(i, 'weight', val / 10);
                                }
                            }}
                            className={`w-16 p-1 text-center font-mono text-sm border border-slate-200 rounded outline-none font-bold text-blue-700 ${readOnly ? 'bg-slate-50 text-slate-500' : 'focus:border-blue-500 focus:ring-1 focus:ring-blue-200'}`}
                        />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 md:hidden">Full Mark</div>
                </div>

                {/* Weightage */}
                <div className="md:col-span-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <span className="text-slate-400 font-mono text-sm">x</span>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={readOnly}
                            value={criterion.weight ?? 1}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0) {
                                    updateCriterion(i, 'weight', val);
                                }
                            }}
                            className={`w-16 p-1 text-center font-mono text-sm border border-slate-200 rounded outline-none ${readOnly ? 'bg-slate-50 text-slate-500' : 'focus:border-blue-500 focus:ring-1 focus:ring-blue-200'}`}
                        />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 md:hidden">Weightage</div>
                </div>

                {/* Levels Preview */}
                <div className="md:col-span-3">
                    <div className="flex flex-wrap gap-1">
                        {criterion.levels.sort((a,b) => a.score - b.score).map(l => (
                            <span key={l.id} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200" title={`${l.description} (Raw: ${l.score})`}>
                                {l.label} <span className="text-slate-400">({(l.score * (criterion.weight ?? 1)).toFixed(1)})</span>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="md:col-span-1 flex items-center justify-end gap-1">
                   {!readOnly ? (
                    <>
                       <button 
                        onClick={() => setEditingIndex(i)} 
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Criterion"
                       >
                          <Icon.Pencil />
                       </button>
                       <button 
                        onClick={() => removeCriterion(i)} 
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete Criterion"
                       >
                          <Icon.Trash />
                       </button>
                    </>
                   ) : (
                       <button 
                        onClick={() => setEditingIndex(i)} 
                        className="p-1.5 text-slate-400 hover:bg-slate-50 rounded transition-colors"
                        title="View Details"
                       >
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                             <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                           </svg>
                       </button>
                   )}
                </div>
             </div>
             );
          })}
          
          {!readOnly && (
            <button 
                onClick={addCriterion} 
                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            >
                <Icon.Plus /> Add New Criterion
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal (Wrapper to support View Mode) */}
      {editingIndex !== null && currentCriterion && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
              <div className="flex justify-between items-center p-6 border-b border-slate-100">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Icon.Pencil /> {readOnly ? 'View Criterion Details' : 'Edit Criterion'}
                 </h2>
                 <button onClick={() => setEditingIndex(null)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <Icon.XMark />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 {/* Criterion Details */}
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-3 space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">Criterion Title</label>
                           <input 
                            disabled={readOnly}
                            value={currentCriterion.title}
                            onChange={(e) => updateCriterion(editingIndex, 'title', e.target.value)}
                            className={`w-full font-medium border border-slate-300 rounded-md p-2 outline-none ${readOnly ? 'bg-slate-50 text-slate-600' : 'focus:ring-2 focus:ring-blue-500'}`}
                            placeholder="e.g. Content Accuracy"
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                           <textarea 
                            disabled={readOnly}
                            value={currentCriterion.description}
                            onChange={(e) => updateCriterion(editingIndex, 'description', e.target.value)}
                            className={`w-full text-sm border border-slate-300 rounded-md p-2 h-20 outline-none resize-none ${readOnly ? 'bg-slate-50 text-slate-600' : 'focus:ring-2 focus:ring-blue-500'}`}
                            placeholder="Describe what is being evaluated..."
                           />
                       </div>
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4 h-fit">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Full Mark (%)</label>
                          <div className={`flex items-center gap-2 bg-white border border-slate-300 rounded-md px-2 py-1 ${!readOnly && 'focus-within:ring-2 focus-within:ring-blue-500'}`}>
                             <input 
                                type="number"
                                min="0"
                                step="0.1"
                                disabled={readOnly}
                                value={(currentCriterion.weight ?? 1) * 10}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val >= 0) {
                                        updateCriterion(editingIndex, 'weight', val / 10);
                                    }
                                }}
                                className="w-full font-mono text-lg font-bold text-blue-600 outline-none bg-transparent"
                             />
                          </div>
                        </div>
                    </div>
                 </div>

                 <hr className="border-slate-100" />

                 {/* Levels Section */}
                 <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700">Performance Levels</h3>
                        {!readOnly && (
                            <button 
                                onClick={() => addLevel(editingIndex)}
                                disabled={currentCriterion.levels.length >= 10}
                                className="text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100 font-medium disabled:opacity-50 flex items-center gap-1 transition-colors"
                            >
                                <Icon.Plus /> Add Level
                            </button>
                        )}
                    </div>

                    <div 
                        className="grid gap-4 overflow-x-auto pb-4" 
                        style={{ 
                          gridTemplateColumns: `repeat(${currentCriterion.levels.length}, minmax(200px, 1fr))` 
                        }}
                    >
                        {currentCriterion.levels && currentCriterion.levels.sort((a,b) => b.score - a.score).map((level, lIndex) => (
                          <div key={level.id} className="bg-white p-4 rounded-lg border border-slate-200 text-sm relative group hover:shadow-md transition-shadow">
                            {!readOnly && (
                                <button 
                                    onClick={() => removeLevel(editingIndex, lIndex)}
                                    className="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                    title="Remove Level"
                                >
                                    <div className="w-4 h-4"><Icon.XMark /></div>
                                </button>
                            )}
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Label</label>
                                    <input 
                                        disabled={readOnly}
                                        value={level.label}
                                        onChange={(e) => {
                                          const newLevels = [...currentCriterion.levels];
                                          newLevels[lIndex] = { ...level, label: e.target.value };
                                          updateCriterion(editingIndex, 'levels', newLevels);
                                        }}
                                        className={`font-bold text-slate-800 w-full outline-none border-b border-transparent bg-transparent transition-colors ${!readOnly && 'focus:border-blue-500'}`}
                                        placeholder="Level Name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Points</label>
                                    <input 
                                        type="number"
                                        disabled={readOnly}
                                        value={level.score}
                                        onChange={(e) => {
                                          const newLevels = [...currentCriterion.levels];
                                          const newScore = parseFloat(e.target.value);
                                          newLevels[lIndex] = { ...level, score: newScore };
                                          updateCriterion(editingIndex, 'levels', newLevels);
                                        }}
                                        className={`font-mono text-slate-800 bg-slate-50 w-full rounded px-2 py-1 outline-none ${!readOnly && 'focus:ring-1 focus:ring-blue-500'}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Description</label>
                                    <textarea 
                                        disabled={readOnly}
                                        value={level.description}
                                        onChange={(e) => {
                                            const newLevels = [...currentCriterion.levels];
                                            newLevels[lIndex] = { ...level, description: e.target.value };
                                            updateCriterion(editingIndex, 'levels', newLevels);
                                        }}
                                        className={`w-full text-slate-600 text-xs resize-none h-24 outline-none border border-slate-200 rounded p-2 transition-colors ${!readOnly && 'focus:border-blue-500'}`}
                                        placeholder="Describe the criteria for this level..."
                                    />
                                </div>
                            </div>
                          </div>
                        ))}
                    </div>
                 </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
                 <button 
                    onClick={() => setEditingIndex(null)} 
                    className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                 >
                    {readOnly ? 'Close' : 'Done'}
                 </button>
              </div>
           </div>
        </div>
     )}

      {/* Template Modal */}
      {!readOnly && showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {templateMode === 'save' ? <Icon.Bookmark /> : <Icon.FolderOpen />}
                    {templateMode === 'save' ? 'Save as Template' : 'Load Template'}
                 </h2>
                 <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                    <Icon.XMark />
                 </button>
              </div>

              <div className="p-6 overflow-y-auto">
                  {templateMode === 'save' ? (
                      <div className="space-y-4">
                          <p className="text-sm text-slate-500">Save the current rubric configuration (criteria & levels) as a reusable template.</p>
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Template Name</label>
                              <input 
                                  value={templateName}
                                  onChange={(e) => setTemplateName(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="e.g. Standard Essay Rubric"
                                  autoFocus
                              />
                          </div>
                          <div className="pt-4 flex justify-end">
                              <button 
                                  onClick={saveTemplate}
                                  disabled={!templateName.trim()}
                                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                              >
                                  Save Template
                              </button>
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          {savedTemplates.length === 0 ? (
                              <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                  <p>No templates saved yet.</p>
                              </div>
                          ) : (
                              <div className="space-y-2">
                                  {savedTemplates.map((t, idx) => (
                                      <div key={idx} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group">
                                          <div className="flex-1 min-w-0 mr-4">
                                              <h4 className="font-bold text-slate-700 truncate">{t.title}</h4>
                                              <p className="text-xs text-slate-500 truncate">{t.criteria?.length || 0} Criteria • {t.description?.slice(0, 50)}...</p>
                                          </div>
                                          <div className="flex gap-2">
                                              <button 
                                                  onClick={() => loadTemplate(t)}
                                                  className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded hover:bg-blue-100 transition-colors"
                                              >
                                                  Load
                                              </button>
                                              <button 
                                                  onClick={() => deleteTemplate(idx)}
                                                  className="p-1.5 text-slate-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                                                  title="Delete Template"
                                              >
                                                  <Icon.Trash />
                                              </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};