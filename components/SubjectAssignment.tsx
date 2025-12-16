import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Rubric } from '../types';
import { Icon } from './Icon';
import { extractSubmissionText } from '../services/geminiService';

interface SubjectAssignmentProps {
  rubric: Rubric;
  allRubrics: Rubric[];
  onUpdate: (rubric: Rubric) => void;
  onSelectRubric: (id: string) => void;
  onCreateRubric: () => void;
  onDeleteRubric: (id: string) => void;
  onDeleteSubject: (subject: string) => void;
  onNext: () => void;
}

export const SubjectAssignment: React.FC<SubjectAssignmentProps> = ({ 
    rubric, 
    allRubrics, 
    onUpdate, 
    onSelectRubric, 
    onCreateRubric,
    onDeleteRubric,
    onDeleteSubject,
    onNext 
}) => {
  const peerWeight = rubric.peerEvalWeight || 0;
  const teacherWeight = 100 - peerWeight;
  const assignmentWeight = rubric.assignmentWeight ?? 100;
  const passingPercentage = rubric.passingPercentage ?? 50;
  
  const teacherContributionToCourse = (assignmentWeight * teacherWeight) / 100;
  const peerContributionToCourse = (assignmentWeight * peerWeight) / 100;
  
  // Calculate passing points based on assignment weight
  const passingPoints = (assignmentWeight * passingPercentage) / 100;

  const briefInputRef = useRef<HTMLInputElement>(null);
  const ploInputRef = useRef<HTMLInputElement>(null);
  const cloInputRef = useRef<HTMLInputElement>(null);
  
  const [isBriefExtracting, setIsBriefExtracting] = useState(false);
  const [isPloExtracting, setIsPloExtracting] = useState(false);
  const [isCloExtracting, setIsCloExtracting] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Group rubrics by Subject
  const groupedRubrics = useMemo<Record<string, Rubric[]>>(() => {
    const groups: Record<string, Rubric[]> = {};
    allRubrics.forEach(r => {
        const key = r.subject && r.subject.trim() ? r.subject.trim().toUpperCase() : 'NO SUBJECT';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });
    return groups;
  }, [allRubrics]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Auto-expand current group when rubric changes
  useEffect(() => {
      const currentSubjectKey = rubric.subject && rubric.subject.trim() ? rubric.subject.trim().toUpperCase() : 'NO SUBJECT';
      setExpandedGroups(prev => {
          const next = new Set(prev);
          next.add(currentSubjectKey);
          return next;
      });
  }, [rubric.subject]);

  const handleSubjectClick = (subjectKey: string, groupAssignments: Rubric[]) => {
      const isExpanded = expandedGroups.has(subjectKey);
      // Check if the currently selected rubric is part of this group
      const isSelectedInGroup = groupAssignments.some(r => r.id === rubric.id);

      if (!isExpanded) {
          // If closed: Open it and select the first assignment
          setExpandedGroups(prev => {
              const next = new Set(prev);
              next.add(subjectKey);
              return next;
          });
          if (groupAssignments.length > 0) {
              onSelectRubric(groupAssignments[0].id);
          }
      } else {
          // If open:
          if (!isSelectedInGroup) {
              // If we are navigating from another group, just select the first assignment of this group
              if (groupAssignments.length > 0) {
                  onSelectRubric(groupAssignments[0].id);
              }
          } else {
              // If we are already in this group, toggle close (standard accordion behavior)
              setExpandedGroups(prev => {
                  const next = new Set(prev);
                  next.delete(subjectKey);
                  return next;
              });
          }
      }
  };

  // Reset peer eval weight if switched to individual
  useEffect(() => {
    if (rubric.type === 'individual' && rubric.peerEvalWeight !== 0) {
        onUpdate({ ...rubric, peerEvalWeight: 0 });
    }
  }, [rubric.type]);

  const handleImportText = async (
    e: React.ChangeEvent<HTMLInputElement>,
    currentText: string,
    field: 'assignmentBrief' | 'plos' | 'clos',
    setLoading: (loading: boolean) => void
  ) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setLoading(true);
        try {
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const text = await extractSubmissionText(base64Data, file.type);
            const newText = currentText ? currentText + "\n\n" + text : text;
            
            if (field === 'plos' || field === 'clos') {
                onUpdate({ ...rubric, [field]: newText.split('\n').filter(x => x.trim()) });
            } else {
                onUpdate({ ...rubric, [field]: newText });
            }
        } catch (error) {
            alert("Failed to extract text.");
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] animate-fade-in">
      
      {/* Sidebar: Assignment List */}
      <div className="w-full lg:w-96 bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm shrink-0 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-bold text-slate-700">Course Structure</h3>
              <p className="text-xs text-slate-500 mt-1">Select a subject to view assignments</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {Object.entries(groupedRubrics).sort((a, b) => a[0].localeCompare(b[0])).map(([subject, assignments]: [string, Rubric[]]) => (
                  <div key={subject} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    {/* Subject Header (Folder) */}
                    <div className="flex items-center w-full bg-slate-50 hover:bg-slate-100 transition-colors">
                        <button 
                            onClick={() => handleSubjectClick(subject, assignments)}
                            className="flex-1 flex items-center justify-between p-3"
                        >
                            <div className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                                <Icon.FolderOpen /> 
                                <span>{subject}</span>
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center">
                                    {assignments.length}
                                </span>
                            </div>
                            <Icon.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedGroups.has(subject) ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteSubject(subject); }}
                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-slate-100"
                            title="Delete Course Structure"
                        >
                            <Icon.Trash />
                        </button>
                    </div>
                    
                    {/* Assignment List */}
                    {expandedGroups.has(subject) && (
                        <div className="bg-white border-t border-slate-100">
                            {assignments.map(r => (
                                <div 
                                    key={r.id}
                                    onClick={() => onSelectRubric(r.id)}
                                    className={`p-3 pl-10 border-b border-slate-50 last:border-0 cursor-pointer transition-colors relative group ${r.id === rubric.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                    <div className="font-medium text-sm truncate pr-6">{r.title}</div>
                                    <div className={`text-[10px] ${r.id === rubric.id ? 'text-blue-500' : 'text-slate-400'}`}>
                                        {r.assignmentWeight}% of Grade
                                    </div>
                                    
                                    {allRubrics.length > 1 && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeleteRubric(r.id); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Delete Assignment"
                                        >
                                            <Icon.Trash />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                  </div>
              ))}
          </div>
          <div className="p-4 border-t border-slate-200">
              <button 
                onClick={onCreateRubric}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors"
              >
                  <Icon.Plus /> Add Assignment
              </button>
          </div>
      </div>

      {/* Main Content: Details */}
      <div className="flex-1 overflow-y-auto pr-2">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
            
            {/* Header */}
            <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
                <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                    <Icon.DocumentText />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Assignment Details</h2>
                    <p className="text-slate-500">Configure parameters for <span className="font-bold text-slate-700">{rubric.title}</span></p>
                </div>
            </div>

            {/* Context 1-line Box */}
            <div className="border border-blue-100 bg-blue-50/50 rounded-xl overflow-hidden transition-all">
                <button 
                    onClick={() => setIsContextOpen(!isContextOpen)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded flex items-center justify-center text-xs">
                            <Icon.Sparkles />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">Assignment Context & AI Alignment</h3>
                            {!isContextOpen && (
                                <p className="text-xs text-slate-500 truncate max-w-md">
                                    {(rubric.assignmentBrief || rubric.plos?.length || rubric.clos?.length) 
                                        ? 'Context provided for AI generation.' 
                                        : 'Click to add Brief, PLOs, and CLOs to improve AI rubric generation.'}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className={`transform transition-transform text-slate-400 ${isContextOpen ? 'rotate-180' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                    </div>
                </button>
                
                {isContextOpen && (
                    <div className="p-6 border-t border-blue-100 bg-white space-y-6 animate-fade-in text-left">
                        {/* Brief */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-bold text-slate-700">Assignment Brief</label>
                                <button 
                                    onClick={() => briefInputRef.current?.click()}
                                    disabled={isBriefExtracting}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                >
                                    {isBriefExtracting ? 'Loading...' : <><Icon.CloudArrowUp /> Import</>}
                                </button>
                                <input type="file" ref={briefInputRef} className="hidden" accept=".pdf,image/*,text/plain" onChange={(e) => handleImportText(e, rubric.assignmentBrief || '', 'assignmentBrief', setIsBriefExtracting)} />
                            </div>
                            <textarea
                                value={rubric.assignmentBrief || ''}
                                onChange={(e) => onUpdate({...rubric, assignmentBrief: e.target.value})}
                                className="w-full text-sm p-3 border border-slate-300 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Paste requirements..."
                            />
                        </div>

                        {/* PLO */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-bold text-slate-700 uppercase">Program Learning Outcomes (PLOs)</label>
                                <button onClick={() => ploInputRef.current?.click()} className="text-xs text-blue-600 hover:underline"><Icon.CloudArrowUp /> Import</button>
                                <input type="file" ref={ploInputRef} className="hidden" accept=".pdf,image/*,text/plain" onChange={(e) => handleImportText(e, (rubric.plos||[]).join('\n'), 'plos', setIsPloExtracting)} />
                            </div>
                            <textarea
                                value={(rubric.plos || []).join('\n')}
                                onChange={(e) => onUpdate({...rubric, plos: e.target.value.split('\n')})}
                                className="w-full text-sm p-3 border border-slate-300 rounded-lg h-32 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="PLO1: Critical Thinking..."
                            />
                        </div>
                        {/* CLO */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-bold text-slate-700 uppercase">Course Learning Outcomes (CLOs)</label>
                                <button onClick={() => cloInputRef.current?.click()} className="text-xs text-blue-600 hover:underline"><Icon.CloudArrowUp /> Import</button>
                                <input type="file" ref={cloInputRef} className="hidden" accept=".pdf,image/*,text/plain" onChange={(e) => handleImportText(e, (rubric.clos||[]).join('\n'), 'clos', setIsCloExtracting)} />
                            </div>
                            <textarea
                                value={(rubric.clos || []).join('\n')}
                                onChange={(e) => onUpdate({...rubric, clos: e.target.value.split('\n')})}
                                className="w-full text-sm p-3 border border-slate-300 rounded-lg h-32 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="CLO1: Apply fundamentals..."
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left Column: Info */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Subject / Course Code</label>
                        <input 
                            value={rubric.subject || ''}
                            onChange={(e) => onUpdate({...rubric, subject: e.target.value})}
                            className="w-full text-lg p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. CS101"
                        />
                        <p className="text-xs text-slate-400 mt-1">Applies to all assignments in this course.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Assignment Title</label>
                        <input 
                            value={rubric.title}
                            onChange={(e) => onUpdate({...rubric, title: e.target.value})}
                            className="w-full text-lg p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Final Group Project"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Assignment Type</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${rubric.type === 'individual' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <input 
                                    type="radio" 
                                    name="assignmentType" 
                                    checked={rubric.type === 'individual'} 
                                    onChange={() => onUpdate({...rubric, type: 'individual'})}
                                    className="hidden"
                                />
                                <Icon.Users /> Individual
                            </label>
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${rubric.type === 'group' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <input 
                                    type="radio" 
                                    name="assignmentType" 
                                    checked={rubric.type === 'group'} 
                                    onChange={() => onUpdate({...rubric, type: 'group'})}
                                    className="hidden"
                                />
                                <Icon.Users /> Group
                            </label>
                        </div>
                    </div>
                </div>

                {/* Right Column: Grading */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Icon.Check /> Grading Composition
                    </h3>
                    
                    <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Total Weightage</label>
                            <div className="flex items-center gap-2">
                                <input 
                                type="number"
                                min="0"
                                max="100"
                                value={assignmentWeight}
                                onChange={(e) => onUpdate({...rubric, assignmentWeight: parseFloat(e.target.value) || 0})}
                                className="w-24 p-2 text-center font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-sm text-slate-500">% of Course Grade</span>
                            </div>
                    </div>
                    
                    <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Passing Score (%)</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="100" 
                                    value={passingPercentage}
                                    onChange={(e) => onUpdate({...rubric, passingPercentage: parseFloat(e.target.value) || 0})}
                                    className="w-24 p-2 text-center font-bold text-slate-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-sm text-slate-500">Threshold based on Total Weightage</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 bg-white p-2 rounded border border-slate-100">
                                <span className="font-bold text-slate-700">Note:</span> A student needs to achieve <span className="font-bold">{passingPoints.toFixed(2)}</span> out of the {assignmentWeight} course points to pass this assignment.
                            </p>
                    </div>

                    <div className="space-y-4">
                        {/* Peer Eval Weight - Only for Group */}
                        {rubric.type === 'group' ? (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Peer Evaluation Weight</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max="100" 
                                        value={peerWeight}
                                        onChange={(e) => onUpdate({...rubric, peerEvalWeight: parseInt(e.target.value) || 0})}
                                        className="w-24 p-2 text-center font-bold text-purple-600 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                    <span className="text-sm text-slate-500">% of Assignment</span>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-100 flex items-center gap-2">
                                <Icon.Users /> Peer evaluation is disabled for individual assignments.
                            </div>
                        )}

                        {/* Visual Breakdown */}
                        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2 mt-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Impact on Final Course Grade</p>
                            
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-700">Teacher Rubric</span>
                                <span className="text-sm font-bold text-blue-600">{teacherContributionToCourse.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-blue-600 h-full" style={{ width: `${teacherWeight}%` }}></div>
                            </div>

                            {rubric.type === 'group' && (
                                <>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-sm font-medium text-slate-700">Peer Evaluation</span>
                                        <span className="text-sm font-bold text-purple-600">{peerContributionToCourse.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-purple-600 h-full" style={{ width: `${peerWeight}%` }}></div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
                <button 
                    onClick={onNext}
                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                >
                    Save & Continue to Rubric <Icon.Check />
                </button>
            </div>
          </div>
      </div>
    </div>
  );
};