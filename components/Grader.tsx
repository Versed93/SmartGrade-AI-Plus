import React, { useState, useMemo, useRef } from 'react';
import { Assignee, Assessment, Rubric, PeerEvaluation } from '../types';
import { generateFeedbackWithAI, autoGradeWithAI, extractSubmissionText } from '../services/geminiService';
import { Icon } from './Icon';

interface GraderProps {
  rubric: Rubric;
  assignees: Assignee[];
  assessments: Record<string, Assessment>;
  onSaveAssessment: (id: string, assessment: Assessment) => void;
}

export const Grader: React.FC<GraderProps> = ({ rubric, assignees, assessments, onSaveAssessment }) => {
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(assignees.length > 0 ? assignees[0].id : null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [isAutoGrading, setIsAutoGrading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showSubmission, setShowSubmission] = useState(false); // Default to collapsed
  
  const submissionInputRef = useRef<HTMLInputElement>(null);

  const selectedAssignee = assignees.find(a => a.id === selectedAssigneeId);

  // Initialize assessment if not exists, and ensure it stays in sync with Rubric changes
  const currentAssessment = useMemo(() => {
    if (!selectedAssigneeId) return null;

    // Use composite key for lookup: rubricId_studentId
    const compositeKey = `${rubric.id}_${selectedAssigneeId}`;
    
    // Determine config
    const peerEvalWeight = (rubric.type === 'group' ? rubric.peerEvalWeight : 0) || 0;
    const teacherWeight = 100 - peerEvalWeight;

    // 1. Calculate Rubric Max Raw Score (Sum of all criteria max possible weighted scores)
    const rubricMaxRawScore = rubric.criteria.reduce((acc, c) => 
      acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0
    );

    const stored = assessments[compositeKey];
    
    // Fallback if no stored assessment
    const baseAssessment: Assessment = stored || {
      id: compositeKey,
      rubricId: rubric.id,
      assigneeId: selectedAssigneeId,
      entries: [],
      peerEvaluations: [],
      totalScore: 0,
      maxScore: 100, // Standardized to 100%
      feedback: '',
      submissionText: '',
      locked: false,
      lastUpdated: Date.now()
    };

    // 2. Filter entries for criteria that still exist in the rubric
    const validEntries = baseAssessment.entries.filter(entry => 
      rubric.criteria.some(c => c.id === entry.criterionId)
    );

    // 3. Calculate Teacher (Rubric) Raw Score
    let teacherRawScore = 0;
    const updatedEntries = validEntries.map(entry => {
      const criterion = rubric.criteria.find(c => c.id === entry.criterionId);
      const level = criterion?.levels.find(l => l.id === entry.levelId);
      const weight = criterion?.weight ?? 1;
      
      const currentScore = entry.score !== undefined ? entry.score : (level ? level.score : 0);
      teacherRawScore += (currentScore * weight);

      return { ...entry, score: currentScore };
    });

    // 4. Calculate Peer Evaluation Score (Average %)
    const peerEvals = baseAssessment.peerEvaluations || [];
    let peerAvg = 100; 
    
    if (peerEvalWeight > 0) {
        if (peerEvals.length > 0) {
            const sumPeer = peerEvals.reduce((s, e) => s + e.score, 0);
            peerAvg = sumPeer / peerEvals.length;
        } else {
            peerAvg = 0; // No reviews yet
        }
    }

    // 5. Final Composite Score
    const teacherComponent = rubricMaxRawScore > 0 
        ? (teacherRawScore / rubricMaxRawScore) * teacherWeight 
        : 0;
    
    const peerComponent = (peerAvg / 100) * peerEvalWeight;
    
    const finalTotalScore = teacherComponent + peerComponent;

    return {
      ...baseAssessment,
      entries: updatedEntries,
      peerEvaluations: peerEvals,
      totalScore: finalTotalScore,
      maxScore: 100 // Always normalized to 100
    };
  }, [selectedAssigneeId, assessments, rubric]);

  const percentage = currentAssessment ? currentAssessment.totalScore : 0;
  const isPassed = percentage >= (rubric.passingPercentage ?? 50);

  // Helper to get raw rubric score
  const getRubricRawScore = () => {
    if (!currentAssessment) return 0;
    return currentAssessment.entries.reduce((acc, e) => {
        const c = rubric.criteria.find(crit => crit.id === e.criterionId);
        const w = c?.weight ?? 1;
        return acc + (e.score * w);
    }, 0);
  };
  
  const handleScore = (criterionId: string, levelId: string) => {
    if (!selectedAssigneeId || !currentAssessment) return;
    if (currentAssessment.locked) return;

    // Find the level to get the score
    const criterion = rubric.criteria.find(c => c.id === criterionId);
    const level = criterion?.levels.find(l => l.id === levelId);
    const score = level ? level.score : 0;

    saveScore(criterionId, levelId, score);
  };

  const handleCustomScore = (criterionId: string, score: number) => {
    if (!selectedAssigneeId || !currentAssessment) return;
    if (currentAssessment.locked) return;

    // Find closest level for metadata
    const criterion = rubric.criteria.find(c => c.id === criterionId);
    if (!criterion) return;
    const closestLevel = [...criterion.levels].sort((a, b) => Math.abs(a.score - score) - Math.abs(b.score - score))[0];
    
    saveScore(criterionId, closestLevel?.id || 'unknown', score);
  };

  const saveScore = (criterionId: string, levelId: string, score: number) => {
    if (!selectedAssigneeId || !currentAssessment) return;

    const newEntries = currentAssessment.entries.filter(e => e.criterionId !== criterionId);
    newEntries.push({ criterionId, levelId, score });
    
    // Re-calc logic (simplified version of useMemo)
    const peerWeight = (rubric.type === 'group' ? rubric.peerEvalWeight : 0) || 0;
    const teacherWeight = 100 - peerWeight;
    
    const rubricMaxRawScore = rubric.criteria.reduce((acc, c) => 
      acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0
    );

    const teacherRawScore = newEntries.reduce((acc, e) => {
        const c = rubric.criteria.find(crit => crit.id === e.criterionId);
        const w = c?.weight ?? 1;
        return acc + (e.score * w);
    }, 0);

    const peerEvals = currentAssessment.peerEvaluations || [];
    let peerAvg = 0;
    if (peerEvals.length > 0) {
         peerAvg = peerEvals.reduce((s, e) => s + e.score, 0) / peerEvals.length;
    } else if (peerWeight > 0) {
        peerAvg = 0; // strict if missing
    } else {
        peerAvg = 100;
    }

    const teacherComponent = rubricMaxRawScore > 0 ? (teacherRawScore / rubricMaxRawScore) * teacherWeight : 0;
    const peerComponent = (peerAvg / 100) * peerWeight;
    
    onSaveAssessment(currentAssessment.id, {
      ...currentAssessment,
      entries: newEntries,
      totalScore: teacherComponent + peerComponent,
      lastUpdated: Date.now()
    });
  };

  const handleFeedbackChange = (text: string) => {
    if (!selectedAssigneeId || !currentAssessment) return;
    onSaveAssessment(currentAssessment.id, {
      ...currentAssessment,
      feedback: text
    });
  };

  const handleSubmissionChange = (text: string) => {
    if (!selectedAssigneeId || !currentAssessment) return;
    onSaveAssessment(currentAssessment.id, {
      ...currentAssessment,
      submissionText: text
    });
  };

  const handleSubmissionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
            alert('Supported formats: PDF, Images, Text files');
            return;
        }

        setIsExtracting(true);
        try {
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const text = await extractSubmissionText(base64Data, file.type);
            handleSubmissionChange(text);
        } catch (error) {
            console.error(error);
            alert("Failed to read file.");
        } finally {
            setIsExtracting(false);
            if (submissionInputRef.current) submissionInputRef.current.value = '';
        }
    }
  };

  const generateAiFeedback = async () => {
    if (!selectedAssignee || !currentAssessment || !rubric) return;
    setLoadingFeedback(true);
    const results = currentAssessment.entries.map(entry => {
      const criterion = rubric.criteria.find(c => c.id === entry.criterionId);
      const level = criterion?.levels.find(l => l.id === entry.levelId);
      return {
        criterion: criterion?.title || 'Unknown',
        level: level?.label || 'Unknown',
        description: level?.description || ''
      };
    });

    try {
      const feedback = await generateFeedbackWithAI(selectedAssignee.name, rubric.title, results);
      handleFeedbackChange(feedback);
    } catch (e) {
      alert("Error generating feedback");
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleAutoGrade = async () => {
    if (!selectedAssigneeId || !currentAssessment || !rubric.criteria.length || !currentAssessment.submissionText) return;
    setIsAutoGrading(true);
    try {
      const result = await autoGradeWithAI(rubric, currentAssessment.submissionText);
      const newEntries = [...currentAssessment.entries];
      
      result.ratings.forEach(rating => {
        const criterion = rubric.criteria.find(c => c.title.toLowerCase() === rating.criterionTitle.toLowerCase());
        if (criterion) {
          const level = criterion.levels.find(l => l.label.toLowerCase() === rating.levelLabel.toLowerCase());
          if (level) {
             const existingIdx = newEntries.findIndex(e => e.criterionId === criterion.id);
             if (existingIdx >= 0) newEntries.splice(existingIdx, 1);
             newEntries.push({ criterionId: criterion.id, levelId: level.id, score: level.score });
          }
        }
      });

      // Recalculate total with new entries (using logic from saveScore)
      const peerWeight = (rubric.type === 'group' ? rubric.peerEvalWeight : 0) || 0;
      const teacherWeight = 100 - peerWeight;
      const rubricMaxRawScore = rubric.criteria.reduce((acc, c) => acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0);
      const teacherRawScore = newEntries.reduce((acc, e) => {
        const c = rubric.criteria.find(crit => crit.id === e.criterionId);
        return acc + (e.score * (c?.weight ?? 1));
      }, 0);
      
      const peerEvals = currentAssessment.peerEvaluations || [];
      const peerAvg = peerEvals.length > 0 ? (peerEvals.reduce((s, e) => s + e.score, 0) / peerEvals.length) : (peerWeight > 0 ? 0 : 100);
      const teacherComponent = rubricMaxRawScore > 0 ? (teacherRawScore / rubricMaxRawScore) * teacherWeight : 0;
      const peerComponent = (peerAvg / 100) * peerWeight;

      onSaveAssessment(currentAssessment.id, {
        ...currentAssessment,
        entries: newEntries,
        totalScore: teacherComponent + peerComponent,
        feedback: result.feedback || currentAssessment.feedback,
        lastUpdated: Date.now()
      });
    } catch (e) {
      console.error(e);
      alert("Failed to auto-grade.");
    } finally {
      setIsAutoGrading(false);
    }
  };

  if (assignees.length === 0) {
    return <div className="text-center p-12 text-slate-500">Add students or groups first.</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-4 animate-fade-in">
      {/* Sidebar List */}
      <div className="w-full lg:w-52 bg-white border border-slate-200 rounded-lg flex flex-col shadow-sm overflow-hidden shrink-0">
        <div className="p-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-700 text-sm">Roster ({assignees.length})</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {assignees.map(a => {
            const compositeKey = `${rubric.id}_${a.id}`;
            const assessment = assessments[compositeKey];
            const score = assessment ? assessment.totalScore : 0;
            const passed = score >= (rubric.passingPercentage ?? 50);

            return (
              <button
                key={a.id}
                onClick={() => setSelectedAssigneeId(a.id)}
                className={`w-full text-left p-2 border-b border-slate-100 hover:bg-slate-50 transition-colors flex justify-between items-center ${selectedAssigneeId === a.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-medium text-sm text-slate-800 truncate" title={a.name}>{a.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{a.id}</div>
                </div>
                <div className="text-right shrink-0">
                   {assessment ? (
                       <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-slate-700">{score.toFixed(0)}%</span>
                            <span className={`w-2 h-2 rounded-full ${passed ? 'bg-green-500' : 'bg-red-500'}`}></span>
                       </div>
                   ) : (
                       <span className="text-xs text-slate-300">-</span>
                   )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {/* Rest of the component follows existing patterns but uses currentAssessment which now correctly includes rubricId in logic */}
      {/* Main Grading Area */}
      <div className="flex-1 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden min-w-0">
        {selectedAssignee && currentAssessment ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {selectedAssignee.name}
                    {selectedAssignee.type === 'group' && (
                        <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Group</span>
                    )}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <span>ID: {selectedAssignee.id}</span>
                    <span>•</span>
                    <span>Rubric: {rubric.title}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-6 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                  <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Rubric Score</span>
                      <span className="text-lg font-bold text-blue-600">
                          {getRubricRawScore().toFixed(1)} 
                      </span>
                  </div>
                  {(rubric.peerEvalWeight || 0) > 0 && rubric.type === 'group' && (
                      <div className="border-l border-slate-200 pl-4">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Peer Score</span>
                          <span className="text-lg font-bold text-purple-600">
                             {currentAssessment.peerEvaluations?.length 
                                ? Math.round(currentAssessment.peerEvaluations.reduce((a,b)=>a+b.score,0)/currentAssessment.peerEvaluations.length) + '%' 
                                : '0%'
                             }
                          </span>
                      </div>
                  )}
                  <div className="border-l border-slate-200 pl-4">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Final Grade</span>
                      <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-slate-800">{currentAssessment.totalScore.toFixed(1)}%</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {isPassed ? 'PASS' : 'FAIL'}
                          </span>
                      </div>
                  </div>
              </div>
            </div>

            {/* Scrollable Grading Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Submission Section */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Icon.DocumentText /> Student Submission
                    </h3>
                    <div className="flex gap-2">
                        <input type="file" ref={submissionInputRef} className="hidden" accept="application/pdf,image/*,text/plain" onChange={handleSubmissionFileUpload}/>
                        <button onClick={() => submissionInputRef.current?.click()} disabled={isExtracting} className="text-xs flex items-center gap-1 bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 transition-colors">
                            {isExtracting ? <span className="animate-pulse">Importing...</span> : <><Icon.CloudArrowUp /> Upload Submission</>}
                        </button>
                        <button onClick={() => setShowSubmission(!showSubmission)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                            {showSubmission ? 'Collapse' : 'Expand'}
                        </button>
                    </div>
                </div>
                
                {showSubmission && (
                    <div className="space-y-3 animate-fade-in">
                        <textarea 
                            value={currentAssessment.submissionText || ''}
                            onChange={(e) => handleSubmissionChange(e.target.value)}
                            className="w-full h-40 p-3 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                            placeholder="Paste student work here or import a file to auto-grade..."
                        />
                        <div className="flex justify-end">
                            <button 
                                onClick={handleAutoGrade}
                                disabled={isAutoGrading || !currentAssessment.submissionText?.trim()}
                                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 font-medium shadow-sm"
                            >
                                {isAutoGrading ? 'Grading...' : <><Icon.Sparkles /> Auto-Grade with AI</>}
                            </button>
                        </div>
                    </div>
                )}
              </div>

              {rubric.criteria.map(criterion => {
                const entry = currentAssessment.entries.find(e => e.criterionId === criterion.id);
                const weight = criterion.weight ?? 1;
                const currentScore = entry?.score ?? 0;

                return (
                  <div key={criterion.id} className="space-y-4 border-b border-slate-100 pb-8 last:border-0">
                    <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-3">
                          <h4 className="font-bold text-slate-700 text-lg">{criterion.title}</h4>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">Weight: x{weight.toFixed(2)}</span>
                        </div>
                        <span className="text-2xl font-bold text-blue-600">{currentScore}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">{criterion.description}</p>
                    
                    {/* 1-10 Point Scale */}
                    <div className="flex flex-wrap gap-1 sm:gap-2 mb-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                            <button
                                key={val}
                                onClick={() => handleCustomScore(criterion.id, val)}
                                className={`flex-1 h-10 rounded-lg font-bold text-sm border transition-all ${currentScore === val ? 'bg-blue-600 border-blue-600 text-white shadow-md transform scale-105' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'}`}
                            >
                                {val}
                            </button>
                        ))}
                    </div>

                    {/* Rubric Levels */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(criterion.levels.length, 1)}, minmax(0, 1fr))` }}>
                      {criterion.levels && criterion.levels.sort((a,b) => a.score - b.score).map(level => {
                        const isExactMatch = currentScore === level.score;
                        return (
                          <button
                            key={level.id}
                            onClick={() => handleScore(criterion.id, level.id)}
                            className={`text-left p-3 rounded-lg border transition-all h-full flex flex-col justify-between group ${isExactMatch ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-slate-200 hover:border-blue-200'}`}
                          >
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`font-bold text-xs uppercase tracking-wide ${isExactMatch ? 'text-blue-700' : 'text-slate-600'}`}>{level.label}</span>
                                    <span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-500 font-mono">{level.score}</span>
                                </div>
                                <p className={`text-xs leading-relaxed ${isExactMatch ? 'text-slate-700' : 'text-slate-500'}`}>{level.description}</p>
                            </div>
                            {isExactMatch && <div className="mt-2 text-center text-blue-600"><Icon.Check /></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Peer Evaluation Section for Groups */}
              {selectedAssignee.type === 'group' && (rubric.peerEvalWeight || 0) > 0 && rubric.type === 'group' && (
                <>
                    <hr className="border-slate-200 my-6" />
                    <div className="bg-purple-50 rounded-lg border border-purple-100 p-6">
                        <h3 className="font-bold text-purple-900 text-lg mb-2 flex items-center gap-2">
                           <Icon.Users /> Peer Evaluation (Weight: {rubric.peerEvalWeight}%)
                        </h3>
                        
                        <div className="grid gap-4 mt-4">
                            {selectedAssignee.members?.map(member => {
                                const allEvaluations = currentAssessment.peerEvaluations?.filter(pe => pe.subject === member) || [];
                                const totalScore = allEvaluations.reduce((sum, e) => sum + e.score, 0);
                                const avgScore = allEvaluations.length > 0 ? Math.round(totalScore / allEvaluations.length) : 0;
                                
                                return (
                                    <div key={member} className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
                                        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between mb-3">
                                            <div className="font-bold text-slate-800">{member}</div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-xs text-slate-500 flex flex-col items-end">
                                                    <span>Avg Peer Score</span>
                                                    <span>({allEvaluations.length} reviews)</span>
                                                </div>
                                                <span className={`font-mono text-lg font-bold w-16 text-center rounded px-2 ${allEvaluations.length === 0 ? 'bg-slate-100 text-slate-400' : (avgScore < 70 ? 'text-red-500 bg-red-50' : 'text-green-600 bg-green-50')}`}>
                                                    {allEvaluations.length > 0 ? avgScore + '%' : '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
              )}

              <hr className="border-slate-200 my-6" />

              {/* Feedback Section */}
              <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800">Overall Feedback</h3>
                  <button onClick={generateAiFeedback} disabled={loadingFeedback} className="flex items-center gap-2 text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-200 disabled:opacity-50 transition-colors">
                    {loadingFeedback ? <span className="animate-pulse">Thinking...</span> : <><Icon.Sparkles /> AI Suggestion</>}
                  </button>
                </div>
                <textarea 
                  value={currentAssessment.feedback}
                  onChange={(e) => handleFeedbackChange(e.target.value)}
                  className="w-full h-32 p-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Enter specific feedback..."
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Select a student to begin grading.
          </div>
        )}
      </div>
    </div>
  );
};