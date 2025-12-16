import React from 'react';
import { Assessment, Assignee, Rubric } from '../types';
import { Icon } from './Icon';

interface ExportViewProps {
  assignees: Assignee[];
  assessments: Record<string, Assessment>;
  rubric: Rubric;
  rubrics: Rubric[];
}

export const ExportView: React.FC<ExportViewProps> = ({ assignees, assessments, rubric, rubrics }) => {
  const isGroupProject = rubric.type === 'group';
  
  // Weight Configurations for Current View
  const totalWeightage = rubric.assignmentWeight ?? 100;
  const peerWeightPct = rubric.peerEvalWeight || 0;
  
  // Calculate max score contribution for each component based on Total Weightage
  const teacherMaxScore = (totalWeightage * (100 - peerWeightPct)) / 100;
  const peerMaxScore = (totalWeightage * peerWeightPct) / 100;

  // Helper to parse "ID, Name" string
  const parseMember = (memberString: string) => {
    if (memberString.includes(',')) {
        const parts = memberString.split(',');
        return { id: parts[0].trim(), name: parts.slice(1).join(',').trim() };
    }
    return { id: '', name: memberString.trim() };
  };

  const getAssessmentForStudent = (r: Rubric, studentId: string): Assessment | undefined => {
      // 1. Direct Individual Match
      const individualKey = `${r.id}_${studentId}`;
      if (assessments[individualKey]) return assessments[individualKey];

      // 2. Group Match (Student is member of a group)
      const group = assignees.find(a => 
          a.type === 'group' && 
          a.members?.some(m => parseMember(m).id === studentId)
      );
      if (group) {
          const groupKey = `${r.id}_${group.id}`;
          return assessments[groupKey];
      }
      return undefined;
  };

  const calculateWeightedScore = (r: Rubric, assessment?: Assessment, studentId?: string) => {
      if (!assessment) return 0;

      const rTotalWeight = r.assignmentWeight ?? 100;
      const rPeerWeightPct = r.peerEvalWeight || 0;
      const rTeacherMax = (rTotalWeight * (100 - rPeerWeightPct)) / 100;
      const rPeerMax = (rTotalWeight * rPeerWeightPct) / 100;

      // Teacher Part
      const rubricMaxRawScore = r.criteria.reduce((acc, c) => acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0);
      const teacherRawScore = assessment.entries.reduce((acc, e) => {
         const c = r.criteria.find(crit => crit.id === e.criterionId);
         return acc + (e.score * (c?.weight ?? 1));
      }, 0);
      const teacherPct = rubricMaxRawScore > 0 ? (teacherRawScore / rubricMaxRawScore) : 0;
      const teacherScoreVal = teacherPct * rTeacherMax;

      // Peer Part
      let peerScoreVal = 0;
      if (rPeerWeightPct > 0) {
        let peerAvgRaw = 0;
        // If it's a group assignment, we need the specific student's peer eval score
        if (r.type === 'group' && studentId) {
             // Find student string in group members matches
             // The peer evaluations are stored in the assessment object
             // Need to match studentId to member name string stored in assessment peer evals
             // This is tricky because peer evals store "Name" or "ID, Name" depending on setup
             // We'll search for any subject that contains the ID
             const studentEvals = assessment.peerEvaluations?.filter(pe => pe.subject.includes(studentId)) || [];
             if (studentEvals.length > 0) {
                 peerAvgRaw = studentEvals.reduce((s,e) => s + e.score, 0) / studentEvals.length;
             } else {
                 // If no evals found for student, 0
                 peerAvgRaw = 0;
             }
        } else {
            // Fallback for non-group or if logic fails (default to 100 if no peer weight)
             peerAvgRaw = 100;
        }
        peerScoreVal = (peerAvgRaw / 100) * rPeerMax;
      }

      return teacherScoreVal + peerScoreVal;
  };

  const getAllUniqueStudents = () => {
      const studentMap = new Map<string, string>(); // id -> name
      assignees.forEach(a => {
          if (a.type === 'individual') {
              studentMap.set(a.id, a.name);
          } else if (a.type === 'group' && a.members) {
              a.members.forEach(m => {
                  const { id, name } = parseMember(m);
                  if (id) studentMap.set(id, name);
              });
          }
      });
      return Array.from(studentMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a,b) => a.id.localeCompare(b.id));
  };

  const downloadAllCSV = () => {
    const students = getAllUniqueStudents();
    
    // Header
    const headers = [
        'Student ID', 
        'Student Name', 
        ...rubrics.map(r => `${r.title} (${r.assignmentWeight}%)`), 
        'Total Course Score'
    ];

    const rows = students.map(student => {
        let totalCourseScore = 0;
        const assignmentScores = rubrics.map(r => {
            const assessment = getAssessmentForStudent(r, student.id);
            const score = calculateWeightedScore(r, assessment, student.id);
            totalCourseScore += score;
            return score.toFixed(2); // String format for CSV
        });

        return [
            student.id,
            `"${student.name}"`,
            ...assignmentScores,
            totalCourseScore.toFixed(2)
        ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `course_summary_all_assignments.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCurrentCSV = () => {
    // Base Headers
    const criteriaHeaders = rubric.criteria.map(c => c.title);
    
    let headers: string[] = [];
    if (isGroupProject) {
        headers = [
            'Group Name', 
            'Student ID', 
            'Student Name',
            ...criteriaHeaders,
            `Teacher Score (${teacherMaxScore.toFixed(1)}%)`,
            `Peer Score (${peerMaxScore.toFixed(1)}%)`,
            `Final Grade (${totalWeightage}%)`,
            'Status',
            'Feedback'
        ];
    } else {
        headers = [
            'Student ID', 
            'Student Name',
            ...criteriaHeaders,
            `Final Grade (${totalWeightage}%)`,
            'Status',
            'Feedback'
        ];
    }
    
    // Build Rows
    const rows: string[] = [];

    assignees.forEach(a => {
      const compositeKey = `${rubric.id}_${a.id}`;
      const assessment = assessments[compositeKey];
      
      // Basic scores per criterion (Raw)
      const criteriaScores = rubric.criteria.map(c => {
        const entry = assessment?.entries.find(e => e.criterionId === c.id);
        return entry ? entry.score : 0;
      });
      
      const feedback = `"${(assessment?.feedback || '').replace(/"/g, '""')}"`;
      
      // Calculate raw percentage from Teacher Rubric (0-1)
      const rubricMaxRawScore = rubric.criteria.reduce((acc, c) => acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0);
      const teacherRawScore = assessment ? assessment.entries.reduce((acc, e) => {
         const c = rubric.criteria.find(crit => crit.id === e.criterionId);
         return acc + (e.score * (c?.weight ?? 1));
      }, 0) : 0;
      const teacherPct = rubricMaxRawScore > 0 ? (teacherRawScore / rubricMaxRawScore) : 0;

      if (isGroupProject && a.type === 'group' && a.members && a.members.length > 0) {
          // Group Mode: One row per member
          a.members.forEach(memberStr => {
             const { id, name } = parseMember(memberStr);
             
             const peerEvals = assessment?.peerEvaluations?.filter(pe => pe.subject === memberStr) || [];
             // Average Peer Score (0-100)
             const peerAvgRaw = peerEvals.length > 0 ? peerEvals.reduce((s,e) => s + e.score, 0) / peerEvals.length : (peerWeightPct > 0 ? 0 : 100);
             
             // Scale scores to Weightage
             const teacherScoreVal = teacherPct * teacherMaxScore;
             const peerScoreVal = (peerAvgRaw / 100) * peerMaxScore;
             const finalVal = teacherScoreVal + peerScoreVal;
             
             // Pass/Fail based on percentage equivalent
             const finalPct = (finalVal / totalWeightage) * 100;
             const status = finalPct >= (rubric.passingPercentage ?? 50) ? 'Pass' : 'Fail';

             const row = [
                `"${a.name}"`,
                id,
                `"${name}"`,
                ...criteriaScores,
                teacherScoreVal.toFixed(2),
                peerScoreVal.toFixed(2),
                finalVal.toFixed(2),
                status,
                feedback
             ];
             rows.push(row.join(','));
          });
      } else if (!isGroupProject && a.type === 'individual') {
          // Individual Mode
          const teacherScoreVal = teacherPct * teacherMaxScore;
          // For individual, teacher score is the final grade
          const finalVal = teacherScoreVal;
          
          const finalPct = (finalVal / totalWeightage) * 100;
          const status = finalPct >= (rubric.passingPercentage ?? 50) ? 'Pass' : 'Fail';

          const row = [
              a.id,
              `"${a.name}"`,
              ...criteriaScores,
              finalVal.toFixed(2),
              status,
              feedback
          ];
          rows.push(row.join(','));
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `grades_${rubric.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Results Summary</h2>
           <p className="text-sm text-slate-500">
               {rubric.title} <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-xs font-bold uppercase">{isGroupProject ? 'Group' : 'Individual'}</span>
           </p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={downloadCurrentCSV}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50 flex items-center gap-2 font-medium transition-colors text-sm"
            >
                <Icon.Download /> Current Assignment
            </button>
            <button 
                onClick={downloadAllCSV}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2 font-medium transition-colors text-sm shadow-sm"
            >
                <Icon.Download /> Course Summary (All)
            </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
            {isGroupProject ? (
                <tr>
                    <th className="p-4">Group</th>
                    <th className="p-4">Student ID</th>
                    <th className="p-4">Student Name</th>
                    <th className="p-4 text-right">Teacher Score ({teacherMaxScore.toFixed(1)}%)</th>
                    <th className="p-4 text-right">Peer Score ({peerMaxScore.toFixed(1)}%)</th>
                    <th className="p-4 text-right">Final Grade ({totalWeightage}%)</th>
                    <th className="p-4 text-center">Status</th>
                </tr>
            ) : (
                <tr>
                    <th className="p-4">Student ID</th>
                    <th className="p-4">Student Name</th>
                    <th className="p-4 text-right">Final Grade ({totalWeightage}%)</th>
                    <th className="p-4 text-center">Status</th>
                </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assignees.length === 0 && (
                <tr>
                    <td colSpan={isGroupProject ? 7 : 4} className="p-8 text-center text-slate-400">
                        No results to display.
                    </td>
                </tr>
            )}
            
            {assignees.flatMap(a => {
              const compositeKey = `${rubric.id}_${a.id}`;
              const assessment = assessments[compositeKey];
              
              // Calculate Teacher Pct (0-1)
              const rubricMaxRawScore = rubric.criteria.reduce((acc, c) => acc + (Math.max(0, ...(c.levels?.map(l => l.score) || [0])) * (c.weight ?? 1)), 0);
              const teacherRawScore = assessment ? assessment.entries.reduce((acc, e) => {
                  const c = rubric.criteria.find(crit => crit.id === e.criterionId);
                  return acc + (e.score * (c?.weight ?? 1));
              }, 0) : 0;
              const teacherPct = rubricMaxRawScore > 0 ? (teacherRawScore / rubricMaxRawScore) : 0;

              // RENDER GROUP ROWS
              if (isGroupProject && a.type === 'group') {
                 if (!a.members || a.members.length === 0) {
                     return (
                         <tr key={a.id} className="bg-orange-50/20">
                             <td className="p-4 font-medium text-slate-800">{a.name}</td>
                             <td className="p-4 text-orange-400 italic" colSpan={6}>No members assigned</td>
                         </tr>
                     );
                 }

                 return a.members.map(memberStr => {
                    const { id, name } = parseMember(memberStr);
                    const peerEvals = assessment?.peerEvaluations?.filter(pe => pe.subject === memberStr) || [];
                    const peerAvgRaw = peerEvals.length > 0 ? peerEvals.reduce((s,e) => s + e.score, 0) / peerEvals.length : 0;
                    
                    const teacherScoreVal = teacherPct * teacherMaxScore;
                    const peerScoreVal = (peerAvgRaw / 100) * peerMaxScore;
                    const finalVal = teacherScoreVal + peerScoreVal;
                    
                    const finalPct = (finalVal / totalWeightage) * 100;
                    const isPass = finalPct >= (rubric.passingPercentage ?? 50);

                    return (
                        <tr key={`${a.id}-${memberStr}`} className="hover:bg-slate-50 border-b last:border-0 border-slate-50">
                            <td className="p-4 font-bold text-slate-600">{a.name}</td>
                            <td className="p-4 font-mono text-slate-500">{id || '-'}</td>
                            <td className="p-4 font-medium text-slate-800">{name}</td>
                            <td className="p-4 text-right font-mono text-blue-600">{teacherScoreVal.toFixed(1)}</td>
                            <td className="p-4 text-right font-mono text-purple-600">{peerScoreVal.toFixed(1)}</td>
                            <td className="p-4 text-right font-bold text-slate-800">{finalVal.toFixed(1)}</td>
                            <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${isPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {isPass ? 'PASS' : 'FAIL'}
                                </span>
                            </td>
                        </tr>
                    );
                 });
              }

              // RENDER INDIVIDUAL ROWS
              if (!isGroupProject && a.type === 'individual') {
                const finalVal = teacherPct * teacherMaxScore;
                const finalPct = (finalVal / totalWeightage) * 100;
                const isPass = finalPct >= (rubric.passingPercentage ?? 50);

                return (
                    <tr key={a.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-slate-500">{a.id}</td>
                    <td className="p-4 font-medium text-slate-800">{a.name}</td>
                    <td className="p-4 text-right font-bold text-slate-800">
                        {finalVal.toFixed(1)}
                    </td>
                    <td className="p-4 text-center">
                        {assessment ? (
                            <span className={`px-2 py-1 rounded text-xs font-bold ${isPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {isPass ? 'PASS' : 'FAIL'}
                            </span>
                        ) : (
                            <span className="text-slate-300">-</span>
                        )}
                    </td>
                    </tr>
                );
              }
              return null;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};